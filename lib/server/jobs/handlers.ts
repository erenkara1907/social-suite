import "server-only";

import { AI_JOB_MODELS } from "@/app.config";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import type { AnyJob, JobContext, JobKind } from "@/lib/core/jobs/types";
import { PLAN_CHANNELS, type PlanChannel } from "@/lib/core/types";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import { planSkeleton } from "@/lib/core/plan/skeleton";
import { writeCaption } from "@/lib/core/ai/caption";
import { toPromptBlock } from "@/lib/core/brand/types";
import { skeletonToContentItems } from "@/lib/core/plan/calendar";
import { checkDuplicate } from "@/lib/core/dedupe";
import { getBrandForJob } from "@/lib/server/jobs/context";
import { runAnthropicCall } from "@/lib/server/ai/run-provider-call";

/**
 * İşleyici kaydı — BIRLESIM_PLANI §12 adım 14 FAZ C.
 *
 * `plan_generate` ve `caption_write` bu adımda dolduruldu — ürünün ilk
 * gerçek Anthropic çağrıları. Kalan altısı hâlâ `NOT_IMPLEMENTED`
 * (adım 15/16/17/18/20'nin işi, `lib/core/jobs/types.ts`'in adım eşlemesi
 * yorumuna bakın).
 */
const NOT_IMPLEMENTED = "işleyici henüz yazılmadı (adım 15+)";

/** Sağlayıcı hatasını iş kuyruğu hata sınıfına çevirir. Bir sonraki denemede
 *  sonucun DEĞİŞİP değişmeyeceği ayrımı — worker bu ikisine göre farklı
 *  davranıyor (`lib/core/jobs/errors.ts`). */
function toJobError(code: ApiErrorCode, detail: string | undefined, fallback: string): Error {
  const message = detail ? `${code}: ${detail}` : `${code}: ${fallback}`;
  switch (code) {
    case "rate_limited":
    case "timeout":
    case "upstream_error":
      return new TransientJobError(message);
    default:
      // missing_key, invalid_key, service_paused, invalid_input, refused —
      // bir sonraki deneme SONUCU DEĞİŞTİRMEZ (müşteri anahtarı eklemeden/
      // düzeltmeden, ya da ops kill switch'i açmadan).
      return new PermanentJobError(message);
  }
}

/** BIRLESIM_PLANI §4a durum makinesi — `plan_generate`'in yazdığı satırlar
 *  hep `idea`'da doğar, gövdesi `caption_write`'ın işi. */
async function handlePlanGenerate(
  payload: Extract<AnyJob, { kind: "plan_generate" }>["payload"],
  ctx: JobContext,
): Promise<void> {
  const admin = createAdminClient();

  const brand = await getBrandForJob(admin, ctx.brandId);
  if (!brand) throw new PermanentJobError(`marka bulunamadı: ${ctx.brandId}`);

  const model = AI_JOB_MODELS.plan_generate;
  const start = new Date(payload.startIso);

  const outcome = await runAnthropicCall(
    { brandId: ctx.brandId, kind: "plan_generate", model, jobId: ctx.jobId },
    (apiKey) =>
      planSkeleton(
        { theme: payload.theme, horizonDays: payload.horizonDays, lang: payload.lang, mode: payload.mode, start, brand },
        apiKey,
        model,
      ),
  );

  if (!outcome.ok) throw toJobError(outcome.code, outcome.detail, "plan üretimi başarısız");

  const { data: plan, error: planError } = await admin
    .from("plans")
    .insert({
      brand_id: ctx.brandId,
      user_id: ctx.userId,
      title: outcome.title,
      theme: payload.theme,
      horizon_days: payload.horizonDays,
      lang: payload.lang,
      start_date: payload.startIso.slice(0, 10),
      mode: payload.mode,
    })
    .select("id")
    .single<{ id: string }>();
  if (planError || !plan) throw new TransientJobError(`plans yazılamadı: ${planError?.message ?? "boş yanıt"}`);

  const projected = skeletonToContentItems(outcome.posts, start, ctx.brandId, brand.timezone);

  let written = 0;
  let blocked = 0;
  for (const item of projected) {
    // ⭐ FAZ C2 — dedupe DİKİŞİ. Adım 15'ten önce her zaman "new" döner;
    // handler bu noktadan sonra ASLA değişmeyecek (adım 15 yalnızca
    // checkDuplicate()'in gövdesini dolduracak).
    const verdict = await checkDuplicate({ brandId: ctx.brandId, title: item.title, hook: item.hook });
    if (verdict !== "new") {
      blocked += 1;
      await admin.from("activity").insert({
        brand_id: ctx.brandId,
        user_id: ctx.userId,
        actor: "plan_generate",
        action: "duplicate_blocked",
        target: item.title,
        meta: { verdict },
      });
      continue;
    }

    // `item.id` skeletonToContentItems()'ın SENTETİK önizleme id'si
    // (`SKELETON_ID_PREFIX`) — DB kendi uuid'ini üretecek, INSERT'e girmez.
    const insertable: Record<string, unknown> = { ...item, plan_id: plan.id, user_id: ctx.userId };
    delete insertable.id;
    const { error: itemError } = await admin.from("content_items").insert(insertable);
    if (itemError) throw new TransientJobError(`content_items yazılamadı: ${itemError.message}`);
    written += 1;
  }

  await admin.from("activity").insert({
    brand_id: ctx.brandId,
    user_id: ctx.userId,
    actor: "plan_generate",
    action: "plan_generated",
    target: outcome.title,
    meta: { written, blocked, horizonDays: payload.horizonDays },
  });
}

