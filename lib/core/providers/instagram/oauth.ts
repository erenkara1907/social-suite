/**
 * ← siraya/lib/instagram/oauth.ts
 *
 * UYARLAMA (§12 adım 16 FAZ A, §8.6):
 *  - `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`/`redirectUri()` importları
 *    KALDIRILDI; her fonksiyon artık ilk parametre olarak bir
 *    `InstagramConfig` (`./config`) alıyor.
 *  - Hata modeli DEĞİŞTİ: kaynak `throw new Error(...)` kullanıyordu; bu
 *    dosya `lib/core/providers/bluesky.ts`'in `{ ok:true, ... } | { ok:false,
 *    error }` desenine taşındı — `lib/core` genelinde tutarlılık için
 *    (bluesky.ts başlığı: "başarılı dönüş ZATEN doğrulanmış demek"). Orijinal
 *    hata mesajları (`readJson`'ın Meta-özel "200 ve hata gövdesi" ayrıştırması
 *    dahil) BİREBİR korundu, yalnızca `throw` yerine `{ ok:false, error }`
 *    dönüyor.
 *  - Kaynak yorumları (satır satır, İngilizce) KORUNDU.
 */
import { graphHost, LONG_LIVED_URL, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, REFRESH_URL, SCOPES, type InstagramConfig } from "./config";

export interface InstagramProfile {
  user_id: string;
  username: string;
  account_type?: string;
  followers_count?: number;
}

export interface LongLivedToken {
  accessToken: string;
  expiresAt: Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

/** Meta answers errors with 200-and-a-body as often as with a 4xx. Check both. */
async function readJson(response: Response, context: string): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
  const text = await response.text();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `${context}: Instagram returned a non-JSON response (${response.status}): ${text.slice(0, 200)}` };
  }

  const error = body.error as { message?: string; code?: number } | undefined;
  if (error?.message) return { ok: false, error: `${context}: ${error.message}` };
  if (typeof body.error_message === "string") return { ok: false, error: `${context}: ${body.error_message}` };
  if (!response.ok) return { ok: false, error: `${context}: HTTP ${response.status} — ${text.slice(0, 200)}` };

  return { ok: true, body };
}

/** Step 1 — where we send the user to grant access. */
export function authorizeUrl(config: InstagramConfig, state: string): string {
  // ⚠ CANLI BULGU (§12 adım 16 FAZ B1) — `enable_fb_login=false` ve
  // `force_reauth=true` BURADA DENENDİ (Meta dokümanının "enable_fb_login
  // varsayılanı true" notuna dayanarak) ve GERİ ALINDI: `force_reauth=true`
  // her denemede Instagram'ı YENİDEN GİRİŞ yaptırmaya zorluyor — kaynağın
  // (siraya, hâlâ çalışan) akışı doğrudan onay ekranına gidiyor (kullanıcının
  // tarayıcısındaki mevcut Instagram oturumunu kullanıyor), bizimki önce bir
  // giriş ekranı gösteriyordu — GÖZLEMLENEN, ölçülebilir bir davranış farkı.
  // Kaynak BU İKİ PARAMETREYİ HİÇ GÖNDERMİYOR; buraya birebir dönüldü.
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params}`;
}

export type ExchangeCodeResult = { ok: true; shortToken: string; userId: string } | { ok: false; error: string };

/** Step 2 — the code is single-use and expires in an hour. */
export async function exchangeCode(config: InstagramConfig, code: string): Promise<ExchangeCodeResult> {
  let response: Response;
  try {
    response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      // ⚠ KANITLANMIŞ KÖK NEDEN (§12 adım 16 FAZ B1, canlı teşhis) —
      // `multipart/form-data` (`FormData`, Meta'nın dokümanındaki `-F`
      // örneğine sadık kalmak için denendi) Vercel'in üretim çalışma
      // zamanında SESSİZCE bozuluyor: AYNI kod, AYNI parametrelerle yerel
      // Node'da (`fetch`+`FormData`) ve `curl -F` ile MÜKEMMEL çalışıyor,
      // ama Vercel'de deploy edilince HER SEFERİNDE Meta'dan "redirect_uri
      // is not identical" (yanıltıcı — gerçek sebep bu değil) hatası
      // dönüyor. Bilinen sınıf: vercel/next.js repo'sunda `fetch`+`FormData`
      // için Node sürümüne özgü, yalnızca üretimde ortaya çıkan bozulma
      // raporları var (örn. github.com/vercel/next.js/issues/52616 ve
      // ilişkili tartışmalar). Kaynağın (siraya) ORİJİNAL tercihi
      // `application/x-www-form-urlencoded` (`URLSearchParams`) — bu daha
      // basit serileştirme (boundary yok) o hata sınıfına hiç girmiyor;
      // buraya GERİ DÖNÜLDÜ. Content-type'ın kendisinin Meta tarafında
      // fark etmediği ayrıca `curl` ile doğrulandı (bkz. `docs/
      // ADIM_16_17b_RAPOR.md`) — sorun HİÇBİR ZAMAN content-type'ın Meta
      // tarafında nasıl yorumlandığı değildi, Vercel'in gövdeyi Meta'ya
      // ULAŞTIRMADAN ÖNCE bozmasıydı.
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
        code,
      }),
      // ⚠ CANLI BULGU (§12 adım 16 FAZ B1) — Next.js App Router, sunucu
      // tarafındaki `fetch()`'i KENDİ Veri Önbelleği'yle otomatik yamalıyor;
      // varsayılan anahtar URL'e dayanır, GÖVDEYE değil. Bu uç noktanın URL'i
      // HER DENEMEDE AYNI (`api.instagram.com/oauth/access_token`) ama `code`
      // her seferinde FARKLI — Next bunu "aynı kaynak" sanıp eski bir
      // denemenin (başarısız) yanıtını önbellekten sunuyor olabilir, kod
      // ne kadar doğru olursa olsun Meta'ya HİÇ gitmeden. `cache: "no-store"`
      // bu katmanı devre dışı bırakır — düz Node'un (yerel test, hep
      // başarılı) zaten hiç sahip olmadığı bir davranış.
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, error: `Code exchange failed: ${errorMessage(error)}` };
  }

  // ⚠ Meta'nın önbellek/istek başlıkları — `cache: "no-store"` hipotezini
  // KESİN doğrulamak için. `x-vercel-cache`/`age` "HIT" ya da sıfırdan farklı
  // bir sayı gösterirse istek gerçekten Meta'ya GİTMEMİŞ demektir.
  console.info(
    `[instagram-oauth][exchangeCode] HTTP ${response.status} ` +
    `x-vercel-cache="${response.headers.get("x-vercel-cache") ?? ""}" ` +
    `age="${response.headers.get("age") ?? ""}" ` +
    `x-cache="${response.headers.get("x-cache") ?? ""}"`,
  );

  const parsed = await readJson(response, "Code exchange failed");
  if (!parsed.ok) return parsed;

  // ⚠ CANLI BULGU — kaynak (siraya) düz `{ access_token, user_id }` şekli
  // varsayıyordu. Meta'nın resmi dokümanı bu uç nokta için `{ data: [{
  // access_token, user_id, permissions }] }` (DİZİ içinde) gösteriyor. İkisi
  // de destekleniyor — hangisinin gerçekten döndüğü sürüm/hesap tipine göre
  // değişebilir, tek bir şekle bahse girmek yerine ikisi de okunuyor.
  const wrapped = (parsed.body.data as Record<string, unknown>[] | undefined)?.[0];
  const source = wrapped ?? parsed.body;

  const shortToken = source.access_token as string | undefined;
  const userId = source.user_id;

  if (!shortToken) return { ok: false, error: "Code exchange failed: no access_token in the response." };
  return { ok: true, shortToken, userId: String(userId ?? "") };
}

