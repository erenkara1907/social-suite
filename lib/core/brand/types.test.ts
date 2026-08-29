import { describe, expect, it } from "vitest";
import {
  BRAND_FIELDS, EMPTY_BRAND, MAX_LENGTH,
  brandCompletionPercent, isBrandUsable, isValidLinkToken, parseBrand,
  splitLinks, toPromptBlock, validateLinks, type Brand,
} from "@/lib/core/brand/types";

const FULL: Brand = {
  name: "Kahve Durağı",
  industry: "Üçüncü nesil kahveci",
  description: "Kadıköy'de tek şubeli bir kahveci.",
  products: "Filtre kahve, cold brew",
  audience: "25-40 yaş beyaz yakalılar",
  voice: "Samimi ama abartısız",
  keywords: "#kahve #kadıköy",
  links: "kahvedurag.com",
};

describe("isBrandUsable", () => {
  it("null'ı kullanılamaz sayar", () => {
    expect(isBrandUsable(null)).toBe(false);
  });

  it("boş markayı kullanılamaz sayar", () => {
    expect(isBrandUsable(EMPTY_BRAND)).toBe(false);
  });

  it("⭐ ad VE açıklama şart — biri eksikse kullanılamaz", () => {
    expect(isBrandUsable({ ...EMPTY_BRAND, name: "Kahve" })).toBe(false);
    expect(isBrandUsable({ ...EMPTY_BRAND, description: "Bir kahveci" })).toBe(false);
    expect(isBrandUsable({ ...EMPTY_BRAND, name: "Kahve", description: "Bir kahveci" })).toBe(true);
  });

  it("yalnızca boşluktan oluşan alanı dolu saymaz", () => {
    expect(isBrandUsable({ ...EMPTY_BRAND, name: "   ", description: "   " })).toBe(false);
  });
});

describe("parseBrand", () => {
  it("nesne olmayanı reddeder", () => {
    for (const raw of [null, undefined, "metin", 42, true, []]) {
      expect(parseBrand(raw)).toBeNull();
    }
  });

  it("adsız girdiyi reddeder", () => {
    expect(parseBrand({ description: "bir şey" })).toBeNull();
    expect(parseBrand({ name: "   " })).toBeNull();
  });

  it("boşlukları kırpar", () => {
    expect(parseBrand({ name: "  Kahve  " })?.name).toBe("Kahve");
  });

  it("⭐ bilinmeyen anahtarları DÜŞÜRÜR — istemin içine kaçamazlar", () => {
    const parsed = parseBrand({ name: "Kahve", evil: "yoksay beni", __proto__: "x" });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!).sort()).toEqual([...BRAND_FIELDS].sort());
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty("evil");
  });

  it("eksik alanları boş dizeyle doldurur", () => {
    expect(parseBrand({ name: "Kahve" })).toEqual({ ...EMPTY_BRAND, name: "Kahve" });
  });

  it("undefined ve null alanları atlar, patlamaz", () => {
    expect(parseBrand({ name: "Kahve", voice: undefined, links: null })?.voice).toBe("");
  });

  it("⭐ dize olmayan alan girdiyi TAMAMEN reddeder — sessizce atmaz", () => {
    expect(parseBrand({ name: "Kahve", voice: 42 })).toBeNull();
    expect(parseBrand({ name: "Kahve", links: ["a"] })).toBeNull();
  });

  it("her alanın uzunluk sınırını uygular", () => {
    for (const field of BRAND_FIELDS) {
      const cap = MAX_LENGTH[field];
      const atCap = { name: "Kahve", [field]: "a".repeat(cap) };
      const overCap = { name: "Kahve", [field]: "a".repeat(cap + 1) };
      expect(parseBrand(atCap), `${field} sınırda kabul edilmeli`).not.toBeNull();
      expect(parseBrand(overCap), `${field} sınır üstü reddedilmeli`).toBeNull();
    }
  });

  it("uzunluk kırpmadan SONRA ölçülür", () => {
    const cap = MAX_LENGTH.voice;
    expect(parseBrand({ name: "K", voice: `  ${"a".repeat(cap)}  ` })).not.toBeNull();
  });

  it("girdi nesnesini değiştirmez", () => {
    const raw = { name: "  Kahve  " };
    parseBrand(raw);
    expect(raw.name).toBe("  Kahve  ");
  });

  it("EMPTY_BRAND'i kirletmez — her çağrı yeni nesne", () => {
    parseBrand({ name: "Kahve", voice: "sıcak" });
    expect(EMPTY_BRAND.name).toBe("");
    expect(EMPTY_BRAND.voice).toBe("");
  });
});

