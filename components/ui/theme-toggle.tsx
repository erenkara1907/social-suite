"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hydration guard: false on the server and during the first client render,
 * true afterwards. next-themes cannot know the theme until it is mounted, so
 * the icon must not be decided before then or the markup mismatches.
 *
 * ⚠ SAPMA (BIRLESIM_PLANI §7.4 "gövdesini değiştirme" kuralından):
 * kaynaktaki `useState(false)` + `useEffect(() => setMounted(true), [])`
 * deseni React 19'un `react-hooks/set-state-in-effect` kuralına takılıyor ve
 * `npm run lint`'i kırıyor. Aynı hata threadly'nin kendisinde de var (yani
 * devralınan borç, burada doğmadı). Davranış birebir korunarak effect'siz
 * karşılığına çevrildi.
 */
const subscribeToNothing = () => () => {};

function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const isDark = theme === "dark";

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer",
        className,
      )}
    >
      {hydrated && isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
