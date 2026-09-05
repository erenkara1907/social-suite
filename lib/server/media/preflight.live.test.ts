// @vitest-environment node
//
// Gerçek Supabase — vendor'a (Kie/ElevenLabs/fal) HİÇBİR ÇAĞRI YOK. Bu
// dosyanın tamamı "ön kontrol vendor'a gitmeden ÖNCE durur" iddiasını
// kanıtlar — görev kısıtı ("bu adımda hiçbir Kling çağrısı yapılmayacak")
// zaten dosyanın konusuyla birebir örtüşüyor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobContext } from "@/lib/core/jobs/types";
import { PermanentJobError } from "@/lib/core/jobs/errors";
import { checkUgcPreflight } from "@/lib/server/media/preflight";
import { findStepJob } from "@/lib/server/media/job-row";
import { runUgcPipelineStep } from "@/lib/server/media/pipeline";

/**
 * `ugc_pipeline` ön kontrol kapısı — BIRLESIM_PLANI §12 adım 20.5 FAZ A
 * DOĞRULAMA: "her ön kontrol maddesi için ayrı test; eksik durumda SIFIR
 * vendor çağrısı yapıldığının kanıtı".
 *
 * İki marka kullanılır:
 *   - "Carino Pizza" — adım 20'den kalan, GERÇEK kie/elevenlabs/fal
 *     `provider_credentials` satırları olan marka. Kimlik bilgisi
 *     kontrolünü GEÇMESİ gereken senaryolar (persona_image/voice_id/
 *     script_length'i İZOLE etmek için) burada — anahtarlar gerçek olsa
 *     da ön kontrol vendor'a HİÇ gitmiyor, yalnızca satır var mı bakıyor.
 *   - geçici bir test markası — SIFIR `provider_credentials` satırı, tüm
 *     "eksik kimlik bilgisi" senaryoları için.
 *
 *   set -a; source .env.local; set +a
 *   RUN_UGC_PREFLIGHT_LIVE_TEST=1 npx vitest run lib/server/media/preflight.live.test.ts
 */
const RUN = process.env.RUN_UGC_PREFLIGHT_LIVE_TEST === "1";

