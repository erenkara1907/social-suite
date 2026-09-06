import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ACTIONS, KIND_ICON, KIND_LABEL, PLAN_CHANNELS, PLATFORMS, PLATFORM_META,
  POST_KINDS, POST_STATUSES, STATUS_LABEL, STATUS_TONE, normalizePlatform,
} from "@/lib/core/types";

describe("normalizePlatform", () => {
  it("küçük harf kanonik değerleri geçirir", () => {
    for (const platform of PLATFORMS) {
      expect(normalizePlatform(platform)).toBe(platform);
    }
  });

  it("⭐ threadly'nin PascalCase değerlerini kanonik anahtara çevirir", () => {
    // §1.2'nin kapattığı göç tam olarak bu.
    expect(normalizePlatform("Instagram")).toBe("instagram");
    expect(normalizePlatform("LinkedIn")).toBe("linkedin");
    expect(normalizePlatform("X")).toBe("x");
  });

  it("boşluk kırpar", () => {
    expect(normalizePlatform("  Instagram \n")).toBe("instagram");
  });

  it("tanınmayan değer için null döner — sessizce uydurmaz", () => {
    for (const raw of ["myspace", "", "   ", "insta", "facebook"]) {
      expect(normalizePlatform(raw)).toBeNull();
    }
  });
});

describe("enum listeleri şemayla hizalı", () => {
  it("altı platform (17a FAZ 0.2: bluesky eklendi)", () => {
    expect([...PLATFORMS]).toEqual(["instagram", "x", "linkedin", "tiktok", "youtube", "bluesky"]);
  });

  it("sekiz içerik durumu (§4a)", () => {
    expect(POST_STATUSES).toHaveLength(8);
  });

  it("on iki aktivite eylemi (§1.2)", () => {
    expect(ACTIVITY_ACTIONS).toHaveLength(12);
  });

  it("yedi içerik biçimi", () => {
    expect(POST_KINDS).toHaveLength(7);
  });

  it("⭐ her enum değeri küçük harf — DB'deki kanonik anahtar", () => {
    for (const list of [PLATFORMS, POST_STATUSES, POST_KINDS, ACTIVITY_ACTIONS, PLAN_CHANNELS]) {
      for (const value of list) expect(value).toBe(value.toLowerCase());
    }
  });

  it("PLAN_CHANNELS, PLATFORMS'un gerçek alt kümesi", () => {
    for (const channel of PLAN_CHANNELS) expect(PLATFORMS).toContain(channel);
    expect(PLAN_CHANNELS.length).toBeLessThan(PLATFORMS.length);
  });
});

describe("kayıt tabloları eksiksiz", () => {
  it("her platformun etiketi, ikonu ve hue'su var", () => {
    for (const platform of PLATFORMS) {
      const meta = PLATFORM_META[platform];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.hue).toMatch(/^\d+$/);
    }
  });

  it("⭐ görünen ad kanonik anahtarın büyük harfli hâli — etiket TS'te yaşıyor", () => {
    expect(PLATFORM_META.instagram.name).toBe("Instagram");
    expect(PLATFORM_META.linkedin.name).toBe("LinkedIn");
    expect(PLATFORM_META.x.name).toBe("X");
  });

  it("her durumun etiketi ve tonu var", () => {
    for (const status of POST_STATUSES) {
      expect(STATUS_LABEL[status].tr.length).toBeGreaterThan(0);
      expect(STATUS_LABEL[status].en.length).toBeGreaterThan(0);
      expect(STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("her biçimin etiketi ve ikonu var", () => {
    for (const kind of POST_KINDS) {
      expect(KIND_LABEL[kind].tr.length).toBeGreaterThan(0);
      expect(KIND_ICON[kind].length).toBeGreaterThan(0);
    }
  });

  it("kayıt tablolarında fazla anahtar yok", () => {
    expect(Object.keys(PLATFORM_META).sort()).toEqual([...PLATFORMS].sort());
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...POST_STATUSES].sort());
    expect(Object.keys(KIND_LABEL).sort()).toEqual([...POST_KINDS].sort());
  });
});