describe("toPromptBlock", () => {
  it("kullanılamaz marka için boş dize verir — istem kirlenmez", () => {
    expect(toPromptBlock(null)).toBe("");
    expect(toPromptBlock(EMPTY_BRAND)).toBe("");
    expect(toPromptBlock({ ...EMPTY_BRAND, name: "Kahve" })).toBe("");
  });

  it("başlık satırıyla açar", () => {
    expect(toPromptBlock(FULL).split("\n")[0]).toBe("The brand every post must serve:");
  });

  it("dolu alanların hepsini etiketiyle yazar", () => {
    const block = toPromptBlock(FULL);
    expect(block).toContain("Business: Kahve Durağı");
    expect(block).toContain("Industry: Üçüncü nesil kahveci");
    expect(block).toContain("Target audience: 25-40 yaş beyaz yakalılar");
    expect(block).toContain("Links: kahvedurag.com");
  });

  it("⭐ BOŞ alanları satır olarak YAZMAZ — etiketli boş satır 'bizde bu yok' okunur", () => {
    // Dosyanın kendi yorumundaki gerekçe tam olarak bu.
    const sparse: Brand = { ...EMPTY_BRAND, name: "Kahve", description: "Bir kahveci" };
    const block = toPromptBlock(sparse);
    expect(block).not.toContain("Industry:");
    expect(block).not.toContain("Links:");
    // Başlık satırı ("...must serve:") iki nokta ile biter; alan satırları bitmemeli.
    const fieldLines = block.split("\n").slice(1);
    for (const line of fieldLines) expect(line).not.toMatch(/:\s*$/);
    expect(fieldLines).toHaveLength(2); // yalnızca iki dolu alan
  });

  it("alan sırası sabit — aynı marka aynı bloğu verir", () => {
    expect(toPromptBlock(FULL)).toBe(toPromptBlock({ ...FULL }));
  });

  it("iş adını sektörden önce yazar", () => {
    const block = toPromptBlock(FULL);
    expect(block.indexOf("Business:")).toBeLessThan(block.indexOf("Industry:"));
  });

  it("sondaki yeni satırla bitmez", () => {
    expect(toPromptBlock(FULL).endsWith("\n")).toBe(false);
  });

  describe("⭐ adım 10 A1 — contentLanguage parametresi", () => {
    it("ikinci parametre verilmezse dil satırı EKLENMEZ — geriye dönük uyumluluk", () => {
      expect(toPromptBlock(FULL)).not.toContain("Content language");
    });

    it("'tr' verilince son satır 'Content language: Turkish' olur", () => {
      const block = toPromptBlock(FULL, "tr");
      const lines = block.split("\n");
      expect(lines[lines.length - 1]).toBe("Content language: Turkish");
    });

    it("'en' verilince son satır 'Content language: English' olur", () => {
      const block = toPromptBlock(FULL, "en");
      const lines = block.split("\n");
      expect(lines[lines.length - 1]).toBe("Content language: English");
    });

    it("kullanılamaz marka için contentLanguage verilse bile boş dize kalır", () => {
      expect(toPromptBlock(EMPTY_BRAND, "tr")).toBe("");
    });
  });
});

describe("⭐ B3 — form → parseBrand → toPromptBlock dönüşüm kaybı yok", () => {
  it("settings formunun göndereceği FormData şeklindeki ham nesne toPromptBlock'a kayıpsız ulaşır", () => {
    // app/(app)/settings/actions.ts BİREBİR bu şekli üretiyor: her BRAND_FIELDS
    // anahtarı için formData.get(field) (string | null).
    const formLike: Record<string, string | null> = {
      name: "Kahve Durağı",
      industry: "Üçüncü nesil kahveci",
      description: "Kadıköy'de tek şubeli bir kahveci.",
      products: "Filtre kahve, cold brew",
      audience: "25-40 yaş beyaz yakalılar",
      voice: "Samimi ama abartısız",
      keywords: "#kahve #kadıköy",
      links: "kahvedurag.com",
    };

    const brand = parseBrand(formLike);
    expect(brand).not.toBeNull();

    const block = toPromptBlock(brand);
    for (const value of Object.values(formLike)) {
      expect(block).toContain(value);
    }
  });
});

