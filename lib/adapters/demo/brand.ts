/**
 * BrandPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/brands.ts` → `DEMO_BRAND` (DOLU profil).
 *
 * ⚠ `save` kalıcı değil — girilen markayı olduğu gibi geri döndürüyor.
 * Formun "kaydedildi" akışı çalışıyor görünsün diye; sayfa yenilendiğinde
 * fixture geri geliyor. Demo modda kalıcılık sözü vermek yanlış olurdu.
 */
import type { BrandPort } from "@/lib/adapters/ports";
import { DEMO_BRAND } from "@/lib/adapters/demo/fixtures/brands";

export const demoBrand: BrandPort = {
  async get() {
    return { ...DEMO_BRAND };
  },
  async save(brand) {
    return { ok: true, data: { ...brand } };
  },
};
