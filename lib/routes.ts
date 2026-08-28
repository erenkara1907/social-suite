/**
 * Guard'ın karar yüzeyi — BIRLESIM_PLANI §12 adım 7 (B3).
 *
 * Neden `proxy.ts` içinde değil: `proxy.ts` `next/server`'ı import ediyor ve
 * proje kökünde, `lib/**` kapsamının dışında. Kararın kendisi ise saf: bir
 * yol dizesi girer, bir boolean çıkar. Next'e bağlı bir dosyanın içinde
 * kalsaydı test edilemezdi — ve burası bir hata olduğunda bir ekranı
 * sessizce herkese açan yer.
 *
 * Hem sunucu (`proxy.ts`, route handler'lar) hem istemci
 * (`components/auth/auth-screen.tsx`) import ediyor; bu yüzden
 * `server-only` YOK ve `process.env` okumuyor.
 */

/** Giriş sonrası varsayılan iniş ekranı (D4: "kabuğun iniş ekranı"). */
export const DEFAULT_LANDING = "/dashboard";

/**
 * `(app)` grubunun tamamı. Oturumsuz ziyaretçi `/login`'e gider.
 *
 * `/onboarding` fiziksel olarak `(app)`'in dışında (`app/(auth)/onboarding/`)
 * ama BURADA: oturum orada da şarttır, yalnızca MARKA şart değildir.
 *
 * Son üçünün rotası henüz yok — §12 adım 11b'de gelecekler. Listede
 * olmalarının bedeli sıfır, faydası şu: eklendikleri gün guard unutulamaz.
 */
export const PROTECTED_ROUTES = [
  "/dashboard",
  "/plan",
  "/queue",
  "/studio",
  "/analytics",
  "/settings",
  "/onboarding",
  "/library",
  "/composer",
  "/channels",
] as const;

/**
 * Oturumluyken burada işi olmayan yollar.
 *
 * ⚠ `/logout` ve `/auth/callback` KASITLI OLARAK YOK. `/logout` burada
 * olsaydı oturumu olan kullanıcı çıkış yapmak istediğinde `/dashboard`'a
 * geri atılırdı — çıkılamayan bir uygulama.
 */
export const AUTH_ROUTES = ["/login", "/signup"] as const;

/**
 * Yol bir ön ekin kendisi mi, yoksa onun alt yolu mu.
 *
 * `startsWith(prefix)` tek başına YANLIŞ: `/plan` koruması `/planlama`yı da
 * yakalardı. Sınır `/` olmalı.
 */
function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function isProtectedPath(pathname: string): boolean {
  return matches(pathname, PROTECTED_ROUTES);
}

export function isAuthPath(pathname: string): boolean {
  return matches(pathname, AUTH_ROUTES);
}

/**
 * `?next=` parametresini güvenli bir iç yola indirger — açık yönlendirme kapısı.
 *
 * ⚠ `startsWith("/")` TEK BAŞINA YETMEZ. `//evil.com` bu kontrolü geçer ama
 * tarayıcı onu protokol-göreli mutlak URL olarak çözer ve kullanıcıyı
 * `https://evil.com`'a götürür. Kimlik akışında bu, oturum açtıran bir
 * kimlik avı sayfasına yönlendirme demek.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_LANDING,
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}
