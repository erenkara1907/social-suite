import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_LANDING, isAuthPath, isProtectedPath } from "@/lib/routes";

/**
 * Oturum tazeleyici + `(app)` guard'ı.
 *
 * Next 16'da dosya adı `middleware.ts` değil `proxy.ts`, export adı `proxy`.
 * Teyit (ADIM_34'ün "değişiklik yok" tespiti bu oturumda tekrar ölçüldü):
 *   node_modules/next/dist/lib/constants.js:289  → const PROXY_FILENAME = 'proxy'
 *   .../build/analysis/get-page-static-info.js:271 → export id === 'proxy'
 *   aynı dosya:609 → Proxy dosyasında `runtime` ayarı YASAK (Node.js sabit).
 * `export const config = { matcher }` desteklenmeye devam ediyor (:333).
 *
 * ⭐ B1 — kimlik doğrulama HER MODDA gerçek. `APP_MODE=demo` yalnızca veriyi
 * demo yapar. Bu yüzden siraya'nın "Supabase yoksa guard'ı tamamen kapat"
 * satırı (`proxy.ts:11`) TAŞINMADI: yapılandırma eksikse korumalı yollar
 * yine `/login`'e gider, orada açık bir yapılandırma hatası görünür.
 */

/**
 * ⚠ Korunan/muaf yol listeleri BURADA DEĞİL, `lib/routes.ts`'te.
 *
 * Sebep: bu dosya `next/server`'ı import ediyor ve `lib/**` kapsamının
 * dışında — buradaki mantık test edilemez. Karar saf olduğu için (yol dizesi
 * girer, boolean çıkar) ayrıldı ve `lib/routes.test.ts` ile 16 assertion
 * altına alındı. Muaf yollar listenin TÜMLEYENİ: `/`, `/login`, `/signup`,
 * `/logout`, `/auth/*` ve aşağıdaki `matcher`'ın dışarıda bıraktığı statikler.
 */

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Yapılandırma yoksa oturum da olamaz. Guard GEVŞEMEZ — korumalı yol
  // /login'e gider, /login yapılandırma hatasını gösterir.
  if (!isSupabaseConfigured) {
    return isProtectedPath(pathname)
      ? redirectTo(request, "/login", pathname)
      : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() token'ı Supabase'e doğrulatır ve tazelenen oturumu yukarıdaki
  // çerezlere yazar. getSession() BURADA ASLA kullanılmaz: yalnızca çereze
  // bakar, doğrulamaz (siraya/proxy.ts:26-27 gerekçesi).
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && isProtectedPath(pathname)) {
    return redirectTo(request, "/login", pathname);
  }

  if (user && isAuthPath(pathname)) {
    return redirectTo(request, DEFAULT_LANDING);
  }

  return response;
}

export const config = {
  // ⭐ §12 adım 16 FAZ B1 CANLI BULGU — `api/` bu matcher'a DAHİLDİ (yalnızca
  // statikler hariçti). `/api/cron/*` (CRON_SECRET) ve `/api/instagram/
  // callback` (kendi state/requireBrand() kontrolü) zaten kendi auth'unu
  // yapıyor ve ikisi de PROTECTED_ROUTES/AUTH_ROUTES dışında olduğu için
  // proxy hiçbir zaman redirect ÜRETMİYORDU — yalnızca her istekte gereksiz
  // bir `supabase.auth.getUser()` çağrısı ekliyordu. OAuth callback'inde bu,
  // tek kullanımlık `code`'un exchange'e ulaşmadan önce harcadığı süreyi
  // BÜYÜTÜYOR (route handler'ın kendi `requireBrand()`'ı zaten AYRI bir
  // `getUser()` çağrısı yapıyor — iki kat gecikme). Zararsız ama amaçsızdı;
  // `api/` hariç tutuldu.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|ico)$).*)",
  ],
};
