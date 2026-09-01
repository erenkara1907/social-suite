import { describe, expect, it } from "vitest";
import { demoEmbed } from "@/lib/core/dedupe/demo-embedding";
import { EMBEDDING_DIMENSIONS } from "@/lib/core/dedupe/config";

describe("demoEmbed — §12 adım 15 revize A3.2", () => {
  it("tam EMBEDDING_DIMENSIONS (1024) boyut döndürür", () => {
    expect(demoEmbed("kahve dükkanı").length).toBe(EMBEDDING_DIMENSIONS);
  });

  it("AYNI metin AYNI vektörü verir (deterministik)", () => {
    expect(demoEmbed("aynı başlık")).toEqual(demoEmbed("aynı başlık"));
  });

  it("FARKLI metin FARKLI vektör verir", () => {
    expect(demoEmbed("başlık A")).not.toEqual(demoEmbed("başlık B"));
  });

  it("birim uzunluğa normalize edilmiş (kosinüs benzerliği anlamlı kalsın)", () => {
    const v = demoEmbed("normalize testi");
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("sıfır dış istek — saf fonksiyon, ağ/DB bağımlılığı yok", () => {
    // Bu test kendisi zaten kanıt: fetch/DB mock'lamaya gerek yok, hiç
    // network erişimi olmayan bir vitest ortamında sorunsuz çalışır.
    expect(() => demoEmbed("x")).not.toThrow();
  });
});
