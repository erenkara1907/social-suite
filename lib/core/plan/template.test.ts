import { describe, expect, it } from "vitest";
import {
  MAX_SLOTS,
  WEEKDAY_LABEL,
  WEEKLY_TEMPLATE,
  addDays,
  buildSlots,
  nextMonday,
  parseIsoDate,
  toIsoDate,
  weekdayOf,
} from "@/lib/core/plan/template";
import { PLAN_CHANNELS, POST_KINDS } from "@/lib/core/types";

/** Test sabitleri: 2026-08-24 bir PAZARTESİ. Haftanın tamamı buradan türüyor. */
const MONDAY = "2026-08-24";
const WEDNESDAY = "2026-08-26";
const SUNDAY = "2026-08-30";

/** `parseIsoDate` null döndürmeyeceği bilinen girdiler için dar yardımcı. */
function iso(value: string): Date {
  const date = parseIsoDate(value);
  if (!date) throw new Error(`test kurulumu hatalı: ${value} ayrıştırılamadı`);
  return date;
}

describe("parseIsoDate", () => {
  it("YYYY-MM-DD'yi UTC gece yarısı olarak ayrıştırır", () => {
    expect(iso("2026-01-05").toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("sıfır dolgusu olmayan biçimleri reddeder", () => {
    expect(parseIsoDate("2026-1-05")).toBeNull();
    expect(parseIsoDate("2026-01-5")).toBeNull();
    expect(parseIsoDate("26-01-05")).toBeNull();
  });

  it("baştaki/sondaki boşluğu reddeder — regex bağlantılı", () => {
    expect(parseIsoDate(" 2026-01-05")).toBeNull();
    expect(parseIsoDate("2026-01-05 ")).toBeNull();
  });

  it("ISO olmayan girdiyi reddeder", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("bugün")).toBeNull();
    expect(parseIsoDate("2026/01/05")).toBeNull();
    expect(parseIsoDate("2026-01-05T00:00:00Z")).toBeNull();
  });

  it("aralık dışı ay ve günü reddeder", () => {
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-01")).toBeNull();
    expect(parseIsoDate("2026-01-00")).toBeNull();
    expect(parseIsoDate("2026-01-32")).toBeNull();
  });

  it("Date.UTC taşmasını yakalar — 31 Şubat diye bir gün yoktur", () => {
    // Date.UTC(2026, 1, 30) sessizce 2 Mart'a taşar; ay/gün kontrolü bunu keser.
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
  });

  describe("artık yıl", () => {
    it("artık yılda 29 Şubat'ı kabul eder", () => {
      expect(iso("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
    });

    it("artık olmayan yılda 29 Şubat'ı reddeder", () => {
      expect(parseIsoDate("2026-02-29")).toBeNull();
    });

    it("400'e bölünen yüzyılı artık sayar (2000)", () => {
      expect(iso("2000-02-29").toISOString()).toBe("2000-02-29T00:00:00.000Z");
    });

    it("100'e bölünüp 400'e bölünmeyen yüzyılı artık SAYMAZ (1900)", () => {
      expect(parseIsoDate("1900-02-29")).toBeNull();
    });
  });

  describe("⚠ devralınan davranış: 0-99 arası yıllar 1900+yıl'a kayar", () => {
    /**
     * `Date.UTC` 0-99 arası yılları 1900+yıl olarak yorumlar ve `parseIsoDate`
     * yalnızca AY ve GÜNÜ geri doğruluyor, YILI doğrulamıyor. Sonuç: girdi
     * kabul edilir ama başka bir yıl döner. Kaynak dosyada da böyle
     * (threadly/lib/plan/template.ts); taşımada davranış DEĞİŞTİRİLMEDİ.
     * Bu test, bugünkü gerçeği kilitliyor — düzeltilirse burası kırılacak.
     */
    it("'0001-01-01' 1901'e kayar, null dönmez", () => {
      expect(iso("0001-01-01").getUTCFullYear()).toBe(1901);
    });

    it("'0099-06-15' 1999'a kayar", () => {
      expect(iso("0099-06-15").getUTCFullYear()).toBe(1999);
    });

    it("'0000-01-01' 1900'e kayar", () => {
      expect(iso("0000-01-01").getUTCFullYear()).toBe(1900);
    });

    it("bu yüzden gidiş-dönüş 0-99 için KAYIPLI", () => {
      expect(toIsoDate(iso("0001-01-01"))).toBe("1901-01-01");
    });

    it("100 ve üstü etkilenmez — sınır tam burada", () => {
      expect(iso("0100-01-01").getUTCFullYear()).toBe(100);
      expect(toIsoDate(iso("0100-01-01"))).toBe("0100-01-01");
    });
  });

  it("dört haneli üst sınırı kabul eder", () => {
    expect(toIsoDate(iso("9999-12-31"))).toBe("9999-12-31");
  });
});

describe("toIsoDate", () => {
  it("UTC gününü döndürür, yerel günü değil", () => {
    // 23:30Z hâlâ aynı UTC günü; yerel saat +03:00 olsa bile kaymaz.
    expect(toIsoDate(new Date("2026-08-24T23:30:00.000Z"))).toBe("2026-08-24");
    expect(toIsoDate(new Date("2026-08-24T00:00:00.000Z"))).toBe("2026-08-24");
  });

  it("100 ve üstü yıllar için parseIsoDate ile gidiş-dönüş yapar", () => {
    for (const value of ["2026-01-01", "2024-02-29", "2026-12-31", "0100-06-15"]) {
      expect(toIsoDate(iso(value))).toBe(value);
    }
  });
});

describe("addDays", () => {
  it("ay sınırını geçer", () => {
    expect(toIsoDate(addDays(iso("2026-01-31"), 1))).toBe("2026-02-01");
  });

  it("yıl sınırını geçer", () => {
    expect(toIsoDate(addDays(iso("2026-12-28"), 7))).toBe("2027-01-04");
  });

  it("artık günü geçer", () => {
    expect(toIsoDate(addDays(iso("2024-02-28"), 1))).toBe("2024-02-29");
    expect(toIsoDate(addDays(iso("2024-02-29"), 1))).toBe("2024-03-01");
  });

  it("artık olmayan yılda Şubat'ı 28'de bitirir", () => {
    expect(toIsoDate(addDays(iso("2026-02-28"), 1))).toBe("2026-03-01");
  });

  it("negatif gün geriye gider", () => {
    expect(toIsoDate(addDays(iso("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("sıfır gün aynı anı döndürür", () => {
    expect(addDays(iso(MONDAY), 0).getTime()).toBe(iso(MONDAY).getTime());
  });

  it("saf — girdi Date'ini değiştirmez", () => {
    const start = iso(MONDAY);
    const before = start.getTime();
    addDays(start, 30);
    expect(start.getTime()).toBe(before);
  });

  it("⭐ AB yaz saati bitişinde bile tam 7×24s ekler (UTC aritmetiği)", () => {
    // 25 Ekim 2026'da Avrupa saati geri alınır. UTC üzerinde çalıştığı için
    // sonuç yine tam gece yarısı — bir saat kaymaz.
    const result = addDays(iso("2026-10-24"), 7);
    expect(result.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});

describe("weekdayOf", () => {
  it("Pazartesi'yi 0, Pazar'ı 6 yapar", () => {
    const days = [
      ["2026-08-24", 0], ["2026-08-25", 1], ["2026-08-26", 2], ["2026-08-27", 3],
      ["2026-08-28", 4], ["2026-08-29", 5], ["2026-08-30", 6],
    ] as const;
    for (const [date, expected] of days) {
      expect(weekdayOf(iso(date))).toBe(expected);
    }
  });

  it("Pazar için 0 DÖNDÜRMEZ — JS'in getUTCDay'i kaydırılmıştır", () => {
    expect(iso(SUNDAY).getUTCDay()).toBe(0);
    expect(weekdayOf(iso(SUNDAY))).toBe(6);
  });

  it("günün saatinden bağımsızdır", () => {
    expect(weekdayOf(new Date("2026-08-24T23:59:59.999Z"))).toBe(0);
  });
});

describe("nextMonday", () => {
  it("hafta içi her günden o haftanın bitişindeki Pazartesi'ye gider", () => {
    for (const [from, expected] of [
      ["2026-08-25", "2026-08-31"], ["2026-08-26", "2026-08-31"],
      ["2026-08-27", "2026-08-31"], ["2026-08-28", "2026-08-31"],
      ["2026-08-29", "2026-08-31"], ["2026-08-30", "2026-08-31"],
    ] as const) {
      expect(toIsoDate(nextMonday(iso(from)))).toBe(expected);
    }
  });

  it("⭐ Pazartesi'den GELECEK Pazartesi'ye atlar, aynı günü döndürmez", () => {
    expect(toIsoDate(nextMonday(iso(MONDAY)))).toBe("2026-08-31");
  });

  it("her zaman Pazartesi döndürür", () => {
    for (let i = 0; i < 14; i += 1) {
      expect(weekdayOf(nextMonday(addDays(iso(MONDAY), i)))).toBe(0);
    }
  });

  it("her zaman ileri gider — 1 ile 7 gün arası", () => {
    for (let i = 0; i < 14; i += 1) {
      const from = addDays(iso(MONDAY), i);
      const delta = (nextMonday(from).getTime() - from.getTime()) / 86_400_000;
      expect(delta).toBeGreaterThanOrEqual(1);
      expect(delta).toBeLessThanOrEqual(7);
    }
  });

  it("ay sınırını geçer", () => {
    expect(toIsoDate(nextMonday(iso("2026-09-29")))).toBe("2026-10-05");
  });
});

describe("WEEKLY_TEMPLATE", () => {
  it("yedi gün taşır, Pazar bilinçli olarak boştur", () => {
    expect(WEEKLY_TEMPLATE).toHaveLength(7);
    expect(WEEKLY_TEMPLATE[6]).toHaveLength(0);
  });

  it("Pazar dışındaki her günde en az bir slot vardır", () => {
    for (let day = 0; day < 6; day += 1) {
      expect(WEEKLY_TEMPLATE[day].length).toBeGreaterThan(0);
    }
  });

  it("⭐ §1.2 — her kanal değeri küçük harf ve PLAN_CHANNELS içinde", () => {
    for (const day of WEEKLY_TEMPLATE) {
      for (const slot of day) {
        expect(PLAN_CHANNELS).toContain(slot.channel);
        expect(slot.channel).toBe(slot.channel.toLowerCase());
      }
    }
  });

  it("her biçim değeri POST_KINDS içinde", () => {
    for (const day of WEEKLY_TEMPLATE) {
      for (const slot of day) expect(POST_KINDS).toContain(slot.kind);
    }
  });

  it("her saat 24 saatlik HH:MM biçiminde ve geçerli", () => {
    for (const day of WEEKLY_TEMPLATE) {
      for (const slot of day) {
        expect(slot.timeOfDay).toMatch(/^\d{2}:\d{2}$/);
        const [h, m] = slot.timeOfDay.split(":").map(Number);
        expect(h).toBeLessThan(24);
        expect(m).toBeLessThan(60);
      }
    }
  });

  it("bir haftada sekiz slot vardır", () => {
    expect(WEEKLY_TEMPLATE.flat()).toHaveLength(8);
  });
});

describe("WEEKDAY_LABEL", () => {
  it("Pazartesi'den başlayan yedi iki dilli etiket taşır", () => {
    expect(WEEKDAY_LABEL).toHaveLength(7);
    expect(WEEKDAY_LABEL[0]).toEqual({ tr: "Pazartesi", en: "Monday" });
    expect(WEEKDAY_LABEL[6]).toEqual({ tr: "Pazar", en: "Sunday" });
  });

  it("weekdayOf'un indeksiyle hizalıdır", () => {
    expect(WEEKDAY_LABEL[weekdayOf(iso(SUNDAY))].en).toBe("Sunday");
    expect(WEEKDAY_LABEL[weekdayOf(iso(MONDAY))].en).toBe("Monday");
  });
});

describe("buildSlots", () => {
  it("sıfır ufuk sıfır slot verir", () => {
    expect(buildSlots(iso(MONDAY), 0)).toHaveLength(0);
  });

  it("negatif ufuk sıfır slot verir", () => {
    expect(buildSlots(iso(MONDAY), -5)).toHaveLength(0);
  });

  it("Pazartesi'den 7 günlük ufuk sekiz slot verir", () => {
    expect(buildSlots(iso(MONDAY), 7)).toHaveLength(8);
  });

  it("hangi günden başlarsa başlasın 7 günlük ufuk sekiz slot verir", () => {
    expect(buildSlots(iso(WEDNESDAY), 7)).toHaveLength(8);
    expect(buildSlots(iso(SUNDAY), 7)).toHaveLength(8);
  });

  it("30 günlük ufuk başlangıç gününe göre değişir", () => {
    expect(buildSlots(iso(MONDAY), 30)).toHaveLength(35);
    expect(buildSlots(iso(WEDNESDAY), 30)).toHaveLength(34);
    expect(buildSlots(iso(SUNDAY), 30)).toHaveLength(34);
  });

  it("tek günlük ufuk o günün şablonunu verir", () => {
    expect(buildSlots(iso(MONDAY), 1)).toHaveLength(2);
    expect(buildSlots(iso(WEDNESDAY), 1)).toHaveLength(1);
    // Pazar boş — tek günlük Pazar ufku hiç slot üretmez.
    expect(buildSlots(iso(SUNDAY), 1)).toHaveLength(0);
  });

  it("⭐ dokümantasyondaki iddia: bir ay ~39 değil 35 slot", () => {
    // MAX_SLOTS yorumu "~39" diyor; ölçülen gerçek 35 (Pazartesi başlangıç).
    expect(buildSlots(iso(MONDAY), 30).length).toBeLessThan(MAX_SLOTS);
  });

  it("MAX_SLOTS'ta durur ve aşmaz", () => {
    expect(buildSlots(iso(MONDAY), 200)).toHaveLength(MAX_SLOTS);
    expect(buildSlots(iso(MONDAY), 365)).toHaveLength(MAX_SLOTS);
  });

  it("⭐ tavana ilk 55 günde ulaşır, 54'te değil", () => {
    expect(buildSlots(iso(MONDAY), 54).length).toBeLessThan(MAX_SLOTS);
    expect(buildSlots(iso(MONDAY), 55)).toHaveLength(MAX_SLOTS);
  });

  it("dayOffset 0'dan başlar ve azalmaz", () => {
    const slots = buildSlots(iso(MONDAY), 30);
    expect(slots[0].dayOffset).toBe(0);
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i].dayOffset).toBeGreaterThanOrEqual(slots[i - 1].dayOffset);
    }
  });

  it("her slotun weekday'i kendi dayOffset'iyle tutarlı", () => {
    const start = iso(WEDNESDAY);
    for (const slot of buildSlots(start, 30)) {
      expect(slot.weekday).toBe(weekdayOf(addDays(start, slot.dayOffset)));
    }
  });

  it("⭐ Çarşamba'da başlayan plan Pazartesi slotlarını yine Pazartesi'ye koyar", () => {
    // Dosyanın başlığındaki iddia tam olarak bu.
    const slots = buildSlots(iso(WEDNESDAY), 14);
    const mondaySlots = slots.filter((s) => s.weekday === 0);
    expect(mondaySlots.length).toBeGreaterThan(0);
    for (const slot of mondaySlots) {
      expect(weekdayOf(addDays(iso(WEDNESDAY), slot.dayOffset))).toBe(0);
      expect(WEEKLY_TEMPLATE[0].some((t) => t.timeOfDay === slot.timeOfDay)).toBe(true);
    }
  });

  it("hiçbir slot Pazar'a düşmez", () => {
    for (const slot of buildSlots(iso(MONDAY), 60)) {
      expect(slot.weekday).not.toBe(6);
    }
  });

  it("şablon alanlarını olduğu gibi taşır", () => {
    const first = buildSlots(iso(MONDAY), 1)[0];
    expect(first).toEqual({ ...WEEKLY_TEMPLATE[0][0], dayOffset: 0, weekday: 0 });
  });

  it("⭐ yeniden üretilebilir — aynı girdi aynı çıktı", () => {
    expect(buildSlots(iso(MONDAY), 30)).toEqual(buildSlots(iso(MONDAY), 30));
  });

  it("şablonu değiştirmez — döndürülen slotlar kopyadır", () => {
    const slots = buildSlots(iso(MONDAY), 7);
    slots[0].timeOfDay = "23:59";
    expect(WEEKLY_TEMPLATE[0][0].timeOfDay).toBe("09:00");
  });

  it("başlangıç Date'ini değiştirmez", () => {
    const start = iso(MONDAY);
    const before = start.getTime();
    buildSlots(start, 60);
    expect(start.getTime()).toBe(before);
  });

  it("ay ve yıl sınırını aşan ufukta da çalışır", () => {
    const slots = buildSlots(iso("2026-12-28"), 14);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.weekday).toBe(weekdayOf(addDays(iso("2026-12-28"), slot.dayOffset)));
    }
  });
});
