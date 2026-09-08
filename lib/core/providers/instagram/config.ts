/**
 * ← siraya/lib/instagram/config.ts
 *
 * UYARLAMA (§12 adım 16 FAZ A, §8.6): `process.env` okuyan dört top-level
 * `const` (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `API_VERSION`,
 * `redirectUri()`'nin `NEXT_PUBLIC_APP_URL`/`INSTAGRAM_REDIRECT_URI` okuması)
 * KALDIRILDI — bu modül artık hiçbir kimlik bilgisi TAŞIMIYOR, yalnızca sabit
 * uç noktaları ve `InstagramConfig` şeklini tanımlıyor. Kimlik bilgisi D2
 * gereği marka bazlı `provider_credentials`'tan (env fallback'iyle) çözülüyor
 * — bkz. `lib/server/credentials.ts` (`resolveProviderCredential`). Bu
 * dosyayı çağıran her fonksiyon (`oauth.ts`, `publish.ts`) artık `apiId`/
 * `apiSecret` yerine tek bir `InstagramConfig` parametresi alıyor —
 * kie/fal/elevenlabs'ın `apiKey` parametresi deseninin Instagram'daki
 * genişletilmiş hâli (iki gizli-olmayan alan + bir gizli alan taşıdığı için
 * tek bir obje daha az gürültülü).
 *
 * Kaynağın orijinal başlığı: "Instagram API with Business Login for
 * Instagram (graph.instagram.com). Chosen over Facebook Login because it
 * needs no linked Facebook Page — the user signs in with their Instagram
 * credentials alone." — bu, FAZ 0'ın 3. maddesindeki "bir Facebook sayfasına
 * bağlı mı" varsayımını GEÇERSİZ kılıyor: bu akış bir FB sayfası gerektirmez.
 *
 * Sürüm kararı (görev + kullanıcı onayı): `v23.0`, kaynakla BİREBİR — güncel
 * sürüm v26.0 (Temmuz 2026) ama taşınabilirlik riski v23.0'da en düşük;
 * `docs/ADIM_16_17b_RAPOR.md`'de gerekçe var.
 */

/** Markadan (D2: `provider_credentials`, env fallback'iyle) çözülmüş,
 *  bu modülün ihtiyaç duyduğu HER ŞEY. `apiVersion` boşsa çağıran
 *  `DEFAULT_API_VERSION`'a düşer — bkz. `graphHost()`. */
export interface InstagramConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Boş string kabul edilir — `graphHost()` bu durumda `DEFAULT_API_VERSION`
   *  kullanır (kaynağın "blank izin ver, `??` bunu YAKALAMAZ" notuyla aynı
   *  gerekçe: `graph.instagram.com//me` gibi çift-slash bir URL kurulmasın). */
  apiVersion: string;
}

/** Boş bırakılırsa (`InstagramConfig.apiVersion === ""`) kullanılan sürüm. */
export const DEFAULT_API_VERSION = "v23.0";

/** `graph.instagram.com/<version>` — her istek bunu kullanır. */
export function graphHost(config: Pick<InstagramConfig, "apiVersion">): string {
  const version = config.apiVersion.trim() || DEFAULT_API_VERSION;
  return `https://graph.instagram.com/${version}`;
}

export const OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const LONG_LIVED_URL = "https://graph.instagram.com/access_token";
export const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";

/** Publishing needs both: basic reads the profile, content_publish posts. */
export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

/**
 * A long-lived token lasts 60 days and dies for good if it is not refreshed in
 * that window. Refresh well before the edge rather than at the last moment.
 */
export const TOKEN_TTL_DAYS = 60;
export const REFRESH_WHEN_DAYS_LEFT = 10;
