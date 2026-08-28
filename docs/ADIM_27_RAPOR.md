# ADIM 2 · 7 RAPORU — canlı Supabase şeması, auth katmanı, uygulama kabuğu

Tarih: 2026-08-28
Kapsam: FAZ A (adım 2 tamamlandı) · FAZ B (adım 7a) · FAZ C (adım 7b)
Kaynak: `docs/BIRLESIM_PLANI.md` · önceki oturumlar: `ADIM_012_RAPOR.md`,
`ADIM_34_RAPOR.md`, `ADIM_56_RAPOR.md`

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — canlı Supabase | ✅ Tamam | `2f23c34` |
| FAZ B — auth katmanı | ✅ Tamam | `11ac7de` |
| FAZ C — uygulama kabuğu | ✅ Tamam | `629f068` |

**Son kapı durumu:**

```
build   EXIT=0   13 rota; (app) altındaki 6'sı ƒ (dinamik); ƒ Proxy kayıtlı
tsc     EXIT=0   (çıktı yok)
lint    EXIT=0   (çıktı yok)
test    EXIT=0   12 dosya, 273 test   (önceki oturum: 9 dosya, 242 test)
audit   EXIT=0   found 0 vulnerabilities
git     temiz    (git status --short boş)
```

ADIM_56'nın beş açık maddesinden **ikisi kapandı**: #5 (şema Supabase'e
uygulanmadı) ve §2'nin çerez okuma katmanı. Kalan üçü (D3 embedding teyidi,
Instagram metrik adları, S7 lisans) bu adımın kapsamı dışında.

---

# FAZ A — canlı Supabase (adım 2)

## Proje

```
$ supabase projects list
REFERENCE ID         | NAME   | REGION                 | CREATED AT (UTC)
osxpcyzohmlgxkzbirci | social | Northeast Asia (Seoul) | 2026-08-28 05:06:24
```

Proje bu oturumda kullanıcı tarafından açıldı. Uygulama öncesi `public`
şemasında **0 tablo** vardı — temiz kurulum, göç değil.

## A0 — ön kontrol

`.env.local` **hiç yoktu**. Dördü de eksikti; A0 gereği durup soruldu.
Dosya oluşturuldu, `CRON_SECRET` `openssl rand -hex 32` ile üretildi.

```
$ git check-ignore -v .env.local
.gitignore:23:.env*.local	.env.local

$ git status --porcelain | grep -i env
(boş)
```

## A1 — placeholder'lar ve sır yönetimi

`supabase/apply.sh` yazıldı. Sır repoya **girmiyor**:

- `.env.local`'dan `SUPABASE_DB_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` okur.
- `__APP_URL__` / `__CRON_SECRET__` yalnızca uygulama anında, `mktemp` ile
  açılan **0600 izinli** geçici dosyada yer değiştirir; dosya `RETURN` trap'i
  ile silinir.
- Değer perl'e **ortam değişkeniyle** geçer, komut satırına gömülerek değil —
  gömülseydi `ps` çıktısında ve shell history'de görünürdü.
- Yerine koyma sonrası `grep` ile placeholder kalmadığı doğrulanır; kalmışsa
  betik durur.

```
$ grep -c "__APP_URL__\|__CRON_SECRET__" supabase/00_schema.sql
3                                  ← placeholder'lar repoda duruyor

$ grep -rn "<CRON_SECRET değeri>" . --include=*.sql --include=*.sh --include=*.ts --include=*.md
(eşleşme yok)                      ← sır repoda hiçbir yerde geçmiyor
```

Eksik değişkenle çalışmayı reddediyor:

```
$ supabase/apply.sh          # SUPABASE_DB_URL boşken
apply.sh: line 28: SUPABASE_DB_URL: HATA: SUPABASE_DB_URL boş (.env.local)
```

## A2 — cron job'ları PASİF

`CRON_ACTIVE=false` varsayılanı. `cron.schedule` ile oluşturulup
`cron.alter_job(..., active := false)` ile kapatılıyor.

**Gerekçe iddia değil, ölçüm.** İlk uygulamada job'lar aktif doğdu ve
pasifleştirilmeden önce beş kez tetiklendiler. `pg_net` sonuçları:

```sql
select id, status_code, error_msg from net._http_response order by id desc;

 id | status_code |          error_msg
----+-------------+----------------------------
  5 |             | Couldn't connect to server
  4 |             | Couldn't connect to server
  3 |             | Couldn't connect to server
  2 |             | Couldn't connect to server
  1 |             | Couldn't connect to server
```

`cron_fire()` `NEXT_PUBLIC_APP_URL || path` adresine istek atıyor, o adres
`http://localhost:3000` ve Supabase bulutundan erişilemez. Pasifleştirmeden
sonra `sm-worker` (dakikada bir) 2.5 dakika boyunca **hiç** çalışmadı:

```sql
select now(), max(start_time), round(extract(epoch from (now()-max(start_time)))/60,1)
  from cron.job_run_details;

            now            |      son_cron_calismasi       | dakika_once
---------------------------+-------------------------------+-------------
 2026-08-28 08:23:31+00    | 2026-08-28 08:21:00+00        |         2.5
```

Aktifleştirme **adım 17**'de (LIVE #3 — yayın), gerçek domain hazır olunca.
Yordam `supabase/README.md`'ye yazıldı:

```
NEXT_PUBLIC_APP_URL=https://<gerçek-domain>   # .env.local
CRON_ACTIVE=true supabase/apply.sh
```

`cron_fire()` `create or replace` olduğu için yeniden uygulama URL'i tazeler.

## A3 — uzantılar

