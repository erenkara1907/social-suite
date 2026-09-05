import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import type { JobContext, MediaPollPayload } from "@/lib/core/jobs/types";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { enqueueInternal } from "@/lib/server/jobs/enqueue-internal";
import { getMediaJob, markStepFailed, type MediaJobDbRow } from "@/lib/server/media/job-row";
import { persistVendorAsset } from "@/lib/server/storage";
import { chainToNextStep } from "@/lib/server/media/pipeline";
import { getMarketTask, type VideoTask } from "@/lib/core/providers/kie";
import { getFalLipsyncTask } from "@/lib/core/providers/fal";
import { MEDIA_POLL_CHAIN_INTERVAL_MS, MEDIA_POLL_MAX_WAIT_MS } from "@/lib/server/media/constants";

/**
 * `media_poll` işleyicisinin gövdesi — BIRLESIM_PLANI §12 adım 20 FAZ B3.
 *
 * ⭐ FAZ 0.3'ün çözümü BURADA: vendor "hâlâ üretiliyor" derse bu iş
 * `TransientJobError` FIRLATMAZ (ki bu, `JOB_RETRY_POLICY.media_poll`'un
 * 5 denemelik hata bütçesini TÜKETİRDİ — ~5dk sonra Kling parayı harcamışken
 * iş ölü mektuba düşerdi). Bunun yerine BAŞARIYLA döner ve KENDİ YERİNE
 * yeni bir `media_poll` işi açar. `maxAttempts=5` böylece yalnızca GERÇEK
 * hatalara (ağ, 401, vendor 5xx) uygulanır — üretim süresi ne kadar uzarsa
 * uzasın zincir kopmaz; yalnızca `MEDIA_POLL_MAX_WAIT_MS` duvarına çarparsa
 * DURUR (ama `media_jobs` satırı `running`'de ve `vendor_task_id` korunur —
 * "vendor tarafında sonuç varsa sonradan toplanabilmeli").
 */

async function fetchVendorStatus(vendor: MediaJobDbRow["vendor"], taskId: string, apiKey: string): Promise<VideoTask> {
  if (vendor === "fal") return getFalLipsyncTask(taskId, apiKey);
  return getMarketTask(taskId, apiKey); // kie — persona_image/persona_video. elevenlabs hiç pollanmaz (senkron).
}

async function completePersonaImage(admin: SupabaseClient, job: MediaJobDbRow, outputUrl: string): Promise<void> {
  const result = await persistVendorAsset(admin, {
    brandId: job.brand_id, userId: job.user_id, sourceUrl: outputUrl, kind: "image", vendor: "kie", mediaJobId: job.id,
  });
  if (!result.ok) throw new TransientJobError(`persona görseli kalıcılaştırılamadı: ${result.error.detail}`);
  if (job.persona_id) await admin.from("personas").update({ image_asset_id: result.data.id }).eq("id", job.persona_id);

  await chainToNextStep(admin, {
    brandId: job.brand_id, userId: job.user_id, contentItemId: job.content_item_id, personaId: job.persona_id ?? "", completedStep: "persona_image",
  });
}

/** Kling'in çıktısı KASITLI olarak Storage'a bridgelenmez — bu, lipsync'in
 *  GİRDİSİ (ara adım), yayınlanacak nihai varlık değil. §4g bridge'i yalnızca
 *  boru hattının SON adımında (lipsync) çalışır. */
