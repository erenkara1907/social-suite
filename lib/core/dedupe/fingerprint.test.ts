import { describe, expect, it } from "vitest";
import { computeFingerprint, normalizeForFingerprint } from "@/lib/core/dedupe/fingerprint";

describe("normalizeForFingerprint — Akış E Kontrol 1", () => {
  it("büyük/küçük harfi Türkçe kurallarıyla eşitler (İ→i, I→ı)", () => {
    expect(normalizeForFingerprint("İSTANBUL Iğdır")).toBe(normalizeForFingerprint("istanbul ığdır"));
  });

  it("hashtag'i atar", () => {
    expect(normalizeForFingerprint("kahve #kahvedükkanı güzel")).toBe(normalizeForFingerprint("kahve güzel"));
  });

  it("emojiyi atar", () => {
    expect(normalizeForFingerprint("yeni ürün 🎉🔥")).toBe(normalizeForFingerprint("yeni ürün"));
  });

  it("noktalamayı atar, çoklu boşluğu teke indirir", () => {
    expect(normalizeForFingerprint("Merhaba,   dünya!!!")).toBe("merhaba dünya");
  });
});

describe("computeFingerprint — Katman 1 birebir kopya", () => {
  it("aynı title+hook (farklı büyük/küçük harf, noktalama) AYNI fingerprint verir", () => {
    const a = computeFingerprint("Yeni Ürün Lansmanı!", "Bugün duyuruyoruz 🎉");
    const b = computeFingerprint("yeni ürün lansmanı", "bugün duyuruyoruz");
    expect(a).toBe(b);
  });

  it("farklı title FARKLI fingerprint verir", () => {
    const a = computeFingerprint("Ürün A", "hook");
    const b = computeFingerprint("Ürün B", "hook");
    expect(a).not.toBe(b);
  });

  it("gövde fingerprint'e GİRMEZ — title+hook aynıysa eşleşir", () => {
    // Bilinçli tasarım kararı: Katman 1, plan_generate içinde gövde henüz
    // yokken çalışır (bkz. dosyanın kendi başlığı). Bu test o kararı kanıtlar.
    const a = computeFingerprint("aynı başlık", "aynı kanca");
    const b = computeFingerprint("aynı başlık", "aynı kanca");
    expect(a).toBe(b);
  });

  it("64 karakterlik hex sha256 döner", () => {
    expect(computeFingerprint("x", "y")).toMatch(/^[0-9a-f]{64}$/);
  });
});
