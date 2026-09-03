// @vitest-environment node
//
// Gerçek Kie/ElevenLabs/fal + gerçek Supabase — jsdom'un fetch/stream
// polyfill'leri araya girmesin diye `storage.live.test.ts` ile AYNI
// gerekçeyle `node` ortamına geçiyor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobContext } from "@/lib/core/jobs/types";
import { runUgcPipelineStep } from "@/lib/server/media/pipeline";
import { pollMediaJob } from "@/lib/server/media/poll";
import { findStepJob, getMediaJob, type MediaJobDbRow } from "@/lib/server/media/job-row";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { listTurkishVoices } from "@/lib/core/providers/elevenlabs";

/**
 * UGC boru hattının UÇTAN UCA canlı kanıtı — BIRLESIM_PLANI §12 adım 20
 * FAZ B verification.
 *
 * ⭐ GÖREV KISITI: "bu oturumda en fazla İKİ tam boru hattı çalıştırılacak".
 * Bu dosya TAM OLARAK iki tane çalıştırır — biri mutlu yol (Test 1), biri
 * yapay olarak başarısız edilip yeniden denenen (Test 3). Test 2 (idempotent
 * retry) ve Test 4 (iptal) SIFIR ek vendor çağrısı yapar — doğrudan DB
 * satırı yazıp `runUgcPipelineStep`'in erken-dönüş dallarını (275-285.
 * satırlar, `pipeline.ts`) tetikler, bu yüzden bütçeye SAYILMAZ.
 *
 *   set -a; source .env.local; set +a
 *   RUN_UGC_PIPELINE_LIVE_TEST=1 npx vitest run lib/server/media/pipeline.live.test.ts
 */
const RUN = process.env.RUN_UGC_PIPELINE_LIVE_TEST === "1";

const POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 10 * 60_000; // 10dk — gerçek süre bu testte ölçülüp raporlanacak
const LIPSYNC_POLL_TIMEOUT_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!RUN)("ugc_pipeline — uçtan uca canlı boru hattı (adım 20 FAZ B)", () => {
  let admin: ReturnType<typeof createAdminClient>;
  let brandId: string;
  let ownerId: string;
  let personaId: string;
  const contentItemIds: string[] = [];
  const ctx: JobContext = { jobId: "live-test", brandId: "", userId: "" };

  beforeAll(async () => {
    admin = createAdminClient();
    // ⭐ Gerçek kimlik bilgileri olan marka — bu oturumda önceden
    // yapılandırıldı (provider_credentials: kie, elevenlabs, fal).
    const { data: brand, error } = await admin
      .from("brands")
      .select("id,owner_id")
      .eq("name", "Carino Pizza")
      .maybeSingle<{ id: string; owner_id: string }>();
    if (error) throw error;
    if (!brand) throw new Error("canlı test için 'Carino Pizza' markası bulunamadı (gerçek vendor anahtarları orada)");
    brandId = brand.id;
    ownerId = brand.owner_id;
    ctx.brandId = brandId;
    ctx.userId = ownerId;

    // ⭐ voice adımı gerçek bir default_voice_id ister (personas.default_voice_id)
    // — bu ElevenLabs'in kendi ses envanterindeki GEÇERLİ bir id olmalı,
    // uydurma bir UUID değil. Marka zaten yapılandırılmış elevenlabs anahtarı
    // üzerinden gerçek Türkçe ses listesi çekiliyor (ucuz, ödemesiz önizleme
    // çağrısı — bkz. lib/adapters/live/voice.ts başlık yorumu).
    const { apiKey: elevenLabsKey } = await resolveProviderCredential(brandId, "elevenlabs");
    if (!elevenLabsKey) throw new Error("canlı test için elevenlabs anahtarı yapılandırılmamış (Carino Pizza)");
    const turkishVoices = await listTurkishVoices(elevenLabsKey);
    if (turkishVoices.length === 0) throw new Error("canlı test için en az bir Türkçe ses gerekiyor");
    const defaultVoiceId = turkishVoices[0].voiceId;

    const { data: persona, error: personaError } = await admin
      .from("personas")
      .insert({
        brand_id: brandId, user_id: ownerId, name: `adım20-canlı-test-${Date.now()}`,
        prompt:
          "20–25 yaşlarında Türk bir kadın, plansız çekilmiş gerçek bir telefon selfiesi gibi görünsün. " +
          "Kadraj hafif eğik, doğal ışık, sade ev kıyafeti, rötuşsuz cilt, günlük ifade.",
        default_voice_id: defaultVoiceId,
      })
      .select("id")
      .single<{ id: string }>();
    if (personaError || !persona) throw new Error(`persona oluşturulamadı: ${personaError?.message}`);
    personaId = persona.id;
  });

  afterAll(async () => {
    // Silinecek media_assets'i (storage nesneleri dahil) media_jobs SİLİNMEDEN
    // ÖNCE topla — result_asset_id'ye buradan erişiliyor.
    const assetIds = new Set<string>();
    const storagePaths: string[] = [];
    if (contentItemIds.length) {
      const { data: jobs } = await admin.from("media_jobs").select("result_asset_id").in("content_item_id", contentItemIds).not("result_asset_id", "is", null);
      for (const j of jobs ?? []) if (j.result_asset_id) assetIds.add(j.result_asset_id);
    }
    const { data: personaRow } = await admin.from("personas").select("image_asset_id").eq("id", personaId).maybeSingle<{ image_asset_id: string | null }>();
    if (personaRow?.image_asset_id) assetIds.add(personaRow.image_asset_id);

    if (assetIds.size) {
      const { data: assets } = await admin.from("media_assets").select("storage_path").in("id", [...assetIds]);
      for (const a of assets ?? []) if (a.storage_path) storagePaths.push(a.storage_path);
    }

    // Sırayla, FK ihlali olmasın diye önce bağımlılar.
    if (contentItemIds.length) {
      await admin.from("activity").delete().in("content_item_id", contentItemIds);
      await admin.from("media_jobs").delete().in("content_item_id", contentItemIds);
      await admin.from("content_items").delete().in("id", contentItemIds);
    }
    await admin.from("media_jobs").delete().eq("persona_id", personaId).is("content_item_id", null);
    await admin.from("personas").delete().eq("id", personaId);
    if (assetIds.size) await admin.from("media_assets").delete().in("id", [...assetIds]);
    if (storagePaths.length) await admin.storage.from("media").remove(storagePaths);
  });

  async function createContentItem(hook: string, body: string): Promise<string> {
    const { data, error } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: ownerId, platform: "instagram", kind: "reels",
        title: "adım20 canlı test içeriği", hook, body,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`content_items yazılamadı: ${error?.message}`);
    contentItemIds.push(data.id);
    return data.id;
  }

  /** `pollMediaJob`'u GERÇEK gecikmelerle döngüde çağırır (cron'un yerine
   *  geçer) — vendor "generating" dedikçe bekler, "ready"/"failed" olunca
   *  döner. Dönüş değeri elapsedMs — bu, FAZ 0'ın istediği GERÇEK süre. */
  async function pollUntilDone(mediaJobId: string, timeoutMs: number): Promise<{ row: MediaJobDbRow; elapsedMs: number }> {
    const start = Date.now();
    for (;;) {
      await pollMediaJob({ mediaJobId }, ctx);
      const row = await getMediaJob(admin, mediaJobId);
      if (!row) throw new Error("media_jobs satırı kayboldu");
      if (row.state === "succeeded" || row.state === "failed") {
        return { row, elapsedMs: Date.now() - start };
      }
      if (Date.now() - start > timeoutMs) throw new Error(`poll zaman aşımı (${timeoutMs}ms) — vendor_task_id=${row.vendor_task_id}`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  it(
    "TEST 1 (boru hattı #1 — mutlu yol): persona_image → persona_video → voice → lipsync, hepsi gerçek",
    async () => {
      // ── persona_image (persona başına bir kez) ──────────────────────────
      await runUgcPipelineStep({ personaId, step: "persona_image" }, ctx);
      const imgJob = await findStepJob(admin, { contentItemId: null, personaId, step: "persona_image" });
      expect(imgJob).not.toBeNull();
      const imgDone = await pollUntilDone(imgJob!.id, VIDEO_POLL_TIMEOUT_MS);
      expect(imgDone.row.state).toBe("succeeded");
      console.log(`[canlı] persona_image gerçek süre: ${Math.round(imgDone.elapsedMs / 1000)}sn`);

      const { data: personaAfterImage } = await admin.from("personas").select("image_asset_id").eq("id", personaId).single<{ image_asset_id: string | null }>();
      expect(personaAfterImage?.image_asset_id).toBeTruthy();

      // ── içerik A: klip süresine (5sn × 13 char/sn = 65 char) uyan KISA
      // script — voice adımının klip-uzunluğu koruması (bkz. pipeline.ts
      // loadVoiceInputs, fal.ts'in cut_off yorumuna uyum) bunu ZORUNLU kılıyor.
      const contentA = await createContentItem("Taze bir tarif!", "Hemen dene.");

      // ── persona_video (GERÇEK Kling çağrısı — süre burada ölçülüyor) ────
      await runUgcPipelineStep({ personaId, step: "persona_video", contentItemId: contentA }, ctx);
      const videoJob = await findStepJob(admin, { contentItemId: contentA, personaId, step: "persona_video" });
      expect(videoJob).not.toBeNull();
      const videoDone = await pollUntilDone(videoJob!.id, VIDEO_POLL_TIMEOUT_MS);
      expect(videoDone.row.state).toBe("succeeded");
      expect(videoDone.row.output_url).toBeTruthy();
      console.log(`[canlı] ⭐ persona_video (Kling) GERÇEK SÜRE: ${Math.round(videoDone.elapsedMs / 1000)}sn — MEDIA_POLL_MAX_WAIT_MS kalibrasyonu için kullanılacak`);

      // ── voice (senkron, ElevenLabs) ──────────────────────────────────────
      const voiceStart = Date.now();
      await runUgcPipelineStep({ personaId, step: "voice", contentItemId: contentA }, ctx);
      const voiceJob = await findStepJob(admin, { contentItemId: contentA, personaId, step: "voice" });
      expect(voiceJob?.state).toBe("succeeded");
      expect(voiceJob?.result_asset_id).toBeTruthy();
      console.log(`[canlı] voice (ElevenLabs, senkron) gerçek süre: ${Math.round((Date.now() - voiceStart) / 1000)}sn`);

      // ── lipsync (GERÇEK fal çağrısı) ─────────────────────────────────────
      await runUgcPipelineStep({ personaId, step: "lipsync", contentItemId: contentA }, ctx);
      const lipsyncJob = await findStepJob(admin, { contentItemId: contentA, personaId, step: "lipsync" });
      expect(lipsyncJob).not.toBeNull();
      const lipsyncDone = await pollUntilDone(lipsyncJob!.id, LIPSYNC_POLL_TIMEOUT_MS);
      expect(lipsyncDone.row.state).toBe("succeeded");
      expect(lipsyncDone.row.result_asset_id).toBeTruthy();
      console.log(`[canlı] lipsync (fal) gerçek süre: ${Math.round(lipsyncDone.elapsedMs / 1000)}sn`);

      // ── §4g ADIM 5 — content_items gerçekten güncellendi mi? ────────────
      const { data: item } = await admin
        .from("content_items").select("primary_media_id,media_type,status").eq("id", contentA)
        .single<{ primary_media_id: string | null; media_type: string; status: string }>();
      expect(item?.primary_media_id).toBe(lipsyncJob!.result_asset_id ?? lipsyncDone.row.result_asset_id);
      expect(item?.media_type).toBe("REELS");
      expect(item?.status).toBe("needs_review");

      const { data: asset } = await admin.from("media_assets").select("public_url").eq("id", lipsyncDone.row.result_asset_id!).single<{ public_url: string }>();
      const liveRes = await fetch(asset!.public_url, { method: "HEAD" });
      expect(liveRes.status).toBe(200);
      console.log("[canlı] nihai video kalıcı URL:", asset!.public_url);

      const { data: activityRow } = await admin.from("activity").select("action").eq("content_item_id", contentA).eq("action", "ugc_ready").maybeSingle();
      expect(activityRow).not.toBeNull();

      // ── TEST 2 (SIFIR ek maliyet) — aynı satır üzerinde idempotent retry ─
      // §12 adım 20'nin "adım işaretleme" kanıtının çekirdeği: zaten
      // succeeded bir adım TEKRAR dispatch edilmez (pipeline.ts satır 275-278).
      const beforeRetry = await getMediaJob(admin, videoJob!.id);
      await runUgcPipelineStep({ personaId, step: "persona_video", contentItemId: contentA }, ctx);
      const afterRetry = await getMediaJob(admin, videoJob!.id);
      expect(afterRetry?.vendor_task_id).toBe(beforeRetry?.vendor_task_id); // YENİ dispatch YOK
      expect(afterRetry?.finished_at).toBe(beforeRetry?.finished_at);
      expect(afterRetry?.state).toBe("succeeded");
      console.log("[canlı] KANIT — succeeded persona_video'ya ikinci runUgcPipelineStep çağrısı vendor_task_id'yi DEĞİŞTİRMEDİ (yeniden dispatch yok)");
    },
    20 * 60_000,
  );

  it(
    "TEST 3 (boru hattı #2 — hata senaryosu): stage 3 (voice) yapay olarak başarısız → retry stage 1-2'yi ATLAR",
    async () => {
      // persona_image zaten Test 1'de succeeded (personaId paylaşılıyor) —
      // bu satıra HİÇ dokunulmuyor, aşağıdaki iddia bunu kanıtlıyor.
      const imgJobBefore = await findStepJob(admin, { contentItemId: null, personaId, step: "persona_image" });
      expect(imgJobBefore?.state).toBe("succeeded");

      // ⚠ aynı 65 karakter sınırı — bkz. contentA'daki not.
      const contentB = await createContentItem("İkinci video.", "Kısa mesaj.");

      // ── persona_video (GERÇEK ikinci Kling çağrısı — boru hattı #2) ─────
      await runUgcPipelineStep({ personaId, step: "persona_video", contentItemId: contentB }, ctx);
      const videoJobB = await findStepJob(admin, { contentItemId: contentB, personaId, step: "persona_video" });
      expect(videoJobB).not.toBeNull();
      const videoDoneB = await pollUntilDone(videoJobB!.id, VIDEO_POLL_TIMEOUT_MS);
      expect(videoDoneB.row.state).toBe("succeeded");
      const videoTaskIdBefore = videoDoneB.row.vendor_task_id;

      // ── stage 3 (voice) YAPAY BAŞARISIZLIK — attempt 1: satırı elle
      // 'failed' olarak simüle et (gerçek bir vendor hatasının markStepFailed
      // sonrası bırakacağı DURUMUN AYNISI), gerçek bir vendor çağrısı
      // YAPMADAN. Bu, worker'ın "attempt 1 başarısız, attempt 2 (retry)"
      // döngüsünün DB-durumunu taklit ediyor — sahte bir birim testi değil,
      // pipeline.ts'in GERÇEK kod yolunu (mevcut satır bulunur, 'failed',
      // dispatch AYNI satırı yeniden kullanır) canlı DB'ye karşı çalıştırıyor.
      const { data: fakeFailedRow, error: insertErr } = await admin
        .from("media_jobs")
        .insert({
          brand_id: brandId, user_id: ownerId, content_item_id: contentB, persona_id: personaId,
          vendor: "elevenlabs", vendor_model: "eleven_multilingual_v2", step: "voice",
          state: "failed", error: "adım20 canlı test — yapay attempt-1 hatası (gerçek vendor çağrısı YOK)",
          credits_estimated: 0,
        })
        .select("id")
        .single<{ id: string }>();
      if (insertErr || !fakeFailedRow) throw new Error(`yapay failed satır yazılamadı: ${insertErr?.message}`);

      // ── retry (attempt 2) — GERÇEK, kısa bir script ile bu kez başarılı ──
      await runUgcPipelineStep({ personaId, step: "voice", contentItemId: contentB }, ctx);
      const voiceJobAfterRetry = await getMediaJob(admin, fakeFailedRow.id);
      expect(voiceJobAfterRetry?.id).toBe(fakeFailedRow.id); // AYNI satır yeniden kullanıldı, yeni satır YOK
      expect(voiceJobAfterRetry?.state).toBe("succeeded");
      console.log("[canlı] KANIT — voice'un attempt-2 retry'ı AYNI media_jobs satırını kullandı (yeni satır açmadı)");

      // ── KANIT — persona_video (stage 2) bu retry'dan TAMAMEN etkilenmedi ─
      const videoJobAfterVoiceRetry = await getMediaJob(admin, videoJobB!.id);
      expect(videoJobAfterVoiceRetry?.vendor_task_id).toBe(videoTaskIdBefore);
      expect(videoJobAfterVoiceRetry?.state).toBe("succeeded");
      console.log("[canlı] KANIT — stage 3 (voice) retry'ı stage 2'nin (persona_video, GERÇEK Kling çıktısı) vendor_task_id'sine DOKUNMADI — video yeniden üretilmedi");

      // ── zincir devam ediyor mu — lipsync'e ilerledi mi? ─────────────────
      const lipsyncJobB = await findStepJob(admin, { contentItemId: contentB, personaId, step: "lipsync" });
      expect(lipsyncJobB).not.toBeNull();
      const lipsyncDoneB = await pollUntilDone(lipsyncJobB!.id, LIPSYNC_POLL_TIMEOUT_MS);
      expect(lipsyncDoneB.row.state).toBe("succeeded");
      console.log(`[canlı] hata senaryosu SONRASI zincir tamamlandı — lipsync gerçek süre: ${Math.round(lipsyncDoneB.elapsedMs / 1000)}sn`);
    },
    20 * 60_000,
  );

  it("TEST 4 (SIFIR maliyet) — aşamalar arası iptal: cancelled satıra dispatch YAPILMAZ", async () => {
    const contentC = await createContentItem("Üçüncü içerik — iptal testi.", "Bu asla üretilmeyecek.");

    // Kullanıcı "iptal etti" — media_jobs satırı elle 'cancelled' yazılıyor
    // (gerçek akışta bu, `/studio`'nun iptal düğmesinin yapacağı UPDATE'in
    // aynısı — burada doğrudan simüle ediliyor, GERÇEK vendor çağrısı YOK).
    const { data: cancelledRow, error } = await admin
      .from("media_jobs")
      .insert({
        brand_id: brandId, user_id: ownerId, content_item_id: contentC, persona_id: personaId,
        vendor: "kie", vendor_model: "kling-3.0/video", step: "persona_video",
        state: "cancelled", credits_estimated: 0,
      })
      .select("id,vendor_task_id")
      .single<{ id: string; vendor_task_id: string | null }>();
    if (error || !cancelledRow) throw new Error(`cancelled satır yazılamadı: ${error?.message}`);

    await runUgcPipelineStep({ personaId, step: "persona_video", contentItemId: contentC }, ctx);

    const afterCall = await getMediaJob(admin, cancelledRow.id);
    expect(afterCall?.state).toBe("cancelled"); // DEĞİŞMEDİ
    expect(afterCall?.vendor_task_id).toBeNull(); // vendor'a HİÇ gidilmedi
    console.log("[canlı] KANIT — cancelled durumundaki adıma runUgcPipelineStep çağrısı SESSİZCE döndü, vendor_task_id null kaldı (bir sonraki pahalı çağrı yapılmadı)");
  }, 30_000);
});
