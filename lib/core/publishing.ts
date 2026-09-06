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

/** Statuses that mean "this is expected to go out on its own". */
export const AUTOMATED_STATUSES = ["scheduled", "published"] as const;
