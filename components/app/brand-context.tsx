"use client";

import { createContext, useContext } from "react";

/**
 * Marka bağlamı — BIRLESIM_PLANI §12 adım 8, A2.
 *
 * ⭐ NEDEN AYRI DOSYA (`lib/server/auth.ts`'in `cache()`'inden ayrı):
 * React Context yalnızca İSTEMCİ ağacında çalışır — bir Server Component
 * (bir `page.tsx`) `useContext()` çağıramaz. Bu yüzden iki farklı sorunun
 * iki farklı çözümü var:
 *   · Sunucu → sunucu (bir sayfa `brand.timezone`'a ihtiyaç duyuyor):
 *     `requireBrand()`'in kendisi `cache()`'li — sayfa onu TEKRAR çağırır,
 *     ikinci bir Supabase sorgusu OLMAZ (React bu render turunda belleğe alır).
 *   · Sunucu → istemci (bir Client Component — örn. Topbar — marka adını
 *     göstermek istiyor): işte bu Context. Layout `brand`'i BİR KEZ çözer,
 *     `<BrandProvider>` ile İSTEMCİ ağacına veri olarak indirir.
 *
 * ⚠ `brand` nesnesinin TAMAMI buradan geçmiyor. Yalnızca ekranların
 * gerçekten kullandığı iki alan: `name` (Topbar başlığın yanında) ve
 * `timezone` (ileride bir istemci bileşeni saat dilimini göstermek isterse).
 * `industry`, `description`, `products`, `audience`, `voice`, `keywords`,
 * `links`, `id`, `isActive` istemciye İNMİYOR — hiçbir istemci bileşeni
 * onlara ihtiyaç duymuyor.
 */
export interface BrandContextValue {
  name: string;
  timezone: string;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({
  value,
  children,
}: {
  value: BrandContextValue;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside <BrandProvider>");
  return ctx;
}
