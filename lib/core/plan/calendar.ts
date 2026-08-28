/**
 * adım 9 C2 — iskelet gönderileri (`SkeletonPost`, henüz DB'de yok) takvim
 * ızgarasına dökmenin köprüsü.
 *
 * ⚠ İkinci bir ızgara motoru YAZILMADI. `/plan`'ın "hafta/ay görünümü" ihtiyacı
 * `/dashboard`'ınkiyle aynı şekil — `lib/core/derive/calendar.ts`'in
 * `buildWeek`/`buildMonthCells`'i zaten bunu yapıyor, ama `ContentItemRow`
 * bekliyor. Bu dosya `SkeletonPost[]`'u o şekle PROJELİYOR ki iki takvim
 * motoru birbirinden ayrışmasın.
 */
import { zonedTimeToUtc } from "@/lib/core/tz";
import type { ContentItemRow } from "@/lib/core/types";
import type { SkeletonPost } from "@/lib/core/plan/skeleton";
import { addDays } from "@/lib/core/plan/template";

/** Iskelet slotlarının sentetik id öneki — gerçek `content_items.id`'lerle
 *  (uuid) asla çakışmaz, "bu satır henüz kaydedilmedi" işareti de taşır. */
export const SKELETON_ID_PREFIX = "skeleton-";

/**
 * `start` + `dayOffset` günü, marka saat diliminde `timeOfDay` duvar saati —
 * `zonedTimeToUtc` ile UTC ana çevrilip `ContentItemRow` alanlarına dökülür.
 * Dönen satırlar SAHTE DEĞİL (§9.1'in kastettiği anlamda) — gerçek
 * `buildSlots()`/model çıktısını taşıyorlar, yalnızca henüz onaylanıp
 * `content_items`'a yazılmadılar; `status: "idea"` bunu açıkça söylüyor.
 */
export function skeletonToContentItems(
  posts: readonly SkeletonPost[],
  start: Date,
  brandId: string,
  tz: string,
): ContentItemRow[] {
  return posts.map((post, index) => {
    const day = addDays(start, post.dayOffset);
    const [hour, minute] = post.timeOfDay.split(":").map(Number);
    const scheduledAt = zonedTimeToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      hour,
      minute,
      tz,
    );

    return {
      id: `${SKELETON_ID_PREFIX}${index}`,
      brand_id: brandId,
      plan_id: null,
      channel_id: null,
      platform: post.channel,
      kind: post.kind,
      media_type: "IMAGE",
      day_offset: post.dayOffset,
      time_of_day: post.timeOfDay,
      scheduled_at: scheduledAt.toISOString(),
      published_at: null,
      is_best_time: false,
      title: post.title,
      hook: post.hook,
      body: "",
      hashtags: "",
      media_url: null,
      status: "idea",
      external_post_id: null,
      parent_id: null,
      root_id: null,
      chain_position: 1,
      continuation_note: "",
      content_fingerprint: null,
      topic_key: null,
    };
  });
}
