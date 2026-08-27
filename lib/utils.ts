import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * BIRLESIM_PLANI §7.4 — siraya'nın dosyası temel alındı. Üç projede de ölü
 * olan formatlayıcılar (CURRENCY, formatMoney, formatPercent, initials)
 * TAŞINMADI: bu ürün para birimi göstermiyor ve avatar baş harfi kullanmıyor.
 * Gerekirse geri eklenir — YAGNI.
 */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(d: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(
    "en-US",
    opts ?? { day: "2-digit", month: "short", year: "numeric" },
  ).format(date);
}

export function formatRelative(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}