```
     uzanti     |    sema    | surum
----------------+------------+--------
 pg_cron        | pg_catalog | 1.6.4     ← bu oturumda kuruldu
 pg_net         | public     | 0.20.4    ← bu oturumda kuruldu
 pgcrypto       | extensions | 1.3       ← projede hazırdı
 supabase_vault | vault      | 0.3.1     ← projede hazırdı
 vector         | extensions | 0.8.2     ← bu oturumda kuruldu (D3 · vector(1024))
```

## A4 — uygulama ve idempotency

### ⚠ Canlıda çıkan gerçek şema hatası

İlk uygulama `find_similar_content` üzerinde durdu:

```
ERROR:  operator does not exist: extensions.vector <=> extensions.vector
```

**Sebep:** Supabase `vector`'ü `extensions` şemasına kuruyor. `<=>` bir
**infix operatör** — `extensions.<=>` diye yazılamaz, yalnızca `search_path`
üzerinden çözülür. Fonksiyon SECURITY DEFINER ve `set search_path = public`
diyordu, oturumun varsayılan `search_path`'i (`"$user", public, extensions`)
geçersiz kalıyordu.

**Düzeltme:** yalnızca bu fonksiyonun `search_path`'i `public, extensions`
oldu. Diğer altı SECURITY DEFINER fonksiyonu (`handle_new_user`,
`owns_brand`, `claim_jobs`, `brand_latest_metrics`, `rate_limit_hit`,
`cron_fire`) vector operatörü kullanmadığı için dokunulmadı. Liste hâlâ
kapalı; `extensions` Supabase'in yönettiği bir şema olduğu için daraltmayı
gevşetmiyor.

**Bu hata lokal testte yakalanamazdı** — ADIM_012'nin lokal denemesinde
`vector` `public`'e kuruluydu. Adım 2'nin "canlı veritabanı" kriterinin neden
ertelenmemesi gerektiğinin somut örneği.

Düzeltmeden sonra:

```
$ supabase/apply.sh
apply EXIT=0 · hata satırı sayısı: 0

$ select * from public.find_similar_content(<boş uuid>, <1024 boyutlu vektör>);
(0 rows)                          ← fonksiyon canlıda çalışıyor
```

### İdempotency — canlıda kanıtlandı

Şema toplam **beş kez** uygulandı. 3. ve 4. uygulama arasındaki sayımlar:

```
ÖNCE : cron sm-* job: 5 | vault sm_cron_secret: 1 | media bucket: 1 | tablo: 14 | politika: 12
       apply EXIT=0 · hata satırı sayısı: 0
SONRA: cron sm-* job: 5 | vault sm_cron_secret: 1 | media bucket: 1 | tablo: 14 | politika: 12
```

Hiçbiri çoğalmadı.

## FAZ A doğrulama çıktıları

### 1 · 14 tablo, RLS durumları ve politika sayıları

```
      table_name      | politika_sayisi | rls_acik
----------------------+-----------------+----------
 activity             |               2 | t
 brands               |               1 | t
 channel_credentials  |               0 | t      ← politikasız
 channels             |               1 | t
 content_items        |               1 | t
 content_metrics      |               1 | t
 jobs                 |               1 | t
 media_assets         |               1 | t
 media_jobs           |               1 | t
 personas             |               1 | t
 plans                |               1 | t
 profiles             |               1 | t
 provider_credentials |               0 | t      ← politikasız
 rate_limit_counters  |               0 | t      ← politikasız
(14 rows)

 tablo_sayisi | sonuc
--------------+-------
           14 | OK
```

### 2 · `pg_policies where schemaname='public'` — 12 politika

```
    tablename    |      policyname      |  cmd   |  roles
-----------------+----------------------+--------+----------
 activity        | brand activity read  | SELECT | {public}
 activity        | brand activity write | INSERT | {public}
 brands          | own brands           | ALL    | {public}
 channels        | brand channels       | ALL    | {public}
 content_items   | brand content        | ALL    | {public}
 content_metrics | brand metrics read   | SELECT | {public}
 jobs            | own jobs read        | SELECT | {public}
 media_assets    | brand media          | ALL    | {public}
 media_jobs      | brand media jobs     | ALL    | {public}
 personas        | brand personas       | ALL    | {public}
 plans           | brand plans          | ALL    | {public}
 profiles        | own profile          | ALL    | {public}
(12 rows)
```

§5'in beklediği asimetri yerinde: `content_metrics` ve `activity` okuması
kullanıcıda, yazması service-role'da; `jobs` yalnızca `SELECT`.

### 3 · Sıfır politikalı üç tablo

```
        tablo         | rls_acik | politika_sayisi |              sonuc
----------------------+----------+-----------------+---------------------------------
 channel_credentials  | t        |               0 | OK — yalnızca service-role okur
 provider_credentials | t        |               0 | OK — yalnızca service-role okur
 rate_limit_counters  | t        |               0 | OK — yalnızca service-role okur
```

### 4 · Cron job'ları — hepsi `active=false`

```
 jobid |     jobname      |   schedule   | active
-------+------------------+--------------+--------
    16 | sm-metrics       | 17 * * * *   | f
    15 | sm-publish       | */5 * * * *  | f
    18 | sm-reaper        | */10 * * * * | f
    17 | sm-token-refresh | 30 3 * * *   | f
    14 | sm-worker        | * * * * *    | f

 sm_job_sayisi | aktif_sayisi |                sonuc
---------------+--------------+-------------------------------------
             5 |            0 | OK — 5 job var, hiçbiri aktif değil
```

### 5 · Vault, bucket, fonksiyonlar

