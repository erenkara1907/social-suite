/**
 * ← siraya/lib/publishing.ts
 * Uyarlama: `Platform` tipi `lib/core/types`'tan; gövde aynen korundu.
 *
 * Platforms the product can actually publish to today. Everything else can
 * still be drafted — but scheduling it would be a promise the scheduler cannot
 * keep, so the queue would sit there looking fine while nothing ever went out.
 *
 * Genişletme noktası: §8.8 (Instagram dışı platform yayıncıları).
 */
import type { Platform } from "@/lib/core/types";

/**
 * ⭐ 17a FAZ 0/B — `instagram` → `bluesky`. §12 adım 17a: yayın hattının
 * KENDİSİ (bu dosya dahil) onay gerektirmeyen bir platformla kanıtlanıyor;
 * Instagram Meta App Review beklerken (`docs/ADIM_17a_RAPOR.md` §0.1).
 * Instagram bu listede DEĞİL demek "yayınlanamaz" demek — `/channels`'ın
 * kendi "yakında OAuth" ipucu ayrı bir sabitle korunuyor
 * (`components/app/channels-view.tsx`), bu listeye bağlı değil.
 * Adım 16/17b Instagram'ı PublisherPort'a ikinci adaptör olarak eklerken
 * bu diziye geri döner.
 */
export const PUBLISHABLE_PLATFORMS: Platform[] = ["bluesky"];

export function canPublish(platform: Platform): boolean {
  return PUBLISHABLE_PLATFORMS.includes(platform);
}

/**
 * ⭐ 17a FAZ A — hangi platformlar OAuth'suz, doğrudan girilen bir kimlik
 * bilgisiyle (`ChannelPort.connectWithCredentials`) bağlanır. Bugün
 * `PUBLISHABLE_PLATFORMS`'la AYNI tek üyeye sahip (yalnızca bluesky) ama
 * kavramsal olarak FARKLI bir soruya cevap veriyor: biri "bugün gerçekten
 * yayınlanabilir mi", diğeri "bağlanması OAuth yönlendirmesi mi gerektiriyor,
 * yoksa bir form mu yeterli". Instagram (17b) OAuth gerektirdiği için bu
 * listeye asla girmeyecek; ileride publishable ama OAuth'lu bir platform
 * (örn. LinkedIn, §8.8) eklendiğinde iki liste ayrışacak.
 */
export const CREDENTIAL_CONNECT_PLATFORMS: Platform[] = ["bluesky"];

/**
 * ⭐ adım 18 — hangi platformlar `content_metrics.reach`'i GERÇEKTEN
 * doldurabiliyor. `docs/ADIM_18_RAPOR.md` §A1: AT Protocol'ün gönderi
 * metriği (`app.bsky.feed.getPosts` → `PostView.likeCount/replyCount/
 * repostCount/quoteCount`) hiçbir erişim/gösterim alanı VERMİYOR — Instagram
 * Graph Insights'ın `reach`/`impressions`'ının Bluesky karşılığı yok, "0"
 * yazmak "ölçüldü ve sıfır çıktı" ile karışır. `/analytics`/`/dashboard` bu
 * listeyi sorgulayıp erişim kartını dürüstçe "bu platform vermiyor" mu,
 * yoksa gerçek bir sayı mı gösterdiğine karar verir — toplayıcı da
 * `content_metrics.engagement_rate` formülünü buna göre seçer (bkz.
 * `lib/server/metrics/collect.ts` başlığı).
 */
export const PLATFORMS_WITHOUT_REACH: Platform[] = ["bluesky"];

export function platformProvidesReach(platform: Platform): boolean {
  return !PLATFORMS_WITHOUT_REACH.includes(platform);
}

/** Statuses that mean "this is expected to go out on its own". */
export const AUTOMATED_STATUSES = ["scheduled", "published"] as const;

/* ── 17a FAZ B1 — platform yayın sınırları + ön kontrol yardımcıları ────────
 *
 * Bu bölüm PORT'un bilmediği şeyi (bir platformun metin/medya sınırı) PUR
 * bir fonksiyon olarak tutar — `PublisherPort` hâlâ platform detayı
 * TAŞIMIYOR (yalnızca `publish(contentItemId)`), ama adaptör/job-handler
 * katmanı (platformu zaten bilen taraf) bu tabloyu sorgulayarak preflight
 * yapar. `lib/adapters/ports.ts`'in PublisherPort yorumu bu ayrımı anlatır.
 */

