"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBrand } from "@/lib/server/auth";
import { appConfig } from "@/app.config";
import { resolveProviderCredential, type ProviderName } from "@/lib/server/credentials";
import { verifyAnthropicKey } from "@/lib/core/providers/anthropic";
import { verifyKieKey } from "@/lib/core/providers/kie";
import { verifyElevenLabsKey } from "@/lib/core/providers/elevenlabs";
import { verifyFalKey } from "@/lib/core/providers/fal";

/**
 * BIRLESIM_PLANI §12 adım 13 FAZ B3 — anahtar yazma/silme yolu.
 *
 * ⭐ Kullanıcının KENDİ oturumuyla (`createClient()`, anon key + çerez),
 * `enqueue_job`/`saveBrandAction`'ın deseninin aynısı — service-role YOK.
 * Sahiplik doğrulaması iki katmanlı: `requireBrand()` burada, `owns_brand()`
 * SQL fonksiyonunun İÇİNDE (`set_provider_credential`/`delete_provider_credential`,
 * `00_schema.sql`).
 *
 * ⚠ `p_secret` (form'dan gelen ham anahtar) hiçbir zaman loglanmaz —
 * aşağıda tek referansı `formData.get("apiKey")`'den RPC çağrısına giden
 * değişken; hata yolunda yalnızca `error.message` (Postgres'in kendi hata
 * metni) okunuyor, `set_provider_credential` gizli değeri hata mesajına
 * hiçbir zaman gömmüyor (bkz. `00_schema.sql` fonksiyon gövdesi).
 *
 * ⚠ "use server" dosyaları yalnızca ASYNC FONKSİYON export edebilir
 * (Next.js kısıtı, ADIM_9'da e2e ile yakalanmıştı) — bu yüzden başlangıç
 * state sabiti burada değil, UI bileşeninde tanımlı.
 */

/** Bu formun yönetebileceği sağlayıcılar — `app.config.ts`'in
 *  `managedViaVault` bayrağından türetilir, TEK kaynak (instagram/openai
 *  buradan hariç: instagram OAuth akışı adım 16'nın işi, openai UI'da hiç
 *  sunulmuyor — D3 Voyage'ı seçti). */
const MANAGED_PROVIDERS = new Set(
  appConfig.integrations.filter((i) => i.managedViaVault).map((i) => i.key),
);

export interface CredentialActionState {
  errorKey: "errCredentialProviderInvalid" | "errCredentialEmpty" | "errCredentialSaveFailed" | "errCredentialDeleteFailed" | null;
  provider: string | null;
  /** Değişince istemci "kaydedildi/silindi" mesajını gösterir. */
  savedAt: number | null;
  /** ⭐ adım 20.5 FAZ B — kaydedilen anahtar bu sağlayıcı için BİLİNEN
   *  önekle (ElevenLabs `sk_`, Anthropic `sk-ant-`) BAŞLAMIYOR. Kaydetmeyi
   *  ENGELLEMEZ (öneki bilinmeyen/değişmiş olabilir) — yalnızca uyarır.
   *  ADIM_20'nin gerçek olayı (ElevenLabs Key ID'si gerçek anahtar
   *  SANILDI) tam olarak bu heuristikle bedava yakalanırdı. */
  formatWarning: boolean;
}

function invalidProvider(provider: string): CredentialActionState {
  return { errorKey: "errCredentialProviderInvalid", provider, savedAt: null, formatWarning: false };
}

/** Yalnızca DOĞRULANMIŞ önekler — bilinmeyen bir sağlayıcı için tahmin
 *  YÜRÜTÜLMEDİ (kie/fal'in belgelenmiş bir anahtar öneki bu oturumda teyit
 *  edilemedi, o yüzden burada YOK — yanlış pozitif, hiç kontrol etmemekten
 *  daha kötü). */
const KEY_PREFIX_HINTS: Partial<Record<string, string>> = {
  elevenlabs: "sk_",
  anthropic: "sk-ant-",
};

function matchesKnownPrefix(provider: string, secret: string): boolean {
  const prefix = KEY_PREFIX_HINTS[provider];
  return !prefix || secret.startsWith(prefix);
}

