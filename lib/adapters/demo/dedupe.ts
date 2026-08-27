/**
 * DedupePort — DEMO implementasyon.
 *
 * ⭐ HER ZAMAN "yeni". §9.1 bunu açıkça söylüyor. Motor adım 15'te geliyor;
 * demoda sahte bir benzerlik skoru üretmek, kalibre EDİLMEMİŞ eşiklerin
 * (0.92 / 0.82) ölçülmüş gibi görünmesine yol açardı.
 *
 * Ürünün bu özelliği demoda `activity.ts`'teki `duplicate_blocked` satırıyla
 * ANLATILIYOR — geçmişte olmuş bir olay olarak, canlı bir hesaplama olarak
 * değil. Aradaki fark dürüstlük: akış gösteriliyor, ölçüm uydurulmuyor.
 *
 * ⚠ D3 — `embed()` demo tarafta ÇAĞRILAMAZ. Sıfır vektörü döndürmek
 * `content_items.embedding`'e anlamsız bir satır yazma riskini doğururdu;
 * `not_configured` demek doğrusu. Boyut sözleşmesi (`EMBEDDING_DIMENSIONS`)
 * canlı implementasyonda runtime'da doğrulanacak.
 */
import type { DedupePort } from "@/lib/adapters/ports";

export const demoDedupe: DedupePort = {
  async check() {
    return { ok: true, data: { decision: "new" } };
  },
  async embed() {
    return {
      ok: false,
      error: { code: "not_configured", detail: "embedding demo modda üretilmez (§12 adım 15)" },
    };
  },
};
