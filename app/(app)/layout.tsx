import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { anyDemo, PORT_NAMES } from "@/lib/adapters";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { DemoBanner } from "@/components/app/demo-banner";
import type { ModuleName } from "@/app.config";

/**
 * Uygulama kabuğu — BIRLESIM_PLANI §12 adım 7b.
 *
 * ⭐ GUARD BURADA, sayfalarda değil. `requireBrand()` iki kapıyı birden
 * geçirir: oturum yoksa `/login`, marka yoksa `/onboarding`. Bu yüzden
 * `(app)` altındaki hiçbir sayfa kendi guard'ını yazmak zorunda değil —
 * adım 8-10'da yazılacak ekranlar için bu, unutulabilecek bir kapı demekti.
 *
 * proxy.ts'in yerine geçmiyor, ONUN ALTINDA duruyor: proxy `matcher`'ı bir
 * rotayı kaçırırsa sayfa yine korunur.
 */

/**
 * ⭐ D4 — kabuğun gösterdiği modüller.
 *
 * Kritik yol dört ekran: `/plan`, `/studio`, `/queue`, `/analytics`.
 * Bunlara iki tanesi eklenir ve sebebi D4'te yazılı:
 *   · `dashboard` — "kabuğun iniş ekranı olduğu için adım 8'de kalır".
 *     Girişten sonra varılan yer burası; menüde olmasaydı `/dashboard`
 *     erişilemez bir sayfa olurdu.
 *   · `settings`  — "marka profili formu `/plan`'ın girdisi olduğu için
 *     adım 9'da kalır". Yalnızca marka profili bölümüyle; entegrasyon
 *     rozetleri ve API anahtarı bölümü 11b / adım 13.
 *
 * 11b'ye ertelenen üçü (`library`, `composer`, `channels`) burada YOK.
 * Rotaları da yok; menüye eklenmeleri tek satırlık bir değişiklik olacak.
 */
const SHELL_MODULES: readonly ModuleName[] = [
  "dashboard",
  "plan",
  "queue",
  "studio",
  "analytics",
  "settings",
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireBrand();

  // §9.1: mod SUNUCUDA çözülür ve istemciye `isDemo` olarak veri gibi iner.
  // Çerez ezmesi üretimde zaten ölü kod (§11 S6).
  const overrides = await requestModeOverrides();
  const isDemo = anyDemo(PORT_NAMES, overrides);

  const sidebarUser = {
    name:
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "—",
    email: user.email ?? "—",
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={sidebarUser} modules={SHELL_MODULES} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar modules={SHELL_MODULES} />
        <DemoBanner isDemo={isDemo} />
        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
