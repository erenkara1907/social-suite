"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBrand } from "@/lib/server/auth";
import { appConfig } from "@/app.config";

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
}

function invalidProvider(provider: string): CredentialActionState {
  return { errorKey: "errCredentialProviderInvalid", provider, savedAt: null };
}

export async function saveCredentialAction(
  _prev: CredentialActionState,
  formData: FormData,
): Promise<CredentialActionState> {
  const { brand } = await requireBrand();
  const provider = String(formData.get("provider") ?? "");
  if (!MANAGED_PROVIDERS.has(provider)) return invalidProvider(provider);

  const secret = String(formData.get("apiKey") ?? "").trim();
  if (!secret) return { errorKey: "errCredentialEmpty", provider, savedAt: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_provider_credential", {
    p_brand_id: brand.id,
    p_provider: provider,
    p_secret: secret,
  });
  if (error) return { errorKey: "errCredentialSaveFailed", provider, savedAt: null };

  revalidatePath("/settings");
  return { errorKey: null, provider, savedAt: Date.now() };
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
  if (error) return { errorKey: "errCredentialDeleteFailed", provider, savedAt: null };

  revalidatePath("/settings");
  return { errorKey: null, provider, savedAt: Date.now() };
}