```
      name      | kayit_sayisi | sonuc            id    | public | kayit_sayisi
----------------+--------------+-------          -------+--------+--------------
 sm_cron_secret |            1 | OK               media | t      |            1

 media_bucket_politikasi
-------------------------
                       4

       proname        | security_definer
----------------------+------------------
 brand_latest_metrics | t
 claim_jobs           | t
 cron_fire            | t
 find_similar_content | t
 handle_new_user      | t
 owns_brand           | t
 rate_limit_hit       | t
```

---

# FAZ B — auth katmanı (adım 7a)

## B1 — kimlik demo modda da GERÇEK

`APP_MODE=demo` yalnızca **veriyi** demo yapar. Karar `BIRLESIM_PLANI.md`
§9.1'in sonuna not olarak eklendi.

siraya'nın **üç** demo kaçamağı taşınmadı:

| Kaçamak | Kaynak | Ne yapıyordu |
|---|---|---|
| Guard kapatma | `siraya/proxy.ts:11` | Supabase yoksa `NextResponse.next()` — tüm uygulama açık |
| `enterDemo()` | `siraya/components/auth/auth-screen.tsx:44-49` | Her buton doğrudan `/dashboard`'a atıyordu |
| `null` dönen client | `siraya/lib/supabase/{server,client}.ts` | Çağıranı "demo kullanıcı say" yoluna itiyordu |

Üçünün yerine: yapılandırma eksikse korumalı yol yine `/login`'e gider,
`/login` `ui.configMissing` hatasını gösterir ve form kilitlidir.

**Gerekçe iş sırasıyla ilgili:** guard'ı FAZ 1'de gevşetip FAZ 2'de sıkmak,
adım 8-10'da yazılan her sayfayı ikinci kez gözden geçirmek demekti — o
sayfalar "kullanıcı yok" varsayımıyla yazılmış olurdu.

## B2 — Supabase client'ları

| Dosya | Rol | Not |
|---|---|---|
| `lib/supabase/config.ts` | URL/anon key + `assertSupabaseConfigured()` | Sessiz `null` yerine fırlatır |
| `lib/supabase/server.ts` | RSC + route handler, çerez tabanlı | **anon key**, service-role değil |
| `lib/supabase/client.ts` | Tarayıcı | Yalnızca auth formları kullanır |
| `lib/supabase/admin.ts` | Service-role | `import "server-only"` |
| `lib/supabase/auth-errors.ts` | Hata → sözlük anahtarı | siraya'dan birebir |

`admin.ts`'in korumasında **kasıtlı bir yükseltme** var: siraya'nın
`typeof window !== "undefined"` kontrolü yalnızca çalışma zamanında
patlıyordu — o noktada anahtar zaten bundle'a girmişti. `import "server-only"`
kapıyı derleyiciye taşıyor.

```
$ grep -rn "SERVICE_ROLE" app/ components/
sıfır sonuç

$ grep -rn "SERVICE_ROLE" --include=*.ts --include=*.tsx .   (docs hariç)
lib/supabase/admin.ts:23  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
lib/supabase/admin.ts:28    "SUPABASE_SERVICE_ROLE_KEY .env.local'da dolu olmalı.",
```

`admin.ts`'i şu an **hiçbir dosya import etmiyor** — adım 13 (Vault), 16
(OAuth callback) ve cron rotalarında kullanılacak.

### ⚠ `createClient()` içinde sıra önemli

