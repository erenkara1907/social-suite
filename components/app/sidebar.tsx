"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Icon } from "@/components/ui/icon";
import { useLang } from "@/components/i18n/language-provider";
import { buildNav, type ModuleName } from "@/app.config";
import { cn } from "@/lib/utils";

/** Kimin oturumu açık. `(app)/layout.tsx` gerçek kullanıcıdan doldurur. */
export interface SidebarUser {
  name: string;
  email: string;
}

/** "Alex Jordan" → "AJ", "mira" → "MI". */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * siraya/components/app/sidebar.tsx tabanlı (§7.4: "tek `user` prop'u alan
 * sürüm"). Dört fark:
 *
 * 1. `appConfig.nav` yerine `buildNav(modules)` — §1.6'da nav statik dizi
 *    olmaktan çıktı. Hangi modüllerin açık olduğuna kabuk karar verir; böylece
 *    11b'de gelen ekranlar tek bir listede açılır, burada değil.
 * 2. `user` artık opsiyonel DEĞİL. siraya'da `user ?? DEMO_USER` vardı;
 *    B1 ile kimlik her modda gerçek olduğu için sahte kullanıcıya düşecek
 *    bir yol kalmadı — tip bunu zorunlu kılıyor.
 * 3. Çıkış istemciden değil, `/logout` route handler'ına POST ile yapılıyor.
 *    Oturum çerezini silme yetkisi yalnızca Route Handler'da.
 * 4. Arama kutusu ve bildirim zili silindi (§7.4: "arama/bildirim dekoru
 *    üçünden de silinir") — ikisi de hiçbir şeye bağlı değildi.
 */
export function Sidebar({
  user,
  modules,
}: {
  user: SidebarUser;
  modules: readonly ModuleName[];
}) {
  const pathname = usePathname();
  const { t, ui, lang } = useLang();
  const [leaving, setLeaving] = useState(false);

  const nav = buildNav(modules);

  return (
    <aside className="hidden bg-sidebar text-sidebar-foreground md:flex md:w-64 md:flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/dashboard">
          <Logo onDark />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="label-mono px-3 pb-2 pt-1 text-sidebar-muted">
          {lang === "tr" ? "Menü" : "Menu"}
        </p>
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-active text-white shadow-sm"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm font-semibold">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
          </div>
          <form action="/logout" method="post" onSubmit={() => setLeaving(true)}>
            <button
              type="submit"
              disabled={leaving}
              aria-label={ui.logout}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground disabled:opacity-50"
            >
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