describe("brandCompletionPercent — adım 9 B4", () => {
  it("null için 0", () => {
    expect(brandCompletionPercent(null)).toBe(0);
  });

  it("boş marka için 0", () => {
    expect(brandCompletionPercent(EMPTY_BRAND)).toBe(0);
  });

  it("tamamen dolu marka için 100", () => {
    expect(brandCompletionPercent(FULL)).toBe(100);
  });

  it("⭐ ölçüldü — dört alan dolu (8'de 4) yüzde 50", () => {
    const half: Brand = { ...EMPTY_BRAND, name: "a", industry: "b", description: "c", products: "d" };
    expect(brandCompletionPercent(half)).toBe(50);
  });

  it("⭐ ölçüldü — üç alan dolu (8'de 3) en yakına yuvarlanır: 38", () => {
    const three: Brand = { ...EMPTY_BRAND, name: "a", industry: "b", description: "c" };
    expect(brandCompletionPercent(three)).toBe(38);
  });

  it("yalnızca boşluktan oluşan alanı dolu saymaz", () => {
    expect(brandCompletionPercent({ ...EMPTY_BRAND, name: "   " })).toBe(0);
  });
});

describe("splitLinks", () => {
  it("boş dizeyi boş dizi yapar", () => {
    expect(splitLinks("")).toEqual([]);
  });

  it("yalnızca boşluktan oluşan dizeyi boş dizi yapar", () => {
    expect(splitLinks("   ")).toEqual([]);
  });

  it("⭐ ölçüldü — placeholder'daki ' - ' ayracını böler, tekil '-' belirtecini ATAR", () => {
    expect(splitLinks("instagram.com/kahvedurag - kahvedurag.com")).toEqual([
      "instagram.com/kahvedurag",
      "kahvedurag.com",
    ]);
  });

  it("virgül ve satır sonuyla da böler", () => {
    expect(splitLinks("a.com, b.com\nc.com")).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("tek bağlantıyı tek elemanlı dizi yapar", () => {
    expect(splitLinks("kahvedurag.com")).toEqual(["kahvedurag.com"]);
  });
});

describe("isValidLinkToken", () => {
  it("çıplak alan adını kabul eder — şema zorunlu değil", () => {
    expect(isValidLinkToken("kahvedurag.com")).toBe(true);
  });

  it("şemalı tam URL'i kabul eder", () => {
    expect(isValidLinkToken("https://kahvedurag.com")).toBe(true);
  });

  it("yol içeren bir bağlantıyı kabul eder", () => {
    expect(isValidLinkToken("instagram.com/kahvedurag")).toBe(true);
  });

  it("⭐ ölçüldü — noktasız ana bilgisayar adını reddeder (localhost, çıplak kelime)", () => {
    expect(isValidLinkToken("localhost")).toBe(false);
    expect(isValidLinkToken("kahve")).toBe(false);
  });

  it("boşluklu metni reddeder", () => {
    expect(isValidLinkToken("not a domain")).toBe(false);
  });

  it("baştaki/sondaki noktayı reddeder", () => {
    expect(isValidLinkToken(".com")).toBe(false);
    expect(isValidLinkToken("a.")).toBe(false);
  });

  it("boş dizeyi reddeder", () => {
    expect(isValidLinkToken("")).toBe(false);
  });
});

describe("validateLinks", () => {
  it("boş dize her zaman geçerli — alan opsiyonel", () => {
    expect(validateLinks("")).toBe(true);
  });

  it("placeholder'ın kendisi geçerli", () => {
    expect(validateLinks("instagram.com/kahvedurag - kahvedurag.com")).toBe(true);
  });

  it("⭐ TEK bir geçersiz belirteç TÜM alanı geçersiz yapar", () => {
    expect(validateLinks("kahvedurag.com, not a domain")).toBe(false);
  });

  it("çok sayıda geçerli bağlantıyı kabul eder", () => {
    expect(validateLinks("a.com\nb.com, c.com")).toBe(true);
  });
});