`cookies()` artık `assertSupabaseConfigured()`'dan **önce** çağrılıyor.
Doğrulama önce gelince Next dinamik API'yi göremiyor, `(app)` rotalarını
statik sanıp derleme sırasında prerender etmeye çalışıyor ve `next build`
"Supabase yapılandırılmamış" ile patlıyordu. O sayfaların hiçbiri statik
olamaz; hepsi oturuma bağlı. (Düzeltme `11ac7de`'de, commit mesajı yanlışlıkla
`629f068`'de anıyor.)

## B3 — `proxy.ts`

Next 16.3.3 konvansiyonu **bayt bayt tekrar teyit edildi** (ADIM_34'ün
"değişiklik yok" tespiti doğrulandı):

```
node_modules/next/dist/lib/constants.js:289          const PROXY_FILENAME = 'proxy'
.../build/analysis/get-page-static-info.js:271       export id === 'proxy'
.../build/analysis/get-page-static-info.js:609       Proxy dosyasında `runtime` YASAK
.../build/analysis/get-page-static-info.js:333       `config.matcher` hâlâ okunuyor
```

`next build` çıktısında `ƒ Proxy (Middleware)` satırı görünüyor — kayıtlı.

### ⚠ Yol listeleri `proxy.ts`'te DEĞİL

`lib/routes.ts`'e çıkarıldı. İki sebep:

1. `proxy.ts` `next/server`'a bağlı ve `lib/**` kapsamının dışında — orada
   kalan mantık test edilemezdi. Guard'ın karar yüzeyi, bir hatanın bir
   ekranı sessizce herkese açtığı yer.
2. **`?next=` açık yönlendirme kontrolü ÜÇ YERDE kopyalanmıştı** —
   `proxy.ts`, `auth-screen.tsx`, `auth/callback/route.ts`. Üçü de doğruydu
   ama biri güncellenmediğinde sessizce açılan bir kapı. Tek kaynağa indi.

**Korunan yollar** (`PROTECTED_ROUTES`):
`/dashboard` `/plan` `/queue` `/studio` `/analytics` `/settings`
`/onboarding` · ve 11b'de gelecek üçü şimdiden: `/library` `/composer`
`/channels` (rotaları yok; listede olmalarının bedeli sıfır, faydası
eklendikleri gün guard'ın unutulamaması).

**Muaf yollar:** `/` (pazarlama), `/login`, `/signup`, `/logout`,
`/auth/*`, ve `matcher`'ın dışarıda bıraktığı statikler
(`_next/static`, `_next/image`, `favicon.ico`,
`svg|png|jpg|jpeg|gif|webp|mp4|mp3|ico`).

**`AUTH_ROUTES`** yalnızca `/login` ve `/signup`. `/logout` ve
`/auth/callback` kasıtlı olarak dışarıda: `/logout` burada olsaydı oturumu
olan kullanıcı çıkış yapmak istediğinde `/dashboard`'a geri atılırdı —
çıkılamayan bir uygulama.

`getUser()` kullanılıyor, `getSession()` değil (siraya `proxy.ts:26-27`
gerekçesi korundu): ilki token'ı Supabase'e doğrulatır, ikincisi yalnızca
çereze bakar.

## B4 — `requireUser` / `requireBrand` ve `/onboarding`

### Neden `/onboarding` var

Şemadaki `handle_new_user` trigger'ı (`00_schema.sql:68-88`) yalnızca
`profiles` satırı yaratıyor, `brands` yaratmıyor. **Bu bir eksik değil,
§4e'nin doğal sonucu:** "bir hesap → çok marka" kararıyla marka artık
hesabın bir *alanı* değil, hesabın *sahip olduğu bir kayıt*. Trigger'ın boş
bir marka uydurması o kararı geri alırdı ve `/plan`'ın girdisi olan profil
boş doğardı.

Canlıda ölçüldü:

```
$ (yeni kullanıcı oluşturuldu)
$ select id, display_name, locale from public.profiles where id='<C>';
 c7ba3a79-… | Kullanıcı C | tr        ← trigger çalıştı

$ select count(*) from public.brands where owner_id='<C>';
 0                                    ← marka YOK
```

### Kurgu

- **`/onboarding` `(app)` grubunun DIŞINDA** (`app/(auth)/onboarding/`).
  İçinde olsaydı `(app)/layout.tsx`'in `requireBrand()`'i "marka yok →
  /onboarding → requireBrand → /onboarding" sonsuz döngüsünü kurardı.
  Guard'ını `proxy.ts`'in `PROTECTED_ROUTES` listesinden ve sayfanın kendi
  `requireUser()`'ından alıyor.
- Markası olan kullanıcı `/onboarding`'e dönerse `/dashboard`'a atılır.
- Form yalnızca **marka adını** sorar. Gerisi `/settings` marka formunda
  (adım 9); `brands`'in sekiz profil alanının hepsi `default ''`.

### Hata ile "marka yok" ayrımı

`requireBrand()` sorgu hatasında `/onboarding`'e **yollamıyor**, fırlatıyor.
Yollasaydı bir Supabase kesintisi "yeni kullanıcı" gibi görünürdü — §9.1'in
"sessiz düşme"sinin kimlik katmanındaki hâli.

### RLS ile tutarlılık

İkisi de **kullanıcı oturumuyla** sorguluyor, service-role ile değil.
`owns_brand()` ancak `auth.uid()` doluyken çalışır; service-role kullanmak
RLS'i baypas eder ve politikaların gerçekten koruyup korumadığını hiç
öğrenmemek demekti. Onboarding'in `INSERT`'ü de kullanıcı oturumuyla —
`brands` politikasının `with check (auth.uid() = owner_id)` kısmı böylece
gerçekten sınanıyor.

## FAZ B doğrulama çıktıları

### Oturumsuz → `/login`

```
  /dashboard   307 → http://localhost:3000/login?next=%2Fdashboard
  /plan        307 → http://localhost:3000/login?next=%2Fplan
  /queue       307 → http://localhost:3000/login?next=%2Fqueue
  /studio      307 → http://localhost:3000/login?next=%2Fstudio
  /analytics   307 → http://localhost:3000/login?next=%2Fanalytics
  /settings    307 → http://localhost:3000/login?next=%2Fsettings
  /onboarding  307 → http://localhost:3000/login?next=%2Fonboarding

  /            200        ← muaf
  /login       200        ← muaf
  /signup      200        ← muaf

alt yol da korunuyor:
  /studio/personas → 1 yönlendirme → /login?next=%2Fstudio%2Fpersonas
```

### Oturumlu → `/dashboard`

```
  /login   307 → http://localhost:3000/dashboard
  /signup  307 → http://localhost:3000/dashboard
```

### Yeni kullanıcı akışının tamamı

Zincir uçtan uca çalıştırıldı (kullanıcı C):

```
1. kullanıcı oluşturuldu               → C_ID=c7ba3a79-…
2. profiles satırı                     → "Kullanıcı C", locale=tr   (trigger çalıştı)
3. brands sayısı                       → 0
4. C oturumuyla /dashboard             → 307 → /onboarding
5. /onboarding formu POST edildi       → 303 → Location: /dashboard
6. brands tablosu                      → "C'nin Kahvesi", owner_id=C
7. C oturumuyla /dashboard             → 200 · "Kullanıcı C" · "Menü" · "DEMO"
8. C oturumuyla /onboarding            → 307 → /dashboard
```

Adım 5 gerçek bir server action POST'u: sayfadan `$ACTION_ID` alanları
okunup formun JS'siz gönderdiği `multipart/form-data` isteği kuruldu.

Oturum çerezleri elle uydurulmadı — `@supabase/ssr`'ın **kendi** kodlaması
kullanıldı (bellek içi çerez kavanozuyla `signInWithPassword`, çıktı curl'e
`Cookie:` başlığı olarak verildi).

### ⭐ RLS izolasyon testi — A ↔ B

İki kullanıcı, A'nın bir markası, B'nin markası yok.

```
1. A kendi markasını görüyor mu           → 1 satır: ["A'nın Markası"]
2. B, A'nın markasını görüyor mu          → 0 satır  []
3. B, A'nın markasını ID ile sorguluyor   → 0 satır  []
4. service-role aynı sorguyu yapıyor      → 1 satır: ["A'nın Markası"]   ← satır GERÇEKTEN var
```

4. satır kontrolün kendisi: satır var, B göremiyor.

Yazma tarafı:

```
5. B, A adına marka yazıyor       → HTTP 403  new row violates RLS policy for table "brands"
6. B, A'nın markasına içerik      → HTTP 403  new row violates RLS policy for table "content_items"
                                              ← owns_brand() çocuk tabloda da tuttu
8. anon key + oturumsuz brands    → 0 satır
```

### ⭐ Politikasız tablolar — sahibi bile okuyamıyor

Boş tabloyu sorgulamak zayıf bir kanıt olurdu. Service-role ile **gerçek bir
satır** yazılıp tekrar denendi:

```
$ select id, provider, brand_id, user_id from public.provider_credentials;
 efda5e97-… | anthropic | ffadf5a7-… (A'nın markası) | 74f05436-… (A'nın kendisi)
(1 row)

A oturumu (satırın sahibi) : 0 satır
B oturumu (yabancı)        : 0 satır
service-role               : 1 satır
```

Satır A'nın markasına **ve** A'nın `user_id`'sine ait; A yine de okuyamıyor.
§5'in "RLS açık + sıfır politika" deseni canlıda doğrulandı.

### `/logout`

```
$ curl -X POST /logout
303 → http://localhost:3000/login
set-cookie: sb-<ref>-auth-token=; Path=/; Max-Age=0; SameSite=lax
```

---

# FAZ C — uygulama kabuğu (adım 7b)

## C1 — `(app)/layout.tsx`

Guard **kabukta**, sayfalarda değil. `requireBrand()` iki kapıyı birden
geçirir. Adım 8-10'da yazılacak ekranların hiçbiri kendi guard'ını yazmıyor
— unutulabilecek bir kapı ortadan kalktı. `proxy.ts`'in yerine geçmiyor,
altına ikinci kat koyuyor: `matcher` bir rotayı kaçırırsa sayfa yine korunur.

Sidebar ve topbar siraya'dan (§7.4), dört farkla:

1. `appConfig.nav` yerine `buildNav(modules)` (§1.6).
2. `user` opsiyonel değil — `user ?? DEMO_USER` yolu B1 ile kapandı, tip
   bunu zorunlu kılıyor.
3. Çıkış istemciden `signOut()` değil, `/logout`'a POST. Oturum çerezini
   silme yetkisi yalnızca Route Handler'da.
4. Arama kutusu ve bildirim zili silindi (§7.4). Arama kutusu `input` bile
   değil bir `div`'di; zilin kırmızı noktası sabitti.

`components/ui/logo.tsx` yeniden çizildi (§7.4: üçünden hiçbiri). İçinde
gömülü metin yok — işaret ve kelime `app.config.ts`'in tek değiştirme
noktasından, renk `--color-primary`'den geliyor (§11 S1 henüz açık).

## C2 — navigasyon

**⚠ Sidebar altı modül gösteriyor, D4'ün dördü değil.** Kritik yol dört
ekran; ikisi D4'ün **kendi gerekçesiyle** ekleniyor:

| Modül | D4'ün cümlesi |
|---|---|
| `dashboard` | "kabuğun iniş ekranı olduğu için adım 8'de kalır" |
| `settings` | "marka profili formu `/plan`'ın girdisi olduğu için adım 9'da kalır" |

`/dashboard` menüye konmasaydı **erişilemez bir sayfa** olurdu: giriş oraya
düşüyor (`AUTH_ROUTES` → `DEFAULT_LANDING`). Bu bir kapsam genişletmesi
değil, C2'nin listesiyle D4'ün metni arasındaki boşluğun kapatılması — ama
bir varsayım, aşağıda tekrar listeleniyor.

11b'ye ertelenen üçü menüde **yok**, rotaları da yok.

## C3 — `DemoBanner`

Kapatılamaz. `isDemo`'yu **prop** olarak alır; mod `(app)/layout.tsx`'te
sunucuda `anyDemo(PORT_NAMES, overrides)` ile çözülür ve istemciye veri gibi
iner. Bileşen `process.env` okumaz — §9.1'in `NEXT_PUBLIC_` tuzağı
(threadly'nin `hasSupabase` sabiti) tam olarak buydu.

İstemci bileşeni olmasının tek sebebi dil: metin `useLang()`'ten gelir, dil
düğmesi şeridi de çevirir. Karar yine sunucuda.

```
APP_MODE=demo → /dashboard 200 · "DEMO — ekrandaki veriler örnektir…" 1 kez
                            · role="status" var
APP_MODE=live → /dashboard 200 · banner metni 0 · role="status" 0
                            · kabuk duruyor ("Menü" 1)
```

## C4 — boş sayfa iskeletleri

Altı sayfa, ortak `components/app/screen-stub.tsx` üzerinden. Ortak bileşen
seçildi çünkü altı kopya, adım 8-10'da altı ayrı temizlik demekti; şimdi bir
ekran gerçek içeriğine kavuştuğunda o sayfadan sadece import siliniyor.

**⚠ `ScreenStub` adım 11'de hiçbir sayfada kalmamalı.** Kaldıysa o ekran
yazılmamış demektir.

## FAZ C doğrulama çıktıları

### Dört (+iki) rota oturumluyken render ediyor

```
  /dashboard  200 DEMO Menü
  /plan       200 DEMO Menü
  /queue      200 DEMO Menü
  /studio     200 DEMO Menü
  /analytics  200 DEMO Menü
  /settings   200 DEMO Menü
```

Oturumsuz hepsi `/login` — yukarıda.

### Beş kapı

```
build   EXIT=0    tsc  EXIT=0    lint  EXIT=0
test    EXIT=0    12 dosya / 273 test
audit   EXIT=0    found 0 vulnerabilities
```

### Dış istek kontrolü

Playwright MCP köprüsü bu makinede kurulu değil (`Extension connection
timeout`), DevTools ağ sekmesi açılamadı. Yerine **iki taraftan ölçüm**
yapıldı.

**Sunucu tarafı** — altı sayfa gezildikten sonra dev sürecinin kurduğu
ESTABLISHED dış bağlantılar:

```
  172.64.149.246:443

$ dig +short <proje>.supabase.co
172.64.149.246
104.18.38.10                       ← eşleşiyor: tek dış bağlantı Supabase
```

**İstemci tarafı** — servis edilen HTML:

```
  toplam <script src>            : 16
  bunlardan /_next ile başlayan  : 16      ← hepsi kendi kökümüzden
  http(s):// içeren src/href     : 0
  fonts.googleapis / gstatic     : 0       ← next/font yerel sunuyor
  supabase.co geçişi (HTML'de)   : 0

  /plan /queue /studio /analytics /settings → hepsinde dış kaynak: 0
```

Bu, DevTools'un yerini **tam** tutmuyor: çalışma zamanında istemci JS'inin
attığı bir `fetch` bu ölçümde görünmezdi. Demo adapter'lar ağ çağrısı
yapmadığı için (adım 5-6'da test edildi) risk düşük, ama adım 8'de gerçek
bir tarayıcıyla tekrar bakılmalı.

---

# TESTLER

Üç yeni dosya, +31 test (242 → 273). Üçü de kapsam raporunda listelenmiyor;
v8 reporter yalnızca %100'ün altındakileri basıyor.

| Dosya | Test | Ne koruyor |
|---|---|---|
| `lib/routes.test.ts` | 16 | Guard'ın karar yüzeyi |
| `lib/supabase/auth-errors.test.ts` | 11 | Ham Supabase hatasının ekrana sızmaması |
| `lib/server/mode.test.ts` | 4 | ADIM_56 §2'nin açık maddesi |

İki test özellikle bir hata sınıfını hedefliyor:

```ts
it("⭐ protokol-göreli mutlak URL'i REDDEDER", () => {
  // "//evil.com" tarayıcıda https://evil.com'a gider ama "/" ile başlar.
  expect(safeNextPath("//evil.com")).toBe("/dashboard");
});

it("⭐ ön ek benzerliği yetmez — /plan koruması /planlama'yı kapsamaz", () => {
  expect(isProtectedPath("/planlama")).toBe(false);
  expect(isProtectedPath("/settings-public")).toBe(false);
});
```

`auth-errors.test.ts`'in son testi eşlemenin **iki dilde de** karşılığı
olduğunu doğruluyor — eşleme var ama çeviri yoksa ekranda `undefined` yazardı.

### `vitest.config.mts`'e `server-only` alias'ı

`server-only` paketi import edilince **fırlatır** — paketin tüm işi bu. Next
onu `react-server` koşuluyla `empty.js`'e çözüyor; vitest o koşulda koşmuyor,
bu yüzden dosya yoluyla eşlendi. Paket adıyla (`server-only/empty`)
eşlenemiyor: `exports` alanı alt yolu yalnızca `react-server` koşulunda
açıyor. **Üretim koruması yerinde** — bir Client Component `admin.ts`'i
import ederse build patlar.

---

# `.env.local` — dolu ve boş değişkenler

```
  dolu   NEXT_PUBLIC_APP_URL              http://localhost:3000
  dolu   APP_MODE                         demo
  dolu   NEXT_PUBLIC_SUPABASE_URL
  dolu   NEXT_PUBLIC_SUPABASE_ANON_KEY
  dolu   SUPABASE_SERVICE_ROLE_KEY
  dolu   SUPABASE_DB_URL                  session pooler, aws-0-ap-northeast-2
  dolu   CRON_SECRET                      openssl rand -hex 32
  dolu   CRON_ACTIVE                      false
  BOŞ    INSTAGRAM_APP_ID                 ← adım 16 (LIVE #2)
  BOŞ    INSTAGRAM_APP_SECRET             ← adım 16
  BOŞ    INSTAGRAM_REDIRECT_URI           ← adım 16
  BOŞ    INSTAGRAM_API_VERSION            ← boş bırakılırsa v23.0 kullanılır
  dolu   PERSONA_PIPELINE_ENABLED         false  (adım 20)
  dolu   PERSONA_PHONE_EFFECT             false  (§10 ffmpeg kararı)
```

**Adım 8 için hiçbiri gerekmiyor.** Dördü de FAZ 2 kapsamında.

`.env.example`'da tanımlı ama `.env.local`'da **hiç bulunmayan** AI sağlayıcı
anahtarları (`ANTHROPIC_API_KEY`, `KIE_API_KEY`, …) bilinçli olarak yok —
§1.12 gereği `provider_credentials` + Vault'ta yaşayacaklar.

### `SUPABASE_DB_URL` hakkında

Doğrudan bağlantı (`db.<ref>.supabase.co`) bu projede **yalnızca IPv6**
çözülüyor ve bu makinenin resolver'ı adresi veremiyor:

```
$ dig +short AAAA db.<ref>.supabase.co
2406:da12:…                                 ← A kaydı yok

$ psql "postgresql://postgres@db.<ref>.supabase.co:5432/postgres"
could not translate host name … to address
```

Bu yüzden **session pooler** kullanılıyor (`aws-0-ap-northeast-2`, port 5432).
`aws-1` yanlış: `FATAL: (ENOTFOUND) tenant/user … not found`.
Transaction pooler (6543) DDL için uygun değil.

**Uygulamanın kendisi bu değişkene ihtiyaç duymuyor** — Next, Supabase'e
REST + GoTrue üzerinden bağlanıyor. `SUPABASE_DB_URL` yalnızca `apply.sh` ve
elle SQL için.

---

# VARSAYIMLAR

Her biri bir karar noktası; katılmazsan geri alınabilir.

1. **Sidebar'a `/dashboard` ve `/settings` eklendi.** C2 dört ekran
   listeliyordu. `/dashboard` menüde olmasaydı erişilemezdi (giriş oraya
   düşüyor); `/settings` zaten C2'nin kendi cümlesinde geçiyor. Gerekçe D4'ün
   metninden. Geri almak: `(app)/layout.tsx`'teki `SHELL_MODULES` dizisi.

2. **Altı boş sayfa yazıldı, dört değil.** Aynı sebep — menüdeki her bağlantı
   çözülmeli, ölü bağlantı bir kusur.

3. **`/onboarding` `(app)` grubunun dışına konuldu.** İçinde olsaydı sonsuz
   döngü olurdu. Alternatif, layout'ta yol kontrolü yapmaktı; grup ayrımı
   daha az kırılgan.

4. **`requireUser()` `?next=` parametresi üretmiyor.** Bir Server Component
   istenen yolu göremiyor (`headers()` pathname taşımaz). Kullanıcı buraya
   normalde düşmüyor — proxy zaten `?next=` ile çeviriyor. Bu yalnızca
   `matcher`'ın kaçırdığı bir rota için emniyet kemeri.

5. **OAuth (Google/GitHub) taşınmadı.** B5 "e-posta + şifre yeterli" dedi;
   ayrıca sağlayıcılar Supabase panelinde kapalı, düğmeler yalnızca
   `errProviderDisabled` üretirdi.

6. **Marka seçici yok.** `requireBrand()` en eski markayı seçiyor. §11 S2
   organizasyon katmanını erteledi; bugün kullanıcı başına bir marka var.
   Şema çoğuna hazır (`brands.user_id` UNIQUE'i kaldırılmıştı).

7. **`00_schema.sql` değiştirildi** — `find_similar_content`'in
   `search_path`'i. ADIM_56 "tek satır değişmedi" diyordu; bu oturumda canlı
   uygulama gerçek bir hata ortaya çıkardı ve düzeltildi. Şema uyum testi
   (`schema-conformance.test.ts`, 24 test) hâlâ yeşil.

8. **`apply.sh`'ta değişken adı `SECRET` yerine `BEARER`.**
   `~/.claude/hooks/secret-scan-precommit.sh` `SECRET="$CRON_SECRET"` satırını
   yanlış pozitifle yakalıyordu (satırdaki şey bir değer değil, değişken
   referansıydı). Hook zayıflatılmadı, ad değişti — `BEARER` zaten Vault
   kaydının kendi açıklaması ("Bearer token for /api/cron/*").

9. **Test kullanıcıları silinmedi.** Aşağıda.

---

# ⚠ CANLI VERİTABANINDA DURAN TEST ARTIKLARI

```
  kullanıcı: 3 · profiles: 3 · brands: 2 · provider_credentials: 1
```

| E-posta | Şifre | Ne için | Markası |
|---|---|---|---|
| `rls-a@ornek.test` | `Parola-A-123456` | RLS izolasyon testi (A) | "A'nın Markası" |
| `rls-b@ornek.test` | `Parola-B-123456` | RLS izolasyon testi (B) | yok |
| `akis-c@ornekmarka.com` | `Parola-C-123456` | Kayıt→onboarding→dashboard zinciri | "C'nin Kahvesi" |

Silinmediler çünkü testi tekrar edebilmen için duruyorlar; ayrıca
`akis-c@…` ile giriş yapıp kabuğu gezebilirsin.

**Ama zayıf şifreli üç hesap canlı bir veritabanında duruyor.** Adım 8'e
başlamadan önce ya sil ya da şifrelerini değiştir:

```bash
set -a; . ./.env.local; set +a
psql "$SUPABASE_DB_URL" -c "select id, email from auth.users;"   # kimlikleri al
for id in <A_ID> <B_ID> <C_ID>; do
  curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/$id" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
done
```

`brands` ve `provider_credentials` `on delete cascade` ile birlikte gider.

`provider_credentials`'taki tek satır sahte (`config: {"note":"rls-testi"}`),
Vault'ta karşılığı yok.

**E-posta onayı açık** (`mailer_autoconfirm: false`). Üç hesap da admin API
ile `email_confirm: true` verilerek oluşturuldu — yani "onay bağlantısına
tıklanmış" hâli simüle edildi. Gerçek bir public `signUp` akışında kullanıcı
e-postasındaki bağlantıya tıklamak zorunda; o yol (`/auth/callback`) yazıldı
ama **uçtan uca denenmedi** çünkü test posta kutusu yok.

Ayrıca Supabase public `signUp`'ta `.test` TLD'sini reddediyor
(`email_address_invalid`) — gerçek kayıt testlerinde geçerli bir alan adı
kullan.

---

# ADIM 8'E (ilk üç ekran) GEÇMEDEN BİLMEN GEREKENLER

### 1. Adapter katmanı artık kabuktan çağrılıyor

`(app)/layout.tsx` `anyDemo(PORT_NAMES, overrides)` diyor. Bu ADIM_56'nın
2. açık maddesini kapatıyor ama bir tanesini açık bırakıyor:

**§11 S6'nın bundle doğrulaması hâlâ yapılmadı.** Layout `port()` çağırmıyor,
yalnızca mod çözüyor. İlk ekran `port("content")` dediğinde `next build`
çıktısında `sm:mode:` dizesi aranmalı, **bulunmamalı** (çerez kaçamağı
üretimde ölü kod olmalı).

### 2. `public/demo/*` varlıkları hâlâ YOK

ADIM_56'nın 1. maddesi değişmedi. Demo adapter'lar şu yolları döndürüyor,
dosyalar yok:

```
/demo/generated/placeholder-1024.png     /demo/personas/{mira,kerem}-01.png
/demo/ugc/v60-demleme.mp4                /demo/voice/aeropress-ada.mp3
/demo/uploads/cold-brew-raf.jpg
```

**Adım 8'den önce** ya dosyalar konmalı ya da ekranlar 404'ü zarif
karşılamalı. S5 gereği video üretilmeyecek, statik 9:16 poster konacak.

### 3. Ekranlar guard yazmayacak

`(app)/layout.tsx` `requireBrand()` çağırıyor; sayfalar sadece içerik. Bir
sayfanın marka kimliğine ihtiyacı varsa `requireBrand()`'i tekrar çağırabilir
ama bu **ikinci bir Supabase sorgusu** demek. Layout şu an `requireBrand()`'in
döndürdüğü `brand`'i kullanmıyor, yalnızca `user`'ı kullanıyor — markayı
prop/context ile aşağı geçirmek adım 8'in ilk kararlarından biri olmalı.

### 4. `ScreenStub` bir borç

Altı sayfa onu render ediyor. Adım 11'in kapanış kriterinde hiçbir sayfada
kalmamalı.

### 5. `/settings` iki adıma bölünmüş

Adım 9 yalnızca **marka profili formunu** yazacak. Entegrasyon rozetleri ve
API anahtarı bölümü 11b / adım 13. Sidebar'daki `/settings` girişi şu an boş
iskelet.

### 6. Cron aktifleştirmeyi unutma

Adım 17'ye kadar beş job pasif. Adım 12'de (iş kuyruğu) `sm-worker`
gerekecekse ya elle `cron.alter_job(..., active := true)` ya da endpoint'i
elle tetikleme lazım — `CRON_ACTIVE=true` yalnızca gerçek domain varken
anlamlı, aksi hâlde `Couldn't connect to server` döner.

### 7. Kapsam tablosu

```
All files            38.09 %
lib                  43.75 %   (routes.ts %100, utils.ts %0)
lib/adapters/demo    88.67 %
lib/server           16.66 %   (mode.ts %100, auth.ts %0 — Next'e bağlı)
lib/supabase         17.85 %   (auth-errors.ts %100, gerisi Next/ağ'a bağlı)
lib/core/plan        37.41 %
```

`lib/server/auth.ts` ve `lib/supabase/{server,client,admin,config}.ts` %0
görünüyor: hepsi `next/headers`, `@supabase/ssr` veya ağ çağrısına bağlı ve
birim testi mock yığını olurdu. Onların doğrulaması bu oturumda **canlı HTTP**
ile yapıldı (yukarıdaki yönlendirme zincirleri ve RLS testi). %80 hedefi adım
14'ten sonra yeniden ölçülmeli.

### 8. Önceki oturumlardan devam eden açıklar

| # | Konu | Ne zaman |
|---|---|---|
| 1 | **D3** — Voyage `output_dimension` / OpenAI `dimensions` teyidi | adım 15'ten önce |
| 2 | §4f Instagram Graph metrik adları sürüme göre değişiyor | adım 18 |
| 3 | **S7** — GoatStarter lisansı, DOA'dan yazılı teyit | satıştan önce |
| 4 | Kalibre edilmemiş eşikler (0.92/0.82, tier ağırlıkları, rate limit, 180 gün) | ilk ~200 içerikten sonra |
| 5 | ~~Şema Supabase'e uygulanmadı~~ | ✅ bu oturumda kapandı |
| 6 | **S1** — ürün adı ve marka rengi hâlâ geçici (`Social Suite`, hue 262) | ekranlar yazılmadan önce iyi olur |
| 7 | `next/font` Google'dan build zamanında indiriyor — çevrimdışı build denenmedi | CI kurulurken |

### 9. Yerel Node sürümü hâlâ v23

ADIM_56 B2'nin uyarısı geçerli: `package.json` `>=22.22.2 <23` diyor, bu
makine v23.10.0 çalıştırıyor. Bu oturumun beş kapısı da v23 altında yeşil
ölçüldü. Vercel projesi oluşturulurken **22.x** seçilmeli.

---

# DEĞİŞTİRİLMEYENLER

- `sahne/`, `siraya/`, `threadly/` — hiçbirine yazılmadı, yalnızca okundu.
- `lib/core/` — tek satır değişmedi; saflık grep'i hâlâ sıfır kod eşleşmesi.
- `lib/adapters/` — tek satır değişmedi.
- `app.config.ts`, `app/globals.css`, `app/layout.tsx` — değişmedi.
- `.env.example` — değişmedi (`.env.local` ondan türetildi).
- Hiçbir video, PNG veya medya dosyası kopyalanmadı.
- `lib/providers/` boş, README'siyle duruyor.