export async function saveCredentialAction(
  _prev: CredentialActionState,
  formData: FormData,
): Promise<CredentialActionState> {
  const { brand } = await requireBrand();
  const provider = String(formData.get("provider") ?? "");
  if (!MANAGED_PROVIDERS.has(provider)) return invalidProvider(provider);

  const secret = String(formData.get("apiKey") ?? "").trim();
  if (!secret) return { errorKey: "errCredentialEmpty", provider, savedAt: null, formatWarning: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_provider_credential", {
    p_brand_id: brand.id,
    p_provider: provider,
    p_secret: secret,
  });
  if (error) return { errorKey: "errCredentialSaveFailed", provider, savedAt: null, formatWarning: false };

  revalidatePath("/settings");
  return { errorKey: null, provider, savedAt: Date.now(), formatWarning: !matchesKnownPrefix(provider, secret) };
}

export async function deleteCredentialAction(
  _prev: CredentialActionState,
  formData: FormData,
): Promise<CredentialActionState> {
  const { brand } = await requireBrand();
  const provider = String(formData.get("provider") ?? "");
  if (!MANAGED_PROVIDERS.has(provider)) return invalidProvider(provider);

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_provider_credential", {
    p_brand_id: brand.id,
    p_provider: provider,
  });
  if (error) return { errorKey: "errCredentialDeleteFailed", provider, savedAt: null, formatWarning: false };

  revalidatePath("/settings");
  return { errorKey: null, provider, savedAt: Date.now(), formatWarning: false };
}

/**
 * "Test et" düğmesi — BIRLESIM_PLANI §12 adım 20.5 FAZ B.
 *
 * Sıra ÖNEMLİ: (1) hız sınırı — RAW anahtarı hiç okumadan ÖNCE reddeder,
 * düğmeye basıp durmak faturayı şişirmesin; (2) `resolveProviderCredential`
 * (service-role, `lib/server/README.md` "üç yer" kuralının 3. maddesi —
 * `provider_credentials` okuması, her bağlamdan izinli); (3) sağlayıcının
 * KENDİ en ucuz uç noktası (`lib/core/providers/*`, her biri kendi
 * gerekçesini taşıyor); (4) sonuç `record_provider_verification` RPC'sine
 * KULLANICI OTURUMUYLA yazılır — RAW anahtar bu yazma yoluna hiç GİRMEZ.
 */
export interface VerifyActionState {
  provider: string | null;
  status: "idle" | "ok" | "error";
  detail: string | null;
  /** Değişince istemci "test edildi" mesajını gösterir (savedAt deseniyle aynı). */
  verifiedAt: number | null;
}

const VERIFIERS: Partial<Record<string, (apiKey: string) => Promise<{ ok: boolean; error?: string }>>> = {
  anthropic: verifyAnthropicKey,
  kie: verifyKieKey,
  elevenlabs: verifyElevenLabsKey,
  fal: verifyFalKey,
};

export async function verifyCredentialAction(
  _prev: VerifyActionState,
  formData: FormData,
): Promise<VerifyActionState> {
  const { brand } = await requireBrand();
  const provider = String(formData.get("provider") ?? "");
  const verifier = VERIFIERS[provider];
  if (!MANAGED_PROVIDERS.has(provider) || !verifier) {
    return { provider, status: "error", detail: "bu sağlayıcı için test desteklenmiyor", verifiedAt: null };
  }

  const supabase = await createClient();

  const { data: allowed, error: rateLimitError } = await supabase
    .rpc("check_credential_verify_rate_limit", { p_brand_id: brand.id });
  if (rateLimitError) return { provider, status: "error", detail: rateLimitError.message, verifiedAt: null };
  if (!allowed) {
    return { provider, status: "error", detail: "çok sık test edildi — biraz sonra tekrar dene", verifiedAt: null };
  }

  const { apiKey } = await resolveProviderCredential(brand.id, provider as ProviderName);
  if (!apiKey) return { provider, status: "error", detail: "önce bir anahtar kaydet", verifiedAt: null };

  const result = await verifier(apiKey);

  const { error: recordError } = await supabase.rpc("record_provider_verification", {
    p_brand_id: brand.id, p_provider: provider, p_ok: result.ok, p_error: result.error ?? null,
  });
  if (recordError) return { provider, status: "error", detail: recordError.message, verifiedAt: null };

  revalidatePath("/settings");
  return {
    provider,
    status: result.ok ? "ok" : "error",
    detail: result.ok ? null : (result.error ?? "doğrulama başarısız"),
    verifiedAt: Date.now(),
  };
}
