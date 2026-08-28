import { describe, expect, it } from "vitest";
import { SKELETON_ID_PREFIX, skeletonToContentItems } from "@/lib/core/plan/calendar";
import type { SkeletonPost } from "@/lib/core/plan/skeleton";

const MONDAY = new Date("2026-08-24T00:00:00Z");

function post(over: Partial<SkeletonPost> = {}): SkeletonPost {
  return { dayOffset: 0, timeOfDay: "09:00", channel: "instagram", kind: "image", title: "A", hook: "hookA", ...over };
}

describe("skeletonToContentItems", () => {
  it("boş girdide boş dizi verir", () => {
    expect(skeletonToContentItems([], MONDAY, "b1", "Europe/Istanbul")).toEqual([]);
  });

  it("her satır 'idea' durumunda ve henüz kaydedilmemiş görünür", () => {
    const [item] = skeletonToContentItems([post()], MONDAY, "b1", "Europe/Istanbul");
    expect(item.status).toBe("idea");
    expect(item.plan_id).toBeNull();
    expect(item.external_post_id).toBeNull();
  });

  it("⭐ ölçüldü — dayOffset + timeOfDay marka saat dilimine göre doğru UTC ana projelenir", () => {
    const [item] = skeletonToContentItems([post({ dayOffset: 0, timeOfDay: "09:00" })], MONDAY, "b1", "Europe/Istanbul");
    expect(item.scheduled_at).toBe("2026-08-24T06:00:00.000Z");
  });

  it("⭐ ölçüldü — dayOffset gün sınırını doğru geçer", () => {
    const [item] = skeletonToContentItems([post({ dayOffset: 2, timeOfDay: "18:30" })], MONDAY, "b1", "Europe/Istanbul");
    expect(item.scheduled_at).toBe("2026-08-26T15:30:00.000Z");
  });

  it("farklı bir saat diliminde de doğru projelenir", () => {
    const [item] = skeletonToContentItems([post({ dayOffset: 0, timeOfDay: "09:00" })], MONDAY, "b1", "America/New_York");
    expect(item.scheduled_at).toBe("2026-08-24T13:00:00.000Z");
  });

  it("day_offset ve time_of_day alanlarını da olduğu gibi taşır", () => {
    const [item] = skeletonToContentItems([post({ dayOffset: 5, timeOfDay: "14:00" })], MONDAY, "b1", "Europe/Istanbul");
    expect(item.day_offset).toBe(5);
    expect(item.time_of_day).toBe("14:00");
  });

  it("platform alanı SkeletonPost.channel'dan gelir", () => {
    const [item] = skeletonToContentItems([post({ channel: "linkedin" })], MONDAY, "b1", "Europe/Istanbul");
    expect(item.platform).toBe("linkedin");
  });

  it("title/hook'u kayıpsız taşır, body/hashtags boş kalır", () => {
    const [item] = skeletonToContentItems([post({ title: "Başlık", hook: "Kanca" })], MONDAY, "b1", "Europe/Istanbul");
    expect(item.title).toBe("Başlık");
    expect(item.hook).toBe("Kanca");
    expect(item.body).toBe("");
    expect(item.hashtags).toBe("");
  });

  it("⭐ id'ler benzersiz ve sentetik önekle işaretli — gerçek uuid'lerle karışmaz", () => {
    const items = skeletonToContentItems([post(), post()], MONDAY, "b1", "Europe/Istanbul");
    expect(items[0].id).toBe(`${SKELETON_ID_PREFIX}0`);
    expect(items[1].id).toBe(`${SKELETON_ID_PREFIX}1`);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it("root_id/parent_id boş — iskelet henüz zincire bağlı değil", () => {
    const [item] = skeletonToContentItems([post()], MONDAY, "b1", "Europe/Istanbul");
    expect(item.root_id).toBeNull();
    expect(item.parent_id).toBeNull();
  });

  it("brand_id'yi verilen değerle doldurur", () => {
    const [item] = skeletonToContentItems([post()], MONDAY, "brand-xyz", "Europe/Istanbul");
    expect(item.brand_id).toBe("brand-xyz");
  });
});