export interface PublishLimits {
  /** Unicode grapheme cluster (kullanıcının gördüğü "karakter") sayısı. */
  maxGraphemes: number;
  /** UTF-8 bayt sayısı — Türkçe (ve çoğu Latin-dışı) karakterde grapheme
   *  sayısından FARKLI: "ç" 1 grapheme ama UTF-8'de 2 bayt. */
  maxBytes: number;
  maxImages: number;
  /** Doğrulanmış: `app.bsky.embed.images` lexicon'u — bkz.
   *  `docs/ADIM_17a_RAPOR.md` §0.1 ve resmi lexicon JSON'u (2.000.000 bayt,
   *  ikili MB değil — ondalık). */
  maxImageBytes: number;
}

/** Bugün yalnızca `bluesky` — değerler resmi AT Protocol lexicon'larından
 *  doğrulandı (`docs/ADIM_17a_RAPOR.md` §0.1): 300 grapheme / 3000 bayt
 *  metin, gönderi başına en fazla 4 görsel, görsel başına 2.000.000 bayt. */
export const PLATFORM_PUBLISH_LIMITS: Partial<Record<Platform, PublishLimits>> = {
  bluesky: { maxGraphemes: 300, maxBytes: 3000, maxImages: 4, maxImageBytes: 2_000_000 },
};

/**
 * Unicode grapheme cluster sayısı — `"İstanbul'da çalışıyorum 👨‍👩‍👧"` gibi bir
 * dizede `.length` (UTF-16 code unit) YANLIŞ sonuç verir (emoji aile
 * dizileri birden fazla code unit/code point'ten oluşan TEK grapheme'dir).
 * `Intl.Segmenter` (Node 18+, motor: ICU) doğru bölücü — AT Protocol'ün
 * "300 grapheme" sınırı da aynı birimi (Unicode extended grapheme cluster)
 * kastediyor.
 */
export function countGraphemes(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(text)].length;
}

/** UTF-8 bayt uzunluğu — `text.length` (UTF-16 code unit) DEĞİL. Türkçe
 *  "ç,ğ,ı,ö,ş,ü" gibi harfler UTF-8'de 2 bayt tutar, `.length` bunu 1 sayar. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface TextLimitCheck {
  ok: boolean;
  graphemes: number;
  bytes: number;
  limits: PublishLimits | null;
}

/** Bir platformun tanımlı sınırı yoksa (bugün bluesky dışındaki her şey)
 *  `ok:true` döner — sınırsız değil, henüz TANIMLANMAMIŞ demek; o platform
 *  zaten `canPublish()`'ten geçemez, bu fonksiyon ikinci bir kapı değil. */
export function checkTextLimit(platform: Platform, text: string): TextLimitCheck {
  const limits = PLATFORM_PUBLISH_LIMITS[platform] ?? null;
  const graphemes = countGraphemes(text);
  const bytes = utf8ByteLength(text);
  if (!limits) return { ok: true, graphemes, bytes, limits: null };
  return { ok: graphemes <= limits.maxGraphemes && bytes <= limits.maxBytes, graphemes, bytes, limits };
}

/**
 * İçerik satırından yayınlanacak NİHAİ metni kurar.
 *
 * ⚠ `hook` KATILMAZ — `lib/core/ai/caption.ts`'in kendi sözleşmesi gereği
 * `body` ZATEN hook satırını ilk satır olarak içeriyor ("The full caption
 * including the hook line"); `hook` yalnızca `/composer`/`/queue`
 * önizlemesi için AYRI tutulan bir kopya. Burada ikisini birleştirmek hook
 * satırını gönderide İKİ KEZ göstermek olurdu.
 */
export function composePostText(item: { body: string; hashtags: string }): string {
  return [item.body.trim(), item.hashtags.trim()].filter(Boolean).join("\n\n");
}

/**
 * `content_items.external_post_id` Bluesky için bir AT URI'dir
 * (`at://<did>/app.bsky.feed.post/<rkey>`) — tarayıcıda AÇILAMAZ. `/queue`
 * (17a FAZ D) yayınlanan gönderiye gerçek bir bağlantı gösterirken bunu
 * `https://bsky.app/profile/<did>/post/<rkey>`'e çevirir.
 *
 * ⚠ Bu fonksiyon BİLEREK `lib/core/providers/bluesky.ts`'te DEĞİL — o dosya
 * `node:crypto`/`@atproto/api` import ediyor (sunucu-yalnızca), `/queue`'nun
 * "use client" görünümü buradan içe aktaramaz. Bu dosya (publishing.ts)
 * zaten `channels-view.tsx` gibi istemci bileşenlerinden güvenle içe
 * aktarılıyor — aynı güvenlik burada da geçerli.
 */
export function atUriToBlueskyPermalink(atUri: string): string | null {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(atUri);
  if (!match) return null;
  return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
}
