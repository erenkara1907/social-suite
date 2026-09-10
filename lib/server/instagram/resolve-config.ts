import "server-only";

import { resolveProviderCredential } from "@/lib/server/credentials";
import { DEFAULT_API_VERSION, type InstagramConfig } from "@/lib/core/providers/instagram/config";

/**
 * D2'nin okuma ucu — `lib/core/providers/instagram/*`'ın ihtiyaç duyduğu
 * `InstagramConfig`'i `resolveProviderCredential(brandId, "instagram")`'dan
 * kurar. §12 adım 16 FAZ B — `credentials.ts` zaten (adım 13'ten) hem marka
 * satırını hem env fallback'ini biliyor; bu dosya yalnızca dönen gevşek
 * `{ apiKey, config }` şeklini `InstagramConfig`'in sıkı alanlarına eşliyor
 * ve eksik/boş alanları TEK YERDE reddediyor — her çağıran (OAuth başlatma,
 * callback, token yenileme, yayın) kendi eksik-alan kontrolünü tekrar
 * yazmasın diye.
 */
export type ResolveInstagramConfigResult =
  | { ok: true; config: InstagramConfig }
  | { ok: false; error: string };

export async function resolveInstagramConfig(brandId: string): Promise<ResolveInstagramConfigResult> {
  const { apiKey, config } = await resolveProviderCredential(brandId, "instagram");

  const appId = String(config.app_id ?? "").trim();
  const appSecret = apiKey ?? "";
  const redirectUri = String(config.redirect_uri ?? "").trim();
  const apiVersion = String(config.api_version ?? "").trim() || DEFAULT_API_VERSION;

  if (!appId || !appSecret || !redirectUri) {
    // ⚠ HANGİ alanın eksik olduğunu SÖYLEMİYOR — bu bir marka
    // yapılandırma hatası, kullanıcıya (veya loga) "app_id boş" gibi bir
    // ayrıntı sızdırmanın kazancı yok, `sanitizeErrorMessage`'ın ruhu aynı.
    return { ok: false, error: "Instagram için App ID/Secret/Redirect URI eksik." };
  }

  return { ok: true, config: { appId, appSecret, redirectUri, apiVersion } };
}
