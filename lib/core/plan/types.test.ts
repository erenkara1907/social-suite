import { describe, expect, it } from "vitest";
import {
  PLAN_HORIZONS, PLAN_MODES,
  toPlan, toPlanPost, type PlanPostRow, type PlanRow,
} from "@/lib/core/plan/types";
import { PLAN_CHANNELS, POST_KINDS } from "@/lib/core/types";

const PLAN_ROW: PlanRow = {
  id: "p1", title: "Ağustos ritmi", theme: "kahve", horizon_days: 30,
  lang: "tr", start_date: "2026-08-24", mode: "weekly",
  created_at: "2026-08-20T10:00:00Z",
};

const POST_ROW: PlanPostRow = {
  id: "pp1", day_offset: 0, time_of_day: "09:00", channel: "instagram",
  kind: "image", title: "Sabah demlemesi", hook: "Saat 7'de kapı açılır.",
  body: null, hashtags: null, status: "idea",
};

describe("toPlan", () => {
  it("snake_case satırı camelCase modele çevirir", () => {
    expect(toPlan(PLAN_ROW)).toEqual({
      id: "p1", title: "Ağustos ritmi", theme: "kahve", horizonDays: 30,
      lang: "tr", startDate: "2026-08-24", mode: "weekly",
      createdAt: "2026-08-20T10:00:00Z",
    });
  });

  describe("horizonDays daraltması", () => {
    it("30'u 30 olarak geçirir", () => {
      expect(toPlan({ ...PLAN_ROW, horizon_days: 30 }).horizonDays).toBe(30);
    });
    it("7'yi 7 olarak geçirir", () => {
      expect(toPlan({ ...PLAN_ROW, horizon_days: 7 }).horizonDays).toBe(7);
    });
    it("⭐ 30 OLMAYAN her şey 7'ye düşer — 14 de, 0 da, -1 de", () => {
      for (const raw of [14, 0, -1, 365, 29, 31]) {
        expect(toPlan({ ...PLAN_ROW, horizon_days: raw }).horizonDays).toBe(7);
      }
    });
    it("sonuç her zaman izinli ufuklardan biri", () => {
      for (const raw of [7, 30, 14, 999]) {
        expect(PLAN_HORIZONS).toContain(toPlan({ ...PLAN_ROW, horizon_days: raw }).horizonDays);
      }
    });
  });

  describe("lang daraltması", () => {
    it("'en' İngilizce kalır", () => {
      expect(toPlan({ ...PLAN_ROW, lang: "en" }).lang).toBe("en");
    });
    it("⭐ 'en' OLMAYAN her şey 'tr'ye düşer — 'de' de, boş da", () => {
      for (const raw of ["tr", "de", "", "EN", "english"]) {
        expect(toPlan({ ...PLAN_ROW, lang: raw }).lang).toBe("tr");
      }
    });
  });

  describe("mode daraltması", () => {
    it("'auto' korunur", () => {
      expect(toPlan({ ...PLAN_ROW, mode: "auto" }).mode).toBe("auto");
    });
    it("⭐ 'auto' OLMAYAN her şey 'weekly'ye düşer", () => {
      for (const raw of ["weekly", "manual", "", "AUTO"]) {
        expect(toPlan({ ...PLAN_ROW, mode: raw }).mode).toBe("weekly");
      }
    });
    it("sonuç her zaman izinli modlardan biri", () => {
      for (const raw of ["auto", "weekly", "çöp"]) {
        expect(PLAN_MODES).toContain(toPlan({ ...PLAN_ROW, mode: raw }).mode);
      }
    });
  });

  it("metin alanlarını olduğu gibi taşır, kırpmaz", () => {
    expect(toPlan({ ...PLAN_ROW, title: "  boşluklu  " }).title).toBe("  boşluklu  ");
  });

  it("girdi satırını değiştirmez", () => {
    const row = { ...PLAN_ROW };
    toPlan(row);
    expect(row).toEqual(PLAN_ROW);
  });
});