export type LongLivedTokenResult = { ok: true; token: LongLivedToken } | { ok: false; error: string };

function toToken(body: Record<string, unknown>, context: string): LongLivedTokenResult {
  const accessToken = body.access_token as string | undefined;
  const expiresIn = Number(body.expires_in ?? 0);

  if (!accessToken) return { ok: false, error: `${context}: no access_token in the response.` };

  return {
    ok: true,
    token: {
      accessToken,
      expiresAt: new Date(Date.now() + (expiresIn || 60 * 24 * 3600) * 1000),
    },
  };
}

/** Step 3 — swap the ~1 hour token for the 60 day one. */
export async function exchangeForLongLived(config: InstagramConfig, shortToken: string): Promise<LongLivedTokenResult> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: shortToken,
  });

  let response: Response;
  try {
    response = await fetch(`${LONG_LIVED_URL}?${params}`, { cache: "no-store" });
  } catch (error) {
    return { ok: false, error: `Long-lived token exchange failed: ${errorMessage(error)}` };
  }

  const parsed = await readJson(response, "Long-lived token exchange failed");
  if (!parsed.ok) return parsed;
  return toToken(parsed.body, "Long-lived token exchange failed");
}

/** Step 4 — must be at least 24h old and not yet expired. */
export async function refreshLongLived(config: InstagramConfig, token: string): Promise<LongLivedTokenResult> {
  const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });

  let response: Response;
  try {
    response = await fetch(`${REFRESH_URL}?${params}`, { cache: "no-store" });
  } catch (error) {
    return { ok: false, error: `Token refresh failed: ${errorMessage(error)}` };
  }

  const parsed = await readJson(response, "Token refresh failed");
  if (!parsed.ok) return parsed;
  return toToken(parsed.body, "Token refresh failed");
}

export type ProfileResult = { ok: true; profile: InstagramProfile } | { ok: false; error: string };

/** Who did we just connect? Used to name the channel. */
export async function fetchProfile(config: InstagramConfig, accessToken: string): Promise<ProfileResult> {
  const params = new URLSearchParams({
    fields: "user_id,username,account_type,followers_count",
    access_token: accessToken,
  });

  let response: Response;
  try {
    response = await fetch(`${graphHost(config)}/me?${params}`, { cache: "no-store" });
  } catch (error) {
    return { ok: false, error: `Profile lookup failed: ${errorMessage(error)}` };
  }

  const parsed = await readJson(response, "Profile lookup failed");
  if (!parsed.ok) return parsed;
  const body = parsed.body;

  return {
    ok: true,
    profile: {
      user_id: String(body.user_id ?? body.id ?? ""),
      username: String(body.username ?? ""),
      account_type: body.account_type as string | undefined,
      followers_count: typeof body.followers_count === "number" ? body.followers_count : undefined,
    },
  };
}
