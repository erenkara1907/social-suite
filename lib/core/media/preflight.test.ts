import { describe, expect, it } from "vitest";
import { evaluateUgcPreflight, remainingUgcSteps, ugcStepVendor, type PreflightFacts } from "./preflight";

/**
 * `evaluateUgcPreflight()` birim testleri — BIRLESIM_PLANI §12 adım 20.5
 * FAZ A DOĞRULAMA: "her ön kontrol maddesi için ayrı test". Saf fonksiyon,
 * hiçbir mock GEREKMEZ — girdi/çıktı.
 */

const BASE: PreflightFacts = {
  fromStep: "persona_video",
  contentItemId: "content-1",
  credentialConfigured: { kie: true, elevenlabs: true, fal: true },
  personaImageAssetId: "asset-1",
  personaDefaultVoiceId: "voice-1",
  script: "kısa bir metin",
  maxScriptChars: 65,
};

describe("remainingUgcSteps", () => {
  it("contentItemId doluysa fromStep'ten zincirin SONUNA kadar döner", () => {
    expect(remainingUgcSteps("persona_video", "content-1")).toEqual(["persona_video", "voice", "lipsync"]);
  });

  it("fromStep=voice ile geriye yalnızca voice+lipsync kalır (persona_video/kie İLGİSİZ)", () => {
    expect(remainingUgcSteps("voice", "content-1")).toEqual(["voice", "lipsync"]);
  });

  it("contentItemId null ise (bağımsız persona_image) zincir HİÇ ilerlemez", () => {
    expect(remainingUgcSteps("persona_image", null)).toEqual(["persona_image"]);
  });
});

describe("ugcStepVendor", () => {
  it("persona_image ve persona_video → kie", () => {
    expect(ugcStepVendor("persona_image")).toBe("kie");
    expect(ugcStepVendor("persona_video")).toBe("kie");
  });
  it("voice → elevenlabs, lipsync → fal", () => {
    expect(ugcStepVendor("voice")).toBe("elevenlabs");
    expect(ugcStepVendor("lipsync")).toBe("fal");
  });
  it("bu boru hattının parçası olmayan adım (post_image) → null", () => {
    expect(ugcStepVendor("post_image")).toBeNull();
  });
});

describe("evaluateUgcPreflight", () => {
  it("her şey yolundaysa sıfır ihlal döner", () => {
    expect(evaluateUgcPreflight(BASE)).toEqual([]);
  });

  it("KONTROL — kie eksikse persona_video adımı için ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, credentialConfigured: { ...BASE.credentialConfigured, kie: false } });
    expect(issues).toEqual([{ check: "credential", vendor: "kie", message: expect.stringContaining("kie") }]);
  });

  it("KONTROL — elevenlabs eksikse voice içeren zincirde ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, credentialConfigured: { ...BASE.credentialConfigured, elevenlabs: false } });
    expect(issues.some((i) => i.check === "credential" && i.vendor === "elevenlabs")).toBe(true);
  });

  it("KONTROL — fal eksikse lipsync içeren zincirde ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, credentialConfigured: { ...BASE.credentialConfigured, fal: false } });
    expect(issues.some((i) => i.check === "credential" && i.vendor === "fal")).toBe(true);
  });

  it("KONTROL — fromStep=lipsync iken elevenlabs/kie EKSİK olsa da ihlal üretmez (zincirde yok)", () => {
    const issues = evaluateUgcPreflight({
      ...BASE, fromStep: "lipsync",
      credentialConfigured: { kie: false, elevenlabs: false, fal: true },
    });
    expect(issues).toEqual([]);
  });

  it("KONTROL — persona_video zincirdeyken görsel yoksa ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, personaImageAssetId: null });
    expect(issues).toEqual([{ check: "persona_image", message: expect.stringContaining("görsel") }]);
  });

  it("KONTROL — fromStep=voice iken (persona_video zincirde DEĞİL) görsel eksikliği görmezden gelinir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, fromStep: "voice", personaImageAssetId: null });
    expect(issues.some((i) => i.check === "persona_image")).toBe(false);
  });

  it("KONTROL — voice zincirdeyken default_voice_id yoksa ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, personaDefaultVoiceId: null });
    expect(issues).toEqual([{ check: "voice_id", message: expect.stringContaining("varsayılan sesi yok") }]);
  });

  it("KONTROL — script fal'in cut_off sınırını aşarsa ihlal üretir", () => {
    const issues = evaluateUgcPreflight({ ...BASE, script: "x".repeat(66), maxScriptChars: 65 });
    expect(issues).toEqual([{ check: "script_length", message: expect.stringContaining("karakter") }]);
  });

  it("KONTROL — script sınırın TAM ALTINDA ise ihlal üretmez", () => {
    const issues = evaluateUgcPreflight({ ...BASE, script: "x".repeat(65), maxScriptChars: 65 });
    expect(issues).toEqual([]);
  });

  it("KONTROL — script null ise (içerik henüz yok) uzunluk kontrolü atlanır", () => {
    const issues = evaluateUgcPreflight({ ...BASE, script: null });
    expect(issues.some((i) => i.check === "script_length")).toBe(false);
  });

  it("KONTROL — bağımsız persona_image (contentItemId null) yalnızca kie'yi ister", () => {
    const issues = evaluateUgcPreflight({
      ...BASE, fromStep: "persona_image", contentItemId: null,
      credentialConfigured: { kie: false, elevenlabs: false, fal: false },
      personaImageAssetId: null, personaDefaultVoiceId: null, script: null,
    });
    expect(issues).toEqual([{ check: "credential", vendor: "kie", message: expect.stringContaining("kie") }]);
  });

  it("KONTROL — birden fazla ihlal AYNI ANDA raporlanır (tek hata mesajına indirgeme çağıranın işi)", () => {
    const issues = evaluateUgcPreflight({
      ...BASE,
      credentialConfigured: { kie: false, elevenlabs: false, fal: true },
      personaImageAssetId: null,
      personaDefaultVoiceId: null,
    });
    expect(issues).toHaveLength(4); // credential(kie), credential(elevenlabs), persona_image, voice_id
  });
});
