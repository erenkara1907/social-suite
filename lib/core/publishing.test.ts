import { describe, expect, it } from "vitest";
import { AUTOMATED_STATUSES, PUBLISHABLE_PLATFORMS, canPublish } from "@/lib/core/publishing";
import { PLATFORMS, POST_STATUSES, type Platform } from "@/lib/core/types";

describe("canPublish", () => {
  it("bugün yalnızca Bluesky'a yayınlar (17a — onay gerektirmeyen platform)", () => {
    expect(canPublish("bluesky")).toBe(true);
  });

  it("⭐ diğer platformların hepsini reddeder — bunlar taslak kalır", () => {
    // Instagram dahil: hat kanıtlanana kadar (17a) yayıncısı yok; Meta App
    // Review sonrası (16/17b) PublisherPort'a ikinci adaptör olarak eklenecek.
    // Zamanlayıcının tutamayacağı bir sözü kuyruğa koymamak bilinçli bir karar.
    for (const platform of ["instagram", "x", "linkedin", "tiktok", "youtube"] as const) {
      expect(canPublish(platform)).toBe(false);
    }
  });

  it("bilinen her platform için bir cevap verir — sessizce undefined dönmez", () => {
    for (const platform of PLATFORMS) {
      expect(typeof canPublish(platform)).toBe("boolean");
    }
  });

  it("tanınmayan bir değer için false döner, patlamaz", () => {
    expect(canPublish("myspace" as Platform)).toBe(false);
  });
});

describe("PUBLISHABLE_PLATFORMS", () => {
  it("canPublish ile aynı gerçeği söyler", () => {
    for (const platform of PLATFORMS) {
      expect(canPublish(platform)).toBe(PUBLISHABLE_PLATFORMS.includes(platform));
    }
  });

  it("yalnızca geçerli platform değerleri taşır", () => {
    for (const platform of PUBLISHABLE_PLATFORMS) {
      expect(PLATFORMS).toContain(platform);
    }
  });
});

describe("AUTOMATED_STATUSES", () => {
  it("kendi kendine gideceği varsayılan durumları sayar", () => {
    expect(AUTOMATED_STATUSES).toEqual(["scheduled", "published"]);
  });

  it("⭐ her değeri şemanın durum listesinde var — yoksa DB reddederdi", () => {
    for (const status of AUTOMATED_STATUSES) {
      expect(POST_STATUSES).toContain(status);
    }
  });

  it("elle müdahale bekleyen durumları içermez", () => {
    for (const status of ["idea", "draft", "needs_review", "failed", "archived"] as const) {
      expect(AUTOMATED_STATUSES).not.toContain(status);
    }
  });
});
