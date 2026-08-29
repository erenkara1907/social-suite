import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { DEFAULT_LANDING } from "@/lib/routes";

/**
 * Kök adres — BIRLESIM_PLANI §12 adım 11 (A0).
 *
 * Adım 1'in iskelet placeholder'ının yerini aldı: `/` artık bir ekran değil,
 * bir yönlendirme. Oturum varsa DEFAULT_LANDING'e, yoksa /login'e düşer —
 * proxy.ts'in `(app)` guard'ıyla aynı karar mantığı (`getUser()`, `getSession()`
 * değil — bkz. `proxy.ts:64-66`).
 *
 * (marketing) grubunda kalmaya devam ediyor: gerçek landing sayfası FAZ 2'nin
 * işi ve bu dosyanın üstüne yazılacak — iki dosyanın birden `/`'e çözülmesi
 * bir Next.js derleme hatası olurdu.
 */
export default async function Home() {
  const user = await getUser();
  redirect(user ? DEFAULT_LANDING : "/login");
}
