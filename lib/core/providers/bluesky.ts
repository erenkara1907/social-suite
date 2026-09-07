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
import { createHash } from "node:crypto";
import { Agent, CredentialSession } from "@atproto/api";

export const BLUESKY_SERVICE_URL = "https://bsky.social";

// ── TID (Timestamp Identifier) — 17a FAZ B2 ─────────────────────────────────
// ⚠ CANLI BULGU (gerçek API hatası, `app.bsky.feed.post.put` çağrısı):
// `app.bsky.feed.post` koleksiyonu rkey'de AT Protocol'ün genel "any" tipini
// DEĞİL, özel olarak TID biçimini zorunlu kılıyor — `content_items.id` (bir
// UUID) doğrudan rkey olarak GÖNDERİLDİĞİNDE sunucu "Invalid TID string"
// hatasıyla reddetti. Sözdizimi resmi spesifikasyondan doğrulandı:
// atproto.com/specs/tid — 13 ASCII karakter, ilk karakter `234567abcdefghij`
// kümesinden, kalan 12 karakter `234567abcdefghijklmnopqrstuvwxyz`'den.
const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";
const TID_FIRST_CHAR_ALPHABET = "234567abcdefghij";

/**
 * `content_items.id` gibi rastgele bir tohumdan DETERMİNİSTİK, sözdizimsel
 * olarak geçerli bir TID üretir — gerçek bir saat/clock-id TAŞIMAZ (sıralama
 * garantisi ya da anlamı YOK, önemli de değil). Tek gereksinim: AYNI tohum
 * HER ZAMAN aynı rkey'i üretsin — bu, `publishBlueskyPost`'un `putRecord`
 * ile kurduğu idempotency'nin (bkz. o fonksiyonun başlığı) rkey tarafındaki
 * yarısı.
 */
export function contentItemIdToRkey(contentItemId: string): string {
  const digest = createHash("sha256").update(contentItemId).digest();
  const firstChar = TID_FIRST_CHAR_ALPHABET[digest[0] % TID_FIRST_CHAR_ALPHABET.length];
  let rest = "";
  for (let i = 1; i <= 12; i++) {
    rest += TID_ALPHABET[digest[i] % TID_ALPHABET.length];
  }
  return firstChar + rest;
}

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

/** Yüklenecek tek bir görsel — ham bayt + mime tipi + alt metin. */
export interface BlueskyImage {
  bytes: Uint8Array;
  mimeType: string;
  alt: string;
}

export interface BlueskyPostInput {
  session: BlueskySession;
  /**
   * `app.bsky.feed.post` koleksiyonundaki KAYIT ANAHTARI — ÇAĞIRAN üretir
   * (sunucu değil). Aynı `rkey`'le ikinci bir çağrı YARATMAZ, DEĞİŞTİRİR
   * (bkz. fonksiyonun kendi başlığı) — bu, `content_items.id`'yi rkey olarak
   * kullanmanın (§12 adım 17a FAZ B2) çifte yayını yapısal olarak imkânsız
   * kılmasının kaynağı.
   */
  rkey: string;
  text: string;
  /** ISO — ÇAĞIRAN sabitler (örn. `content_items.scheduled_at`), `new
   *  Date()` ile YENİDEN ÜRETİLMEZ; aksi hâlde her yeniden deneme aynı
   *  rkey'i FARKLI bir `createdAt`'la ezer — tam idempotent olmaz. */
  createdAt: string;
  images?: BlueskyImage[];
}

export interface BlueskyPostReceipt {
  /** `at://<did>/app.bsky.feed.post/<rkey>` — AT URI. */
  uri: string;
  cid: string;
}

export type BlueskyPostResult = { ok: true; receipt: BlueskyPostReceipt } | { ok: false; error: string };

/**
 * Gönderiyi yayınlar — `com.atproto.repo.putRecord` (createRecord DEĞİL).
 *
 * ⭐ İDEMPOTENCY ARAŞTIRMASI (17a FAZ B2) — `createRecord`'un aynı `rkey`'le
 * ikinci çağrısı HATA verir ("record already exists" — resmi lexicon bunu
 * açıkça belgelemiyor, davranış topluluk kaynaklarından doğrulandı: bkz.
 * `docs/ADIM_17a_RAPOR.md` §B2). `putRecord` ise resmi olarak UPSERT'tir:
 * `rkey` yoksa YARATIR, VARSA aynı içerikle DEĞİŞTİRİR — sunucu tarafında
 * gerçek bir "if not exists" kontrolü gerekmeden doğal idempotency verir.
 * Bu yüzden yayın çağrısı `putRecord`'a taşındı: aynı `content_items.id`'yi
 * `rkey` olarak kullanan bir RETRY (çökme sonrası reaper geri açtı, ya da
 * geçici ağ hatası sonrası worker yeniden denedi) AYNI gönderiyi ikinci kez
 * OLUŞTURMAZ, olsa olsa AYNI içerikle üzerine yazar — görünürde hiçbir şey
 * değişmez, çifte gönderi YAPISAL OLARAK imkânsız hâle gelir.
 */
