# `app/(app)/` — tek uygulama kabuğu

BIRLESIM_PLANI §3.1 · doldurulacağı adım: **§12 adım 7 (layout), 8-10, 11b**

## Ne girer
Giriş yapmış kullanıcının gördüğü her ekran, **tek sidebar ve tek layout**
altında: `dashboard/` · `plan/` · `queue/` · `studio/` (+ `studio/personas/`) ·
`library/` · `channels/` · `analytics/` · `settings/`

`layout.tsx` **auth guard'ını burada yapar** — threadly'de bu eksikti, giriş
yapmamış biri `/dashboard`'a girebiliyordu (§10 bulgu 4).

## Ne GİRMEZ
- **Proje başına route group.** `(sahne)/`, `(siraya)/`, `(threadly)/`
  yapılmadı: kullanıcıya üç ayrı uygulama hissi verirdi ve `/dashboard` iki
  grupta tanımlanırsa Next.js zaten build hatası verir (§3.1).
- Pazarlama sayfası — o `(marketing)/`'de
- Auth ekranı — o `(auth)/`'da

## Kritik yol (D4)
Satılabilir demo için gereken dört ekran: **`/plan` · `/studio` · `/queue` ·
`/analytics`**. `/library`, `/composer`, `/channels` ve `/settings`'in
entegrasyon bölümü adım **11b**'ye ertelendi.
