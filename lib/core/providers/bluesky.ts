/**
 * Bluesky (AT Protocol) — §12 adım 17a FAZ 0/A: onay/inceleme gerektirmeyen
 * ilk gerçek yayıncı platformu. `docs/ADIM_17a_RAPOR.md` §0.1'in doğruladığı
 * uç noktaları sarar.
 *
 * §8.6 deseni burada da geçerli: `process.env` OKUNMAZ, kimlik bilgisi
 * çağırandan parametre gelir. Farkı: diğer sağlayıcılarda (kie/fal/
 * elevenlabs) "anahtar" tek bir statik API key'dir ve `verify*Key` onu
 * SONRADAN, ayrı bir çağrıyla test eder. Burada "anahtar" yerine
 * identifier + uygulama şifresi ÇİFTİ var ve `createSession` (bkz.
 * `connectBluesky`) bu çifti sunucuya karşı zaten doğruluyor — ayrı bir
 * ön-doğrulama adımına gerek yok, giriş = doğrulama.
 *
 * `verifyBlueskySession` farklı bir soruya cevap veriyor: SAKLANMIŞ bir
 * oturumun (accessJwt/refreshJwt, `channel_credentials`'tan okunmuş) hâlâ
 * geçerli olup olmadığı — adım 20.5'in "test et" deseninin (`verifyKieKey`
 * vb.) eşleniği, en ucuz uç noktayla (`getSession`, yazma yok).
 */
import { Agent, CredentialSession } from "@atproto/api";

export const BLUESKY_SERVICE_URL = "https://bsky.social";

/** `@atproto/api`'nin `AtpSessionData`'sının bu uygulamanın taşıdığı alt
 *  kümesi — `email`/`emailConfirmed` gibi hesap-yönetim alanları burada
 *  YOK, `channel_credentials`'a yazılacak/oradan okunacak dört alan var. */
export interface BlueskySession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export type BlueskyResult = { ok: true; session: BlueskySession } | { ok: false; error: string };
export type BlueskyCheck = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

/**
 * Uygulama şifresiyle oturum açar (`com.atproto.server.createSession`).
 * Başarılı dönüş ZATEN doğrulanmış demektir — sunucu kimlik bilgisini
 * kabul etmeden `accessJwt`/`refreshJwt` vermez.
 */
export async function connectBluesky(identifier: string, appPassword: string): Promise<BlueskyResult> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  try {
    await credentialSession.login({ identifier, password: appPassword });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const session = credentialSession.session;
  if (!session) return { ok: false, error: "oturum boş döndü" };
  return {
    ok: true,
    session: {
      did: session.did,
      handle: session.handle,
      accessJwt: session.accessJwt,
      refreshJwt: session.refreshJwt,
    },
  };
}

/**
 * Saklanan bir oturumun hâlâ geçerli olup olmadığını `getSession` ile
 * sınar — yazma yok, ücret/kredi yok, adım 20.5'in "en ucuz uç nokta"
 * kısıtına uyar.
 */
export async function verifyBlueskySession(session: BlueskySession): Promise<BlueskyCheck> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...session, active: true };
  const agent = new Agent(credentialSession);
  try {
    await agent.com.atproto.server.getSession();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * `refreshJwt` ile yeni bir `accessJwt`/`refreshJwt` çifti alır
 * (`com.atproto.server.refreshSession`) — FAZ B3'ün "token süresi
 * dolmuşsa yenile" adımı bunu kullanır.
 *
 * ⚠ ÖNEMLİ BULGU (canlı test, 17a FAZ A2.1) — `accessJwt`'in kendisi
 * `fetchHandler` tarafından otomatik yenilenir (401/ExpiredToken alınca,
 * `node_modules/@atproto/api/dist/atp-agent.js`), bu fonksiyon YALNIZCA
 * `refreshJwt`'in KENDİSİ süresi dolduğunda veya oturum `deleteSession`
 * ile iptal edildiğinde manuel olarak çağrılmalı — o durumda sunucu bu
 * çağrıyı da reddeder (bkz. `revokeBlueskySession` sonrası bu fonksiyonun
 * `ok:false` dönmesi, canlı doğrulandı).
 */
export async function refreshBlueskySession(session: BlueskySession): Promise<BlueskyResult> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...session, active: true };
  try {
    await credentialSession.refreshSession();
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const refreshed = credentialSession.session;
  if (!refreshed) return { ok: false, error: "yenilenmiş oturum boş döndü" };
  return {
    ok: true,
    session: {
      did: refreshed.did,
      handle: refreshed.handle,
      accessJwt: refreshed.accessJwt,
      refreshJwt: refreshed.refreshJwt,
    },
  };
}

/**
 * Sunucudaki oturumu iptal eder (`com.atproto.server.deleteSession`) —
 * disconnect akışında `channel_credentials` satırı silinmeden ÖNCE
 * çağrılır, böylece token yalnızca bizim tarafımızda değil, Bluesky
 * tarafında da geçersiz kalır. Başarısız olması (örn. token zaten
 * süresi dolmuş) disconnect'i ENGELLEMEMELİ — çağıran bu yüzden hatayı
 * yutar, yalnızca loglar.
 */
export async function revokeBlueskySession(session: BlueskySession): Promise<BlueskyCheck> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...session, active: true };
  const agent = new Agent(credentialSession);
  try {
    // ⚠ `fetchHandler` HER çağrıda accessJwt'i bearer yapar (doğrulandı:
    // node_modules/@atproto/api/dist/atp-agent.js `fetchHandler`) —
    // `deleteSession` ise protokol gereği refreshJwt bekler. SDK'nın kendi
    // (deprecated) `AtpAgent.logout()`'unun yaptığı gibi başlığı BURADA elle
    // eziyoruz; aksi halde accessJwt ile çağrılır ve sunucu reddedebilir.
    await agent.com.atproto.server.deleteSession(undefined, {
      headers: { authorization: `Bearer ${session.refreshJwt}` },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
