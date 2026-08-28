import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./config";

/**
 * RSC ve route handler'lar için, istek çerezlerine bağlı istemci.
 *
 * ⭐ ANON KEY, service-role DEĞİL (BIRLESIM_PLANI §5). Sunucuda çalışıyor
 * olmak RLS'i atlamak için bir sebep değil: her sorgu kullanıcının
 * oturumuyla gider ve `owns_brand()` politikalarından geçer. Service-role
 * üç yere ayrılmıştır — cron, OAuth callback, credential okuması
 * (`lib/supabase/admin.ts`).
 */
export async function createClient() {
  // ⚠ SIRA ÖNEMLİ. `cookies()` ÖNCE çağrılıyor: bu bir dinamik API ve Next
  // onu görene kadar rotayı statik sayıp derleme sırasında prerender etmeye
  // çalışıyor. Doğrulama önce gelseydi `next build`, `(app)` altındaki her
  // sayfada "Supabase yapılandırılmamış" ile patlardı — oysa o sayfaların
  // hiçbiri statik olamaz, hepsi oturuma bağlı.
  const cookieStore = await cookies();

  assertSupabaseConfigured();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component render'ı çerez yazamaz — yalnızca Route Handler
          // ve Server Action yazabilir. Oturumu proxy.ts zaten tazeledi,
          // bu yüzden BU durumu yutmak güvenli. Başka hiçbir hata yutulmuyor.
        }
      },
    },
  });
}

/**
 * Oturumdaki kullanıcı, yoksa `null`.
 *
 * `getUser()` token'ı Supabase'e doğrulatır; `getSession()` yalnızca çereze
 * bakar ve kandırılabilir. siraya'nın `proxy.ts:26-27` yorumu bu ayrımı
 * yazmış, karar korunuyor.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