describe("toPlanPost", () => {
  it("snake_case satırı camelCase modele çevirir", () => {
    expect(toPlanPost(POST_ROW)).toEqual({
      id: "pp1", dayOffset: 0, timeOfDay: "09:00", channel: "instagram",
      kind: "image", title: "Sabah demlemesi", hook: "Saat 7'de kapı açılır.",
      body: null, hashtags: null, status: "idea",
    });
  });

  it("null gövde ve hashtag'i null bırakır", () => {
    const post = toPlanPost({ ...POST_ROW, body: null, hashtags: null });
    expect(post.body).toBeNull();
    expect(post.hashtags).toBeNull();
  });

  describe("⭐ kanal doğrulaması — §1.2 küçük harf göçünün kırılma noktası", () => {
    it("küçük harf kanalları geçirir", () => {
      for (const channel of PLAN_CHANNELS) {
        expect(toPlanPost({ ...POST_ROW, channel }).channel).toBe(channel);
      }
    });

    it("⭐ göç etmemiş PascalCase satırı küçük harfe normalize eder", () => {
      // threadly'nin eski verisi 'Instagram' / 'LinkedIn' / 'X' yazıyordu.
      // Kaynaktaki kör `as Channel` cast'i bunu tipe uyuyormuş gibi geçirirdi.
      expect(toPlanPost({ ...POST_ROW, channel: "Instagram" }).channel).toBe("instagram");
      expect(toPlanPost({ ...POST_ROW, channel: "LinkedIn" }).channel).toBe("linkedin");
      expect(toPlanPost({ ...POST_ROW, channel: "X" }).channel).toBe("x");
    });

    it("boşluklu değeri de toparlar", () => {
      expect(toPlanPost({ ...POST_ROW, channel: "  Instagram  " }).channel).toBe("instagram");
    });

    it("planlayıcının yazmadığı platformu varsayılana düşürür", () => {
      // tiktok/youtube geçerli Platform ama PLAN_CHANNELS'ta değil (§8.8).
      expect(toPlanPost({ ...POST_ROW, channel: "tiktok" }).channel).toBe("instagram");
      expect(toPlanPost({ ...POST_ROW, channel: "çöp" }).channel).toBe("instagram");
      expect(toPlanPost({ ...POST_ROW, channel: "" }).channel).toBe("instagram");
    });

    it("sonuç her zaman geçerli bir plan kanalı", () => {
      for (const raw of ["instagram", "Instagram", "tiktok", "", "çöp"]) {
        expect(PLAN_CHANNELS).toContain(toPlanPost({ ...POST_ROW, channel: raw }).channel);
      }
    });
  });

  describe("biçim doğrulaması", () => {
    it("bilinen biçimleri geçirir", () => {
      for (const kind of POST_KINDS) {
        expect(toPlanPost({ ...POST_ROW, kind }).kind).toBe(kind);
      }
    });
    it("bilinmeyen biçimi 'text'e düşürür", () => {
      for (const raw of ["gif", "", "Image", "çöp"]) {
        expect(toPlanPost({ ...POST_ROW, kind: raw }).kind).toBe("text");
      }
    });
  });

  describe("durum doğrulaması", () => {
    it("plan durumlarını geçirir", () => {
      for (const status of ["idea", "draft", "scheduled", "published"] as const) {
        expect(toPlanPost({ ...POST_ROW, status }).status).toBe(status);
      }
    });
    it("⭐ plan dışı durumu 'idea'ya düşürür", () => {
      // 'failed'/'archived' içerik tablosunda geçerli ama PLAN durumu değil.
      for (const raw of ["failed", "archived", "publishing", "", "çöp"]) {
        expect(toPlanPost({ ...POST_ROW, status: raw }).status).toBe("idea");
      }
    });
  });

  it("dayOffset'i olduğu gibi taşır", () => {
    expect(toPlanPost({ ...POST_ROW, day_offset: 29 }).dayOffset).toBe(29);
  });

  it("girdi satırını değiştirmez", () => {
    const row = { ...POST_ROW, channel: "Instagram" };
    toPlanPost(row);
    expect(row.channel).toBe("Instagram");
  });
});
