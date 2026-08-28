/**
 * Supabase bağlantı değerleri — BIRLESIM_PLANI §5 "threadly'nin getUser() +
 * anon key kararı korunur".
 *
 * ⚠ B1 — Kimlik doğrulama HER MODDA gerçektir. `APP_MODE=demo` yalnızca
 * VERİYİ demo yapar (§9.1, `lib/adapters/mode.ts`). Bu yüzden burada
 * "Supabase yoksa girişi atla" gibi bir kaçış yolu YOK: siraya'nın
 * `isSupabaseConfigured` bayrağı guard'ı gevşetmek için değil, yalnızca
 * yapılandırma eksikliğini AÇIKÇA raporlamak için var.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Yapılandırma eksikse sessizce `null` dönmek yerine patlıyoruz.
 *
 * Gerekçe: sessiz `null` iki farklı durumu ("kullanıcı giriş yapmamış" ve
 * "Supabase hiç yapılandırılmamış") tek bir sonuca indirir — §9.1'in
 * "sessiz düşme" olarak adlandırdığı hata. Guard'ın yanlış tarafına düşmek
 * kimlik doğrulamada kabul edilemez.
 */
export function assertSupabaseConfigured(): void {
  if (isSupabaseConfigured) return;
  throw new Error(
    "Supabase yapılandırılmamış: NEXT_PUBLIC_SUPABASE_URL ve " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local'da dolu olmalı. " +
      "Kimlik doğrulama demo modda da gerçektir (BIRLESIM_PLANI §9.1 · B1).",
  );
}