describe.skipIf(!RUN)("ugc_pipeline ön kontrol kapısı — canlı Supabase, sıfır vendor çağrısı (adım 20.5 FAZ A)", () => {
  let admin: ReturnType<typeof createAdminClient>;
  let noCredsBrandId: string;
  let carinoBrandId: string;
  let carinoOwnerId: string;
  const personaIds: string[] = [];
  const contentItemIds: string[] = [];
  const tempBrandIds: string[] = [];

  const SHORT_HOOK = "kısa bir kanca";
  const SHORT_BODY = "kısa bir gövde metni.";
  // 5sn klip × 13 karakter/sn = 65 karakter sınırı (kie.ts maxScriptCharsForClip).
  const LONG_BODY = "x".repeat(120);

  async function makePersona(brandId: string, userId: string, overrides: Partial<{ imageAssetId: string | null; defaultVoiceId: string | null }> = {}) {
    const { data, error } = await admin
      .from("personas")
      .insert({
        brand_id: brandId, user_id: userId, name: `preflight-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt: "preflight canlı testi — gerçek bir prompt değil, yalnızca NOT NULL kısıtını karşılıyor.",
        image_asset_id: overrides.imageAssetId ?? null,
        default_voice_id: overrides.defaultVoiceId ?? null,
      })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`persona oluşturulamadı: ${error?.message}`);
    personaIds.push(data.id);
    return data.id;
  }

  async function makeContentItem(brandId: string, userId: string, body: string) {
    const { data, error } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: userId, platform: "instagram", kind: "video",
        title: "preflight canlı test", hook: SHORT_HOOK, body,
      })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`content_item oluşturulamadı: ${error?.message}`);
    contentItemIds.push(data.id);
    return data.id;
  }

  beforeAll(async () => {
    admin = createAdminClient();

    const { data: carino, error: carinoError } = await admin
      .from("brands").select("id,owner_id").eq("name", "Carino Pizza").maybeSingle<{ id: string; owner_id: string }>();
    if (carinoError) throw carinoError;
    if (!carino) throw new Error("canlı test için 'Carino Pizza' markası bulunamadı (gerçek vendor anahtarları orada)");
    carinoBrandId = carino.id;
    carinoOwnerId = carino.owner_id;

    const { data: noCreds, error: noCredsError } = await admin
      .from("brands").insert({ owner_id: carinoOwnerId, name: `preflight-noc-${Date.now()}` }).select("id").single<{ id: string }>();
    if (noCredsError || !noCreds) throw new Error(`geçici marka oluşturulamadı: ${noCredsError?.message}`);
    noCredsBrandId = noCreds.id;
    tempBrandIds.push(noCreds.id);
  });

  afterAll(async () => {
    // Sıra önemli: content_items/personas önce (Carino Pizza'ya bağlı olanlar
    // marka SİLİNMEDİĞİ için elle temizlenmeli); geçici markalar (cascade)
    // kendi personas/content_items'ını zaten temizler ama elle temizlik
    // zararsız (idempotent delete).
    for (const id of contentItemIds) await admin.from("content_items").delete().eq("id", id);
    for (const id of personaIds) await admin.from("personas").delete().eq("id", id);
    for (const id of tempBrandIds) await admin.from("brands").delete().eq("id", id);
  });

  it("KONTROL 1 — kimlik bilgisi: hiçbir provider_credentials satırı yokken kie/elevenlabs/fal HEPSİ eksik raporlanır", async () => {
    const personaId = await makePersona(noCredsBrandId, carinoOwnerId);
    const contentItemId = await makeContentItem(noCredsBrandId, carinoOwnerId, SHORT_BODY);

    const issues = await checkUgcPreflight(admin, {
      brandId: noCredsBrandId, personaId, persona: { imageAssetId: null },
      fromStep: "persona_video", contentItemId,
    });

    const checks = issues.map((i) => i.check);
    const vendors = issues.filter((i) => i.check === "credential").map((i) => i.vendor);
    expect(vendors.sort()).toEqual(["elevenlabs", "fal", "kie"]);
    expect(checks).toContain("persona_image"); // görsel de yok
    expect(checks).toContain("voice_id");       // varsayılan ses de yok
    expect(checks).not.toContain("script_length"); // metin kısa
    console.log("[preflight canlı] KONTROL 1 —", JSON.stringify(issues));
  });

  it("KONTROL 2 — 'kalan adımlar' hassasiyeti: fromStep=lipsync iken yalnızca fal aranır, kie/elevenlabs İSTENMEZ", async () => {
    const personaId = await makePersona(noCredsBrandId, carinoOwnerId);
    const contentItemId = await makeContentItem(noCredsBrandId, carinoOwnerId, SHORT_BODY);

    const issues = await checkUgcPreflight(admin, {
      brandId: noCredsBrandId, personaId, persona: { imageAssetId: null },
      fromStep: "lipsync", contentItemId,
    });

    expect(issues).toEqual([{ check: "credential", vendor: "fal", message: expect.stringContaining("fal") }]);
    console.log("[preflight canlı] KONTROL 2 —", JSON.stringify(issues));
  });

  it("KONTROL 3 — persona görseli eksik: gerçek kimlik bilgileriyle (Carino Pizza) TEK BAŞINA izole edilir", async () => {
    const personaId = await makePersona(carinoBrandId, carinoOwnerId, { defaultVoiceId: "placeholder-voice-id" });
    const contentItemId = await makeContentItem(carinoBrandId, carinoOwnerId, SHORT_BODY);

    const issues = await checkUgcPreflight(admin, {
      brandId: carinoBrandId, personaId, persona: { imageAssetId: null },
      fromStep: "persona_video", contentItemId,
    });

    expect(issues).toEqual([{ check: "persona_image", message: expect.stringContaining("görsel") }]);
    console.log("[preflight canlı] KONTROL 3 —", JSON.stringify(issues));
  });

  it("KONTROL 4 — persona varsayılan sesi eksik: fromStep=voice ile persona_image kontrolü DEVRE DIŞI, yalnızca voice_id kalır", async () => {
    const personaId = await makePersona(carinoBrandId, carinoOwnerId); // ne görsel ne ses
    const contentItemId = await makeContentItem(carinoBrandId, carinoOwnerId, SHORT_BODY);

    const issues = await checkUgcPreflight(admin, {
      brandId: carinoBrandId, personaId, persona: { imageAssetId: null },
      fromStep: "voice", contentItemId,
    });

    expect(issues).toEqual([{ check: "voice_id", message: expect.stringContaining("varsayılan sesi yok") }]);
    console.log("[preflight canlı] KONTROL 4 —", JSON.stringify(issues));
  });

  it("KONTROL 5 — metin uzunluğu: fal cut_off sınırını (65 karakter, 5sn klip) aşan script tek başına yakalanır", async () => {
    const personaId = await makePersona(carinoBrandId, carinoOwnerId, { defaultVoiceId: "placeholder-voice-id" });
    const contentItemId = await makeContentItem(carinoBrandId, carinoOwnerId, LONG_BODY);

    const issues = await checkUgcPreflight(admin, {
      brandId: carinoBrandId, personaId, persona: { imageAssetId: null },
      fromStep: "voice", contentItemId,
    });

    expect(issues).toEqual([{ check: "script_length", message: expect.stringContaining("karakter") }]);
    console.log("[preflight canlı] KONTROL 5 —", JSON.stringify(issues));
  });

  it("KONTROL 6 — sıfır vendor çağrısı KANITI: runUgcPipelineStep preflight'ta durur, media_jobs satırı HİÇ açılmaz", async () => {
    const personaId = await makePersona(noCredsBrandId, carinoOwnerId);
    const contentItemId = await makeContentItem(noCredsBrandId, carinoOwnerId, SHORT_BODY);
    const ctx: JobContext = { jobId: "preflight-live-test", brandId: noCredsBrandId, userId: carinoOwnerId };

    await expect(
      runUgcPipelineStep({ personaId, step: "persona_video", contentItemId }, ctx),
    ).rejects.toThrow(PermanentJobError);

    // ⭐ KANIT — `dispatchPersonaVideo` hiç çalışmadı: `insertQueuedJob` hiç
    // çağrılmadı demek, bu (persona, step) için media_jobs'ta SATIR YOK.
    // ADIM_20'nin "vendor_task_id hiç oluşmadı" kanıtıyla AYNI desen —
    // burada bir adım daha erken: satırın kendisi bile açılmadı.
    const row = await findStepJob(admin, { contentItemId, personaId, step: "persona_video" });
    expect(row).toBeNull();
    console.log("[preflight canlı] KONTROL 6 — media_jobs satırı: ", row);
  });
});
