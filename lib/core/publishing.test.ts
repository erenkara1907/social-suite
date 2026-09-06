import { describe, expect, it } from "vitest";
import {
  AUTOMATED_STATUSES, PUBLISHABLE_PLATFORMS, canPublish,
  checkTextLimit, composePostText, countGraphemes, utf8ByteLength,
} from "@/lib/core/publishing";
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

describe("countGraphemes — 17a FAZ B1", () => {
  it("ASCII'de .length ile aynı sonucu verir", () => {
    expect(countGraphemes("hello")).toBe(5);
  });

  it("⭐ Türkçe harfler TEK grapheme, .length'ten FARKLI değil ama bayt'tan farklı", () => {
    // "çğıöşü" — 6 Türkçe harf, 6 grapheme (UTF-16 .length de 6 — bunlar
    // BMP'de tek code unit; asıl fark bayt sayımında, aşağıda).
    expect(countGraphemes("çğıöşü")).toBe(6);
  });

  it("⭐ emoji aile dizisi TEK grapheme — .length ÇOK FAZLA sayardı", () => {
    const familyEmoji = "👨‍👩‍👧"; // ZWJ ile birleşmiş 3 emoji, tek grapheme
    expect(countGraphemes(familyEmoji)).toBe(1);
    expect(familyEmoji.length).toBeGreaterThan(1); // .length yanlış sonucun kanıtı
  });

  it("boş dizide 0 döner", () => {
    expect(countGraphemes("")).toBe(0);
  });
});

describe("utf8ByteLength — 17a FAZ B1", () => {
  it("ASCII'de .length ile aynı", () => {
    expect(utf8ByteLength("hello")).toBe(5);
  });

  it("⭐ Türkçe harfler UTF-8'de 2 bayt — grapheme sayısından FARKLI", () => {
    // ç,ğ,ı,ö,ş,ü hepsi Latin-1 Supplement/Extended-A dışı, UTF-8'de 2 bayt.
    expect(utf8ByteLength("çğıöşü")).toBe(12); // 6 harf × 2 bayt
    expect(countGraphemes("çğıöşü")).toBe(6); // aynı dizede grapheme farklı
  });
});

describe("checkTextLimit — 17a FAZ B1", () => {
  it("bluesky sınırı içindeki metin geçer", () => {
    const result = checkTextLimit("bluesky", "Merhaba dünya, bugün kahve içiyoruz ☕");
    expect(result.ok).toBe(true);
    expect(result.limits?.maxGraphemes).toBe(300);
  });

  it("⭐ 300 grapheme'i AŞAN Türkçe metin reddedilir (bayt sayımı DEĞİL, grapheme)", () => {
    const longText = "çğıöşü".repeat(60); // 360 grapheme, sınırı aşıyor
    const result = checkTextLimit("bluesky", longText);
    expect(result.ok).toBe(false);
    expect(result.graphemes).toBe(360);
  });

  it("⭐ 3000 baytı AŞAN ama 300 grapheme sınırının ALTINDA kalan metin de reddedilir", () => {
    // ZWJ aile emojisi: 1 grapheme, 25 UTF-8 bayt (4 emoji + 3 birleştirici).
    // 130 tekrar → 130 grapheme (< 300, grapheme testinden GEÇER) ama
    // 3250 bayt (> 3000) — yalnızca bayt sınırı bunu yakalar.
    const familyEmoji = "👨‍👩‍👧‍👦".repeat(130);
    const result = checkTextLimit("bluesky", familyEmoji);
    expect(result.graphemes).toBe(130);
    expect(result.graphemes).toBeLessThan(300);
    expect(result.bytes).toBeGreaterThan(3000);
    expect(result.ok).toBe(false);
  });

  it("tanımlı sınırı olmayan platformda ok:true, limits:null döner", () => {
    const result = checkTextLimit("instagram", "x".repeat(10_000));
    expect(result.ok).toBe(true);
    expect(result.limits).toBeNull();
  });
});

describe("composePostText — 17a FAZ B1", () => {
  it("body + hashtags birleşir, aralarında boş satır var", () => {
    expect(composePostText({ body: "Merhaba dünya.", hashtags: "#kahve #istanbul" }))
      .toBe("Merhaba dünya.\n\n#kahve #istanbul");
  });

  it("⭐ hook AYRI PARAMETRE olarak alınmaz — body zaten hook'u içeriyor (caption.ts sözleşmesi)", () => {
    // composePostText'in imzasında hook YOK — bu, onu yanlışlıkla body'nin
    // önüne eklemenin (hook'u iki kez göstermenin) yapısal olarak mümkün
    // olmadığını kanıtlıyor.
    const result = composePostText({ body: "Kanca satırı zaten burada.", hashtags: "" });
    expect(result).toBe("Kanca satırı zaten burada.");
  });

  it("hashtags boşsa yalnızca body döner, fazladan boşluk kalmaz", () => {
    expect(composePostText({ body: "Tek satır.", hashtags: "" })).toBe("Tek satır.");
  });
});