async function completePersonaVideo(admin: SupabaseClient, job: MediaJobDbRow, outputUrl: string): Promise<void> {
  const { error } = await admin
    .from("media_jobs")
    .update({ state: "succeeded", output_url: outputUrl, error: null, finished_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw new TransientJobError(`media_jobs güncellenemedi: ${error.message}`);

  await chainToNextStep(admin, {
    brandId: job.brand_id, userId: job.user_id, contentItemId: job.content_item_id, personaId: job.persona_id ?? "", completedStep: "persona_video",
  });
}

const NON_OVERWRITABLE_STATUSES = new Set(["scheduled", "publishing", "published", "archived"]);

/** §4g ADIM 5 — köprü + `content_items` güncellemesi. Boru hattının SON
 *  adımı; bir sonraki `ugc_pipeline` işi YOK. */
async function completeLipsync(admin: SupabaseClient, job: MediaJobDbRow, outputUrl: string): Promise<void> {
  const result = await persistVendorAsset(admin, {
    brandId: job.brand_id, userId: job.user_id, sourceUrl: outputUrl, kind: "video", vendor: "fal", mediaJobId: job.id,
  });
  if (!result.ok) throw new TransientJobError(`video kalıcılaştırılamadı: ${result.error.detail}`);
  if (!job.content_item_id) return; // yalnızca savunma — lipsync her zaman bir içeriğe bağlı

  const { data: item } = await admin
    .from("content_items").select("status").eq("id", job.content_item_id).maybeSingle<{ status: string }>();
  // ⚠ zaten yayınlanmış/zamanlanmış bir içeriği GERİYE almaz — savunma derinliği.
  if (item && !NON_OVERWRITABLE_STATUSES.has(item.status)) {
    await admin
      .from("content_items")
      .update({ primary_media_id: result.data.id, media_type: "REELS", status: "needs_review" })
      .eq("id", job.content_item_id);
  }

  await admin.from("activity").insert({
    brand_id: job.brand_id, user_id: job.user_id, actor: "ugc_pipeline", action: "ugc_ready",
    target: "UGC video", content_item_id: job.content_item_id, meta: { mediaJobId: job.id, assetId: result.data.id },
  });
}

export async function pollMediaJob(payload: MediaPollPayload, ctx: JobContext): Promise<void> {
  const admin = createAdminClient();
  const job = await getMediaJob(admin, payload.mediaJobId);
  if (!job) throw new PermanentJobError(`media_jobs satırı yok: ${payload.mediaJobId}`);
  if (job.brand_id !== ctx.brandId) throw new PermanentJobError("media_jobs başka markaya ait");
  // Zaten bitmiş/iptal edilmiş — idempotent no-op (bir önceki poll bunu
  // hallettiyse ya da kullanıcı arada iptal ettiyse tekrar çalışmaz).
  if (job.state === "cancelled" || job.state === "succeeded") return;
  if (!job.vendor_task_id) throw new PermanentJobError("media_jobs: vendor_task_id yok, poll edilemez");

  const { apiKey } = await resolveProviderCredential(ctx.brandId, job.vendor);
  if (!apiKey) throw new PermanentJobError(`missing_key: ${job.vendor} anahtarı yapılandırılmamış`);

  const status = await fetchVendorStatus(job.vendor, job.vendor_task_id, apiKey);

  if (status.state === "failed") {
    const message = status.error ?? "vendor üretim hatası";
    await markStepFailed(admin, job.id, message);
    await admin.from("activity").insert({
      brand_id: job.brand_id, user_id: job.user_id, actor: "ugc_pipeline", action: "failed",
      target: job.step, content_item_id: job.content_item_id, meta: { mediaJobId: job.id, error: message },
    });
    throw new PermanentJobError(`${job.vendor} ${job.step} başarısız: ${message}`);
  }

  if (status.state === "generating") {
    const startedAtMs = new Date(job.started_at ?? job.created_at).getTime();
    const elapsedMs = Date.now() - startedAtMs;

    if (elapsedMs > MEDIA_POLL_MAX_WAIT_MS) {
      // FAZ 0.3 — bütçe doldu. `media_jobs` `running`'de ve `vendor_task_id`
      // korunuyor; iş ÖLMÜYOR, yalnızca otomatik zincir burada durur.
      await admin
        .from("media_jobs")
        .update({ error: `otomatik kontrol bütçesi doldu (~${Math.round(elapsedMs / 60_000)}dk) — vendor_task_id ile daha sonra elle kontrol edilebilir` })
        .eq("id", job.id)
        .is("result_asset_id", null);
      return;
    }

    await enqueueInternal(
      admin, ctx.brandId, ctx.userId, "media_poll", { mediaJobId: job.id },
      { dedupeKey: `media_poll:${job.id}`, runAfter: new Date(Date.now() + MEDIA_POLL_CHAIN_INTERVAL_MS) },
    );
    return;
  }

  // status.state === "ready"
  if (!status.videoUrl) throw new PermanentJobError(`${job.vendor} hazır ama sonuç URL'i yok`);

  if (job.step === "persona_image") return completePersonaImage(admin, job, status.videoUrl);
  if (job.step === "persona_video") return completePersonaVideo(admin, job, status.videoUrl);
  if (job.step === "lipsync") return completeLipsync(admin, job, status.videoUrl);
  throw new PermanentJobError(`media_poll: '${job.step}' adımı için tamamlama mantığı yok`);
}