export async function publishBlueskyPost(input: BlueskyPostInput): Promise<BlueskyPostResult> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...input.session, active: true };
  const agent = new Agent(credentialSession);
  try {
    let embed: { $type: "app.bsky.embed.images"; images: { image: unknown; alt: string }[] } | undefined;
    if (input.images?.length) {
      const uploaded: { image: unknown; alt: string }[] = [];
      for (const image of input.images) {
        const blobResult = await agent.uploadBlob(image.bytes, { encoding: image.mimeType });
        uploaded.push({ image: blobResult.data.blob, alt: image.alt });
      }
      embed = { $type: "app.bsky.embed.images", images: uploaded };
    }

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: input.text,
      createdAt: input.createdAt,
      ...(embed ? { embed } : {}),
    };

    const result = await agent.app.bsky.feed.post.put(
      { repo: input.session.did, rkey: input.rkey },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record'un tam AppBskyFeedPost.Record tipini burada yeniden kurmak yerine (embed'in beş union üyesinden yalnızca birini kullanıyoruz), lexicon'un kendisi sunucu tarafında zaten doğruluyor.
      record as any,
    );
    return { ok: true, receipt: { uri: result.uri, cid: result.cid } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/* ── adım 18 — metrik okuma ───────────────────────────────────────────────
 * Doğrulanmış kaynak: `app.bsky.feed.getPosts` resmi lexicon'u
 * (github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/
 * getPosts.json — `uris` en fazla 25 eleman) ve `@atproto/api`'nin ÜRETİLMİŞ
 * tipleri (`node_modules/@atproto/api/dist/client/types/app/bsky/feed/
 * defs.d.ts` — `PostView.likeCount/replyCount/repostCount/quoteCount/
 * indexedAt`). Bluesky'nin verdiği TEK ŞEY bunlar — Instagram Insights'ın
 * `reach`/`impressions`'ının BİR KARŞILIĞI YOK (bkz. `lib/core/publishing.ts`
 * `PLATFORMS_WITHOUT_REACH`).
 *
 * ⚠ Silinmiş/erişilemeyen bir gönderinin URI'si `getPosts`'un döndürdüğü
 * dizide HİÇ GÖRÜNMEZ — resmi lexicon bunu belgelemiyor, davranış topluluk
 * kaynaklarından doğrulandı (bkz. `docs/ADIM_18_RAPOR.md` §A1); sunucu HATA
 * FIRLATMAZ, yalnızca o URI'yi atlar. Çağıran (`lib/server/metrics/
 * collect.ts`) bunu "bul(a)madım" olarak ele almalı, iş hatası SAYMAMALI. */

const MAX_GET_POSTS_URIS = 25;

export interface BlueskyPostMetrics {
  uri: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  indexedAt: string;
}

export type BlueskyPostMetricsResult =
  | { ok: true; posts: BlueskyPostMetrics[] }
  | { ok: false; error: string };

/**
 * `com.atproto.repo.putRecord`'un aksine bu bir OKUMA — kimlik doğrulama
 * gerekmiyor gibi görünse de (AppView genel okumaya izin verir), oturumla
 * çağırmak diğer tüm fonksiyonlarla AYNI istemci kurulumunu paylaşmayı
 * sağlıyor; ayrıca askıya alınmış/bloklu hesap durumlarında oturumlu istek
 * daha tutarlı davranıyor.
 *
 * Dönen dizi GİRDİYLE AYNI SIRADA/UZUNLUKTA OLMAYABİLİR — bulunamayan URI'ler
 * sessizce eksik. Çağıran eşleştirmeyi `uri` alanına göre yapmalı.
 */
export async function getBlueskyPostMetrics(
  session: BlueskySession,
  uris: string[],
): Promise<BlueskyPostMetricsResult> {
  if (uris.length === 0) return { ok: true, posts: [] };
  if (uris.length > MAX_GET_POSTS_URIS) {
    return { ok: false, error: `getPosts tek çağrıda en fazla ${MAX_GET_POSTS_URIS} uri kabul eder (${uris.length} verildi)` };
  }
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...session, active: true };
  const agent = new Agent(credentialSession);
  try {
    const result = await agent.app.bsky.feed.getPosts({ uris });
    const posts: BlueskyPostMetrics[] = result.data.posts.map((p) => ({
      uri: p.uri,
      likeCount: p.likeCount ?? 0,
      replyCount: p.replyCount ?? 0,
      repostCount: p.repostCount ?? 0,
      quoteCount: p.quoteCount ?? 0,
      indexedAt: p.indexedAt,
    }));
    return { ok: true, posts };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export interface BlueskyProfileStats {
  followersCount: number;
  followsCount: number;
  postsCount: number;
}

export type BlueskyProfileStatsResult =
  | { ok: true; stats: BlueskyProfileStats }
  | { ok: false; error: string };

/**
 * Kanal düzeyi sayaçlar (§4f "Kanal düzeyi") — `app.bsky.actor.getProfile`,
 * doğrulanmış (`@atproto/api` `defs.d.ts` `ProfileViewDetailed.
 * followersCount/followsCount/postsCount`). `session.did` kendi hesabımız —
 * `actor` parametresi handle veya DID kabul ediyor, DID her zaman geçerli.
 */
export async function getBlueskyProfileStats(session: BlueskySession): Promise<BlueskyProfileStatsResult> {
  const credentialSession = new CredentialSession(new URL(BLUESKY_SERVICE_URL));
  credentialSession.session = { ...session, active: true };
  const agent = new Agent(credentialSession);
  try {
    const result = await agent.app.bsky.actor.getProfile({ actor: session.did });
    return {
      ok: true,
      stats: {
        followersCount: result.data.followersCount ?? 0,
        followsCount: result.data.followsCount ?? 0,
        postsCount: result.data.postsCount ?? 0,
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
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
