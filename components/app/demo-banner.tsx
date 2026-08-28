"use client";

import { useLang } from "@/components/i18n/language-provider";

/**
 * §9.1 · §12 adım 8-10 kabul kriteri: "her ekranda DemoBanner görünür".
 *
 * Dört karar:
 *  1. KAPATILAMAZ. Kapatma düğmesi olsaydı müşteri demosunda ilk iş kapatmak
 *     olurdu ve ekrandaki sayıların örnek olduğu bilgisi kaybolurdu.
 *  2. `isDemo` bir PROP — bileşen `process.env` OKUMAZ. Mod sunucuda
 *     `(app)/layout.tsx` içinde çözülür ve istemciye VERİ gibi iner. §9.1'in
 *     `NEXT_PUBLIC_` tuzağı (threadly `hasSupabase`) tam olarak buydu.
 *  3. İstemci bileşeni olmasının tek sebebi dil: metin `useLang()`'ten gelir,
 *     böylece dil düğmesi şeridi de çevirir. Karar yine sunucuda.
 *  4. `role="status"` — ekran okuyucu bunu bağlam olarak duyurur, hata
 *     (`alert`) olarak değil.
 */
export function DemoBanner({ isDemo }: { isDemo: boolean }) {
  const { ui } = useLang();

  if (!isDemo) return null;

  return (
    <p
      role="status"
      className="border-b border-dashed border-border bg-muted/60 px-5 py-2 text-center text-xs font-medium tracking-wide text-muted-foreground"
    >
      {ui.demoBannerShell}
    </p>
  );
}
