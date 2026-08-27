/**
 * Demo marka profili — `/settings` → marka formu ve her AI isteminin girdisi.
 *
 * ← threadly `lib/brand/*` alanları + siraya `lib/demo/data.ts` hero metninin
 *   anlattığı işletme ("Mira", kahve). İki proje aynı kurguyu farklı yerlerde
 *   anlatıyordu; burada tek marka olarak birleşti.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK. `Brand` `lib/core/brand/types.ts`'te yaşıyor.
 *
 * Marka DOLU — boş değil. §9.2: "/settings → marka: örnek marka profili
 * (dolu)". Boş bir profil demoyu `/plan`'ın ilk adımında durdururdu.
 */
import type { Brand } from "@/lib/core/brand/types";

/** Tüm fixture satırlarının `brand_id`'si. Tek marka — §4e'nin çok markalı
 *  senaryosu FAZ 3, demoda tek işletme anlatılıyor. */
export const DEMO_BRAND_ID = "b0000000-0000-4000-8000-000000000001";
export const DEMO_USER_ID = "u0000000-0000-4000-8000-000000000001";

/** `brands.timezone` varsayılanı — `lib/core/tz.ts`'in `DEFAULT_TZ`'siyle aynı. */
export const DEMO_TIMEZONE = "Europe/Istanbul";

export const DEMO_BRAND: Brand = {
  name: "Demleme Kahve",
  industry: "Üçüncü nesil kahve · perakende + e-ticaret",
  description:
    "Kadıköy'de tek şube, haftada 400 kg taze kavurma. Çekirdekleri doğrudan " +
    "üreticiden alıyoruz ve her partinin kavurma tarihini paketin üstüne " +
    "yazıyoruz. Online satış cironun %40'ı.",
  products:
    "Tek köken çekirdek (Etiyopya Yirgacheffe, Kolombiya Huila), harman " +
    "kahve (Sabah Harmanı), abonelik kutusu (aylık 250g/500g), soğuk demleme " +
    "şişe, ekipman (V60, Aeropress, değirmen)",
  audience:
    "25-40 yaş, evde demleme yapan, kahveyi bir alışkanlıktan çok bir zanaat " +
    "olarak gören şehirli tüketici. Çoğu Instagram'dan geliyor; LinkedIn " +
    "tarafında kurumsal hediye kutusu alan İK ekipleri var.",
  voice:
    "Sıcak ama bilgiç değil. Terimi kullanırız, sonra bir cümleyle açıklarız. " +
    "Abartılı sıfat yok — 'muhteşem' yerine 'bu partide çilek notu belirgin'. " +
    "Emoji az, en fazla bir tane.",
  keywords:
    "taze kavurma, tek köken, demleme, V60, filtre kahve, abonelik, " +
    "kavurma tarihi, çekirdek",
  links: "demlemekahve.com · instagram.com/demlemekahve · linkedin.com/company/demleme",
};
