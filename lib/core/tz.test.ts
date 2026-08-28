import { describe, expect, it } from "vitest";
import {
  COMMON_TIMEZONES, DEFAULT_TZ, dayKey, dayKeyOf, isValidTimeZone, monthShape,
  zonedParts, zonedTime, zonedTimeToUtc,
} from "@/lib/core/tz";

const BERLIN = "Europe/Berlin";

describe("DEFAULT_TZ", () => {
  it("Europe/Istanbul", () => {
    expect(DEFAULT_TZ).toBe("Europe/Istanbul");
  });
});

describe("zonedParts", () => {
  it("UTC anını Istanbul duvar saatine yansıtır (+03:00)", () => {
    expect(zonedParts("2026-08-24T00:00:00Z")).toEqual({
      year: 2026, month: 8, day: 24, hour: 3, minute: 0, weekday: 0,
    });
  });

  it("⭐ gün sınırını saat diliminde geçer — UTC hâlâ 24'ünde, Istanbul 25'inde", () => {
    expect(zonedParts("2026-08-24T21:00:00Z")).toEqual({
      year: 2026, month: 8, day: 25, hour: 0, minute: 0, weekday: 1,
    });
    // Bir dakika öncesi hâlâ 24'ü.
    expect(zonedParts("2026-08-24T20:59:00Z").day).toBe(24);
  });

  it("gece yarısını 24 değil 0 olarak verir", () => {
    expect(zonedParts("2026-08-24T21:00:00Z").hour).toBe(0);
  });

  it("Date ve ISO string'i aynı şekilde kabul eder", () => {
    const iso = "2026-08-24T12:34:00Z";
    expect(zonedParts(iso)).toEqual(zonedParts(new Date(iso)));
  });

  it("hafta gününü Pazartesi=0 olarak verir", () => {
    // 2026-08-24 Pazartesi, 2026-08-30 Pazar.
    expect(zonedParts("2026-08-24T09:00:00Z").weekday).toBe(0);
    expect(zonedParts("2026-08-30T09:00:00Z").weekday).toBe(6);
  });

  it("ay ve yıl sınırını geçer", () => {
    expect(zonedParts("2026-12-31T22:00:00Z")).toMatchObject({ year: 2027, month: 1, day: 1 });
  });

  describe("⭐ yaz saati (Europe/Berlin) — Istanbul'da DST yok, bu yüzden ayrı bölge", () => {
    it("sonbahar geri alışında tekrarlanan saati aynı duvar saatine yansıtır", () => {
      // 25 Ekim 2026: 00:30Z ve 01:30Z Berlin'de İKİSİ DE 02:30.
      expect(zonedTime("2026-10-25T00:30:00Z", BERLIN)).toBe("02:30");
      expect(zonedTime("2026-10-25T01:30:00Z", BERLIN)).toBe("02:30");
    });

    it("ilkbahar ileri alışında var olmayan saati atlar", () => {
      // 29 Mart 2026: 02:00 yerel saati hiç yok; 01:30 -> 03:30'a atlar.
      expect(zonedTime("2026-03-29T00:30:00Z", BERLIN)).toBe("01:30");
      expect(zonedTime("2026-03-29T01:30:00Z", BERLIN)).toBe("03:30");
    });
  });

  it("bölge ötelemesi gerçekten uygulanıyor — aynı an, farklı gün", () => {
    const instant = "2026-08-24T22:00:00Z";
    expect(zonedParts(instant, "UTC").day).toBe(24);
    expect(zonedParts(instant, "Pacific/Kiritimati").day).toBe(25);
    expect(zonedParts(instant, "Pacific/Midway").day).toBe(24);
    expect(zonedParts(instant, "Pacific/Kiritimati").weekday).toBe(1);
  });
});

describe("zonedTime", () => {
  it("HH:MM olarak sıfır dolgulu döner", () => {
    expect(zonedTime("2026-08-24T00:00:00Z", "UTC")).toBe("00:00");
    expect(zonedTime("2026-08-24T09:05:00Z", "UTC")).toBe("09:05");
    expect(zonedTime("2026-08-24T23:59:00Z", "UTC")).toBe("23:59");
  });

  it("varsayılan bölge Istanbul", () => {
    expect(zonedTime("2026-08-24T00:00:00Z")).toBe("03:00");
  });

  it("saniyeyi yuvarlamaz, atar", () => {
    expect(zonedTime("2026-08-24T09:05:59Z", "UTC")).toBe("09:05");
  });
});

describe("dayKey", () => {
  it("YYYY-MM-DD üretir", () => {
    expect(dayKey("2026-08-24T12:00:00Z", "UTC")).toBe("2026-08-24");
  });

  it("⭐ takvim gününü BÖLGEYE göre seçer — UTC gününe göre değil", () => {
    const instant = "2026-08-24T22:00:00Z";
    expect(dayKey(instant, "UTC")).toBe("2026-08-24");
    expect(dayKey(instant, "Europe/Istanbul")).toBe("2026-08-25");
  });

  it("ay ve gün için sıfır dolgu yapar", () => {
    expect(dayKey("2026-01-05T12:00:00Z", "UTC")).toBe("2026-01-05");
  });

  it("dayKeyOf ile aynı biçimi üretir", () => {
    const p = zonedParts("2026-01-05T12:00:00Z", "UTC");
    expect(dayKey("2026-01-05T12:00:00Z", "UTC")).toBe(dayKeyOf(p.year, p.month, p.day));
  });
});

