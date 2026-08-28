import { cn } from "@/lib/utils";
import { BRAND_MARK, BRAND_NAME } from "@/app.config";

/**
 * Ürün logosu — BIRLESIM_PLANI §7.4: üç projenin logosu da kendi markasına
 * aitti, HİÇBİRİ taşınmadı. Bu yeniden çizim.
 *
 * ⚠ §11 S1 — ad ve renk henüz kesin değil. Bu yüzden burada hiçbir metin
 * gömülü değil: işaret ve kelime `app.config.ts`'in TEK DEĞİŞTİRME
 * NOKTASI bloğundan geliyor, renk `--color-primary` token'ından.
 */
export function Logo({
  onDark = false,
  className,
}: {
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg text-[13px] font-bold tracking-tight",
          onDark ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        {BRAND_MARK}
      </span>
      <span
        className={cn(
          "font-display text-[17px] font-semibold tracking-tight",
          onDark ? "text-white" : "text-foreground",
        )}
      >
        {BRAND_NAME}
      </span>
    </span>
  );
}