interface ContentItemForCaption {
  id: string;
  brand_id: string;
  platform: string;
  title: string;
  hook: string;
}

/** BIRLESIM_PLANI §4a — `idea` → `draft` geçişi, gövde bu adımda yazılır. */
async function handleCaptionWrite(
  payload: Extract<AnyJob, { kind: "caption_write" }>["payload"],
  ctx: JobContext,
): Promise<void> {
  const admin = createAdminClient();

  const brand = await getBrandForJob(admin, ctx.brandId);
  if (!brand) throw new PermanentJobError(`marka bulunamadı: ${ctx.brandId}`);

  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id,brand_id,platform,title,hook")
    .eq("id", payload.contentItemId)
    .eq("brand_id", ctx.brandId)
    .maybeSingle<ContentItemForCaption>();
  if (itemError) throw new TransientJobError(`content_items okunamadı: ${itemError.message}`);
  if (!item) throw new PermanentJobError(`content_item bulunamadı: ${payload.contentItemId}`);
  if (!(PLAN_CHANNELS as readonly string[]).includes(item.platform)) {
    throw new PermanentJobError(`caption_write bu platformu desteklemiyor: ${item.platform}`);
  }

  const model = AI_JOB_MODELS.caption_write;
  const idea = [item.title, item.hook].filter(Boolean).join(" — ");

  const outcome = await runAnthropicCall(
    { brandId: ctx.brandId, kind: "caption_write", model, jobId: ctx.jobId },
    (apiKey) =>
      writeCaption(
        {
          idea,
          channel: item.platform as PlanChannel,
          tone: brand.voice || "samimi, abartısız",
          lang: brand.contentLanguage,
          brand: toPromptBlock(brand, brand.contentLanguage),
        },
        apiKey,
        model,
      ),
  );

  if (!outcome.ok) throw toJobError(outcome.code, outcome.detail, "caption yazımı başarısız");

  const { error: updateError } = await admin
    .from("content_items")
    .update({
      hook: outcome.draft.hook,
      body: outcome.draft.body,
      hashtags: outcome.draft.hashtags,
      status: "draft",
    })
    .eq("id", item.id);
  if (updateError) throw new TransientJobError(`content_items güncellenemedi: ${updateError.message}`);

  await admin.from("activity").insert({
    brand_id: ctx.brandId,
    user_id: ctx.userId,
    actor: "caption_write",
    action: "caption_written",
    target: item.title,
    content_item_id: item.id,
  });
}

/** `kind` başına bir işleyici; `payload` o kind'ın `AnyJob`'daki daralmış
 *  hâli — her gövde yalnızca kendi payload tipini görür. */
export const JOB_HANDLERS: {
  [K in JobKind]: (payload: Extract<AnyJob, { kind: K }>["payload"], ctx: JobContext) => Promise<void>;
} = {
  plan_generate: handlePlanGenerate,
  caption_write: handleCaptionWrite,
  async ugc_pipeline() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async media_poll() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async publish() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async metrics_collect() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async token_refresh() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async embed_backfill() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },

  /** Döngüyü kanıtlar — hiçbir dış çağrı yapmaz. `forceFailure` yalnızca
   *  worker'ın hata yollarını test etmek için (bkz. `NoopTestPayload`). */
  async noop_test(payload) {
    if (payload.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
    }
    if (payload.forceFailure === "permanent") {
      throw new PermanentJobError("noop_test: kasıtlı kalıcı hata (test)");
    }
    if (payload.forceFailure === "transient") {
      throw new TransientJobError("noop_test: kasıtlı geçici hata (test)");
    }
  },
};

export type { JobKind };
