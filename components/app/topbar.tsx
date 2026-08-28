"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLang } from "@/components/i18n/language-provider";
import { useBrand } from "@/components/app/brand-context";
import { buildNav, type ModuleName } from "@/app.config";

/**
 * siraya/components/app/topbar.tsx tabanlı (§7.4). İki fark:
 *
 * 1. Arama kutusu ve bildirim zili SİLİNDİ — §7.4 "arama/bildirim dekoru
 *    üçünden de silinir". İkisi de hiçbir şeye bağlı değildi: arama kutusu
 *    bir `<div>`'di (input bile değil), zil `onClick`'siz bir düğmeydi ve
 *    okunmamış bildirim olduğunu söyleyen kırmızı noktası sabitti.
 * 2. Başlık `appConfig.nav` yerine `buildNav(modules)`'tan geliyor (§1.6).
 */
export function Topbar({ modules }: { modules: readonly ModuleName[] }) {
  const pathname = usePathname();
  const { t } = useLang();
  const brand = useBrand();

  const current = buildNav(modules).find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-5 backdrop-blur">
      <div className="min-w-0">
        <h1 className="font-display text-lg font-semibold tracking-tight">
          {current ? t(current.label) : ""}
        </h1>
        <p className="truncate text-xs text-muted-foreground">{brand.name}</p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <LanguageToggle className="mr-1" />
        <ThemeToggle />
      </div>
    </header>
  );
}
