// @vitest-environment node
//
// Gerçek vendor çağrıları — ama HER BİRİ görev metninin "en ucuz uç nokta"
// kısıtına uyuyor: kie kredi bakiyesi, ElevenLabs abonelik/kota, fal kuyruk
// durumu (var olmayan bir id için), Anthropic model listesi. HİÇBİRİ üretim
// BAŞLATMAZ — bu adımın "sıfır Kling çağrısı" kısıtıyla ÇAKIŞMAZ.
import { beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { verifyAnthropicKey } from "@/lib/core/providers/anthropic";
import { verifyKieKey } from "@/lib/core/providers/kie";
import { verifyElevenLabsKey } from "@/lib/core/providers/elevenlabs";
import { verifyFalKey } from "@/lib/core/providers/fal";

/**
 * BIRLESIM_PLANI §12 adım 20.5 FAZ B DOĞRULAMA: "dört sağlayıcı için test
 * düğmesi çalışıyor; geçersiz anahtar → net hata". Bu dosya `verifyCredentialAction`'ın
 * SUNUCU EYLEMİ kabuğunu (Next `cookies()` gerektirir, vitest'te taklit
 * edilemez) DEĞİL, dört sağlayıcının kendi doğrulama fonksiyonunu — asıl
 * mantık — canlıya karşı kanıtlıyor.
 *
 *   set -a; source .env.local; set +a
 *   RUN_CREDENTIAL_VERIFY_LIVE_TEST=1 npx vitest run lib/core/providers/verify.live.test.ts
 */
const RUN = process.env.RUN_CREDENTIAL_VERIFY_LIVE_TEST === "1";

describe.skipIf(!RUN)("sağlayıcı kimlik bilgisi doğrulama — canlı, en ucuz uç nokta (adım 20.5 FAZ B)", () => {
  let brandId: string;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("brands").select("id").eq("name", "Carino Pizza").maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!data) throw new Error("canlı test için 'Carino Pizza' markası bulunamadı (gerçek vendor anahtarları orada)");
    brandId = data.id;
  });

  it("kie — GERÇEK anahtar: getCredits gerçek bir bakiye döndürür (ok:true)", async () => {
    const { apiKey } = await resolveProviderCredential(brandId, "kie");
    if (!apiKey) throw new Error("Carino Pizza'da kie anahtarı yapılandırılmamış");
    const result = await verifyKieKey(apiKey);
    console.log("[verify canlı] kie —", JSON.stringify(result));
    expect(result.ok).toBe(true);
  });

  it("kie — GEÇERSİZ anahtar: net hatayla ok:false", async () => {
    const result = await verifyKieKey("obviously-invalid-kie-key");
    console.log("[verify canlı] kie (geçersiz) —", JSON.stringify(result));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("elevenlabs — GERÇEK anahtar: /user/subscription gerçek kota döndürür (ok:true)", async () => {
    const { apiKey } = await resolveProviderCredential(brandId, "elevenlabs");
    if (!apiKey) throw new Error("Carino Pizza'da elevenlabs anahtarı yapılandırılmamış");
    const result = await verifyElevenLabsKey(apiKey);
    console.log("[verify canlı] elevenlabs —", JSON.stringify(result));
    expect(result.ok).toBe(true);
  });

  it("elevenlabs — GEÇERSİZ anahtar: net hatayla ok:false", async () => {
    const result = await verifyElevenLabsKey("sk_obviously_invalid");
    console.log("[verify canlı] elevenlabs (geçersiz) —", JSON.stringify(result));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("fal — GERÇEK anahtar: kuyruk durumu sorgusu 401 vermez (ok:true)", async () => {
    const { apiKey } = await resolveProviderCredential(brandId, "fal");
    if (!apiKey) throw new Error("Carino Pizza'da fal anahtarı yapılandırılmamış");
    const result = await verifyFalKey(apiKey);
    console.log("[verify canlı] fal —", JSON.stringify(result));
    expect(result.ok).toBe(true);
  });

  it("fal — GEÇERSİZ anahtar: 401/403 ile ok:false", async () => {
    const result = await verifyFalKey("obviously-invalid-fal-key");
    console.log("[verify canlı] fal (geçersiz) —", JSON.stringify(result));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("anthropic — GEÇERSİZ anahtar: net hatayla ok:false (invalid_key sınıfı)", async () => {
    const result = await verifyAnthropicKey("obviously-invalid-anthropic-key");
    console.log("[verify canlı] anthropic (geçersiz) —", JSON.stringify(result));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("anthropic — marka yapılandırılmışsa gerçek anahtarla ÇAĞRILABİLİR (sonuç ADIM_15'in bilinen 'identity-linked anahtar' riskiyle ok:false de olabilir — burada yalnızca FONKSİYONUN atmadığını doğruluyoruz)", async () => {
    const { apiKey } = await resolveProviderCredential(brandId, "anthropic");
    if (!apiKey) {
      console.warn("[verify canlı] Carino Pizza'da anthropic anahtarı yok — bu senaryo atlandı");
      return;
    }
    const result = await verifyAnthropicKey(apiKey);
    console.log("[verify canlı] anthropic (gerçek anahtar) —", JSON.stringify(result));
    expect(typeof result.ok).toBe("boolean");
  });
});
