/**
 * Deterministik SAHTE embedding — demo implementasyon + testler için.
 * BIRLESIM_PLANI §12 adım 15, revize A3.2.
 *
 * Gerçek bir sağlayıcının anlamsal yapısını TAKLİT ETMEZ (aynı konuya
 * yakın metinler burada yakın vektör üretmez — bu, hash tabanlı bir PRNG'in
 * doğası). Amacı yalnızca:
 *   1. AYNI metin → AYNI vektör (embedding'in "deterministik" sözleşmesi),
 *   2. tam `EMBEDDING_DIMENSIONS` (1024) boyut,
 *   3. sıfır dış istek,
 * böylece Katman 2/3'ün EŞİK MANTIĞI (bkz. `similarity.ts`, `index.ts`
 * testleri) sayılarla DOĞRUDAN sınanabiliyor — bu fonksiyon sadece "plumbing"
 * kanıtı (embed() çağrıldı, boyut doğru, aynı girdi aynı çıktı verdi).
 */
import { EMBEDDING_DIMENSIONS } from "@/lib/core/dedupe/config";

function hashSeed(text: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — küçük, bağımlılıksız, deterministik PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Birim uzunluğa normalize edilmiş 1024 boyutlu vektör — kosinüs benzerliği
 *  `[-1, 1]` aralığında anlamlı kalsın diye (gerçek embedding'lerin de
 *  genelde normalize döndüğü davranışı taklit eder). */
export function demoEmbed(text: string): number[] {
  const rand = mulberry32(hashSeed(text));
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => rand() * 2 - 1);
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}
