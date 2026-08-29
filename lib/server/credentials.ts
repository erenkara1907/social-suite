import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marka + sağlayıcı için anahtarı çözer — BIRLESIM_PLANI §12 adım 13 FAZ B2.
 *
 * ⭐ Service-role — `lib/server/README.md`'nin "üç yer" kuralının 3. maddesi
 * (`provider_credentials` okuması), `get_provider_secret()`'in kendisi de
 * yalnızca service-role'e GRANT edilmiş (`00_schema.sql`, authenticated'dan
 * REVOKE).
 *
 * §8.6 kuralı: `lib/core/providers/*` (`kie.ts`, `fal.ts`, `elevenlabs.ts`)
 * `process.env` okumuyor, `apiKey` parametresi alıyor — bu fonksiyon o
 * parametreyi ÜRETİYOR. Adım 14+'in her sağlayıcı çağrısından önce
 * `resolveProviderCredential(brandId, "anthropic")` gibi çağrılması
 * beklenir. Bu adımda (13) hiçbir çağıran yok — ilk kullanım adım 14.
 *
 * ⚠ D2 env fallback — YALNIZCA `instagram`. Diğer sağlayıcılarda satır
 * yoksa `apiKey: null` döner, env'e DÜŞÜLMEZ: ürün tanımı "müşteri kendi
 * anahtarını girer" diyor, bir AI sağlayıcı için sessizce BİZİM env'imize
 * düşmek o sözleşmeyi kırar. Instagram farklı — MVP kararı (§1.12, S4):
 * tek Meta uygulaması, müşteriler tester olarak eklenir; marka bazlı satır
 * yalnızca App Review sonrası ya da kendi uygulamasını getiren müşteride
 * devreye girer.
 */

export type ProviderName = "anthropic" | "kie" | "elevenlabs" | "fal" | "openai" | "voyage" | "instagram";

export type CredentialSource = "brand" | "env" | "none";

export interface ResolvedCredential {
  apiKey: string | null;
  /** Gizli OLMAYAN yapılandırma (örn. Instagram app_id/redirect_uri). */
  config: Record<string, unknown>;
  source: CredentialSource;
}

interface EnvFallback {
  apiKey: string | null;
  config: Record<string, unknown>;
}

/** Yalnızca `instagram` için — gerekçe yukarıda (D2). Yeni bir sağlayıcı
 *  buraya eklemeden önce BIRLESIM_PLANI §1.12'yi tekrar oku. */
function instagramEnvFallback(): EnvFallback {
  return {
    apiKey: process.env.INSTAGRAM_APP_SECRET || null,
    config: {
      app_id: process.env.INSTAGRAM_APP_ID ?? "",
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI ?? "",
      api_version: process.env.INSTAGRAM_API_VERSION || "v23.0",
    },
  };
}

const ENV_FALLBACK: Partial<Record<ProviderName, () => EnvFallback>> = {
  instagram: instagramEnvFallback,
};

interface GetProviderSecretRow {
  secret: string | null;
  config: Record<string, unknown> | null;
}

/**
 * Markanın bir sağlayıcı için kayıtlı anahtarını çözer. Satır yoksa (ya da
 * `is_active=false`) ve sağlayıcının bir env fallback'i varsa (yalnızca
 * `instagram`) ona düşer — hangi yolun kullanıldığı `source` alanında VE
 * (fallback'e düşüldüğünde) bir `console.info` satırında görünür, sessizce
 * olmaz.
 */
export async function resolveProviderCredential(
  brandId: string,
  provider: ProviderName,
): Promise<ResolvedCredential> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("get_provider_secret", { p_brand_id: brandId, p_provider: provider })
    .single<GetProviderSecretRow>();

  // Hata mesajı Postgres'ten geliyor — bu fonksiyonun kendi hatası, kullanıcı
  // girdisi değil; içinde anahtar OLAMAZ (get_provider_secret hiçbir zaman
  // hata metnine gizli değeri gömmez).
  if (error) throw new Error(`credentials.resolve(${provider}) başarısız: ${error.message}`);

  if (data?.secret) {
    return { apiKey: data.secret, config: data.config ?? {}, source: "brand" };
  }

  const fallback = ENV_FALLBACK[provider]?.();
  if (fallback) {
    if (fallback.apiKey) {
      // Yalnızca HANGİ markanın/sağlayıcının fallback'e düştüğünü logluyor —
      // anahtarın kendisi burada YOK.
      console.info(`[credentials] ${provider}: marka satırı yok, env fallback kullanıldı (brand=${brandId})`);
    }
    return { apiKey: fallback.apiKey, config: fallback.config, source: fallback.apiKey ? "env" : "none" };
  }

  return { apiKey: null, config: data?.config ?? {}, source: "none" };
}

/** İnce yardımcı — bir sağlayıcının o marka için ÇALIŞIR durumda olup
 *  olmadığını sormak, anahtarı hiç istemeyen çağıranlar için (örn. UI
 *  rozeti). Anahtarın kendisini asla DÖNDÜRMEZ. */
export async function isProviderConfigured(brandId: string, provider: ProviderName): Promise<boolean> {
  const { apiKey } = await resolveProviderCredential(brandId, provider);
  return !!apiKey;
}
