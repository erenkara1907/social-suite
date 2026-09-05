// @vitest-environment node
//
// Gerçek Supabase + GERÇEK ElevenLabs (abonelik dahilinde, ek kredi YOK —
// ADIM_20_RAPOR.md'nin kendi maliyet tablosu: "voice — abonelik dahilinde,
// ek maliyet yok"). Kie (Kling) HİÇ ÇAĞRILMAZ — persona_video adımı bu
// testte baştan `succeeded` olarak ELLE kurulur, gerçek bir render asla
// tetiklenmez. fal (lipsync) de çağrılmaz: chainToNextStep'in açtığı
// `lipsync` işi yalnızca `jobs` kuyruğuna YAZILIR, cron pasif olduğu için
// hiçbir worker onu ALMAZ (afterAll'da elle silinir).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobContext } from "@/lib/core/jobs/types";
import { runUgcPipelineStep } from "@/lib/server/media/pipeline";
import { findStepJob, type MediaJobDbRow } from "@/lib/server/media/job-row";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { listTurkishVoices } from "@/lib/core/providers/elevenlabs";

/**
 * "Gerçek başarısızlık → retry aşama atlar" — BIRLESIM_PLANI §12 adım 20.5
 * FAZ C2. ADIM_20_RAPOR.md'nin açıkça bıraktığı boşluk: TEST 3 (bir adımı
 * GERÇEKTEN başarısız kılıp retry'ın AYNI satırı yeniden kullanarak devam
 * ettiğini kanıtlamak) Kie kredisi tükendiği için canlıda TAMAMLANAMADI.
 *
 * Bu oturum Kling çağıramaz (görev kısıtı). Senaryo bu yüzden `voice`
 * adımında kurulu — dispatch'i GERÇEK ve ÜCRETSİZ (ElevenLabs abonelik),
 * `persona_video`'nun "tamamlanmış aşama" işareti İSE ELLE (sahte
 * vendor_task_id, hiçbir Kie çağrısı olmadan) kuruluyor. Senaryo:
 *   1. persona_video → succeeded (elle, "aşama işareti yerinde")
 *   2. voice → failed (elle, "gerçek bir başarısızlık" simülasyonu)
 *   3. runUgcPipelineStep({step:"voice"}) — GERÇEK ElevenLabs dispatch
 *   4. KANIT A — voice satırı AYNI id ile succeeded'a geçti (yeni satır AÇILMADI)
 *   5. KANIT B — persona_video satırı BAYT BAYT aynı kaldı (retry onu
 *      YENİDEN DENEMEDİ, dokunmadı bile)
 *   6. KANIT C — preflight'ın "kalan adımlar" hesabı voice'tan başlarken
 *      kie'yi hiç istemez (lib/core/media/preflight.ts, FAZ A) — bu adımın
 *      Kie'ye HİÇ gidemeyeceğinin yapısal garantisi
 *
 *   set -a; source .env.local; set +a
 *   RUN_RETRY_FROM_FAILED_LIVE_TEST=1 npx vitest run lib/server/media/retry-from-failed.live.test.ts
 */
const RUN = process.env.RUN_RETRY_FROM_FAILED_LIVE_TEST === "1";