describe("dayKeyOf", () => {
  it("sıfır dolgular", () => {
    expect(dayKeyOf(2026, 1, 5)).toBe("2026-01-05");
    expect(dayKeyOf(2026, 12, 31)).toBe("2026-12-31");
  });
});

describe("monthShape", () => {
  it("ay uzunluklarını verir", () => {
    expect(monthShape(2026, 1).daysInMonth).toBe(31);
    expect(monthShape(2026, 4).daysInMonth).toBe(30);
    expect(monthShape(2026, 12).daysInMonth).toBe(31);
  });

  describe("artık yıl", () => {
    it("artık olmayan Şubat 28 gün", () => {
      expect(monthShape(2026, 2).daysInMonth).toBe(28);
    });
    it("artık Şubat 29 gün", () => {
      expect(monthShape(2024, 2).daysInMonth).toBe(29);
    });
    it("2000 artık (400'e bölünür)", () => {
      expect(monthShape(2000, 2).daysInMonth).toBe(29);
    });
    it("1900 artık DEĞİL (100'e bölünür, 400'e bölünmez)", () => {
      expect(monthShape(1900, 2).daysInMonth).toBe(28);
    });
  });

  it("⭐ ayın 1'inin hafta gününü Pazartesi=0 olarak verir", () => {
    // 1 Şubat 2026 bir PAZAR -> 6. Pazar-önce indeksleme olsaydı 0 olurdu.
    expect(monthShape(2026, 2).firstWeekday).toBe(6);
    // 1 Ocak 2026 bir PERŞEMBE -> 3.
    expect(monthShape(2026, 1).firstWeekday).toBe(3);
    // 1 Aralık 2026 bir SALI -> 1.
    expect(monthShape(2026, 12).firstWeekday).toBe(1);
  });

  it("firstWeekday her zaman 0-6 aralığında", () => {
    for (let month = 1; month <= 12; month += 1) {
      const { firstWeekday, daysInMonth } = monthShape(2026, month);
      expect(firstWeekday).toBeGreaterThanOrEqual(0);
      expect(firstWeekday).toBeLessThanOrEqual(6);
      expect(daysInMonth).toBeGreaterThanOrEqual(28);
      expect(daysInMonth).toBeLessThanOrEqual(31);
    }
  });

  it("⭐ 6 haftalık ızgara her ay için yeterli (firstWeekday + gün <= 42)", () => {
    // buildMonthCells 42 hücre çiziyor; hiçbir ay taşmamalı.
    for (let year = 2024; year <= 2030; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const { firstWeekday, daysInMonth } = monthShape(year, month);
        expect(firstWeekday + daysInMonth).toBeLessThanOrEqual(42);
      }
    }
  });
});

describe("isValidTimeZone — adım 9 B3", () => {
  it("her COMMON_TIMEZONES girdisini geçerli sayar", () => {
    for (const tz of COMMON_TIMEZONES) expect(isValidTimeZone(tz)).toBe(true);
  });

  it("listenin dışında ama gerçek bir IANA bölgesini de kabul eder", () => {
    expect(isValidTimeZone("Pacific/Kiritimati")).toBe(true);
  });

  it("uydurma bir bölgeyi reddeder", () => {
    expect(isValidTimeZone("Europe/Atlantis")).toBe(false);
  });

  it("boş dizeyi reddeder", () => {
    expect(isValidTimeZone("")).toBe(false);
  });

  it("⭐ ölçüldü — Intl büyük/küçük harfi normalize eder, farklı case de geçerli sayılır", () => {
    expect(isValidTimeZone("europe/istanbul")).toBe(true);
  });
});

describe("zonedTimeToUtc — adım 9 C2 (zonedParts'ın tersi)", () => {
  it("⭐ ölçüldü — Istanbul 09:00 -> 06:00Z (+03:00 sabit ofset)", () => {
    expect(zonedTimeToUtc(2026, 8, 24, 9, 0, "Europe/Istanbul").toISOString()).toBe("2026-08-24T06:00:00.000Z");
  });

  it("⭐ ölçüldü — New York 09:00 (yaz saati, UTC-4) -> 13:00Z", () => {
    expect(zonedTimeToUtc(2026, 8, 24, 9, 0, "America/New_York").toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });

  it("zonedParts ile gidiş-dönüş yapar (DST dışı bölgelerde her zaman)", () => {
    const utc = zonedTimeToUtc(2026, 8, 24, 14, 30, "Europe/Istanbul");
    const back = zonedParts(utc, "Europe/Istanbul");
    expect(back).toMatchObject({ year: 2026, month: 8, day: 24, hour: 14, minute: 30 });
  });

  it("varsayılan bölge Istanbul", () => {
    expect(zonedTimeToUtc(2026, 8, 24, 9, 0).toISOString()).toBe(zonedTimeToUtc(2026, 8, 24, 9, 0, DEFAULT_TZ).toISOString());
  });

  it("gün ve ay sınırını doğru geçer", () => {
    // Istanbul 01:00 -> bir önceki UTC günü 22:00.
    expect(zonedTimeToUtc(2026, 1, 1, 1, 0, "Europe/Istanbul").toISOString()).toBe("2025-12-31T22:00:00.000Z");
  });
});
