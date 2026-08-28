import { Icon } from "@/components/ui/icon";

/**
 * Adım 7'nin geçici sahnesi. `(app)` kabuğunun içinde render eden, guard'lı
 * ama boş bir ekran.
 *
 * Neden ortak bir bileşen: altı sayfa aynı iskeleti gösteriyor. Altı kopya
 * yazmak, adım 8-10'da her birini ayrı ayrı temizlemek demekti; tek bileşen
 * bir ekran gerçek içeriğine kavuştuğunda o sayfadan sadece import'u siler.
 *
 * ⚠ Bu bileşen adım 11'de hiçbir sayfada kalmamalı. Kaldıysa o ekran
 * yazılmamış demektir.
 */
export function ScreenStub({
  icon,
  step,
}: {
  icon: string;
  /** BIRLESIM_PLANI §12'de bu ekranı yazacak adım. */
  step: string;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <p className="label-mono mt-4 text-muted-foreground">{step}</p>
      </div>
    </div>
  );
}