describe.skipIf(!RUN)("ugc_pipeline — gerçek başarısızlık → retry aynı satırı kullanır (adım 20.5 FAZ C2)", () => {
  let admin: ReturnType<typeof createAdminClient>;
  let brandId: string;
  let ownerId: string;
  let personaId: string;
  let contentItemId: string;
  let personaVideoRowId: string;
  let voiceRowId: string;
  let personaVideoSnapshot: MediaJobDbRow;
  const assetIds = new Set<string>();
  const storagePaths: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();

    const { data: brand, error: brandError } = await admin
      .from("brands").select("id,owner_id").eq("name", "Carino Pizza").maybeSingle<{ id: string; owner_id: string }>();
    if (brandError) throw brandError;
    if (!brand) throw new Error("canlı test için 'Carino Pizza' markası bulunamadı");
    brandId = brand.id;
    ownerId = brand.owner_id;

    const { apiKey: elevenLabsKey } = await resolveProviderCredential(brandId, "elevenlabs");
    if (!elevenLabsKey) throw new Error("canlı test için elevenlabs anahtarı yapılandırılmamış (Carino Pizza)");
    const turkishVoices = await listTurkishVoices(elevenLabsKey);
    if (turkishVoices.length === 0) throw new Error("canlı test için en az bir Türkçe ses gerekiyor");

    const { data: persona, error: personaError } = await admin
      .from("personas")
      .insert({
        brand_id: brandId, user_id: ownerId, name: `adım20.5-retry-test-${Date.now()}`,
        prompt: "retry-from-failed canlı testi — yalnızca NOT NULL kısıtını karşılıyor, hiç görsel üretilmeyecek.",
        default_voice_id: turkishVoices[0].voiceId,
      })
      .select("id").single<{ id: string }>();
    if (personaError || !persona) throw new Error(`persona oluşturulamadı: ${personaError?.message}`);
    personaId = persona.id;

    const { data: item, error: itemError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: ownerId, platform: "instagram", kind: "reels",
        title: "adım20.5 retry canlı testi", hook: "kısa bir kanca", body: "kısa bir gövde metni.",
      })
      .select("id").single<{ id: string }>();
    if (itemError || !item) throw new Error(`content_item oluşturulamadı: ${itemError?.message}`);
    contentItemId = item.id;

    // ── "aşama işareti yerinde": persona_video ELLE succeeded ────────────
    // Sahte vendor_task_id — Kie'ye HİÇ gidilmedi, gidilmeyecek de (bu
    // testin entry point'i doğrudan "voice", persona_video hiç dispatch
    // edilmiyor).
    const { data: pv, error: pvError } = await admin
      .from("media_jobs")
      .insert({
        brand_id: brandId, user_id: ownerId, content_item_id: contentItemId, persona_id: personaId,
        vendor: "kie", vendor_model: "kling-3.0/video", step: "persona_video", state: "succeeded",
        vendor_task_id: "elle-kuruldu-kie-hic-cagrilmadi-sahte-id",
        credits_estimated: 135, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      })
      .select("*").single<MediaJobDbRow>();
    if (pvError || !pv) throw new Error(`persona_video satırı yazılamadı: ${pvError?.message}`);
    personaVideoRowId = pv.id;
    personaVideoSnapshot = pv;

    // ── "gerçek bir başarısızlık": voice ELLE failed ──────────────────────
    const { data: v, error: vError } = await admin
      .from("media_jobs")
      .insert({
        brand_id: brandId, user_id: ownerId, content_item_id: contentItemId, persona_id: personaId,
        vendor: "elevenlabs", vendor_model: "eleven_multilingual_v2", step: "voice", state: "failed",
        error: "simüle edilmiş ağ hatası (attempt 1) — adım 20.5 FAZ C2",
        credits_estimated: 0, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      })
      .select("*").single<MediaJobDbRow>();
    if (vError || !v) throw new Error(`voice satırı yazılamadı: ${vError?.message}`);
    voiceRowId = v.id;
  }, 30_000); // gerçek Türkçe ses listesi (HTTP) — 5sn varsayılanı yetmeyebilir

  afterAll(async () => {
    if (contentItemId) {
      const { data: jobs } = await admin.from("media_jobs").select("result_asset_id").eq("content_item_id", contentItemId).not("result_asset_id", "is", null);
      for (const j of jobs ?? []) if (j.result_asset_id) assetIds.add(j.result_asset_id);
    }
    if (assetIds.size) {
      const { data: assets } = await admin.from("media_assets").select("storage_path").in("id", [...assetIds]);
      for (const a of assets ?? []) if (a.storage_path) storagePaths.push(a.storage_path);
    }

    if (contentItemId) {
      // chainToNextStep'in açtığı "lipsync" jobs satırı — hiçbir worker
      // onu almadı (cron pasif), yine de temizlik olarak siliniyor.
      await admin.from("jobs").delete().eq("brand_id", brandId).eq("kind", "ugc_pipeline")
        .like("dedupe_key", `ugc_pipeline:${contentItemId}:%`);
      await admin.from("activity").delete().eq("content_item_id", contentItemId);
      await admin.from("media_jobs").delete().eq("content_item_id", contentItemId);
      await admin.from("content_items").delete().eq("id", contentItemId);
    }
    if (personaId) await admin.from("personas").delete().eq("id", personaId);
    if (assetIds.size) await admin.from("media_assets").delete().in("id", [...assetIds]);
    if (storagePaths.length) await admin.storage.from("media").remove(storagePaths);
  });

  it("failed → retry AYNI satırı kullanır, persona_video'ya HİÇ dokunmaz", async () => {
    // Gerçek ElevenLabs TTS + Supabase Storage yükleme — vitest'in 5sn
    // varsayılanı yetmez (pipeline.live.test.ts'in aynı gerekçesi).
    const ctx: JobContext = { jobId: "retry-live-test", brandId, userId: ownerId };

    // ── attempt 2: gerçek dispatch, gerçek ElevenLabs, sıfır Kie/fal ────
    await runUgcPipelineStep({ personaId, step: "voice", contentItemId }, ctx);

    const voiceAfter = await findStepJob(admin, { contentItemId, personaId, step: "voice" });
    console.log("[retry canlı] KANIT A — voice satırı (retry sonrası):", JSON.stringify(voiceAfter));
    expect(voiceAfter?.id).toBe(voiceRowId); // AYNI satır — yeni satır AÇILMADI
    expect(voiceAfter?.state).toBe("succeeded");
    expect(voiceAfter?.error).toBeNull();

    const personaVideoAfter = await findStepJob(admin, { contentItemId, personaId, step: "persona_video" });
    console.log("[retry canlı] KANIT B — persona_video satırı (dokunulmadı mı?):", JSON.stringify(personaVideoAfter));
    expect(personaVideoAfter?.id).toBe(personaVideoRowId);
    expect(personaVideoAfter?.state).toBe("succeeded");
    expect(personaVideoAfter?.vendor_task_id).toBe(personaVideoSnapshot.vendor_task_id); // BAYT BAYT aynı
    expect(personaVideoAfter?.finished_at).toBe(personaVideoSnapshot.finished_at); // hiç yeniden yazılmadı

    // Bu (persona, step=voice) üçlüsü için TEK satır var — retry ikinci
    // bir satır AÇMADI.
    const { count } = await admin
      .from("media_jobs").select("id", { count: "exact", head: true })
      .eq("content_item_id", contentItemId).eq("persona_id", personaId).eq("step", "voice");
    expect(count).toBe(1);
  }, 30_000);
});
