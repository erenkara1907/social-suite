# BİRLEŞİM PLANI — AI Social Media Management

> Üç projenin (`sahne/`, `siraya/`, `threadly/`) tek ürüne indirgenmesi için
> mimari kararlar ve şema tasarımı. Kod yazılmadı.
> Kaynak: `KESIF_SAHNE.md`, `KESIF_SIRAYA.md`, `KESIF_THREADLY.md` + doğrulama okumaları.
> Tarih: 2026-08-25

---

## ÖNCE: RAPORLARIN EN BÜYÜK KORKUSU GERÇEK DEĞİL

Üç raporun da §14.2'si "diğer projeler Next 14/15 veya Tailwind v3 ise **kritik**"
diye uyarıyor. Üç `package.json` yan yana konduğunda bu risk **yok**:

| | sahne | siraya | threadly |
|---|---|---|---|
| next | `16.2.5` | `16.2.5` | `16.2.5` |
| react / react-dom | `19.2.4` | `19.2.4` | `19.2.4` |
| tailwindcss | `^4` | `^4` | `^4` |
| typescript | `^5` | `^5` | `^5` |
| lucide-react | `^1.14.0` | `^1.14.0` | `^1.14.0` |
| recharts | `^3.8.1` | `^3.8.1` | `^3.8.1` |
| next-themes | `^0.4.6` | `^0.4.6` | `^0.4.6` |
| clsx / tailwind-merge | `^2.1.1` / `^3.5.0` | aynı | aynı |
| eslint-config-next | `16.2.5` | `16.2.5` | `16.2.5` |

Üçü de aynı GoatStarter sürümünden çatallanmış. Bu, birleşimin maliyetini
kökten düşürür: **migrasyon yok, sadece birleştirme var.** Aynı sebeple
`app.config.ts` üçünde de birebir aynı arayüze sahip (`NavItem`, `Stat`,
`PricingTier`, `Integration`), `globals.css` üçünde de aynı token adlarını
farklı hue değerleriyle taşıyor, `components/ui/*` üçünde de aynı bileşen seti.

Bu raporun geri kalanı bu gerçeğin üzerine kurulu.

---

## 1. ÇAKIŞMA MATRİSİ

### 1.1 Veritabanı tabloları

| Çakışan | sahne | siraya | threadly | KARAR | Gerekçe |
|---|---|---|---|---|---|
| `posts` / `plan_posts` | — | `posts` (`schema.sql:85`) | `plan_posts` (`0001:25`) | **TEK TABLO: `content_items`** | §4a. Fikirden yayına tek kimlik; tekrar önleme ve metrik geri beslemesi ancak tek kimlikle çalışır |
| `plans` | — | — | `plans` (`0001:9`) | **`plans` korunur** + `brand_id` eklenir | Çakışma yok; sadece marka kapsamı eksik |
| `channels` | demo dizi (`lib/demo/data.ts:140`) | `channels` (`schema.sql:69`) | — | **siraya'nınki kazanır** + `brand_id` | Tek gerçek tablo o; sahne'ninki hardcoded dizi |
| `brands` | — | — | `brands` (`0002:12`) | **korunur**, `user_id UNIQUE` **kaldırılır**, `owner_id` olur | §4e |
| `activity` | demo dizi (`data.ts:161`) | `activity` (`schema.sql:131`) | demo dizi (`data.ts:157`) | **siraya'nınki kazanır**, `action` listesi genişletilir | Tek gerçek tablo o |
| `post_metrics` | — | `post_metrics` (`schema.sql:116`) | — | **`content_metrics`** olarak yeniden adlandırılır, kolonlar genişletilir | `content_items`'a bağlanıyor, adı da onunla uyumlu olmalı |
| `profiles` | — | `profiles` (`schema.sql:24`) | — | **korunur** | Çakışma yok |
| `channel_credentials` | — | `003-instagram.sql:15` | — | **korunur, birebir** | RLS deseni dahil (§5) |
| `personas` | JSON dosyası (`personas.ts:19`) | — | — | **YENİ TABLO** | Vercel'de dosya sistemi salt-okunur (`KESIF_SAHNE §8.5`) |
| medya kayıtları | yok | `posts.media_url` (tek text) | `plan_posts.image_url` (hiç yazılmıyor) | **`media_assets` + `media_jobs`** | §4d, §4g |
| iş kuyruğu | yok | yok | yok | **`jobs` — YENİ** | §8.5 |
| müşteri API anahtarı | `.env` | `.env` | `.env` | **`provider_credentials` — YENİ** | Ürün tanımı: müşteri kendi anahtarını girer |

### 1.2 Postgres enum'ları

| Enum | siraya | threadly | KARAR | Gerekçe |
|---|---|---|---|---|
| `platform` | gerçek enum: `instagram\|x\|linkedin\|tiktok` (`schema.sql:12`) | `text CHECK`: `X\|LinkedIn\|Instagram` (`0001:31`) | **`text` + `CHECK`, 5 değer, küçük harf**: `instagram\|x\|linkedin\|tiktok\|youtube` | Aşağıda |
| `post_status` | gerçek enum, 5 değer (`schema.sql:16`) | `text CHECK`, 4 değer (`0001:41`) | **`text` + `CHECK`, 8 değer** | Aynı |
| `activity_action` | gerçek enum, 5 değer (`schema.sql:20`) | — | **`text` + `CHECK`, 12 değer** | Aynı |

**Karar: threadly'nin `text + CHECK` deseni kazanır.** İki seçenek de yazıldı:

- *Seçenek A — Postgres enum (siraya):* DB seviyesinde tip güvenliği, 4 bayt
  depolama, doğal sıralama. Bedeli: değer **silinemez**, sıralama değiştirilemez,
  yeniden adlandırma tip yeniden yaratmayı gerektirir.
- *Seçenek B — text + CHECK (threadly):* CHECK tek migration içinde `drop
  constraint` + `add constraint` ile transaction'da değişir. threadly bunu zaten
  yapıyor (`0002_brands.sql:48-51`).

**B seçildi.** Bu üründe üç liste de sık değişecek: `platform`'un CHECK listesi
siraya'nın dört değerinden **beşe** çıktı (`youtube` eklendi), `post_status`'a
`publishing` ve `archived` eklendi (§4a), `activity_action`'a 7 yeni eylem geldi.
Enum bu değişimin her birinde maliyet çıkarır, CHECK çıkarmaz. TypeScript union
tarafı iki seçenekte de aynı.

**⚠ Düzeltme (B4).** Bu paragrafın önceki hâli *"`platform`'a youtube/tiktok
yayıncısı eklenecek (§8.8)"* diyordu ve §1.2'nin platform listesi dört değer
okunuyordu. Şema beş değer tanımlıyor (`00_schema.sql:219-220` ve `:369-370`,
iki tabloda da `('instagram', 'x', 'linkedin', 'tiktok', 'youtube')`) ve
`lib/core/types.ts`'in `PLATFORMS` union'ı şemaya göre yazıldı. **Şema
doğrudur**; §1.2 metni ona hizalandı.

Ayrım önemli: §8.8'in eklediği şey bir **enum değeri değil, bir yayıncı
implementasyonudur**. `tiktok` ve `youtube` bugün de geçerli `platform`
değerleri — içerik onlar için planlanabilir ve taslak yazılabilir. Yayınlanıp
yayınlanamayacağını `lib/core/publishing.ts`'in ayrı listesi söylüyor
(`PUBLISHABLE_PLATFORMS = ["instagram"]`). §8.8 genişleyen liste **odur**,
CHECK değil. İki listenin ayrı olması bilinçli: "planlanabilir" ile
"yayınlanabilir" farklı sorulardır.

**Ayrıca: platform değerleri küçük harfe normalize edilir.** threadly'nin
`'X' | 'LinkedIn' | 'Instagram'` PascalCase değerleri DB'de görünen etiket gibi
davranıyor; görünen etiket TS'te (`channelMeta`) yaşamalı, DB'de kanonik anahtar.
Bu, `threadly/lib/plan/skeleton.ts` ve `lib/plan/types.ts`'te **KÜÇÜK UYARLAMA**
gerektirir (JSON şemasındaki enum değerleri ve `toPlanPost` dönüştürücüsü).

### 1.3 Sayfa route'ları

| Route | sahne | siraya | threadly | KARAR |
|---|---|---|---|---|
| `/dashboard` | ✅ (461 satır, %100 demo) | ✅ (`dashboard-client.tsx`, 488 satır, takvim+ısı haritası) | ✅ (616 satır, %100 demo) | **siraya'nınki kazanır** — tek gerçek veri okuyan o; takvim ürünün ana ekranı |
| `/settings` | ✅ | ✅ | ✅ (marka formu GERÇEK) | **threadly'ninki kazanır** (marka formu) + sahne'nin entegrasyon rozeti listesi eklenir |
| `/analytics` | — | ✅ (gerçek türetme, boş girdi) | ✅ (%100 demo) | **siraya'nınki kazanır** |
| `/queue` | — | ✅ | — | korunur |
| `/channels` | — | ✅ | — | korunur |
| `/plan` | — | — | ✅ (GERÇEK) | korunur |
| `/composer` | — | — | ✅ (GERÇEK) | korunur |
| `/library` | — | — | ✅ (demo) | **yeniden yazılır** → `media_assets` okur |
| `/videos`, `/persona` | ✅ (GERÇEK) | — | — | **`/studio` altında birleşir** |
| `/actors`, `/scripts` | ✅ (demo) | — | — | **kaldırılır** — `personas` ve `content_items` bunları kapsıyor |
| `/login`, `/signup` | ✅ (sahte) | ✅ (gerçek) | ✅ (gerçek) | **siraya'nınki kazanır** (`auth-errors.ts` TR/EN eşlemesi var) |

Namespace stratejisi §3'te.

### 1.4 API route'ları

| Route | Sahibi | KARAR | Gerekçe |
|---|---|---|---|
| `/api/image` | threadly (fal flux) | **`/api/ai/image`** | "image" tek başına çok genel; sahne'nin persona görseliyle karışıyor |
| `/api/caption` | threadly | **`/api/ai/caption`** | Aynı |
| `/api/plan`, `/api/plan/post` | threadly | **`/api/ai/plan`, `/api/ai/plan/post`** | Aynı gruba |
| `/api/brand` | threadly | **`/api/brand`** | Çakışma yok |
| `/api/voice`, `/api/voices`, `/api/credits`, `/api/lipsync`, `/api/video/[taskId]` | sahne | **`/api/studio/*`** altına | Raporun kendi önerisi (`KESIF_SAHNE §14.1`): isimler fazla genel |
| `/api/persona/*` (6 rota) | sahne | **`/api/studio/persona/*`** | Aynı |
| `/api/instagram/connect`, `/callback` | siraya | **`/api/channels/instagram/*`** | Platform sayısı artacak; `channels` altı doğal ev |
| `/api/cron/publish` | siraya | **`/api/cron/publish`** korunur + 4 yeni kardeş | `worker`, `metrics`, `tokens`, `reaper` (`00_schema.sql` §10) |
| `/auth/callback` | siraya/threadly | **korunur** | İkisi de aynı; open-redirect kontrolü olan siraya sürümü alınır (`route.ts:12`) |

### 1.5 Bileşen isimleri — hangi projenin kopyası kazanır

Üçü de aynı GoatStarter setini taşıyor. Kural: **gerçek veriye bağlı olan
sürüm kazanır; hiçbiri bağlı değilse en yeni/en zengin olan kazanır.**

| Bileşen | Kazanan | Gerekçe |
|---|---|---|
| `Button`, `Card`, `Input`, `Label`, `Badge`, `Icon` | **threadly** | Tek `Textarea`'sı olan o (`input.tsx`); marka formu ona bağlı |
| `Logo`, `LogoMark` | **yeniden çizilir** | Üçü de kendi markasına özel; yeni ürünün adı henüz yok (§11 S1) |
| `ThemeToggle`, `LanguageToggle` | **siraya** | `onDark` prop'u olan sürüm (`language-toggle.tsx:7`) |
| `Sidebar` | **siraya** | Tek `user` prop'u alan ve gerçek oturumdan besleneni o (`sidebar.tsx:27`); sahne ve threadly "Alex Jordan" hardcoded |
| `Topbar` | **siraya** | Diğer ikisiyle aynı; arama/bildirim üçünde de dekoratif, **kaldırılacak** |
| `AuthScreen` | **siraya** | Gerçek Supabase auth + `auth-errors.ts` TR/EN hata eşlemesi (290 satır) |
| `LanguageProvider`, `lib/i18n/*` | **siraya** | Üçü işlevsel olarak aynı; `dict.ts`'i en zengin olan o. Ölü anahtarlar temizlenir |
| `PostDialog` / `NewPostButton` | **siraya** (tek sahip) | Storage upload + Feed/Reel/Story seçimi |
| `QueueClient`, `ChannelsClient`, `DashboardClient`, `AnalyticsClient` | **siraya** (tek sahip) | — |
| `EmptyState`, `DemoBanner` | **siraya** (tek sahip) | `DemoBanner` FAZ 1'in görünür işareti olacak (§9) |
| `TrendChart` | **üçü de birebir aynı dosya** | Herhangi biri; `trendFill` id'si düzeltilerek (§1.8) |
| `DataTable`, `KpiCard` | **threadly** | Üçünde de ÖLÜ kod; threadly'ninki `Column` tipi en zengin |
| `PersonaStudio`, `Studio`, `VoicePicker` | **sahne** (tek sahip) | Ürünün UGC kolu |
| `SettingsClient` | **threadly** | Tek gerçek çalışanı o (marka formu, 8 alan) |
| `PostVisual` / `ActorCard` | **sahne'nin `ActorCard`'ı** | 9:16 oranlı; UGC dikey video placeholder'ı olarak doğru oran |

### 1.6 `app.config.ts`

Üçünde de **aynı arayüz**, farklı içerik. Doğrulandı: `NavItem`, `Stat`,
`PricingTier`, `Integration` tanımları üç dosyada birebir aynı satırlarda
(her birinde `:12,14,15,17`).

**Karar: TEK `app.config.ts`, kökte kalır.** Ama iki değişiklikle:

1. `nav` artık statik değil — **modül bazlı** (`lib/config/nav.ts`), çünkü FAZ 1'de
   bazı modüller kapalı olacak. `appConfig.nav` yerine `buildNav(enabledModules)`.
2. `integrations` üçünün **birleşimi** olur: kie, elevenlabs, fal, anthropic,
   supabase, instagram. `settings/page.tsx:8`'in `process.env[v]` okuması
   `provider_credentials` okumasına döner — çünkü artık anahtar env'de değil,
   müşterinin girdiği kayıtta.

Bu değişiklik 6-7 import eden dosyayı etkiler ama hepsi tek satırlık: sidebar,
topbar, settings-client, auth-screen, logo, layout, marketing.

### 1.7 CSS token'ları ve global sınıflar

Doğrulandı — global sınıf listeleri neredeyse birebir aynı:

```
üçünde ortak : .animate-float-up .blob .dark .display-accent .drift .floaty
               .font-display .hl .hl-primary .label-mono .marquee .pulse-dot
               .rise .shadow-pop .shadow-soft
sadece sahne : .glow
sadece siraya: .slide-x
```

Token adları da aynı (`--color-primary`, `--grad-brand`, `--grad-hero`,
`--grad-tile-1..4`), **sadece hue farklı**:

| | sahne | siraya | threadly |
|---|---|---|---|
| `--color-primary` (light) | `oklch(64% 0.21 25)` mercan | `oklch(56% 0.13 195)` turkuaz | `oklch(56% 0.22 290)` mor |

**Karar: TEK `globals.css`, threadly'ninki temel alınır, hue seçimi §11 S1'e
bağlı.** Gerekçe: threadly'ninki en kısa (194 satır) ve `prefers-reduced-motion`
desteği var (`:191-193`). `.glow` ve `.slide-x` sınıfları eklenir. Marka rengi
belirlenince tek yerde H değeri değişir — dosyanın kendi yorumu (`:6-8`) bunu
zaten böyle tasarlamış.

**Çakışma riski düşük** çünkü sınıflar aynı isimde **ve** aynı tanımda. Gerçek
risk yalnızca üç `globals.css`'in üçü birden import edilirse; tek dosyaya
indirildiğinde risk sıfır.

### 1.8 SVG gradient id'leri — gerçek bug riski

Doğrulandı (grep çıktısı):

| id | Nerede |
|---|---|
| **`trendFill`** | `sahne/components/app/trend-chart.tsx:32`, `siraya/...:32`, `threadly/...:32` — **üçü de aynı satır** |
| **`sg`** | `sahne/components/ui/logo.tsx:9` **ve** `siraya/components/ui/logo.tsx:12` |
| `sbeam` | sahne logo + icon.svg |
| `ssun` | siraya logo + icon.svg |
| `th-bg`, `th-thread` | threadly logo + icon.svg |
| `spark` | `sahne/app/(app)/dashboard/page.tsx:34` |
| `dspark`, `cockpitReach` | `threadly/app/(app)/dashboard/page.tsx:34,63` |

SVG `id`'leri belge genelinde global. Aynı sayfada iki `TrendChart` render
edilirse ikincisinin gradyanı birincisininkini kullanır — sessiz görsel bozulma.

**Karar: `useId()` tabanlı benzersizleştirme, prefix şeması değil.**

İki seçenek:
- *Seçenek A — statik prefix:* `sahne-trendFill`, `siraya-trendFill`. Basit ama
  aynı bileşenin iki örneği aynı sayfada hâlâ çakışır.
- *Seçenek B — React `useId()`:* `const gid = useId()` → `id={`${gid}-fill`}`.
  Örnek başına benzersiz, SSR-güvenli (React 19'da hidrasyon uyumlu).

**B seçildi.** Zaten tek `TrendChart` kalacağı için A'nın çözdüğü sorun kalmıyor;
kalan gerçek sorun aynı bileşenin çoklu örneği ve onu yalnızca B çözer.
Statik SVG'ler (`icon.svg`, `Logo`) için ise tek logo kalacağından sorun düşüyor;
yine de `Logo` içindeki id'ler `useId()` ile sarılır (2 satırlık iş).

### 1.9 localStorage anahtarları

| Anahtar | Kim yazıyor | Karar |
|---|---|---|
| `"lang"` | **üçü de** (`language-provider.tsx:30,36`) | **Çakışma değil, paylaşım.** Tek provider kalacak, tek anahtar. Yine de `sm:lang` olarak ön eklenir — aynı domaine başka bir GoatStarter uygulaması kurulursa diye |
| `TASK_KEY` = `"sahne:render-task"` | sahne (`studio.tsx:20,90,117,122,176`) | **Kaldırılır.** Render devamlılığı artık `media_jobs` tablosunda (§4d) — sunucuda. localStorage'daki kopya, sekme kapanınca ödenmiş render'ın kaybolması sorununu çözmüyordu, sadece erteliyordu |

Kalan tüm istemci durumu için ön ek kuralı: **`sm:<modül>:<anahtar>`**.

### 1.10 Storage bucket'ları

| | siraya | sahne |
|---|---|---|
| Bugün | `media` (public, `003-instagram.sql:48`) | Bucket yok — Kie'nin geçici deposu (`kie.ts:13`) |

**Karar: TEK bucket, `media`, public kalır.** İki seçenek:
- *Seçenek A — iki bucket:* `media` (yayına hazır, public) + `generated`
  (üretim ara çıktıları, private). Ara çıktıyı gizlemek doğru geliyor.
- *Seçenek B — tek public bucket, yol ile ayrım.*

**B seçildi.** Gerekçe: Instagram medyayı yayın anında **kendisi çekiyor**, yani
yayınlanacak dosya zorunlu olarak public. Ara çıktı (persona karesi, ham ses)
zaten yayınlanacak dosyanın girdisi; ikisini ayırmak, boru hattının ortasında
bucket'lar arası kopyalama gerektirir. siraya'nın mevcut politikaları
(`003-instagram.sql:54-71`) ilk klasör segmentine bakıyor, o yüzden yol şeması:

```
media/<user_id>/<brand_id>/<kind>/<uuid>.<ext>
media/<user_id>/personas/<persona_id>.png
```

`user_id`'nin başta kalması **zorunlu** — mevcut RLS politikaları
`(storage.foldername(name))[1] = auth.uid()::text` diyor.

### 1.11 pg_cron job adları

Job adları pg_cron'da global. siraya `siraya-publish` kullanıyor
(`004-cron.sql:25`).

**Karar: hepsi `sm-` ön ekli.** `sm-worker`, `sm-publish`, `sm-metrics`,
`sm-token-refresh`, `sm-reaper` (`00_schema.sql` §10). Eski `siraya-publish`
job'ı birleşim sırasında `cron.unschedule` edilmeli — aksi halde iki zamanlayıcı
aynı satırlara yazar.

### 1.12 Env değişkenleri

Çakışma yok, **paylaşım** var. `NEXT_PUBLIC_SUPABASE_*` üçünde de aynı projeyi
gösterecek. Tek gerçek karar: **AI sağlayıcı anahtarları env'den
`provider_credentials`'a taşınır** — ürün tanımı bunu gerektiriyor (müşteri
kendi anahtarını girer).

**⭐ D2 — Instagram uygulama kimlikleri de marka bazlıdır.**
Önceki hâli `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`'ı "bunlar bizim
uygulama kimliğimiz" diyerek global env sayıyordu. Bu, MVP'de doğru ama
**kalıcı olarak yanlış**: App Review çıktığında ya da bir müşteri kendi Meta
uygulamasını kullanmak istediğinde (ajans senaryosunda beklenen durum) şema
migration'ı gerekirdi. Karar:

- `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` **`provider_credentials`
  üzerinden marka bazlı** okunur (`provider='instagram'`).
- **Global env yalnızca fallback'tir:** markanın satırı yoksa env'e düşülür.
  MVP'de her marka fallback'e düşecek — davranış bugünküyle aynı, ama şema
  ileriye hazır.
- `lib/providers/instagram/config.ts` **`process.env` okumayı bırakır**,
  parametre alır. Bu, §8.6'nın Kie/ElevenLabs/fal için koyduğu kuralın aynısı:
  *sağlayıcı istemcisi anahtarı kendi bulmaz, kendisine verilir.*

**MVP kararı (S4 ile birlikte):** tek Meta uygulaması kullanılacak, müşteriler
o uygulamaya **tester** olarak eklenecek (Meta limiti ~25 tester). App Review
başvurusu paralel yürüyecek. Yani MVP'de tüm markalar fallback env'i kullanır;
marka bazlı satır ilk App-Review'lu ya da kendi uygulamasını getiren müşteride
devreye girer.

Env'de kalanlar: Supabase üçlüsü, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`,
`APP_MODE`, ve **fallback** olarak `INSTAGRAM_APP_ID/SECRET` +
`INSTAGRAM_REDIRECT_URI` + `INSTAGRAM_API_VERSION`.

---

## 2. SÜRÜM DOĞRULAMASI

### 2.1 Tam bağımlılık tablosu

| Paket | sahne | siraya | threadly | Birleşik |
|---|---|---|---|---|
| `next` | 16.2.5 | 16.2.5 | 16.2.5 | **16.3.3** ⚠ |
| `react` / `react-dom` | 19.2.4 | 19.2.4 | 19.2.4 | **19.2.4** |
| `clsx` | ^2.1.1 | ^2.1.1 | ^2.1.1 | **^2.1.1** |
| `tailwind-merge` | ^3.5.0 | ^3.5.0 | ^3.5.0 | **^3.5.0** |
| `lucide-react` | ^1.14.0 | ^1.14.0 | ^1.14.0 | **^1.14.0** |
| `next-themes` | ^0.4.6 | ^0.4.6 | ^0.4.6 | **^0.4.6** |
| `recharts` | ^3.8.1 | ^3.8.1 | ^3.8.1 | **^3.8.1** |
| `@fal-ai/client` | ^1.10.1 | — | ^1.10.1 | **^1.10.1** |
| `@supabase/ssr` | — | ^0.12.4 | ^0.12.4 | **^0.12.4** |
| `@supabase/supabase-js` | — | ^2.112.3 | ^2.112.3 | **^2.112.3** |
| `@anthropic-ai/sdk` | — | — | ^0.117.1 | **^0.117.1** |
| `@tailwindcss/postcss` (dev) | ^4 | ^4 | ^4 | **^4** |
| `tailwindcss` (dev) | ^4 | ^4 | ^4 | **^4** |
| `typescript` (dev) | ^5 | ^5 | ^5 | **^5** |
| `@types/node` (dev) | ^20 | ^20 | ^20 | **^20** |
| `@types/react` / `-dom` (dev) | ^19 | ^19 | ^19 | **^19** |
| `eslint` (dev) | ^9 | ^9 | ^9 | **^9** |
| `eslint-config-next` (dev) | 16.2.5 | 16.2.5 | 16.2.5 | **16.3.3** ⚠ |

**Farklılık sıfır.** Ortak paketlerin hiçbirinde sürüm ayrımı yok. Birleşik
`package.json` = üçünün union'ı, hiçbir sürüm çözümü gerekmiyor.

**⚠ Tek istisna — `next` / `eslint-config-next` 16.3.3 (D6).** Üç kaynak proje
16.2.5'te. Birleşik proje **kasıtlı olarak** 16.3.3'e çıkıyor: 16.2.5'in 10
adet high-severity açığı var ve bunların ikisi App Router'da **Middleware /
Proxy bypass**. Bu üründe tek auth sınırı `proxy.ts` (§7.2) — bypass, tehdit
modelinin tamamını geçersiz kılar. "Sürüm eşitliği" kuralının amacı birleşme
sırasında sürüm çözümü yapmamaktı; birleşme tamamlandı, kural amacını yitirdi.
Gerekçe REVİZYON KAYDI **D6**'da. Proxy konvansiyonunda değişiklik **yok**
(`next/dist/server/web/types.d.ts` iki sürümde bayt bayt aynı).

### 2.2 Eklenecek yeni bağımlılıklar

| Paket | Ne için | Zorunlu mu |
|---|---|---|
| `voyageai` (veya doğrudan HTTP) | Tekrar önleme embedding'i (§4c) | §11 S3'e bağlı |
| test runner (`vitest` + `@testing-library/react`) | Üçünde de test yok; birleşen boru hattı test edilmeli | **Evet** — §12 Adım 3 |

`recharts` **alınmalı mı?** Üçünde de sadece `TrendChart` kullanıyor ve sahne'de
o da ölü kod. siraya'nın analitik ekranı gerçekten kullanıyor → **alınır**.

`ffmpeg` (sahne/`lib/server/audio.ts`) bir npm paketi değil, **lokal binary**.
Vercel'de yok. Karar §10'da.

---

## 3. HEDEF DİZİN YAPISI

```
social/                              (tek Next.js uygulaması, monorepo DEĞİL)
├── app/
│   ├── (marketing)/                 # tek landing page — sıfırdan, üçü de atılır
│   ├── (auth)/
│   │   ├── login/  signup/          # siraya'nın AuthScreen'i
│   │   └── callback/                # siraya'nın open-redirect korumalı sürümü
│   ├── (app)/                       # ⭐ TEK UYGULAMA KABUĞU — tek sidebar, tek layout
│   │   ├── layout.tsx               # auth guard BURADA (threadly'de eksikti, §10)
│   │   ├── dashboard/               # siraya: takvim + ısı haritası
│   │   ├── plan/                    # threadly: plan üretici
│   │   ├── queue/                   # siraya: kuyruk + onay
│   │   ├── studio/                  # sahne: UGC üretimi
│   │   │   ├── page.tsx             #   seçilen içerikler → video kuyruğu
│   │   │   └── personas/            #   persona kadrosu
│   │   ├── library/                 # media_assets görünümü (threadly'nin demo'su yerine)
│   │   ├── channels/                # siraya: kanal bağlama
│   │   ├── analytics/               # siraya: türetme mantığı, gerçek girdiyle
│   │   └── settings/                # threadly marka formu + API anahtarı girişi
│   ├── api/
│   │   ├── ai/                      # plan, plan/post, caption, image   (threadly)
│   │   ├── studio/                  # voice, voices, lipsync, video, credits (sahne)
│   │   │   └── persona/             # image, video, voice, voices, lipsync, fal-status
│   │   ├── channels/instagram/      # connect, callback                 (siraya)
│   │   ├── brand/                   # GET/POST                          (threadly)
│   │   └── cron/                    # worker, publish, metrics, tokens, reaper
│   ├── globals.css                  # threadly tabanlı, tek dosya
│   └── layout.tsx                   # font + Theme + Language provider
│
├── lib/
│   ├── core/                        # ⭐ SAF İŞ MANTIĞI — Next'e, DB'ye, HTTP'ye bağımsız
│   │   ├── plan/
│   │   │   ├── skeleton.ts          # threadly — plan iskeleti üretici
│   │   │   ├── template.ts          # threadly — haftalık ritim + UTC tarih aritmetiği
│   │   │   └── types.ts             # threadly — DB↔app dönüştürücüler
│   │   ├── caption/caption.ts       # threadly — hook/body/hashtags
│   │   ├── brand/types.ts           # threadly — toPromptBlock(), doğrulama
│   │   ├── calendar/
│   │   │   ├── tz.ts                # siraya — saat dilimi projeksiyonu (saf)
│   │   │   ├── derive-calendar.ts   # siraya — ay/hafta ızgarası
│   │   │   └── derive-analytics.ts  # siraya — ısı haritası, en iyi saat
│   │   ├── dedupe/                  # ⭐ YENİ — tekrar önleme + devam zinciri (§8.1)
│   │   │   ├── fingerprint.ts
│   │   │   ├── similarity.ts
│   │   │   └── continuation.ts
│   │   ├── insights/build-feedback.ts   # ⭐ YENİ — metrik → plan köprüsü (§8.3)
│   │   ├── publishing.ts            # siraya — hangi platform yayınlanabilir
│   │   └── contracts.ts             # threadly lib/ai/types.ts — ApiResult, hata kodları
│   │
│   ├── adapters/                    # ⭐ DEMO | LIVE İKİLİĞİ — §9
│   │   ├── ports.ts                 # arayüzler (tek gerçek kaynak)
│   │   ├── index.ts                 # fabrika + bayrak çözümü
│   │   ├── demo/                    # her port için demo implementasyonu
│   │   │   ├── fixtures/            # üç projenin lib/demo/data.ts'lerinin birleşimi
│   │   │   └── *.ts
│   │   └── live/                    # her port için gerçek implementasyon
│   │
│   ├── providers/                   # ⭐ DIŞ SERVİS İSTEMCİLERİ — tek sorumluluk: HTTP
│   │   ├── kie.ts                   # sahne — 3 model + upload + kredi + poller
│   │   ├── elevenlabs.ts            # sahne — TTS + Türkçe ses keşfi + kota
│   │   ├── fal.ts                   # sahne + threadly — lipsync + flux
│   │   ├── anthropic.ts             # threadly — SDK sarmalayıcı
│   │   ├── instagram/               # siraya — config, oauth, publish, tokens
│   │   └── embedding.ts             # YENİ — §11 S3
│   │
│   ├── server/                      # Next/Supabase'e bağlı sunucu yardımcıları
│   │   ├── supabase/                # client, server, admin, config  (siraya)
│   │   ├── auth.ts                  # requireUser(), requireBrand()
│   │   ├── credentials.ts           # YENİ — Vault'tan müşteri anahtarı okuma
│   │   ├── rate-limit.ts            # YENİ — rate_limit_hit() sarmalayıcı
│   │   ├── queue.ts                 # YENİ — jobs enqueue/claim
│   │   └── storage.ts               # YENİ — vendor URL → kalıcı asset (§4g)
│   │
│   ├── i18n/                        # siraya — config.ts (L tipi) + dict.ts
│   └── utils.ts                     # cn() + formatlayıcılar (üçünün birleşimi, ölüler atılır)
│
├── components/
│   ├── ui/                          # threadly primitive'leri (tek set)
│   ├── app/                         # kabuk: sidebar, topbar, kpi, tablo, grafik
│   ├── calendar/                    # siraya: dashboard-client parçalanmış hâli
│   ├── studio/                      # sahne: persona-studio, voice-picker
│   ├── plan/                        # threadly: plan ekranı
│   ├── auth/                        # siraya: auth-screen
│   └── i18n/                        # siraya: language-provider
│
├── supabase/
│   └── 00_schema.sql                # ⭐ birleşik şema (bu planla birlikte yazıldı)
│
├── proxy.ts                         # tek middleware — üç kapı mantığının birleşimi
└── app.config.ts                    # tek config
```

### 3.1 Route group ve namespace stratejisi

**Karar: route group DEĞİL, tek `(app)` grubu + yol namespace'i.**

İki seçenek vardı:
- *Seçenek A — proje başına route group:* `(sahne)/videos`, `(siraya)/queue`,
  `(threadly)/plan`. Raporların önerdiği yol (`KESIF_SAHNE §14.1`). Her grubun
  kendi layout'u olur, çakışma anında biter.
- *Seçenek B — tek `(app)` grubu, sayfalar işleve göre adlandırılır.*

**B seçildi.** Gerekçe: A, çakışmayı **saklar ama ürünü bölünmüş bırakır** — üç
ayrı sidebar, üç ayrı settings, kullanıcı için üç ayrı uygulama hissi. Oysa
ürün tanımı tek bir akış anlatıyor (plan → seç → üret → yayınla). Route group'lar
URL'de görünmediği için A'nın çakışma çözümü zaten sadece dosya sistemi
seviyesinde; `/dashboard` iki grupta da tanımlanırsa Next.js **build hatası**
verir. Yani A gerçek çözüm bile değil — yine de sayfa başına tek sahip seçmek
gerekiyor (§1.3).

A'dan alınan tek şey: **API tarafında namespace kalır** (`/api/ai/*`,
`/api/studio/*`, `/api/channels/*`). Orada çakışma gerçek ve isimler fazla genel.

TypeScript tarafında namespace: `lib/core/*` içindeki tipler **modül başına
dosyada**, barrel export yok. `Post` gibi jenerik isim yerine `ContentItem`,
`PlanPost` yerine aynı `ContentItem` — tek tablo, tek tip (§4a).

---

## 4. BİRLEŞİK VERİ MODELİ

### 4a. `plan_posts` + `posts` → tek tablo mu, ayrı mı?

**Seçenek A — AYRI KALSINLAR.**
`plan_posts` fikir/taslak dünyası (threadly), `posts` yayın dünyası (siraya).
Kullanıcı bir plan gönderisini "onayladığında" `posts`'a bir satır kopyalanır.

- *Artısı:* Her tablo tek bir hayat evresine hizmet eder; durum makineleri
  karışmaz; siraya ve threadly kodu neredeyse hiç değişmeden taşınır.
- *Eksisi:* Aynı içeriğin **iki kimliği** olur. Bu, ürün tanımının 5. ve 6.
  maddelerini doğrudan kırar:
  - Tekrar önleme "daha önce bunu ürettim mi?" diye soracak — iki tabloya
    bakmak ve iki kimliği eşleştirmek gerekir.
  - Devam zinciri (`parent_id`) hangi tabloda yaşayacak? Yayınlanmış bir
    gönderiye atıf yapan yeni bir **fikir** üretilecek — zincir iki tabloyu
    çaprazlar.
  - Metrik geri beslemesi `posts`'a bağlanır ama plan üretimi `plan_posts`'a
    bakar; "hangi gönderi iyi performans gösterdi → benzerini üret" yolu
    her seferinde JOIN + kimlik eşlemesi ister.
  - Kopyalama anında bilgi kaybı riski: hangi alan taşınacak, hangisi kalacak?

**Seçenek B — TEK TABLO: `content_items`.**
Fikirden yayına, tek satır, tek kimlik. Durum kolonu evreyi taşır.

- *Artısı:* Tekrar önleme tek `WHERE brand_id = ?` sorgusu. Devam zinciri tek
  tablo içinde self-reference. Metrik → içerik → sonraki plan yolu kesintisiz.
  Takvim, kuyruk ve geçmiş aynı tablonun üç görünümü olur — siraya'nın kendi
  yorumu zaten bunu söylüyor (`schema.sql:83`: *"the calendar, the queue and
  the history are all views of this"*).
- *Eksisi:* Tek durum makinesi tasarlanmalı; `day_offset`/`time_of_day` (plan
  ızgarası) ile `scheduled_at` (gerçek an) aynı satırda yaşar — ikisi de
  nullable olur. threadly'nin `toPlanPost` dönüştürücüsü uyarlanır.

**KARAR: B — tek tablo `content_items`.**

Gerekçe: iki tablonun kolonları zaten %70 örtüşüyor (`user_id, title, body,
status, channel/platform, created_at, media/image_url`). Ayrı tutmanın tek
gerçek kazancı "kodu daha az değiştirmek", ve o kazanç ürünün iki temel
özelliğini (tekrar önleme, metrik geri beslemesi) kalıcı olarak pahalılaştırıyor.
Nullable iki kolon, çapraz-tablo kimlik eşlemesinden ucuz.

`day_offset`/`time_of_day` **nullable** kalır: plandan doğmayan bir içerik
(Composer'da elle yazılan) bunlara sahip olmaz. `scheduled_at` de nullable:
`idea` durumundaki satır henüz zamanlanmamıştır.

#### Birleşik durum makinesi

```
                 ┌──────────────────── revizyon ────────────────────┐
                 ▼                                                   │
   [idea] ──► [draft] ──► [needs_review] ──► [scheduled] ──► [publishing] ──► [published]
      │          │             │                  │                │
      │          │             │                  │                ▼
      │          │             │                  │            [failed]
      │          │             │                  │                │
      │          │             │                  └──── retry ◄────┘
      │          │             │
      └──────────┴─────────────┴──────────────► [archived]
```

| Durum | Kim yazar | Anlamı | Kaynak |
|---|---|---|---|
| `idea` | plan üretici | İskelet var, gövde yok | threadly `'idea'` |
| `draft` | caption yazıcı | Metin yazıldı | ikisinde de var |
| `needs_review` | kullanıcı / otomasyon | Onay bekliyor | siraya `'needs_review'` |
| `scheduled` | kullanıcı onayı | `scheduled_at` dolu **ve** platform yayınlanabilir | ikisinde de var |
| `publishing` | **cron** | Satır kilitlendi — çifte yayın kalkanı | **YENİ** |
| `published` | cron | Yayında, `external_post_id` dolu | ikisinde de var |
| `failed` | cron | `failure_error` dolu, retry mümkün | siraya `'failed'` |
| `archived` | kullanıcı / tekrar motoru | Üretilmeyecek, ama **tekrar hafızasında kalır** | **YENİ** |

Kritik ekleme: **`publishing`**. siraya'nın cron'unda idempotency kilidi yok
(`KESIF_SIRAYA §14`) — sorgu ile `status` güncellemesi arasında ikinci bir cron
çalışması aynı satırı alabiliyor. `scheduled → publishing` geçişi koşullu
UPDATE ile (`where status = 'scheduled'`) yapılırsa, satırı yalnızca bir çalışma
alır. `locked_at` + `sm-reaper` job'ı takılan kilitleri geri açar.

İkinci ekleme: **`archived`**. "Bu içeriği üretme" demek, satırı silmek
olmamalı — silinen içerik tekrar motorunun hafızasından da çıkar ve AI aynı
fikri iki hafta sonra yeniden önerir.

**Ayrı tutulan şey: medya üretim durumu.** `content_items.status` yalnızca
editoryal/yayın hayatını taşır. UGC videosunun üretim durumu `media_jobs.state`
içinde yaşar (`queued|running|succeeded|failed|cancelled`). İkisi ortogonal:
bir içerik `needs_review` iken videosu hâlâ `running` olabilir.

### 4b. `parent_id` self-reference — devam zinciri

**Şema** (`00_schema.sql` `content_items`):

```sql
parent_id      uuid references content_items(id) on delete set null,
root_id        uuid,
chain_position int not null default 1 check (chain_position between 1 and 12),
continuation_note text not null default ''
```

**Zincir nasıl kurulur.** Kullanıcı/AI, yayınlanmış bir içeriğe "devam" üretmek
istediğinde yeni satır `parent_id = <önceki içerik>` ile yazılır. Trigger
(`content_chain_guard`) ebeveynden `root_id` ve `chain_position`'ı türetir.
`continuation_note` ne tür bir devam olduğunu tutar ("A'nın pil ömrü özelliğini
anlatır") ve **caption prompt'una girer** — ürün tanımının 5. maddesi bunu
istiyor.

**Nasıl sorgulanır.** `root_id` denormalize olduğu için recursive CTE gerekmez:

```sql
-- Tüm zincir, sırayla, tek indeks taraması (content_root_idx)
select * from content_items where root_id = $1 order by chain_position;

-- "Bu ürün hakkında daha önce ne söyledim?" — caption prompt'una girecek bağlam
select title, hook, body from content_items
 where root_id = $1 and chain_position < $2 order by chain_position;
```

**Döngü nasıl engellenir.** Üç seçenek değerlendirildi:

- *Seçenek A — recursive CTE ile döngü tarayıcı trigger:* her INSERT/UPDATE'te
  zinciri yukarı yürü, kendini görürsen reddet. Doğru ama her yazımda O(derinlik)
  sorgu.
- *Seçenek B — `parent_id`'yi INSERT'ten sonra değiştirilemez yapmak.*
- *Seçenek C — sadece uygulama katmanında kontrol.* Reddedildi: RLS'e güvenen
  bir mimaride veri bütünlüğünü uygulamaya bırakmak tutarsız.

**B seçildi.** Gerekçe: bir döngü ancak **var olan bir kenarı değiştirerek**
oluşabilir. Yeni satır yalnızca kendisinden önce var olan bir satırı gösterebilir
(FK bunu garantiler), dolayısıyla ekleme sırası doğal bir topolojik sıra üretir.
`parent_id` ve `root_id` UPDATE'te kilitlenirse graf **yapısal olarak** ormandır
— tarayıcıya hiç gerek kalmaz, maliyet sıfırdır.

Ek koruma: `chain_position` 12 ile sınırlı (aynı fikrin sonsuza kadar
uzamasını engeller), ve zincir marka sınırını aşamaz.

### 4c. Tekrar önleme — hash + anlamsal benzerlik

**İki katmanlı.** Ucuz kat her zaman, pahalı kat gerektiğinde çalışır.

| Kat | Kolon | İndeks | Ne yakalar |
|---|---|---|---|
| 1. Birebir | `content_fingerprint text` | `content_fingerprint_idx (brand_id, content_fingerprint)` | Aynı fikrin birebir tekrarı |
| 2. Anlamsal | `embedding vector(1024)` | `content_embedding_idx` — HNSW, `vector_cosine_ops` | Yeniden ifade edilmiş aynı fikir |
| Yardımcı | `topic_key text` | — | Kaba konu filtresi ("ürün-A"), zincir önerisi için |

**`content_fingerprint` nasıl üretilir:** `title + "\n" + hook` → küçük harfe
çevir → emoji, hashtag, noktalama at → çoklu boşluk tek boşluğa → SHA-256.
Bu, "Yeni ürünümüz X!" ile "yeni ürünümüz x" arasındaki farkı siler.

**İndeks neden UNIQUE değil:** Plan üretimi 7-30 satırı tek transaction'da
yazıyor (`threadly/app/api/plan/route.ts:143`). Tek bir parmak izi çakışması
UNIQUE olsaydı **tüm planı** düşürürdü. Motor indeksi sorgular, karar verir
(reddet / "devam" olarak yeniden çerçevele / geçir); DB reddetmez.

**pgvector gerekli mi? EVET.**

İki seçenek:
- *Seçenek A — pgvector yok, sadece hash + LLM kontrolü:* Yeni fikir üretilirken
  son 30 içeriğin başlıklarını prompt'a koy, "bunları tekrarlama" de. Basit,
  ek bağımlılık yok. Ama: 30 gönderi/ay × 6 ay = 180 içerik, hepsi prompt'a
  sığmaz; ve LLM'in "tekrar etmedim" demesi ölçülebilir bir güvence değil.
- *Seçenek B — pgvector + embedding.* Ölçülebilir eşik, sınırsız geçmiş,
  tek indeks sorgusu.

**B seçildi.** Ürün tanımının 5. maddesi ("aynı içerik tekrar üretilmez")
ölçülebilir bir garanti istiyor; A bunu veremiyor. pgvector Supabase'de
`create extension vector` ile geliyor, ek servis maliyeti yok.

**⭐ D3 — Embedding boyutu: `vector(1024)`, SABİT. Sağlayıcıya bağlı değil.**

Önceki hâli kolon tipini §11 S3'ün cevabına bağlıyordu ("OpenAI seçilirse 1536
olur, tüm satırlar yeniden gömülür"). Bu riski, bağımlılığın yönünü çevirerek
küçültüyoruz: **kolon sözleşmedir, sağlayıcı ona uyar.**

- Kolon tipi `vector(1024)` — kalıcı, sağlayıcıdan bağımsız.
- **`EmbeddingPort` sözleşmesi:** implementasyon ne olursa olsun `embed()`
  **tam 1024 boyutlu** bir vektör döndürmek zorundadır. Sağlayıcı daha yüksek
  boyut üretiyorsa, çıktı boyutunu API parametresiyle 1024'e indirir.
- Adapter, dönen dizinin uzunluğunu **çalışma zamanında doğrular** ve 1024
  değilse hata fırlatır (sessizce kırpmaz/doldurmaz). Yanlış boyutlu bir vektör
  DB'ye ulaşmadan önce durur.

```ts
// lib/providers/embedding.ts  (kavramsal — kod değil)
export const EMBEDDING_DIMENSIONS = 1024;   // ⚠ content_items.embedding ile bağlı

export interface EmbeddingPort {
  /** MUTLAKA tam EMBEDDING_DIMENSIONS uzunluğunda dönmeli. */
  embed(input: string): Promise<number[]>;
}
```

Bu, sağlayıcı değişimini **satır göçü olmayan** bir işe indirir: yeni sağlayıcı
da 1024 döndürdüğü sürece kolon değişmez. (Vektör uzayı değişeceği için eski
satırlar yine yeniden gömülmeli — ama bu bir *migration* değil, bir *backfill*;
şema, indeks ve `find_similar_content()` imzası aynı kalır.)

**⚠ DOĞRULANMALI:** Bu karar, iki sağlayıcının da çıktı boyutu kısaltmayı
desteklediği varsayımına dayanıyor:
- Voyage AI `voyage-3.5` — `output_dimension` parametresi (256/512/1024/2048)
- OpenAI `text-embedding-3-*` — `dimensions` parametresi (Matryoshka kısaltma)

İkisinin de **güncel dokümantasyonundan teyit edilmeli.** Teyit edilemezse
kolon 1024'te kalır ve o sağlayıcı için adapter yazılamaz — karar sağlayıcıyı
eler, şemayı değiştirmez. Bu doğrulama §12 adım 15'ten (tekrar önleme motoru)
önce yapılmalı.

**Eşik değerleri (BAŞLANGIÇ — ölçülmedi, ⚠ kalibre edilmeli):**

| Kosinüs benzerliği | Karar |
|---|---|
| `>= 0.92` | **TEKRAR** — üretme, `duplicate_blocked` aktivitesi yaz |
| `0.82 – 0.92` | **YAKIN** — "devam" olarak yeniden çerçevele (`parent_id` ata) veya reddet |
| `< 0.82` | **YENİ** — geçir |

Bu eşikler ilk ~200 içerikten sonra gerçek veriyle kalibre edilmeli; şu an
kalibre edilmemiş bir başlangıç noktası.

### 4d. `media` ilişkisi ve sahne'nin üretim job'ları

**İki tablo, farklı sorumluluk:**

| Tablo | Ne tutar | Ömür |
|---|---|---|
| `media_assets` | **Kalıcı** dosya: storage yolu, public URL, boyut, süre | Kalıcı |
| `media_jobs` | **Geçici** üretim işi: vendor, task id, durum, kredi maliyeti | İş bitince arşiv |

`content_items.primary_media_id` → yayınlanacak asset.
`media_jobs.result_asset_id` → işin ürettiği asset.
`media_jobs.content_item_id` → hangi içerik için üretildiği.

**Sahne'nin kimlikleri nerede yaşıyor:**

| Sahne'de bugün | Birleşimde |
|---|---|
| Kie `taskId` — `localStorage["sahne:render-task"]` | `media_jobs.vendor_task_id`, `vendor='kie'` |
| fal `requestId` — sadece React state | `media_jobs.vendor_task_id`, `vendor='fal'` |
| Vendor (kie/fal/11labs) | `media_jobs.vendor` + `vendor_model` |
| Durum (`pending/success/failed`) | `media_jobs.state` |
| Kredi maliyeti (`kie.ts:17,137,154`) | `credits_estimated` / `credits_charged` |
| Boru hattı adımı | `media_jobs.step` (`persona_image\|persona_video\|voice\|lipsync\|post_image`) |

**Bu neden önemli:** sahne bugün `PersonaStudio`'da sayfa yenilenince ilerlemeyi
**bilerek** kaybediyor (`persona-studio.tsx:6-9`), `Studio`'da ise localStorage
ile kurtarıyor — çünkü "render için para ödenmiş". Job sunucuda tutulunca bu
ayrım gereksizleşir: ödenmiş her iş kurtarılabilir hâle gelir ve `sm-worker`
cron'u tarayıcı kapalıyken de pollamaya devam eder.

`personas` tablosu JSON registry'nin (`personas.ts:19`) yerini alır. Korunacak
güvenlik detayları (`KESIF_SAHNE §8.5`): id doğrulaması, https-only indirme,
25MB boyut sınırı, `imageUrl`'in client'tan değil `recordInfo`'dan gelmesi
şartı — hepsi `lib/server/storage.ts`'e taşınır.

### 4e. `brands.user_id UNIQUE` — B2B ajans senaryosu

`threadly/0002_brands.sql:14-16` kısıtı koyarken gerekçesini de yazmış:
*"One brand per account for now. Drop the unique constraint the day the app has
to manage several clients from one login."* O gün geldi.

**Seçenek A — Organizasyon katmanını ŞİMDİ ekle.**
`organizations` + `memberships(user_id, org_id, role)` tabloları, davet akışı,
rol kontrolü. Her RLS politikası `org_id in (select org_id from memberships
where user_id = auth.uid())` olur.

- *Maliyeti:* 2 yeni tablo, 12 RLS politikasının hepsi alt sorgulu olur
  (performans için `memberships` üzerinde indeks + muhtemelen SECURITY DEFINER
  yardımcı), davet e-postası akışı (Resend hiç bağlanmamış — `KESIF_SIRAYA §4`),
  rol matrisi UI'ı, "hangi org'dayım" bağlam seçici. Kabaca **1.5-2 oturumluk
  ek iş** ve FAZ 1'in hiçbir ekranına değer katmıyor.

**Seçenek B — UNIQUE'i kaldır, organizasyonu ERTELE, ama şimdiden yerini aç.**
`brands.user_id` → `brands.owner_id` (UNIQUE yok), `brands.org_id` kolonu
nullable olarak eklenir ama kullanılmaz. **Kritik hamle:** çocuk tabloların
hiçbiri `user_id` ile kapsanmaz — hepsi **`brand_id`** ile kapsanır, ve RLS
tek bir fonksiyona bağlanır:

```sql
create function owns_brand(target uuid) returns boolean ... as $$
  select exists (select 1 from brands where id = target and owner_id = auth.uid());
$$;
```

**KARAR: B.**

Gerekçe: A'nın bugünkü faydası sıfır (tek kullanıcı, FAZ 1 demo veriyle
çalışacak), maliyeti yüksek. B, ajans senaryosunun **asıl gereksinimini**
(bir hesap → çok marka) bugün karşılıyor.

**Erteleme maliyeti ölçülü:** organizasyon geldiğinde değişecekler:
1. `owns_brand()` gövdesi — tek fonksiyon, ~5 satır.
2. `brands.owner_id` → `brands.org_id` dolumu — her kullanıcı için tek kişilik
   bir org yaratan mekanik backfill migration'ı.
3. Yeni `organizations` + `memberships` tabloları ve davet UI'ı.

**12 RLS politikasının hiçbiri değişmez**, çünkü hepsi `owns_brand(brand_id)`
diyor. `user_id` kolonları tabloda kalır ama sadece storage yolu ve denetim izi
için — yetkilendirme kararı vermezler. Erteleme bedelinin tamamı 1. ve 2.
maddedir; bu kabul edilebilir.

**⭐ D2 — `provider_credentials` marka bazlı olduğu için, sağlayıcı
kimlikleri de markanın kapsamındadır.** Bu yalnızca AI anahtarları için değil,
**Instagram uygulama kimliği** için de geçerli (§1.12). `provider_credentials`
şemasının taşıması gereken iki şey var:

1. Bir markanın **birden fazla sağlayıcı** kaydı olabilir
   (`anthropic`, `kie`, `elevenlabs`, `fal`, `voyage`, `instagram`) →
   `unique (brand_id, provider)`.
2. Bir kayıt **birden fazla gizli değer** taşıyabilir. Instagram'ın app id'si
   gizli değil (client id), app secret'ı gizli. Bu yüzden şema tek bir
   `vault_secret_id` yerine **iki alan** tutar: gizli olmayan yapılandırma
   `config jsonb` içinde açık, gizli olan `vault_secret_id` üzerinden Vault'ta.

`owns_brand()` bu tabloya **uygulanmaz** — tablo politikasızdır (§5), yalnızca
service-role okur. Marka kapsamı burada yetkilendirme değil, **çözümleme**
anahtarıdır: "bu marka için hangi kimlikle çağrı yapacağım?".

### 4f. Metrik toplama

`post_metrics`'e INSERT eden kod **hiç yok** (`KESIF_SIRAYA §13`) — analitik
ekranı, ısı haritası ve "en iyi saat" canlı kullanıcıda daima boş. Toplayıcının
yazacağı şema `content_metrics` (`00_schema.sql` §6).

**Şema kararları:**

- **Append-only, upsert değil.** Her toplama yeni satır yazar. Trend ancak
  böyle çıkar; upsert edilirse "ilk 24 saatte ne oldu" bilgisi kaybolur.
- **`raw jsonb`** — platformun ham yanıtı. Alan adları platformdan platforma
  değişiyor; kolon eklemeden önce neyin biriktiğini görmek gerekir.
- **`tier`** — hangi periyodun ölçümü: `h6` / `d1` / `final`.
- **`content_metrics_final_idx`** — `tier='final'` üzerinde UNIQUE. Analitik ve
  plan geri beslemesi yalnızca bu satırları okur; bir içeriğin tek "nihai"
  ölçümü olur.

**Platform alanları (Instagram, ilk yayıncı).** `GET /{media-id}/insights`
metrikleri kolonlara şöyle oturur:

| Kolon | Instagram metriği |
|---|---|
| `reach` | `reach` |
| `impressions` | `impressions` |
| `likes` / `comments` | `likes` / `comments` |
| `saves` | `saved` |
| `shares` | `shares` |
| `video_views` | `video_views` (Reels: `plays`) |
| `profile_visits` | `profile_visits` (hesap düzeyi; ⚠ medya düzeyinde her tipte yok) |
| `engagement_rate` | Türetilmiş: `(likes+comments+saves+shares) / reach × 100` |

**⚠ DOĞRULANMALI:** Instagram Graph API metrik adları sürüme göre değişiyor
(`INSTAGRAM_API_VERSION` bugün `v23.0`, `instagram/config.ts:22`) ve bazı
metrikler medya tipine göre yok. Toplayıcı **eksik metriği hata saymamalı**;
`raw`'a ne geldiyse yazıp bilinen kolonları doldurmalı.

**Periyot ve retention:**

| Yaş | Sıklık | tier |
|---|---|---|
| 0–48 saat | 6 saatte bir | `h6` |
| 2–30 gün | günde bir | `d1` |
| 30. gün | son ölçüm, sonra durur | `final` |

**`tier`'in anlamı (D1 ile netleştirildi).** `tier` bir ölçümün **hangi
periyotta alındığını** söyler, "okunabilir tek satır" demez:

- `final` = **artık toplama yapılmaz.** İçerik 30 günü doldurdu, toplayıcı o
  içerik için bir daha çalışmaz. Ölçümün *nihai* olduğu anlamına gelir,
  *okunabilir tek satır olduğu* anlamına **gelmez**.
- `d1` / `h6` = toplama sürüyor; içerik hâlâ 30 günlük pencerenin içinde.
- Bir içeriğin `final` satırı **yalnızca 30. günden sonra vardır.** 10 gün önce
  yayınlanmış içeriğin `final` satırı yoktur ve olmayacaktır — ama en son `d1`
  ölçümü vardır ve okunabilir.

Bu yüzden geri besleme (§8.3, Akış D) `final`'e değil, **içerik başına en son
mevcut ölçüme** bakar. `tier` orada bir *güvenilirlik ağırlığı* olarak taşınır.

Retention: ham anlık görüntüler **180 gün**, sonra silinir (`sm-metrics` job'ı
kendi temizliğini yapar). `tier='final'` satırları **süresiz** kalır — tek
satır/içerik oldukları için ucuzlar ve içeriğin nihai performansını taşırlar.
`content_metrics_final_idx` UNIQUE kısıtı **korunur**: bir içeriğin en fazla bir
`final` satırı olabilir. Kısıt `final` satırlarının tekliğini garantiler; geri
beslemenin *yalnızca* onları okuduğu anlamına gelmez.

**Kanal düzeyi:** `channels.followers/growth/engagement` bugün hiç
güncellenmiyor (`KESIF_SIRAYA §13`). `sm-metrics` job'ı profil çağrısıyla
bunları da tazeler, `channels.last_synced_at` damgalar.

### 4g. Sahne → Sıraya medya köprüsü

**Sorun:** Sahne çıktısı Kie/fal'ın **geçici** URL'i (`KESIF_SAHNE §4`:
*"Bu bağlantı bir süre sonra kapanır"*). Sıraya'nın yayıncısı kalıcı, public
bir `https` URL bekliyor (`lib/actions/posts.ts` https zorunluluğu; Instagram
medyayı yayın anında **kendisi çekiyor**). Arada köprü yok.

**Akış:**

```
1. media_jobs.state = 'succeeded', output_url = <vendor geçici URL>
2. sm-worker → jobs(kind='media_poll') tamamlanınca jobs(kind='ugc_pipeline')
   son adımı: lib/server/storage.ts → persistVendorAsset()
3. persistVendorAsset:
     a. URL'i SSRF allowlist'ine karşı doğrula (§10) — sadece
        kieai.redpandaai.co / *.fal.media / api.elevenlabs.io
     b. sunucu tarafında indir, boyut sınırı 100MB (video), 25MB (görsel)
     c. Content-Type doğrula (beklenen mime ile eşleşiyor mu)
     d. Supabase Storage'a yükle:
          media/<user_id>/<brand_id>/video/<uuid>.mp4
     e. media_assets satırı yaz (public_url, bytes, duration_ms, source_vendor,
        source_url = izlenebilirlik için geçici URL)
     f. media_jobs.result_asset_id = <yeni asset>
4. content_items.primary_media_id = <asset>
   content_items.media_type = 'REELS'   (dikey UGC video)
   content_items.status: 'draft' → 'needs_review'
   activity(action='ugc_ready')
5. Yayın anında cron:
     media_url := media_assets.public_url   ← siraya'nın beklediği alan
```

**Bucket tarafı:** tek `media` bucket'ı, public read (§1.10). siraya'nın mevcut
politikaları (`003-instagram.sql:54-71`) değişmeden çalışır çünkü yol şeması
ilk segmentte `user_id` tutuyor.

**Neden 5. adımda URL kopyalanıyor (`media_url`)?** Yayın anında asset'in URL'i
`content_items`'a **dondurulur**. Asset sonradan silinirse yayınlanmış gönderinin
kaydı ne gösterdiğini bilmeye devam eder. `primary_media_id` ilişkiyi,
`media_url` o andaki gerçeği tutar.

---

## 5. `supabase/00_schema.sql` AÇIKLAMASI

| Bölüm | Tablolar | Türediği yer |
|---|---|---|
| 1. Kimlik ve sahiplik | `profiles`, `brands`, `provider_credentials` + `owns_brand()` | `siraya/schema.sql:24-66` (profiles + trigger), `threadly/0002_brands.sql:12-27` (brands, UNIQUE kaldırıldı), `provider_credentials` **yeni** — D2 ile Instagram app kimliğini de taşır (`config jsonb` + `vault_secret_id`, `unique (brand_id, provider)`) |
| 2. Kanallar ve token'lar | `channels`, `channel_credentials` | `siraya/schema.sql:69-80`, `siraya/003-instagram.sql:15-37` (birebir) |
| 3. Personalar ve medya | `personas`, `media_assets` | `sahne/lib/server/personas.ts:28-38` (JSON→tablo), `media_assets` **yeni** |
| 4. Planlar ve içerik | `plans`, `content_items`, `media_jobs` | `threadly/0001_plans.sql:9-23`; `content_items` = `siraya.posts` + `threadly.plan_posts`; `media_jobs` `sahne/lib/server/{kie,fal}.ts`'ten türetildi |
| 5. İş kuyruğu | `jobs` + `claim_jobs()` | **Üç projede de yok** — §8.5 |
| 6. Metrikler ve aktivite | `content_metrics`, `activity` | `siraya/schema.sql:116-139`, genişletilmiş |
| 7. Hız sınırı | `rate_limit_counters` + `rate_limit_hit()` | **Yeni** — §8.7 |
| 8. Depolama | `media` bucket + 4 politika | `siraya/003-instagram.sql:48-71` (birebir) |
| 9. RLS | 12 tablo | `siraya/schema.sql:150-168` + `threadly/0001:58-70` deseni, `owns_brand()` üzerinden |
| 10. Zamanlayıcı | 5 pg_cron job'ı + `cron_fire()` | `siraya/004-cron.sql:12-37` deseni, `sm-` ön ekli |
| 11. Tekrar yardımcısı | `find_similar_content()` | **Yeni** — §4c |

### RLS stratejisi

Üç proje de `auth.uid() = user_id` kullanıyor
(`siraya/schema.sql:150-168`, `threadly/0001:58-70`, `threadly/0002:31-36`).
Birleşimde bu **`owns_brand(brand_id)`** olur — sebep §4e.

**Token ve anahtar tabloları için siraya'nın "RLS açık + SIFIR politika"
deseni (`003-instagram.sql:37`) AYNEN uygulanır.** Bu, üç raporun ortaya
çıkardığı en sağlam güvenlik kararıdır: RLS açık ama hiçbir politika tanımlı
değilse, `authenticated` ve `anon` rollerinin **ikisi de hiçbir satır göremez**;
yalnızca RLS'i baypas eden service-role erişir. Bu desen iki tabloya uygulandı:

| Tablo | Neden politikasız |
|---|---|
| `channel_credentials` | Instagram uzun ömürlü token'ı. Tarayıcıya sızarsa hesap ele geçirilir |
| `provider_credentials` | Müşterinin **kendi** Anthropic/Kie/fal anahtarı **ve** (D2) marka bazlı Instagram app secret'ı. Sızarsa müşterinin faturası ödenir / uygulama kimliği ele geçer |

`provider_credentials`'da anahtarın kendisi **tabloda bile durmuyor** — Supabase
Vault'ta duruyor, tablo yalnızca `vault_secret_id` taşıyor. İki kat koruma.

`rate_limit_counters` da politikasız: yalnızca SECURITY DEFINER
`rate_limit_hit()` üzerinden yazılır. Kullanıcı kendi sayacını sıfırlayamamalı.

`content_metrics` ve `activity` için politika **asimetrik**: kullanıcı okur,
yazan taraf service-role job'dır. `jobs` tablosunda kullanıcı yalnızca `select`
alır (ilerleme çubuğu için) — kuyruğa elle iş yazamaz.

### threadly'nin `getUser()` + anon key kararı korunur

`threadly/lib/supabase/server.ts:5-6` sunucu tarafında bile **service role
değil, anon key + kullanıcı cookie'si** kullanıyor — böylece her sorgu RLS'ten
geçiyor. Bu korunmalı. Service-role yalnızca üç yerde kullanılır:
cron job'ları, OAuth callback'i (token yazımı), ve `provider_credentials`
okuması. Rapor bunu doğru uyarıyor (`KESIF_THREADLY §11`): *"tek bir kaçak
varsa her şey açılır."*

---

## 6. AKIŞ DİYAGRAMLARI

### Akış A — Marka profili → plan üretimi → içerik listesi

```
[/settings]  SettingsClient            ← threadly/components/app/settings-client.tsx
     │        8 alan, karakter sınırı, TR/EN
     ▼
  POST /api/brand                      ← threadly/app/api/brand/route.ts
     │  parseBrand()                   ← threadly/lib/brand/types.ts:104
     ▼
  brands (upsert, artık onConflict: id — user_id UNIQUE kalktı)
     │
     ▼
[/plan]  tema + mod(weekly|auto) + ufuk(7|30) + dil
     │
     ▼
  POST /api/ai/plan   ──► jobs(kind='plan_generate')    ← YENİ: senkron 300sn DEĞİL
     │                     dedupe_key='plan:<brand>:<theme-hash>'
     │                     202 + jobId döner
     ▼
  sm-worker (dakikada bir)
     │
     ├─► credentials.ts: müşterinin ANTHROPIC anahtarını Vault'tan oku
     │
     ├─► buildSlots(start, horizonDays)          ← threadly/lib/plan/template.ts:91
     │     WEEKLY_TEMPLATE (Pzt görsel+LinkedIn, Sal story, Çar reels, …)
     │
     ├─► toPromptBlock(brand)                    ← threadly/lib/brand/types.ts:127
     │
     ├─► planSkeleton()                          ← threadly/lib/plan/skeleton.ts:240
     │     claude-opus-5, max_tokens 16000, effort medium
     │     WEEKLY_SCHEMA | AUTO_SCHEMA
     │
     ├─► ⭐ TEKRAR KONTROLÜ (Akış E) — her iskelet gönderisi için
     │
     └─► plans + content_items (status='idea') insert
             platform küçük harfe normalize    ← KÜÇÜK UYARLAMA
             activity(action='plan_generated')
     ▼
[/plan] gün gün liste — kullanıcı bir gönderiye tıklar
     │
     ▼
  POST /api/ai/plan/post  ──► jobs(kind='caption_write')
     │     writeCaption()                       ← threadly/lib/ai/caption.ts:87
     │     idea metni inşası                    ← threadly/app/api/plan/post/route.ts:82-89
     │     + zincir bağlamı (varsa)             ← YENİ, §4b
     ▼
  content_items.body/hashtags dolu, status='draft'
```

### Akış B — İçerik seçimi → UGC video boru hattı → kalıcı depolama

```
[/plan] veya [/queue] — kullanıcı "UGC video iste" der (çoklu seçim)
     │
     ▼
  POST /api/studio/ugc  ──► jobs(kind='ugc_pipeline', payload={contentItemId, personaId})
     │                       dedupe_key='ugc:<contentItemId>'   ← çifte üretim kalkanı
     ▼
  sm-worker · ADIM 1 — persona karesi (varsa atlanır)
     │  createPersonaImage(prompt)              ← sahne/lib/server/kie.ts:172
     │  Nano Banana Pro · 24 kredi              ← kie.ts:137
     │  media_jobs(step='persona_image', vendor='kie')
     │  ⚠ persona prompt'u: KESIF_SAHNE §9.1 — "AI görünmeyen UGC" metni
     ▼
  ADIM 2 — konuşan klip
     │  createPersonaVideo(imageUrl, prompt, {duration, mode})  ← kie.ts:206
     │  Kling 3.0, sound:true, İNGİLİZCE        ← kie.ts:187-205 gerekçesi
     │  media_jobs(step='persona_video')
     ▼
  ADIM 3 — Türkçe seslendirme
     │  synthesizeSpeech(text, voiceId)         ← sahne/lib/server/elevenlabs.ts:121
     │  eleven_multilingual_v2, ayarlı voice_settings ← elevenlabs.ts:132-137
     │  [opsiyonel] applyPhoneEffect()          ← sahne/lib/server/audio.ts:51 · §10'a bak
     │  media_jobs(step='voice', vendor='elevenlabs')
     ▼
  ADIM 4 — lipsync
     │  createFalLipsync(videoUrl, audioUrl)    ← sahne/lib/server/fal.ts:99
     │  Sync Labs v3, FAL_SYNC_MODE='cut_off'   ← fal.ts:55 gerekçesi (remap DEĞİL)
     │  ⚠ SSRF: URL'ler client'tan DEĞİL, media_jobs'tan okunur   ← §10
     │  media_jobs(step='lipsync', vendor='fal')
     ▼
  ADIM 5 — ⭐ KÖPRÜ (§4g) — lib/server/storage.ts persistVendorAsset()
     │  allowlist doğrula → indir → Storage'a yükle → media_assets yaz
     ▼
  content_items.primary_media_id = <asset>
  content_items.media_type = 'REELS'
  content_items.status: 'draft' → 'needs_review'
  activity(action='ugc_ready')
     ▼
[/queue] kullanıcı onaylar → status='scheduled'
```

Bu akışın UI'ı: `sahne/components/app/persona-studio.tsx` (759 satır, 5 adımlı
panel) + `persona-copy.ts` + `persona-voice-picker.tsx`. `useTaskPoll` hook'u
(`persona-studio.tsx:76-117`) korunur ama artık vendor'ı değil **`media_jobs`
satırını** pollar — tek endpoint, tek şekil, tarayıcı kapansa da iş sürer.

### Akış C — Zamanlayıcı → token tazeleme → yayın → activity

```
pg_cron 'sm-publish'  (*/5 * * * *)          ← siraya/004-cron.sql ritmi
     │  cron_fire('/api/cron/publish')
     │  Authorization: Bearer <vault sm_cron_secret>
     ▼
  /api/cron/publish                           ← siraya/app/api/cron/publish/route.ts
     │  Bearer doğrula (:33-35)
     │
     ├─► SELECT ... WHERE status='scheduled' AND scheduled_at <= now() LIMIT 25
     │
     └─► her satır için: jobs(kind='publish', dedupe_key='publish:<id>')
             ↑ endpoint ARTIK YAYINLAMIYOR, sadece kuyruğa koyuyor.
               Gerekçe: pg_net 60sn'de bağlantıyı kapatıyor (KESIF_SIRAYA §12),
               ama bir Reels'in container polling'i 5 dakika sürebiliyor.
     ▼
  sm-worker · publish işi
     │
     ├─► ⭐ KİLİT:  UPDATE content_items SET status='publishing', locked_at=now(),
     │              locked_by=<run-id>
     │              WHERE id=$1 AND status='scheduled'      ← koşul kilidi
     │              → 0 satır döndüyse: başka bir çalışma aldı, ÇIK
     │              (siraya'nın idempotency eksiği burada kapanıyor)
     │
     ├─► kanal + credential oku (service-role)
     │
     ├─► ensureFreshToken()                   ← siraya/lib/instagram/tokens.ts:20
     │     10 günden az kaldıysa yenile, channel_credentials'a yaz
     │
     ├─► media_url = media_assets.public_url  ← §4g köprüsünün çıktısı
     │
     ├─► createContainer → waitForContainer(100×3sn) → publishContainer
     │                                        ← siraya/lib/instagram/publish.ts:67,80,112
     │
     ├─ BAŞARILI ─► status='published', published_at, external_post_id
     │              activity(action='published')
     │              jobs(kind='metrics_collect', run_after=now()+6h)   ← Akış D tetiği
     │
     └─ HATA ─────► status='failed', failure_error (500 kar. kırpma)
                    activity(action='failed')
                    attempts < max_attempts ise geri 'scheduled' + backoff

pg_cron 'sm-reaper' (*/10)  → 15 dakikadır 'publishing'de kalanı 'scheduled'a al
pg_cron 'sm-token-refresh' (günde 1) → token_expires_at yaklaşan kanalları tazele
     ↑ siraya'da bu job HİÇ YOK: hiç yayın yapmayan kanalın token'ı 60 günde
       sessizce ölüyordu (KESIF_SIRAYA §12). channel_credentials_expiry_idx
       bu job için hazırlanmış ama job yazılmamıştı.
```

### Akış D — Metrik toplama → analiz → sonraki plana geri besleme

```
jobs(kind='metrics_collect')  ·  sm-metrics (saat başı) sırası geleni kuyruğa koyar
     │
     ├─► yaş < 48sa → tier='h6' (6 saatte bir)
     ├─► yaş < 30g  → tier='d1' (günde bir)
     └─► yaş = 30g  → tier='final', sonra durur
     ▼
  GET /{external_post_id}/insights   (Instagram Graph, müşterinin token'ı ile)
     │  ⚠ eksik metrik hata değil — raw'a ne geldiyse yaz
     ▼
  content_metrics insert (append-only)
  channels.followers/growth/engagement + last_synced_at tazele
  activity(action='metrics_collected')
     ▼
  ── ANALİZ (saf fonksiyonlar, siraya'dan — girdisi ARTIK DOLU) ──
     buildHeatmap(posts, metrics, tz)      ← siraya/lib/data/derive-analytics.ts
        7 gün × 6 üç-saatlik pencere, en iyi slota göre 0-100 normalizasyon
     buildTopPosts(posts, metrics, tz)
     buildEngagementTrend(metrics, now)
     ▼
  [/analytics] ekranı ARTIK BOŞ DEĞİL
     ▼
  ── GERİ BESLEME (⭐ YENİ — hiçbir projede yok, §8.3) ──
     lib/core/insights/build-feedback.ts
        1. son 30 günde yayınlanmış içeriklerin EN SON MEVCUT ölçümünü oku
           distinct on (content_item_id) ... order by content_item_id,
                                                  collected_at desc
           tier='h6' HARİÇ  ·  tier ağırlık: final 1.0 > d1 0.7
           ↑ D1: 'final' 30. günde yazılır; 10 gün önce yayınlanmış
             içeriğin final satırı YOKTUR. Sadece final okunsaydı geri
             besleme 30-60 günlük veriye bakardı (ürün tanımı md.6 kırılır)
        2. üstteki %20 içeriği seç (ağırlıklı engagement_rate'e göre)
        3. ortak örüntüleri çıkar: hangi kind, hangi saat penceresi,
           hangi topic_key, hangi hook kalıbı
        4. bir "insight bloğu" metni üret (toPromptBlock'a benzer şekilde,
           BOŞ ALANLAR DÜŞÜRÜLÜR — threadly/lib/brand/types.ts:122-126 dersi)
     ▼
  Sonraki planSkeleton() çağrısı bu bloğu prompt'a ekler
  plans.insight_snapshot = <kullanılan analiz> (izlenebilirlik)
     ▼
  Ayrıca: en iyi pencere → content_items.is_best_time = true
          activity(action='shifted_to_best_time')
     ↑ siraya'da bu iki alanı YAZAN KOD YOK'tu (KESIF_SIRAYA §13),
       ama pazarlama vaadi buydu (app.config.ts:64)
```

### Akış E — Tekrar kontrolü ve "devam" kararı

Yeni içerik **veritabanına yazılmadan önce**, sırayla:

```
GİRDİ: {title, hook, brand_id, topic_key?}
     │
  ┌──┴─────────────────────────────────────────────────────────────┐
  │ KONTROL 1 — Birebir parmak izi          (maliyet: 1 indeks)    │
  │   fp = sha256(normalize(title + "\n" + hook))                  │
  │   SELECT ... WHERE brand_id=? AND content_fingerprint=fp       │
  │   VARSA ──► REDDET · activity('duplicate_blocked') · yeniden üret│
  └──┬─────────────────────────────────────────────────────────────┘
     │ yok
  ┌──┴─────────────────────────────────────────────────────────────┐
  │ KONTROL 2 — Anlamsal komşuluk           (maliyet: 1 embedding) │
  │   emb = embed(title + hook + topic_key)                        │
  │   find_similar_content(brand_id, emb, 0.82, 5)                 │
  │                                                                 │
  │   sim >= 0.92  ──► TEKRAR. Reddet, yeniden üret.                │
  │                    3 denemede geçmezse slotu boş bırak          │
  │                    (threadly prompt'u zaten "pad etme" diyor)   │
  │                                                                 │
  │   0.82–0.92    ──► KONTROL 3'e                                  │
  │                                                                 │
  │   < 0.82       ──► YENİ. Geçir.                                 │
  └──┬─────────────────────────────────────────────────────────────┘
     │ yakın komşu var
  ┌──┴─────────────────────────────────────────────────────────────┐
  │ KONTROL 3 — "DEVAM" mı, tekrar mı?                             │
  │                                                                 │
  │   Komşu 'published' DEĞİL ise ──► REDDET                        │
  │     (yayınlanmamış bir şeyin devamı olmaz — okuyan kimse yok)   │
  │                                                                 │
  │   Komşu 'published' ise:                                        │
  │     a. zincir derinliği < 12 mi?                     değilse RED│
  │     b. komşunun yayınından bu yana >= 3 gün geçmiş mi? değilse RED│
  │     c. LLM'e sor: "Bu yeni fikir, şu yayınlanmış gönderinin      │
  │        FARKLI bir yönünü mü anlatıyor, yoksa aynı şeyi mi       │
  │        tekrar ediyor?" → {isContinuation, aspect}               │
  │                                                                 │
  │     isContinuation ──► KABUL ET, ama:                           │
  │        parent_id = komşu.id                                     │
  │        continuation_note = aspect                               │
  │        caption prompt'una zincir bağlamı eklenir:               │
  │          "Bu gönderi şunun devamı: <parent.title>.              │
  │           Aynı noktayı tekrarlama, <aspect> yönünü anlat."      │
  │        activity('continuation_created')                         │
  │                                                                 │
  │     değilse ──► REDDET                                          │
  └────────────────────────────────────────────────────────────────┘
```

**Eşikler:** `0.92` / `0.82` / `3 gün` / `12 derinlik` / `3 deneme`.
**⚠ Hiçbiri ölçülmedi** — makul başlangıç değerleri. İlk ~200 içerikten sonra
kalibre edilmeli; `activity` tablosundaki `duplicate_blocked` sayısı bunun
göstergesi olur (çok yüksekse eşik sıkı, sıfırsa gevşek).

**Kontrol 3c'nin maliyeti:** slot başına ek bir LLM çağrısı, ama yalnızca
0.82–0.92 bandındaki (yani nadir) durumlarda. Ucuz model + `effort: "low"`
yeterli — `caption.ts:95` zaten bu deseni kullanıyor.

---

## 7. TAŞIMA HARİTASI

Değişiklik kolonu: **OLDUĞU GİBİ** / **KÜÇÜK UYARLAMA** / **YENİDEN YAZILACAK**

### 7.1 Çekirdek iş mantığı

| Kaynak | Hedef yol | Önc. | Değişiklik | Not |
|---|---|---|---|---|
| `threadly/lib/plan/skeleton.ts` | `lib/core/plan/skeleton.ts` | 1 | **KÜÇÜK UYARLAMA** | Kanal enum'ları küçük harfe; `lib/demo/data` tip importu `lib/core/types`'a |
| `threadly/lib/plan/template.ts` | `lib/core/plan/template.ts` | 1 | **OLDUĞU GİBİ** | Sıfır runtime bağımlılığı |
| `threadly/lib/plan/types.ts` | `lib/core/plan/types.ts` | 1 | **KÜÇÜK UYARLAMA** | `toPlanPost` → `toContentItem`; yeni kolonlar |
| `threadly/lib/ai/caption.ts` | `lib/core/ai/caption.ts` | 1 | **KÜÇÜK UYARLAMA** | Kanal enum'u; zincir bağlamı parametresi eklenir |
| `threadly/lib/brand/types.ts` | `lib/core/brand/types.ts` | 1 | **OLDUĞU GİBİ** | `toPromptBlock()` üç modülün ortak marka kaynağı |
| `threadly/lib/ai/types.ts` | `lib/core/ai/types.ts` | 1 | **KÜÇÜK UYARLAMA** | `ApiErrorCode`'a `rate_limited`, `duplicate`, `publish_failed` eklenir |
| `threadly/lib/ai/client.ts` | `lib/core/ai/client.ts` | 1 | **KÜÇÜK UYARLAMA** | Yeni hata kodlarının TR/EN metinleri |
| `sahne/lib/server/kie.ts` | `lib/core/providers/kie.ts` | 1 | **KÜÇÜK UYARLAMA** | `uploadPath:"sahne"` → yeni marka; apiKey parametreye (env'den değil, §8.6) |
| `sahne/lib/server/elevenlabs.ts` | `lib/core/providers/elevenlabs.ts` | 1 | **KÜÇÜK UYARLAMA** | Aynı: apiKey parametreye |
| `sahne/lib/server/fal.ts` | `lib/core/providers/fal.ts` | 1 | **KÜÇÜK UYARLAMA** | `fal.config()` import-time singleton'ı → istek başına client (§8.6) |
| `sahne/lib/server/prompt.ts` | `lib/core/ai/prompt.ts` | 2 | **OLDUĞU GİBİ** | 15 satır |
| `sahne/lib/server/personas.ts` | `lib/server/storage.ts` | 1 | **YENİDEN YAZILACAK** | Arayüz korunur, gövde Storage+DB olur. Güvenlik kontrolleri (id regex, https, 25MB) taşınır |
| `sahne/lib/server/audio.ts` | `lib/core/providers/audio.ts` | 3 | **KÜÇÜK UYARLAMA** | §10'daki ffmpeg kararına bağlı |
| `siraya/lib/instagram/{config,oauth,publish,tokens}.ts` | `lib/core/providers/instagram/*` | 1 | **KÜÇÜK UYARLAMA** | D2: `config.ts` `process.env` okumayı bırakır, `InstagramAppConfig` parametresi alır (`resolveInstagramConfig(brandId)` → `provider_credentials`, yoksa env fallback). `oauth/publish/tokens` bu nesneyi parametre olarak geçer |
| `siraya/lib/data/tz.ts` | `lib/core/tz.ts` | 1 | **OLDUĞU GİBİ** | Saf TS, sıfır bağımlılık |
| `siraya/lib/data/derive-calendar.ts` | `lib/core/derive/calendar.ts` | 2 | **KÜÇÜK UYARLAMA** | Tip importu `lib/demo/data`'dan koparılır |
| `siraya/lib/data/derive-analytics.ts` | `lib/core/derive/analytics.ts` | 2 | **KÜÇÜK UYARLAMA** | Aynı; `MetricRow` yeni kolonlarla |
| `siraya/lib/data/types.ts` | `lib/core/types.ts` | 2 | **KÜÇÜK UYARLAMA** | `lib/demo/data` tip bağımlılığı koparılır |
| `siraya/lib/publishing.ts` | `lib/core/publishing.ts` | 2 | **OLDUĞU GİBİ** | 15 satır; genişletme noktası (§8.8) |
| `siraya/lib/actions/posts.ts` | `lib/server/actions/content.ts` | 1 | **KÜÇÜK UYARLAMA** | `readPostForm()` doğrulaması birebir; tablo adı + `brand_id` |
| `siraya/lib/actions/channels.ts` | `lib/server/actions/channels.ts` | 2 | **KÜÇÜK UYARLAMA** | `brand_id` eklenir |
| `siraya/lib/data/{index,queries}.ts` | `lib/adapters/*` | 1 | **YENİDEN YAZILACAK** | Desen korunur, açık bayrağa çevrilir (§9) |
| `siraya/lib/supabase/{client,server,admin,config}.ts` | `lib/server/supabase/*` | 1 | **OLDUĞU GİBİ** | Dördü de doğrudan çalışır |
| `siraya/lib/supabase/auth-errors.ts` | `lib/server/supabase/auth-errors.ts` | 2 | **OLDUĞU GİBİ** | TR/EN hata eşlemesi |

**⚠ Hizalama notu (B4) — bu tablonun hedef yolları adım 4'te uygulanan
gerçek yollarla güncellendi.** Önceki hâli beş yerde diskteki ağaçtan
ayrışıyordu ve plan artık var olmayan yolları gösteriyordu:

| Planın eski yolu | Gerçek yol | Neden |
|---|---|---|
| `lib/core/calendar/tz.ts` | `lib/core/tz.ts` | `tz.ts` takvime özel değil; saat dilimi yardımcıları planlayıcı, kuyruk ve analitik tarafından da okunuyor |
| `lib/core/calendar/derive-{calendar,analytics}.ts` | `lib/core/derive/{calendar,analytics}.ts` | İki dosya da "satırdan görünüm türet" işi yapıyor; ortak olan `derive`, `calendar` değil. `derive-` ön eki dizin adında tekrarlanıyordu |
| `lib/core/caption/caption.ts` · `lib/core/contracts.ts` · `contracts-client.ts` | `lib/core/ai/{caption,types,client}.ts` | `caption/caption.ts` tekrar; üç dosya da aynı AI sözleşmesinin parçası, tek dizinde |
| `lib/providers/*` | `lib/core/providers/*` | Sağlayıcı sarmalayıcıları adım 4'te saflaştırıldı (`process.env` → `apiKey` parametresi). Saf oldukları için `lib/core/`'un saflık grep'i onları da kapsıyor; `lib/core/` dışında olsalardı bu kapı onları denetlemezdi |

`lib/providers/README.md` ve `lib/server/README.md` yerinde duruyor —
`lib/providers/` FAZ 2'de saf olmayan sağlayıcı kodu doğarsa (ör. Instagram
OAuth'un yönlendirme akışı) hâlâ hedef dizin.

**Henüz taşınmamış satırlar** (bu tablo taşıma haritası, tamamlanma raporu
değil): `client.ts`, `prompt.ts`, `audio.ts`, `personas.ts`, `instagram/*`,
`actions/*`, `supabase/*` ve `data/{index,queries}.ts`. Sonuncusu adım 5'in
konusu (§9.1 adapter deseni).

### 7.2 API rotaları

| Kaynak | Hedef | Önc. | Değişiklik | Not |
|---|---|---|---|---|
| `siraya/app/api/cron/publish/route.ts` | `app/api/cron/publish/route.ts` | 1 | **KÜÇÜK UYARLAMA** | Artık yayınlamıyor, kuyruğa koyuyor (Akış C) |
| `siraya/app/api/instagram/{connect,callback}/route.ts` | `app/api/channels/instagram/*` | 1 | **KÜÇÜK UYARLAMA** | `brand_id` bağlamı; cookie adı `sm:ig_oauth_state` |
| `siraya/app/auth/callback/route.ts` | `app/(auth)/callback/route.ts` | 1 | **OLDUĞU GİBİ** | Open-redirect koruması (`:12`) korunur |
| `threadly/app/api/plan/route.ts` | `app/api/ai/plan/route.ts` | 1 | **YENİDEN YAZILACAK** | 300sn senkron → kuyruk + 202 |
| `threadly/app/api/plan/post/route.ts` | `app/api/ai/plan/post/route.ts` | 1 | **KÜÇÜK UYARLAMA** | Kuyruk + zincir bağlamı |
| `threadly/app/api/brand/route.ts` | `app/api/brand/route.ts` | 2 | **KÜÇÜK UYARLAMA** | `onConflict: user_id` → `id` (UNIQUE kalktı) |
| `threadly/app/api/caption/route.ts` | `app/api/ai/caption/route.ts` | 2 | **KÜÇÜK UYARLAMA** | **AUTH + RATE LIMIT EKLE** (§10) |
| `threadly/app/api/image/route.ts` | `app/api/ai/image/route.ts` | 2 | **KÜÇÜK UYARLAMA** | **AUTH + RATE LIMIT EKLE**; çıktı Storage'a kalıcılaştırılır |
| `sahne/app/api/persona/*` (6 rota) | `app/api/studio/persona/*` | 1 | **KÜÇÜK UYARLAMA** | **AUTH EKLE**; **SSRF DÜZELT**; kuyruğa bağlan |
| `sahne/app/api/{lipsync,voice,voices,credits,video}` | `app/api/studio/*` | 2 | **KÜÇÜK UYARLAMA** | **AUTH EKLE**; demo `actors` dizisi → DB |
| `siraya/proxy.ts` | `proxy.ts` | 2 | **KÜÇÜK UYARLAMA** | Üç kapı mantığının birleşimi; korumalı yol listesi genişler |

### 7.3 UI

| Kaynak | Hedef | Önc. | Değişiklik | Not |
|---|---|---|---|---|
| `sahne/components/app/persona-studio.tsx` | `components/studio/persona-studio.tsx` | 1 | **KÜÇÜK UYARLAMA** | `useTaskPoll` artık `media_jobs`'ı pollar |
| `sahne/components/app/persona-copy.ts` | `components/studio/persona-copy.ts` | 1 | **OLDUĞU GİBİ** | TR/EN metinler + prompt yönlendirmeleri |
| `sahne/components/app/persona-voice-picker.tsx` | `components/studio/voice-picker.tsx` | 2 | **KÜÇÜK UYARLAMA** | `m: PersonaCopy` prop'u gevşetilir |
| `sahne/components/app/studio.tsx` | `components/studio/omnihuman-studio.tsx` | 2 | **KÜÇÜK UYARLAMA** | Kredi onay diyaloğu korunur; localStorage kaldırılır |
| `sahne/components/actor-card.tsx` | `components/app/media-card.tsx` | 3 | **KÜÇÜK UYARLAMA** | 9:16 thumbnail placeholder |
| `siraya/components/app/post-dialog.tsx` | `components/app/content-dialog.tsx` | 1 | **KÜÇÜK UYARLAMA** | Storage yolu `brand_id` içerir |
| `siraya/components/app/queue-client.tsx` | `components/app/queue-client.tsx` | 1 | **KÜÇÜK UYARLAMA** | "UGC iste" aksiyonu eklenir (Akış B tetiği) |
| `siraya/components/app/channels-client.tsx` | `components/app/channels-client.tsx` | 2 | **OLDUĞU GİBİ** | — |
| `siraya/components/app/dashboard-client.tsx` | `components/calendar/*` | 2 | **YENİDEN YAZILACAK** | 488 satır → parçalanır (takvim / ısı haritası / KPI / donut) |
| `siraya/components/app/analytics-client.tsx` | `components/app/analytics-client.tsx` | 2 | **KÜÇÜK UYARLAMA** | Girdi artık dolu |
| `siraya/components/app/empty-state.tsx` | `components/ui/empty-state.tsx` | 1 | **OLDUĞU GİBİ** | `DemoBanner` FAZ 1'in görünür işareti |
| `threadly/app/(app)/plan/page.tsx` | `app/(app)/plan/page.tsx` | 1 | **KÜÇÜK UYARLAMA** | Kuyruk durumu pollama; TR/EN metinler dışarı |
| `threadly/components/app/settings-client.tsx` | `components/app/brand-form.tsx` | 2 | **KÜÇÜK UYARLAMA** | API anahtarı girişi bölümü eklenir |
| `threadly/app/(app)/composer/page.tsx` | `app/(app)/composer/page.tsx` | 3 | **KÜÇÜK UYARLAMA** | "Planla" butonu bağlanır (`:196` bugün işlevsiz) |
| `siraya/components/auth/auth-screen.tsx` | `components/auth/auth-screen.tsx` | 2 | **KÜÇÜK UYARLAMA** | Demo bypass FAZ 2'de kaldırılır |
| üç `dashboard/page.tsx` | — | — | **TAŞINMAZ** | Üçü de %100 demo; yeni dashboard sıfırdan |
| üç `(marketing)/page.tsx` | — | — | **TAŞINMAZ** | 1019 / 1161 / 1038 satır, üçü de kendi markası |

### 7.4 Duplike GoatStarter dosyaları — hangi projeden alınacak

Bu dosyalar **üç projede de** var ve neredeyse aynı. Kural: gerçek veriye bağlı
olan / en zengin olan kazanır.

| Dosya | Hangi projeden | Neden o |
|---|---|---|
| `components/ui/button.tsx` | **threadly** | 5 variant × 4 size, `icon` size'ı olan tek sürüm |
| `components/ui/card.tsx` | **threadly** | Üçü aynı; threadly'ninki tam aile (Header/Title/Description/Content/Footer) |
| `components/ui/input.tsx` | **threadly** | Tek `Textarea` içeren sürüm — marka formu ve composer buna bağlı |
| `components/ui/badge.tsx` | **herhangi biri** | Üçü birebir aynı (`tone` union'ı dahil) |
| `components/ui/icon.tsx` | **herhangi biri** | Üçü birebir aynı; `lucide-react/dynamic` |
| `components/ui/logo.tsx` | **HİÇBİRİ** | Üçü de kendi markasına özel SVG. Yeniden çizilecek (§11 S1) |
| `components/ui/theme-toggle.tsx` | **herhangi biri** | Üçü aynı |
| `components/ui/language-toggle.tsx` | **siraya / threadly** | `onDark` prop'u olan sürüm (sahne'de yok) |
| `lib/utils.ts` | **siraya** temel + **sahne**'nin `formatRelative`'i | Üçünde de ölü fonksiyonlar var (`CURRENCY`, `formatMoney`, `formatPercent`, `initials`); birleşimde sadece `cn`, `formatNumber`, `formatDate`, `formatRelative` kalır |
| `lib/i18n/config.ts` | **herhangi biri** | Üçü birebir (`L` tipi, `pick()`, `DEFAULT_LANG`) |
| `lib/i18n/dict.ts` | **siraya** | En zengin sözlük; ölü anahtarlar (`reconnect`, `igNotConfigured`, `editPost`, `export`) temizlenir |
| `components/i18n/language-provider.tsx` | **herhangi biri** | Üçü birebir; localStorage anahtarı `sm:lang` olur |
| `components/theme-provider.tsx` | **herhangi biri** | Üçü de 11 satırlık ince sarmalayıcı |
| `components/auth/auth-screen.tsx` | **siraya** | Tek gerçek Supabase auth'u + e-posta onay ekranı + `auth-errors.ts` eşlemesi (290 satır; threadly 260, sahne 172 ve tamamen sahte) |
| `app.config.ts` | **yapı: herhangi biri · içerik: birleşim** | Arayüz üçünde birebir aynı; `integrations` union, `nav` fonksiyona döner (§1.6) |
| `app/globals.css` | **threadly** | En kısa (194 satır) + `prefers-reduced-motion` desteği. `.glow` (sahne) ve `.slide-x` (siraya) eklenir |
| `proxy.ts` | **siraya** | Korumalı yol listesi + `getUser()` (`getSession()` değil) deseni ve gerekçesi (`:26-27`) |
| `lib/supabase/*` | **siraya** | `admin.ts`'i (service-role + tarayıcı koruması) olan tek proje |
| `components/app/data-table.tsx` | **threadly** | Üçünde de ÖLÜ; threadly'ninki en zengin `Column` tipi (money/number/badge/text) |
| `components/app/kpi-card.tsx` | **threadly / sahne** | İkisi aynı, siraya'nınki de aynı; üçünde de ölü. Yeni dashboard kullanacak |
| `components/app/trend-chart.tsx` | **herhangi biri** | Üçü **birebir aynı dosya**; `trendFill` id'si `useId()`'ye çevrilir (§1.8) |
| `components/app/{sidebar,topbar}.tsx` | **siraya** | Tek `user` prop'u alan sürüm; arama/bildirim dekoru üçünden de silinir |
| `videos/*.mp4` (11×3 = 33 dosya) | **HİÇBİRİ** (bkz. §11 S5) | Üçünde de kodda referans yok. ~180MB ölü ağırlık |
| `setup-guide/*.png` (5×3) | **HİÇBİRİ** | GoatStarter kurulum kiti |
| `SETUP.md`, `START-HERE.md`, `MADE-BY.md`, `.claude/commands/setup.md` | **HİÇBİRİ** | Kit dokümanları. `MADE-BY.md` lisans için saklanır ama repoya girmez (§11 S7) |
| `README.md` | **HİÇBİRİ** | siraya'nınki başka bir ürünü anlatıyor (DeskNimbus) |

---

## 8. SIFIRDAN YAZILACAKLAR

Hiçbir projede karşılığı olmayan modüller. Büyüklük tahminleri kaba.

### 8.1 Tekrar önleme + devam zinciri motoru
- **Ne yapacak:** Akış E'nin üç kontrolü; fingerprint üretimi, embedding çağrısı,
  komşu sorgusu, "devam mı" kararı, zincir bağlamının prompt'a enjeksiyonu.
- **Nereye:** `lib/core/dedupe/{fingerprint,similarity,continuation}.ts`
- **Neye bağlı:** `content_items` (fingerprint + embedding kolonları),
  `find_similar_content()`, embedding sağlayıcısı (§11 S3), caption prompt'u.
- **Büyüklük:** ~250 satır + testler. `fingerprint.ts` saf ve tam test edilebilir.
- **Neden yok:** Üç rapor da doğruluyor — sahne'de içerik kavramı bile yok,
  siraya AI kullanmıyor (§9), threadly'nin skeleton prompt'u *"Each post is a
  distinct angle — never the same idea reworded"* diyor ama bu **yalnızca tek
  bir çağrının içinde** geçerli; iki farklı plan arasında hiçbir hafıza yok.

### 8.2 Metrik toplama job'ı
- **Ne yapacak:** Instagram Insights'tan çekip `content_metrics`'e yazmak;
  `channels` sayaçlarını tazelemek; tier/periyot mantığı; retention temizliği.
- **Nereye:** `app/api/cron/metrics/route.ts` + `lib/server/jobs/collect-metrics.ts`
- **Neye bağlı:** `channel_credentials` (token), `content_items.external_post_id`,
  `content_metrics`, `jobs`.
- **Büyüklük:** ~200 satır.
- **Neden yok:** `KESIF_SIRAYA §13` birebir: *"`post_metrics` tablosuna INSERT
  eden hiçbir kod yoktur"*. Tablo, indeks ve tüm türetme fonksiyonları hazır —
  **eksik olan tek şey yazan taraf.**

### 8.3 Metrik → plan geri besleme katmanı
- **Ne yapacak:** Son 30 günde yayınlanmış içeriklerin **en son mevcut**
  ölçümünden üst %20'yi seçip ortak örüntüyü (kind / saat / topic / hook
  kalıbı) bir prompt bloğuna çevirmek.
- **Nereye:** `lib/core/insights/build-feedback.ts`
- **Neye bağlı:** `content_metrics`, `derive-analytics.ts`, `skeleton.ts`.
- **Büyüklük:** ~150 satır, saf fonksiyon (test edilebilir).

**⭐ D1 — okuma kuralı (`final`'e bağlı DEĞİL).** Ürün tanımının 6. maddesi
"bir önceki ayın istatistiği" diyor. `final` 30. güne konduğu için (§4f), son
30 günde yayınlanmış içeriklerin çoğunun `final` satırı **henüz yoktur**;
yalnızca `final` okunursa geri besleme pratikte 30–60 günlük veriye bakar ve
madde 6 karşılanmaz. Kural şu:

```sql
-- İçerik başına EN SON mevcut ölçüm — tier ne olursa olsun
select distinct on (content_item_id)
       content_item_id, tier, collected_at,
       reach, likes, comments, saves, shares, engagement_rate
  from content_metrics
 where brand_id = $1
   and tier <> 'h6'                    -- çok erken, gürültülü → hariç
   and collected_at >= now() - interval '35 days'
 order by content_item_id, collected_at desc;
```

- **`h6` hariç.** İlk 48 saatteki ölçüm henüz oturmamıştır; bir içeriğin 6
  saatlik erişimiyle 20 günlük erişimini aynı torbaya koymak sıralamayı bozar.
- **`tier` güvenilirlik ağırlığı olarak taşınır:** `final` > `d1`. Üst %20
  seçilirken `d1` satırları ağırlıkla (öneri: `final` 1.0, `d1` 0.7)
  değerlendirilir — olgunlaşmış ölçüm, taze ölçümden daha çok söz sahibidir.
  ⚠ Ağırlık değeri **kalibre edilmeli** (§4c eşikleriyle aynı statüde).
- `distinct on` PostgreSQL'e özgüdür ve `(content_item_id, collected_at desc)`
  indeksiyle tek tarama yapar — `content_metrics_item_idx` bunun için var.
- **Neden yok:** Analitikten üretime giden yol hiçbir projede yok. threadly plan
  üretiyor ama metriği yok; siraya metriği türetiyor ama üretimi yok. Ürün
  tanımının 6. maddesi tam olarak bu köprü.

### 8.4 Sahne → yayın medya köprüsü + kalıcı storage
- **Ne yapacak:** Vendor geçici URL → allowlist doğrulama → indirme →
  Storage yükleme → `media_assets` kaydı (§4g).
- **Nereye:** `lib/server/storage.ts`
- **Neye bağlı:** Supabase Storage, `media_assets`, `media_jobs`, SSRF allowlist.
- **Büyüklük:** ~180 satır. `personas.ts`'in güvenlik kontrolleri buraya taşınır.
- **Neden yok:** sahne'nin kalıcı depolaması hiç yok (`KESIF_SAHNE §4`), üretilen
  video geçici URL'de yaşıyor; threadly'nin `plan_posts.image_url` kolonuna
  **hiçbir kod yazmıyor**.

### 8.5 İş kuyruğu
- **Ne yapacak:** `jobs` tablosu üzerinde enqueue / claim (SKIP LOCKED) /
  complete / retry-with-backoff / dead-letter; `sm-worker` sürücüsü.
- **Nereye:** `lib/server/queue.ts` + `app/api/cron/worker/route.ts`
- **Neye bağlı:** `jobs`, `claim_jobs()`, pg_cron.
- **Büyüklük:** ~300 satır + handler kayıt tablosu.
- **Neden yok — üç ayrı kanıt:**
  - threadly `/api/plan` **300sn senkron** (`route.ts:35`) — sekme kapanırsa iş kayıp
  - sahne **client-side `setInterval`** (`studio.tsx:128`) — tarayıcı kapanırsa
    ödenmiş render kayıp
  - siraya cron'unda **idempotency kilidi yok** (`KESIF_SIRAYA §14`) — üst üste
    binen çalışmalar aynı gönderiyi iki kez yayınlayabilir

### 8.6 Auth katmanı (ve müşteri anahtarı yönetimi)
- **Ne yapacak:** `requireUser()` / `requireBrand()` sunucu yardımcıları; `(app)`
  layout'unda guard; **müşterinin kendi API anahtarını** Vault'a yazma/okuma.
- **Nereye:** `lib/server/auth.ts`, `lib/server/credentials.ts`,
  `app/(app)/layout.tsx`
- **Neye bağlı:** Supabase Auth, `provider_credentials`, Vault.
- **Büyüklük:** ~200 satır.
- **Neden yok:**
  - sahne: **12 rotanın 12'sinde auth yok** (`KESIF_SAHNE §7`)
  - threadly: `/api/caption` ve `/api/image` açık (`KESIF_THREADLY §7`); ayrıca
    `app/(app)/layout.tsx` hiç guard yapmıyor — giriş yapmamış biri `/dashboard`'a
    girebiliyor, sadece veri göremiyor
  - Müşteri anahtarı yönetimi üçünde de yok: hepsi env'den okuyor. Ürün tanımı
    ("müşteri kendi anahtarını girer") bunu gerektiriyor — `lib/providers/*`
    dosyalarının `process.env` okumayı bırakıp **apiKey parametresi** alması
    gerekiyor. threadly bunu zaten doğru yapıyor (`skeleton.ts` apiKey'i
    parametre olarak alıyor); sahne yapmıyor (`kie.ts:51` env okuyor).

### 8.7 Rate limit
- **Ne yapacak:** `rate_limit_hit(bucket, limit, window)` sarmalayıcı + rota
  middleware'i; 429 + `Retry-After`.
- **Nereye:** `lib/server/rate-limit.ts`
- **Neye bağlı:** `rate_limit_counters`, `rate_limit_hit()`.
- **Büyüklük:** ~80 satır.
- **Neden gerekli:** Müşteri kendi anahtarını kullanıyor — açık bir endpoint
  **müşterinin** faturasını şişirir, bizimkini değil. Bu, auth'tan bağımsız bir
  kontrol: giriş yapmış bir kullanıcı da döngüde plan üretebilir.
- **Başlangıç limitleri (⚠ kalibre edilmeli):** plan üretimi 10/saat/marka,
  caption 100/saat/marka, görsel 50/saat/marka, UGC video 20/gün/marka.

### 8.8 Instagram dışı platform yayıncıları
- **Ne yapacak:** `PublisherPort` arayüzü + X / LinkedIn / TikTok implementasyonları.
- **Nereye:** `lib/providers/{x,linkedin,tiktok}/`
- **Neye bağlı:** `lib/core/publishing.ts` (`PUBLISHABLE_PLATFORMS` genişler),
  `channel_credentials.refresh_token` (IG kullanmıyor, diğerleri kullanıyor).
- **Büyüklük:** platform başına ~250 satır (OAuth + publish + token yenileme).
- **Neden yok:** `siraya/lib/publishing.ts:8` — `PUBLISHABLE_PLATFORMS =
  ["instagram"]`. Diğer üçü UI'da görünüyor ama **bilinçli olarak**
  yayınlanamaz işaretli. Yorumu doğru sebebi söylüyor: *"scheduling it would be
  a promise the scheduler cannot keep."*
- **Öncelik notu:** Bu, FAZ 2'nin **en sonuna** konmalı. MVP tek platformla
  (Instagram) uçtan uca çalışırsa ürün ispatlanmış olur.

---

## 9. FAZ 1 KAPSAMI — demo veriyle tasarım

### 9.1 Adapter deseni — bayrak nerede, nasıl çalışır

Sıraya'nın `lib/data/index.ts` + `queries.ts` ikilisi bu desenin hazır örneği,
ama **iki eksiği var:**

1. **Bayrak örtük.** Karar `getWorkspace()` null döndü mü diye veriliyor
   (`index.ts:78`: `ws ? liveDashboard(...) : demoDashboard()`). Yani "demo mu
   canlı mı" sorusunun cevabı *"veri var mı"*. FAZ 1'de **giriş yapmış bir
   kullanıcıya bile demo göstermek** gerekiyor — bu yapı bunu yapamaz.
2. **Sessiz düşme riski.** Supabase kesintisinde `getWorkspace()` null döner ve
   ekran, sahte veriyi gerçekmiş gibi gösterir. (`queries.ts:34-38` sorgu hatası
   için fırlatıyor — bu doğru yapılmış — ama oturum yokluğu ile servis yokluğu
   ayırt edilmiyor.)

**Genelleştirilmiş hâli:**

```
lib/adapters/
├── ports.ts        # arayüzler — tek gerçek kaynak
├── index.ts        # fabrika + bayrak çözümü
├── demo/           # her port için demo implementasyonu
│   ├── fixtures/   # üç lib/demo/data.ts'in birleşimi
│   └── *.ts
└── live/           # her port için gerçek implementasyon
```

**Portlar** (her biri bir arayüz, iki implementasyon):

| Port | Sorumluluk | Demo kaynağı | Live kaynağı |
|---|---|---|---|
| `ContentPort` | içerik CRUD + takvim/kuyruk görünümü | fixtures | `content_items` |
| `PlannerPort` | plan iskeleti üretimi | hazır plan JSON | `skeleton.ts` + Anthropic |
| `CopyPort` | caption yazımı | `sampleDrafts` (threadly `data.ts:266`) | `caption.ts` + Anthropic |
| `ImagePort` | görsel üretimi | statik PNG | fal flux |
| `VideoPort` | UGC video boru hattı | hazır mp4 + sahte ilerleme | kie + 11labs + fal |
| `VoicePort` | ses listesi + TTS | sabit ses listesi | ElevenLabs |
| `PublisherPort` | yayın | no-op + "yayınlandı" damgası | Instagram Graph |
| `MetricsPort` | metrik okuma | fixtures (siraya `data.ts:238`) | `content_metrics` |
| `ChannelPort` | kanal bağlama | sahte "bağlı" kanal | Instagram OAuth |
| `BrandPort` | marka profili | örnek marka | `brands` |
| `StoragePort` | dosya kalıcılaştırma | data URL | Supabase Storage |
| `DedupePort` | tekrar kontrolü | her zaman "yeni" | fingerprint + pgvector |

**Bayrak — nerede ve nasıl:**

```ts
// lib/adapters/index.ts  (kavramsal — kod değil)
type Mode = "demo" | "live";

function resolveMode(port: PortName): Mode {
  // 1. Geliştirme çerezi — tek bir portu canlıya almak için (yalnızca dev)
  if (isDev && cookie(`sm:mode:${port}`)) return cookie(...);
  // 2. Port başına env  →  MODE_PLANNER=live
  if (process.env[`MODE_${port.toUpperCase()}`]) return ...;
  // 3. Genel env        →  APP_MODE=demo
  if (process.env.APP_MODE) return ...;
  // 4. Varsayılan: güvenli taraf
  return "demo";
}
```

**Neden bu tasarım:**

- **Port başına bayrak, uygulama başına değil.** FAZ 2 "servisleri tek tek
  bağlıyoruz" diyor. `MODE_PUBLISHER=live` iken `MODE_VIDEO=demo` çalışabilmeli
  — yayın hattı test edilirken pahalı video üretimi kapalı kalsın.
- **Sunucuda çözülür, `NEXT_PUBLIC_` değil.** `NEXT_PUBLIC_*` build zamanında
  inline edilir ve runtime'da değiştirilemez — threadly'nin `hasSupabase` sabiti
  tam olarak bu tuzağa düşmüş (`KESIF_THREADLY §14.3`: *"17 dosya dolaylı olarak
  buna bağlı"*, runtime'da değiştirilemez). Mod sunucu tarafında çözülür ve
  view payload'ında `isDemo: true` olarak istemciye **veri gibi** iner.
- **Varsayılan `demo`.** Bilinmeyen durumda sahte veri göstermek, gerçek para
  harcamaktan iyidir. Bu, siraya'nın örtük davranışının tersi değil, açık hâli.
- **`isDemo` her view'da taşınır.** siraya'nın `DemoBanner`'ı
  (`empty-state.tsx:25`) bu bayrağı gösterir. Kullanıcı hangi modda olduğunu
  ekranda görür — sessiz düşme kapanır.

**⭐ Bayrak yalnızca VERİYİ kapsar — kimliği DEĞİL.** (Adım 7 oturumu,
2026-08-28.)

`APP_MODE=demo` bir sonuç veriyor: ekrandaki sayılar sahte. Bir sonuç
VERMİYOR: "giriş yapmadan gezilebilir". Kimlik doğrulama her modda gerçektir.

Gerekçe iş sırasıyla ilgili. Guard'ı FAZ 1'de gevşetip FAZ 2'de sıkmak,
adım 8-10'da yazılan her sayfayı ikinci kez gözden geçirmek demekti — çünkü
o sayfalar "kullanıcı yok" varsayımıyla yazılmış olurdu. Sekiz ekranın
sekizinde de `requireBrand()`'in döndürdüğü marka kimliği baştan var.

Bunun üç somut karşılığı var:

1. `proxy.ts` siraya'nın *"Supabase yoksa guard'ı tamamen kapat"* satırını
   **taşımaz** (`siraya/proxy.ts:11`). Yapılandırma eksikse korumalı yollar
   yine `/login`'e gider; `/login` orada açık bir yapılandırma hatası gösterir.
2. `components/auth/auth-screen.tsx`'te **demo bypass yoktur**. siraya'nın
   `enterDemo()`'su (`auth-screen.tsx:44-49`) taşınmadı.
3. `lib/supabase/{server,client}.ts` yapılandırma eksikken `null` **dönmez**,
   fırlatır. Sessiz `null`, "kullanıcı giriş yapmamış" ile "Supabase hiç
   yapılandırılmamış" durumlarını tek sonuca indiriyordu — bu bölümün
   *"sessiz düşme"* diye adlandırdığı hatanın kimlik katmanındaki hâli.

**Demo modda kullanıcı ne görür:** gerçek bir hesapla giriş yapar, gerçek bir
`brands` satırı yaratır (`/onboarding`), sonra o markanın altında **sahte**
içerik/metrik/video görür. Sahiplik gerçek, içerik sahte.

**⭐ B2 (adım 9) — `/settings`'in marka profili formu bayrağı hiç OKUMAZ,
`APP_MODE` ne olursa olsun her zaman gerçek `brands` satırına yazar.**

Gerekçe: `brands` satırı zaten gerçek (`/onboarding`'de oluşturuldu), auth
gerçek. `APP_MODE=demo` yalnızca EKRANLARIN GÖSTERDİĞİ içerik/metriği demo
yapar — kullanıcının kendi marka profilini değil. Bunun somut karşılığı:
`/settings` marka formu `port("brand")`/`resolveMode` katmanına HİÇ girmiyor;
`app/(app)/settings/actions.ts` `/onboarding`'in `createBrandAction`'ıyla aynı
desende, oturum sahibinin kendi `createClient()`'ıyla (RLS altında,
service-role DEĞİL) doğrudan `brands` tablosuna yazıyor. `BrandPort.demo/live`
(ports.ts) ayrı bir amaca hizmet ediyor — FAZ 2'de `PlannerPort`/`CopyPort`'un
girdisi olarak marka profilini okuyacak yol, ki o okuma da modu izlemeli
(demo modda plan üretimi zaten kapalı — §12 adım 9 C5). Yani iki farklı soru:
"kullanıcı kendi profilini düzenliyor mu" (her zaman gerçek) ile "AI planı
üretirken hangi markayı okuyor" (moda bağlı) — birbirine karıştırılmadı.

**⭐ İçerik dili (adım 10 A1) — arayüz dili ile içerik dili iki ayrı şeydir.**
`brands.content_language` (`timezone`'un tam yanında, varsayılan `'tr'`)
müşterinin panoyu hangi dilde kullandığını değil, AI'ın hangi dilde içerik
üreteceğini tutar — bir kullanıcı arayüzü İngilizce açıp Türkçe içerik
üretmek isteyebilir. **Adım 14** `PlannerPort.live`/`CopyPort.live`'ı
yazarken bu alanı okuyacak; `useLang()`'ın `localStorage` tabanlı arayüz
tercihini (`sm:lang`) DEĞİL — SSR o tercihi zaten bilemiyordu, bu yüzden
soru başta yanlış kurulmuştu. `toPromptBlock()` bu alanı ikinci, opsiyonel
bir parametre olarak taşır (`lib/core/brand/types.ts`).

### 9.2 FAZ 1 ekran tablosu

| Ekran | Demo kaynağı | Adapter arayüzü | FAZ 2'de bağlanacak servis |
|---|---|---|---|
| `/dashboard` (takvim + ısı haritası) | `siraya/lib/demo/data.ts:80-131` (monthCells), `:178-194` (heatmap) | `ContentPort` + `MetricsPort` | Supabase `content_items` + `content_metrics` |
| `/plan` (plan üretici) | hazır plan JSON (7 ve 30 günlük iki örnek) | `PlannerPort` | Anthropic `claude-opus-5` (müşterinin anahtarı) |
| `/plan` → caption yazma | `threadly/lib/demo/data.ts:266-281` `sampleDrafts` | `CopyPort` | Anthropic |
| `/queue` (kuyruk + onay) | `siraya/lib/demo/data.ts` queue dizisi | `ContentPort` | Supabase + `jobs` |
| `/studio` (UGC üretimi) | `sahne/videos/*.mp4`'ten 2-3 örnek + sahte adım ilerlemesi | `VideoPort` + `VoicePort` | Kie (OmniHuman/Kling) + ElevenLabs + fal |
| `/studio/personas` | `sahne/public/personas/*.png` (10 gerçek PNG) + `personas.json` | `VideoPort` | Kie Nano Banana + `personas` tablosu |
| `/library` | `threadly/lib/demo/data.ts:135-148` `assets` | `StoragePort` | `media_assets` + Supabase Storage |
| `/channels` | `siraya/lib/demo/data.ts` channels dizisi, biri "bağlı" | `ChannelPort` | Instagram OAuth |
| `/analytics` | `siraya/lib/demo/data.ts:238` reach14d, `:259-276` topPosts | `MetricsPort` | `content_metrics` (§8.2'nin çıktısı) |
| `/settings` → marka | örnek marka profili (dolu) | `BrandPort` | `brands` |
| `/settings` → API anahtarları | sahte "bağlı" rozetleri | — (FAZ 2'de doğrudan) | `provider_credentials` + Vault |
| `/composer` | `sampleDrafts` | `CopyPort` + `ImagePort` | Anthropic + fal |
| `/login`, `/signup` | Supabase yoksa bypass (mevcut davranış) | — | Supabase Auth |

**FAZ 1'in kabul kriteri:** `APP_MODE=demo` ile tüm ekranlar gezilebilir, hiçbir
dış servis çağrılmaz, hiçbir kuruş harcanmaz, her ekranda `DemoBanner` görünür.

**⭐ D4 — bu tablo FAZ 1'in tam kapsamıdır, kritik yol değil.** §12'de kritik
yol dört ekrana daraltıldı: `/plan`, `/studio`, `/queue`, `/analytics`
(+ `/dashboard` ve `/settings`'in marka formu). Yukarıdaki tablonun kalan
satırları — `/library`, `/composer`, `/channels`, `/settings` → API anahtarları
— §12 adım **11b**'ye taşındı. Tasarımları burada tanımlı kalır; yalnızca
**sıraları** değişti.

**FAZ 1'de demo verinin nereden geleceği:** Üç `lib/demo/data.ts` dosyası
(225 + 275 + 282 = 782 satır) `lib/adapters/demo/fixtures/` altında birleşir.
Kritik ayrım — **tipler demo dosyasından çıkarılır**: siraya'da 13 dosya tipleri
`lib/demo/data.ts`'ten import ediyor (`KESIF_SIRAYA §14.3`), yani demo verisi
silinemez hâle gelmiş. Tipler `lib/core/types.ts`'e taşınır, fixtures yalnızca
veri olur.

---

## 10. GÜVENLİK KAPANIŞ LİSTESİ

| # | Bulgu | Kaynak | Öncelik | Çözüm |
|---|---|---|---|---|
| 1 | **SSRF** — `videoUrl`/`audioUrl` client'tan gelip fal'a veriliyor | `sahne/app/api/persona/lipsync/route.ts:43-49` | **KRİTİK** | Aşağıda ⬇ |
| 2 | **12 rotanın 12'sinde auth yok** | `KESIF_SAHNE §7` | **KRİTİK** | `requireUser()` + `requireBrand()`; `(app)` layout guard'ı |
| 3 | `/api/caption` ve `/api/image` auth'suz | `KESIF_THREADLY §7` | **KRİTİK** | Aynı + rate limit |
| 4 | `app/(app)/layout.tsx` guard yapmıyor — giriş yapmamış kullanıcı dashboard'a girebiliyor | `KESIF_THREADLY §11` | **YÜKSEK** | Layout'ta `requireUser()`; siraya'nın `proxy.ts` kapısı da katılır |
| 5 | **Rate limit hiç yok** — müşterinin faturası şişer | üç projede de | **YÜKSEK** | §8.7 |
| 6 | **Cron idempotency kilidi yok** — çifte yayın riski | `KESIF_SIRAYA §14` | **YÜKSEK** | `publishing` durumu + koşullu UPDATE (§4a, Akış C) |
| 7 | **Kalıcı depolama yok** — üretilen video geçici URL'de | `KESIF_SAHNE §4` | **YÜKSEK** | §4g köprüsü |
| 8 | `public/personas/` yazımı — Vercel'de dosya sistemi salt-okunur | `KESIF_SAHNE §8.5` | **YÜKSEK** | `personas` tablosu + Storage |
| 9 | **Token'lar tarayıcıya sızabilir mi?** | — | — | **Zaten çözülmüş** — siraya'nın "RLS açık + sıfır politika" deseni korunur (§5) |
| 10 | Müşteri API anahtarları env'de, müşteri başına ayrılmamış | ürün tanımı | **YÜKSEK** | `provider_credentials` + Vault; tablo da politikasız |
| 11 | Service-role kullanımı RLS'i baypas eder — "tek kaçak her şeyi açar" | `KESIF_THREADLY §11` | **ORTA** | Service-role yalnızca 3 yerde: cron, OAuth callback, credential okuma. Kod incelemesinde bu kural denetlenir |
| 12 | `.env.local` dosyaları gerçek anahtarlarla dolu | üçünde de | **ORTA** | Birleşik projeye **dosya taşınmaz**, sadece anahtar isimleri. Taşıma sırasında açığa çıkan anahtarlar **rotasyona girmeli** |
| 13 | `supabase/004-cron.sql:29` prod URL'yi hardcode ediyor | `KESIF_SIRAYA §14` | **DÜŞÜK** | `__APP_URL__` placeholder'ı (`00_schema.sql` §10) |
| 14 | Token yenileme job'ı yok — hiç yayın yapmayan kanalın token'ı 60 günde ölür | `KESIF_SIRAYA §12` | **ORTA** | `sm-token-refresh` cron job'ı |
| 15 | Test yok, CI yok | üçünde de | **ORTA** | §12 Adım 3 |
| 16 | Demo bypass üretimde açık kalabilir | `KESIF_THREADLY §13` | **ORTA** | FAZ 2'de `auth-screen.tsx` bypass'ı kaldırılır; `APP_MODE=live` iken bypass derlenmez |

### Bulgu 1 — SSRF çözümü (koddaki `TODO(ssrf)`'ten taşındı)

`sahne/app/api/persona/lipsync/route.ts:43-49` yorumu sorunu **ve çözümü**
yazmış. Doğrulandı, birebir:

> `TODO(ssrf)`: both URLs arrive from the client. They are *meant* to be the
> pipeline's own outputs — the Kling task's video and the ElevenLabs task's mp3
> — and this route should eventually take those two task ids and read the URLs
> back off recordInfo, the way `/api/persona/image` PUT already does. Until then
> https is the only guarantee.

**Uygulama:** Rota artık `videoUrl` / `audioUrl` **kabul etmez**. Bunun yerine
`videoJobId` / `audioJobId` alır ve URL'leri `media_jobs` satırından okur:

```
POST /api/studio/persona/lipsync
  girdi : { videoJobId, audioJobId }          ← client'tan gelen tek şey: kendi job'ının id'si
  1. media_jobs'tan iki satırı oku
  2. owns_brand(brand_id) doğrula             ← başkasının job'ı okunamaz
  3. state='succeeded' mi kontrol et
  4. output_url'leri oradan al                ← client hiç URL göndermiyor
  5. fal'a ver
```

Bu, `/api/persona/image` PUT'un zaten yaptığı desenin aynısı
(`personas.ts:56-58`: *imageUrl client'tan değil recordInfo'dan gelmeli*).

**İkinci kat — allowlist.** `lib/server/storage.ts` sunucu tarafında dosya
indirirken (§4g), host allowlist'i uygulanır:

```
izinli: kieai.redpandaai.co · *.fal.media · api.elevenlabs.io
+ https zorunlu · yönlendirme takibi kapalı · özel IP aralıkları reddedilir
+ Content-Type beklenenle eşleşmeli · boyut sınırı (görsel 25MB, video 100MB)
```

Bu ikinci kat gerekli çünkü §4g akışında **biz** indiriyoruz — sahne'nin
bugünkü durumunda (URL'i fal'a verip geçiyor) blast radius fal'ın fetcher'ıydı,
köprüden sonra bizim sunucumuz olur.

### ffmpeg kararı (bulgu değil, dağıtım riski)

`sahne/lib/server/audio.ts` lokal `ffmpeg` binary'sine bağlı; Vercel'de yok.
Bugün hata sessizce yutuluyor ve ham ses yükleniyor
(`app/api/persona/voice/route.ts:119-130`).

**Karar: FAZ 1 ve FAZ 2 MVP'sinde telefon efekti KAPALI.** Gerekçe: sessiz
atlanma zaten bugünkü davranış, yani üründe hiç çalışmamış bir özellik; MVP'yi
bir binary bağımlılığı için bloke etmek yanlış. Kod taşınır ama
`PERSONA_PHONE_EFFECT` varsayılan `false` olur ve **sessiz yutma kaldırılır** —
efekt istendiği hâlde çalışmıyorsa log'a düşer. Etkiyi geri getirmek için sonraki
seçenek fal.ai'nin bir ses işleme modeli (ek binary yok).

---

## 11. KARARLAR — kapatıldı (D5)

> **Durum:** S1–S6 **KARAR VERİLDİ**. S7 bilinçli olarak **AÇIK** bırakıldı —
> teknik değil ticari bir risk, kod yazımını bloklamıyor.

### S1. Ürünün adı, markası ve rengi — ✅ KARAR VERİLDİ

**Karar: yeni isim kullanılacak. İsim henüz kesin değil → geçici değerler
tek yerden değiştirilebilir şekilde kurulacak.**

Geçici değerler:

| Ne | Geçici değer | Nerede |
|---|---|---|
| Paket adı | `social-suite` | `package.json` `"name"` |
| Cron job ön eki | `sm-` | `00_schema.sql` §10 (`sm-worker`, `sm-publish`, …) |
| localStorage ön eki | `sm:` | `sm:lang`, `sm:mode:<port>`, `sm:ig_oauth_state` |
| Marka rengi | threadly'nin **token yapısı**, **hue DEĞİŞTİRİLECEK** | `app/globals.css` |
| Görünen ad | `app.config.ts` içinde tek sabit | `app.config.ts` |

**Zorunlu kural — tek değiştirme noktası:** ürün adı ve marka hue'su
`app.config.ts` içinde **tek bir yerde** tanımlanır ve o satırlar **yorumla
işaretlenir** (`// ⭐ TEK DEĞİŞTİRME NOKTASI — isim kesinleşince burayı değiştir`).
`globals.css`'teki hue de aynı yorumu taşır. İsim kesinleştiğinde değişecek
dosya sayısı ikiyi geçmemeli.

**Hue neden değişiyor:** threadly'nin token *yapısı* (`--color-primary`,
`--grad-brand`, `--grad-hero`, `--grad-tile-1..4`) alınıyor çünkü en kısa ve
`prefers-reduced-motion` desteği olan o (§1.7). Ama hue 290 (mor) threadly'nin
markasıdır; yeni ürün kendi hue'sunu alacak. Yapı kalır, sayı değişir.

### S2. `organizations` katmanı ne zaman? — ✅ KARAR VERİLDİ

**Karar: ERTELENDİ. §4e'nin B seçeneği uygulanır.**

- `brands.user_id UNIQUE` **kaldırılır**, kolon `owner_id` olur.
- `brands.org_id` nullable olarak **şimdiden açılır**, kullanılmaz.
- **`owns_brand(uuid)` fonksiyonu ŞART.** Tüm çocuk tabloların RLS'i istisnasız
  bu fonksiyona bağlanır — `auth.uid() = user_id` deseni hiçbir çocuk tabloda
  kullanılmaz. Organizasyon katmanı geldiğinde değişecek tek şey bu fonksiyonun
  **gövdesi** olur; 12 politikanın hiçbiri değişmez.
- Tetikleyici: ilk kurumsal müşteri "3 kişi aynı hesaba girsin" derse öne alınır.

### S3. Embedding sağlayıcısı — ⚠ AÇIK (adım 15'te yeniden açıldı)

**Sağlayıcı seçilene kadar AÇIK. Kolon sözleşmesi sabit: `vector(1024)`
(bkz. D3) — bu, sağlayıcı kararından BAĞIMSIZ ve DEĞİŞMEDİ.**

Önceki oturum (adım 0-2) bunu "Voyage AI, `voyage-3.5`, `output_dimension=1024`"
olarak kapatmıştı. Adım 15'te şu gerçek ortaya çıktı: **hiçbir markada
`VOYAGE_API_KEY`/Vault satırı YOK** ve bu geçici bir eksiklik değil, BYOK
modelinin kalıcı bir sonucu olabilir (her müşteri beşinci anahtarı
girmeyecek). "⚠ DOĞRULANMALI" maddesi (aşağıda, değişmeden bırakıldı) hiçbir
oturumda fiilen teyit edilmedi — model adı/`output_dimension` bir canlı
çağrıya karşı hiç doğrulanmadı. Adım 15 bu yüzden sağlayıcıya özgü HİÇBİR kod
YAZMADI ve motoru sağlayıcı OLMADAN da çalışacak şekilde tasarladı (bkz.
`docs/ADIM_15_RAPOR.md` §1-2, "zarif düşüş" — Katman 2/3 sağlayıcı yoksa
atlanır, Katman 1/3'ün elle-işaretleme yolu her zaman çalışır).

- **Sağlayıcı seçimi ERTELENDİ.** Voyage hâlâ ilk aday (çok dilli, Anthropic'in
  önerdiği yol) ama bu, `output_dimension` desteğinin güncel dokümantasyondan
  teyit edilmesini BEKLİYOR — bir sonraki oturumun işi.
- **Kolon artık karara bağlı değil (DEĞİŞMEDİ).** `vector(1024)` sabittir,
  `EmbeddingPort` implementasyonu — Voyage, OpenAI, ya da başka biri — **tam
  1024 boyut döndürmek zorundadır.** Sağlayıcı değişimi artık şema değişimi
  değildir.
- **Müşteri sürtünmesi kararı DEĞİŞMEDİ:** bu, müşterinin dördüncü/beşinci API
  anahtarı. Azaltma yolu FAZ 3'e bırakıldı.
- **⚠ DOĞRULANMALI (D3) — HÂLÂ AÇIK:** Voyage ve OpenAI'ın güncel
  dokümantasyonundan **çıktı boyutu kısaltma desteği** teyit edilmeli
  (`output_dimension` / `dimensions` parametreleri). Adım 15'te YAPILMADI
  (anahtar yok, doğrulanamadı) — sağlayıcı seçilip gerçek bir anahtar
  girildiğinde yapılmalı. Teyit edilemeyen sağlayıcı elenir; kolon değişmez.

### S4. FAZ 2'de ilk bağlanacak servis hangisi? — ✅ KARAR VERİLDİ

**Karar: ilk canlı servis Anthropic. Meta tester akışı paralel yürüyecek.**

Sıra (§12 adım 14 → 16 → 17 → 20):
1. **Anthropic** (plan + caption) — en ucuz, en hızlı geri bildirim, çıktısı
   sonraki her şeyin girdisi. Adapter deseninin gerçek testi burada verilir.
2. **Instagram bağlama** → 3. **yayın** — uçtan uca "plan → yayın" ispatı.
3. **Kie / ElevenLabs / fal UGC** en sona — en pahalı ve en uzun süren.

**Paralel yürüyen, kod bloklamayan iş:** Meta tarafı. MVP'de **tek Meta
uygulaması** kullanılacak ve müşteriler o uygulamaya **tester** olarak
eklenecek (Meta limiti ~25 tester). **App Review başvurusu bununla paralel
yürütülecek** — onay süresi belirsiz olduğu için kritik yola konmuyor. D2'nin
marka bazlı `provider_credentials` kararı tam da bunun için: App Review çıkınca
ya da bir müşteri kendi uygulamasını getirince şema değişmeyecek.

⚠ **Kapasite sınırı:** ~25 tester, MVP'de bağlanabilecek müşteri sayısının üst
sınırıdır. 25'e yaklaşıldığında App Review artık kritik yola girer.

### S5. `videos/*.mp4` dosyaları (üç projede 33 dosya, ~180MB) — ✅ KARAR VERİLDİ

**Karar: 2 demo videosu alınacak — ama ÖNCE içerik kontrolü yapılacak.**

Şartlı karar:

- Üç projedeki `videos/*.mp4` dosyalarının içeriği incelenecek (dosya boyutu,
  süre, varsa metadata).
- **UGC örneğiyseler:** 2 tanesi `public/demo/` altına alınır, `/studio`
  demo modda gerçek video oynatır.
- **GoatStarter stok videosuysalar:** **alınmayacak.** Yerine placeholder
  (statik 9:16 poster + "demo çıktı" rozeti) konur. Gerekçe: stok pazarlama
  videosu UGC stüdyosunun ne ürettiğini yanlış anlatır — demoyu güçlendirmez,
  yanıltır.
- Bu kontrol **FAZ 1'de** yapılır ve sonucu raporlanır (bkz. `ADIM_012_RAPOR.md`).

### S6. Demo bypass üretimde kalsın mı? — ✅ KARAR VERİLDİ

**Karar: korunur, ama sertleştirilmiş şartla.**

Bypass yalnızca şu iki koşul **birlikte** sağlandığında derlenir:

```
APP_MODE === "demo"  &&  NODE_ENV !== "production"
```

- Koşul **derleme zamanında** ölü kod eleme (dead-code elimination) ile
  çözülmeli — üretim build'inde bypass kodu **bundle'ın içinde bile olmamalı**.
  Doğrulama: üretim build çıktısında bypass'a ait string aranır, bulunmamalı.
- `APP_MODE`'un tek başına yeterli olmaması bilinçli: `APP_MODE=demo`
  yanlışlıkla üretimde kalırsa (en olası kaza) `NODE_ENV=production` ikinci
  kapıyı kapatır.
- §10 bulgu 16'nın kapanışı budur.

### S7. GoatStarter lisansı — ⚠ AÇIK (bilinçli)

**Durum: AÇIK. DOA'dan yazılı teyit alınacak. Kod yazımını BLOKLAMIYOR.**

- Üç repoda da `LICENSE` yok; sahiplik `MADE-BY.md:25`
  (© DOA · GoatStarter · Burhan Kocabıyık & Esad Kılıç).
- Kendi ürününde kullanım muhtemelen serbest (kit bu amaçla satılıyor);
  **yeniden satış / türev ürün dağıtımı belirsiz.** Bu ürün B2B lisans
  satacağı için tam da belirsiz alana giriyor.
- **Aksiyon:** DOA'dan **yazılı** teyit alınacak (e-posta yeterli).
- **Neden bloklamıyor:** bu teknik değil ticari bir risk. Kod yazımı, şema ve
  FAZ 1 demo bundan bağımsız ilerler. Teyit, ürün **satışa çıkmadan** önce
  gerekir — kod yazılmadan önce değil.
- Bu hukuki tavsiye değildir; kitin şartlarına bakılması gerektiğinin tespitidir.

---

## 12. UYGULAMA SIRASI

Her adım tek oturumda bitecek büyüklükte. Çıktı ve "tamamlandı" kriteri yazılı.

| # | Adım | Çıktı | "Tamamlandı" kriteri |
|---|---|---|---|
| **0** | **§11'deki S1, S3, S4 kararları** | Ad + renk + embedding sağlayıcı + FAZ 2 sırası | Bu dosyanın §11'i cevaplarla güncellenmiş |
| **1** | **İskelet kurulum** — boş Next 16 projesi, birleşik `package.json`, tek `globals.css`, tek `app.config.ts`, `components/ui/*` (§7.4 kararlarıyla) | Ayağa kalkan boş kabuk | `npm run build` 0 hata; `/` boş sayfa render eder; `npx tsc --noEmit` temiz |
| **2** | **Şema kurulumu** — `00_schema.sql` Supabase'e uygulanır, `__APP_URL__`/`__CRON_SECRET__` doldurulur | Canlı veritabanı | Tüm tablolar mevcut; `select * from pg_policies where schemaname='public'` beklenen politikaları gösterir; `channel_credentials` ve `provider_credentials` **sıfır** politikayla listelenir |
| **3** | **Test altyapısı** — vitest kurulumu, ilk testler `lib/core/plan/template.ts` (saf, sıfır bağımlılık) üzerinde | Çalışan test koşucusu | `npm test` yeşil; `template.ts` %100 kapsam |
| **4** | **`lib/core/` taşıması** — §7.1'deki OLDUĞU GİBİ ve KÜÇÜK UYARLAMA dosyaları; hiçbiri Next'e/DB'ye bağlanmadan | Saf iş mantığı katmanı | `tsc --noEmit` temiz; `lib/core/**` içinde `next/`, `@supabase/`, `process.env` grep'i **sıfır sonuç** |
| **5** | **Adapter iskeleti** — `ports.ts` (12 arayüz), `index.ts` fabrikası, boş `demo/` ve `live/` | Derlenen ama boş adapter katmanı | Her portun iki implementasyonu da tip olarak var; `resolveMode()` testleri yeşil |
| **6** | **Demo fixtures** — üç `lib/demo/data.ts` birleşir, **tipler ayrıştırılır** | `lib/adapters/demo/fixtures/*` | `fixtures/` içinde hiçbir tip tanımı yok, hepsi `lib/core/types.ts`'te; demo adapter'lar 12 portu da dolduruyor |
| **7** | **Auth + kabuk** — Supabase client'ları, `proxy.ts`, `(app)/layout.tsx` guard'ı, sidebar/topbar, `requireUser`/`requireBrand` | Giriş yapılabilen uygulama | Oturumsuz `/dashboard` → `/login`; oturumlu `/login` → `/dashboard`; `(app)` altındaki her sayfa guard'lı |
| **8** | **FAZ 1 ekranları — grup A:** `/dashboard`, `/queue`, `/analytics` (siraya'dan) | 3 ekran demo veriyle | Üçü de `APP_MODE=demo` ile render; `DemoBanner` görünür; sıfır ağ isteği (DevTools ile doğrulanır) |
| **9** | **FAZ 1 ekranları — grup B:** `/plan` (threadly) + `/settings` → **yalnızca marka profili formu** | 2 ekran demo veriyle | Aynı kriter; marka formu demo profilini gösterir ve kaydeder. `/settings`'in entegrasyon rozetleri ve API anahtarı bölümü **bu adımda YOK** (11b / adım 13) |
| **10** | **FAZ 1 ekranları — grup C:** `/studio`, `/studio/personas` (sahne'den) | 2 ekran demo veriyle | Aynı kriter; S5 kararına göre demo video oynar veya placeholder gösterir |
| **11** | **FAZ 1 KAPANIŞI — satılabilir demo** | Dört kritik ekran + kabuk, uçtan uca gezilebilir | `/plan` → `/studio` → `/queue` → `/analytics` akışı `APP_MODE=demo` ile kesintisiz gezilir; `/dashboard` ve marka formu çalışır; hiçbir dış servis çağrılmaz; hiçbir kuruş harcanmaz; `npm run build` temiz |
| **11b** | **ERTELENEN EKRANLAR** (D4) — `/library`, `/composer`, `/channels`, `/settings`'in entegrasyon + anahtar bölümleri | 4 ekran demo veriyle | Aynı FAZ 1 kriteri. Kritik yolda **değil**; adım 12+ ile paralel yürütülebilir |
| **12** | **İş kuyruğu** — `lib/server/queue.ts`, `claim_jobs()` sarmalayıcısı, `sm-worker` rotası, handler kayıt tablosu | Çalışan kuyruk | Sahte bir job kuyruğa girer, worker alır, tamamlar; iki eşzamanlı worker **aynı satırı almaz** (test) |
| **13** | **Rate limit + credentials** — `rate-limit.ts`, `credentials.ts` (Vault okuma/yazma), `/settings` API anahtarı bölümü | Müşteri anahtarı girebiliyor | Anahtar Vault'a yazılır, `provider_credentials` satırı oluşur, tarayıcıdan **okunamadığı doğrulanır** (anon key ile `select` boş döner) |
| **14** | **LIVE #1 — Anthropic** (S4 önerisi) — `PlannerPort.live` + `CopyPort.live`, `/api/ai/plan` kuyruğa bağlanır | Gerçek plan üretimi | `MODE_PLANNER=live` ile gerçek plan `content_items`'a yazılır; diğer portlar demo kalır; sekme kapatılıp açıldığında iş devam eder |
| **15** | **Tekrar önleme motoru** — fingerprint + embedding + Akış E | Tekrar kontrolü çalışıyor | Aynı tema iki kez planlanır; ikinci seferde `duplicate_blocked` aktiviteleri yazılır; bir "devam" içeriği `parent_id` ile oluşur |
| **16** | **LIVE #2 — Instagram bağlama** — `ChannelPort.live`, OAuth connect/callback, `channel_credentials` | Kanal bağlanabiliyor | Gerçek IG hesabı bağlanır; token yazılır; **tarayıcıdan okunamadığı doğrulanır** |
| **17** | **LIVE #3 — yayın** — `PublisherPort.live`, `sm-publish` + `publishing` kilidi + `sm-reaper` | Gerçek yayın | Zamanlanan bir gönderi otomatik yayınlanır; iki eşzamanlı cron çalışmasında **tek** yayın olur (test) |
| **18** | **Metrik toplama + geri besleme** — §8.2 + §8.3 | Analitik dolu | `content_metrics` satırları birikir; `/analytics` boş değil; bir sonraki plan `insight_snapshot` ile üretilir |
| **19** | **Medya köprüsü + storage** — `lib/server/storage.ts`, allowlist, `media_assets` | Kalıcı medya | fal/kie çıktısı Storage'a iner; `public_url` yayınlanabilir; **SSRF allowlist testi** yeşil |
| **20** | **LIVE #4 — UGC boru hattı** — `VideoPort.live` + `VoicePort.live`, 5 adım kuyruğa bağlanır, SSRF düzeltmesi | Gerçek UGC videosu | Bir içerik seçilir, video üretilir, Storage'a iner, `needs_review`'a düşer; tarayıcı kapatılsa da iş biter |
| **21** | **Güvenlik kapanışı** — §10'un 16 maddesinin denetimi | Denetim raporu | Her madde ya kapalı ya da gerekçeli erteleme; `security-reviewer` incelemesi CRITICAL/HIGH içermiyor |
| **22** | **Diğer platformlar** (§8.8) | X / LinkedIn / TikTok | Her biri ayrı oturum; `PUBLISHABLE_PLATFORMS` genişler |

**Kritik yol (D4 ile daraltıldı):**
`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → (8, 9, 10 paralel) → 11 → 12 → 14`

Adım 11'de **satılabilir bir demo**, adım 17'de uçtan uca çalışan bir ürün var.

**Neden daraltıldı.** Önceki hâlinde adım 8-10 **on ekranı** kapsıyordu ve
hepsi adım 11'in kabul kriterine giriyordu. Satılabilir bir demo için gereken
ekran sayısı on değil, **dört**:

| Ekran | Demoda ne kanıtlıyor |
|---|---|
| `/plan` | Ürünün beyni — AI plan üretiyor |
| `/studio` | Ürünün farkı — UGC videosu üretiliyor |
| `/queue` | Ürünün kontrolü — insan onaylıyor |
| `/analytics` | Ürünün döngüsü — sonuç ölçülüyor ve plana geri dönüyor |

Bu dördü ürün tanımının tamamını anlatır: *plan → üret → onayla → yayınla →
ölç → tekrar planla.* `/dashboard` (takvim) kabuğun iniş ekranı olduğu için
adım 8'de kalır; `/settings`'in **marka profili formu** `/plan`'ın girdisi
olduğu için adım 9'da kalır.

**11b'ye ertelenenler ve neden kritik yolda olmadıkları:**

| Ekran | Neden ertelendi |
|---|---|
| `/library` | `media_assets` görünümü. `/studio` zaten çıktıyı gösteriyor; kütüphane ikinci bir görünüm |
| `/composer` | Elle içerik yazma. `/plan` AI ile aynı işi yapıyor — demoda anlatılan hikâye o |
| `/channels` | Kanal bağlama. Demo modda "bağlı" rozeti gösteren sahte ekran; gerçek değeri adım 16'da (LIVE Instagram) doğuyor |
| `/settings` → entegrasyon + API anahtarı | Anahtar girişinin gerçek karşılığı adım 13'te var. Demo modda sahte rozetten ibaret |

**Numaralandırma notu:** ertelenen ekranlar 12-22'yi kaydırmamak için **11b**
olarak eklendi — dosyanın geri kalanı (§8, §10, D3) adım numaralarına atıf
yapıyor, kaydırma o atıfları kırardı.

**Adım 3 (test) neden 4'ten önce:** `lib/core/` taşınırken uyarlamalar
yapılacak (enum küçük harfe, tip importları koparılacak). Test yoksa bu
uyarlamaların bir şeyi bozduğu ancak adım 8'de fark edilir.

**Adım 4'ün kriterindeki grep neden önemli:** `lib/core/` içinde `process.env`
çıkarsa, o dosya müşterinin anahtarını parametre olarak almıyor demektir —
ürün tanımının "müşteri kendi anahtarını girer" maddesi orada kırılır.

---

## REVİZYON KAYDI

**Revizyon 1 — 2026-08-27 · Adım 0/1/2 oturumu, FAZ 0**

Beş düzeltme uygulandı. Hiçbiri yeni bir mimari karar getirmiyor; dördü mevcut
kararların iç tutarsızlığını kapatıyor, biri (D5) açık kararları cevaplıyor.

| # | Ne | Değişen bölümler |
|---|---|---|
| **D1** | Metrik geri beslemesi artık `tier='final'`'e bağlı değil — içerik başına **en son mevcut** ölçüm okunuyor | §4f, §8.3, Akış D |
| **D2** | Instagram uygulama kimlikleri **marka bazlı** (`provider_credentials`), global env yalnızca **fallback** | §1.12, §4e, §5 (×2), §7.1 |
| **D3** | Embedding boyutu **sözleşmeye** bağlandı: kolon `vector(1024)` SABİT, sağlayıcı uyar | §4c, §11 S3 |
| **D4** | Kritik yol on ekrandan **dört ekrana** daraltıldı; dört ekran **11b**'ye ertelendi | §12 tablosu, "Kritik yol" satırı, §9.2 |
| **D5** | §11'in yedi açık kararı kapatıldı (S1–S6 KARAR VERİLDİ, S7 bilinçli AÇIK) | §11 tamamı |

### D1 — Metrik geri beslemesi `final`'e bağlı kalamaz

**Tutarsızlık:** §4f `tier='final'`'i 30. güne koyuyordu, §8.3 ise geri
beslemenin yalnızca `final` satırlarını okuduğunu söylüyordu. Bu ikisi birlikte,
10 gün önce yayınlanmış içeriğin geri beslemeye **hiç girememesi** demekti —
geri besleme pratikte 30-60 günlük veriye bakardı. Ürün tanımının 6. maddesi
("bir önceki ayın istatistiği") bu tanımla karşılanmıyordu.

**Düzeltme:** okuma `distinct on (content_item_id) ... order by
content_item_id, collected_at desc` oldu. `tier='h6'` hariç tutuldu (ilk 48
saat, gürültülü). `tier` bir **güvenilirlik ağırlığı** olarak taşınıyor
(`final` 1.0 > `d1` 0.7 — ⚠ kalibre edilmeli). §4f'te `final`'in anlamı
netleştirildi: *"artık toplama yapılmaz"*, *"okunabilir tek satır"* değil.
`content_metrics_final_idx` UNIQUE kısıtı **korundu**.

### D2 — Instagram uygulama kimlikleri marka bazlı olmalı

**Tutarsızlık:** §1.12 `INSTAGRAM_APP_ID/SECRET`'ı *"bunlar bizim uygulama
kimliğimiz"* diyerek global env sayıyordu. MVP'de doğru, kalıcı olarak yanlış:
App Review çıktığında veya bir müşteri kendi Meta uygulamasını getirdiğinde
şema migration'ı gerekirdi.

**Düzeltme:** ikisi de `provider_credentials` üzerinden marka bazlı okunuyor
(`provider='instagram'`), global env **fallback**. `lib/providers/instagram/
config.ts` `process.env` okumayı bırakıp parametre alıyor — §8.6'nın Kie için
koyduğu kuralın aynısı. Şema `unique (brand_id, provider)` + `config jsonb`
(gizli olmayan) + `vault_secret_id` (gizli) taşıyor.

**MVP kararı kaydedildi:** tek Meta uygulaması, müşteriler **tester** olarak
ekleniyor (~25 limit), App Review paralel yürüyor.

### D3 — Embedding boyutu sözleşmeye bağlansın, sağlayıcıya değil

**Risk:** §11 S3 sağlayıcı seçimini kolon tipine bağlıyordu ("OpenAI seçilirse
`vector(1536)`"), ve *"sonradan değişirse tüm satırlar yeniden gömülür"*
diyordu.

**Düzeltme:** bağımlılığın yönü çevrildi. Kolon `vector(1024)` **sabit**;
`EmbeddingPort` implementasyonu ne olursa olsun **tam 1024 boyut** döndürmek
zorunda, ve adapter dönen uzunluğu çalışma zamanında doğruluyor. Sağlayıcı
değişimi artık şema değişimi değil, yalnızca backfill.

⚠ **DOĞRULANMALI:** Voyage (`output_dimension`) ve OpenAI (`dimensions`)
parametrelerinin güncel dokümantasyondan teyidi — §12 adım 15'ten önce.
Teyit edilemeyen sağlayıcı **elenir**, kolon değişmez.

### D4 — Kritik yol daraltılsın

**Sorun:** §12 adım 8-10 on ekranı kapsıyordu ve hepsi adım 11'in kabul
kriterine giriyordu. Satılabilir demo için gereken ekran sayısı dört.

**Düzeltme:** kritik yolda kalan dört ekran `/plan`, `/studio`, `/queue`,
`/analytics` (+ `/dashboard` iniş ekranı olduğu için adım 8'de,
`/settings` → **yalnızca marka profili formu** `/plan`'ın girdisi olduğu için
adım 9'da). `/library`, `/composer`, `/channels` ve `/settings`'in entegrasyon
+ API anahtarı bölümleri **11b**'ye taşındı.

**Numaralandırma kararı (varsayım):** ertelenen ekranlar 12-22'yi kaydırmamak
için `11b` olarak eklendi. Gerekçe: §8, §10 ve D3 metinleri adım numaralarına
atıf yapıyor; yeniden numaralandırma o atıfları sessizce kırardı.

### D5 — §11 açık kararları kapatıldı

| Karar | Sonuç |
|---|---|
| **S1** İsim/renk | ✅ Yeni isim. Geçici: paket `social-suite`, cron `sm-`, threadly token yapısı + **değiştirilecek hue**. İsim ve hue `app.config.ts`'te tek yerde, yorumla işaretli |
| **S2** Organizasyon katmanı | ✅ ERTELENDİ (§4e seçenek B). `owns_brand()` **şart** |
| **S3** Embedding | ✅ Voyage ile başlanacak, kolon `vector(1024)` sabit (D3) |
| **S4** İlk canlı servis | ✅ Anthropic. Meta tester akışı paralel |
| **S5** Demo videoları | ✅ 2 video — **şartlı**: önce içerik kontrolü. Stok videoysa alınmaz, placeholder konur |
| **S6** Demo bypass | ✅ Korunur: `APP_MODE=demo && NODE_ENV !== "production"`. Üretim bundle'ında bulunmamalı |
| **S7** GoatStarter lisansı | ⚠ **AÇIK** — DOA'dan yazılı teyit alınacak. Kod yazımını bloklamıyor; satıştan önce gerekir |

**Revizyon 2 — 2026-08-27 · Adım 2.5/3/4 oturumu**

| # | Ne | Değişen bölümler |
|---|---|---|
| **D6** | `next` / `eslint-config-next` **16.2.5 → 16.3.3**; "üç projeyle sürüm eşitliği" kuralı bu iki paket için düşürüldü | §2.1 |

### D6 — Sürüm eşitliği kuralı `next` için düşürüldü

**Kuralın amacı neydi:** §2.1'in "sürümler üç projeyle birebir aynı olmalı"
şartı, birleşme sırasında **sürüm çözümü yapmamak** içindi — üç projeden kod
kopyalanırken API farkı çıkmasın diye. Bu amaç, kopyalama tamamlandığında
sona eriyor.

**Neden düşürüldü:** `next@16.2.5` **10 high-severity açık** taşıyor:

- App Router'da **Middleware / Proxy bypass** (2 ayrı advisory)
- Server Actions'ta SSRF (özel sunucu) · rewrites'ta SSRF
- Yanıt gövdelerinde cache karışması (2 advisory)
- Server Actions DoS · Image Optimization (SVG) DoS
- İç Server Function uç noktalarının **kimliksiz ifşası**
- Edge runtime'da sınırsız Server Action gövdesi

Bunlardan **Middleware / Proxy bypass** belirleyici olan. Bu üründe kimlik
doğrulamasının **tek sınırı** `proxy.ts` (§7.2; siraya'nın korumalı yol listesi
+ `getUser()` deseni). Bypass edilebilen bir proxy, §10'un güvenlik kapanış
listesini ve §5'in RLS stratejisinin önündeki ilk kapıyı birlikte geçersiz
kılar. Ürün auth, **müşteri API anahtarı**, ödeme yapan üçüncü taraf servisleri
ve PII taşıyacak.

**Risk neden düşük:** `lib/core/` saf kalacak (§7.1 + adım 4'ün grep kriteri) —
Next API'sine dokunan tek dosya `proxy.ts` ve API rotaları. Proxy
konvansiyonunda 16.2.5 → 16.3.3 arasında **değişiklik yok**: `proxy.ts` +
`export function proxy(request)` + `export const config = { matcher }` aynen
geçerli, `next/dist/server/web/types.d.ts` (`NextProxy` tipini tanımlayan
dosya) iki sürümde **bayt bayt aynı**. 16.3.3'te eklenenler yalnızca ek:
opsiyonel ikinci `event: NextFetchEvent` parametresinin belgelenmesi ve Node
runtime proxy'sinden önce `instrumentation.ts` kaydı.

**Doğrulama:** `npm audit` → **found 0 vulnerabilities**; `npm run build`,
`npx tsc --noEmit`, `npm run lint` → üçü de exit 0.

**⚠ Not:** `next@16.3.3` Node `^22.22.2 || ^24.15.0 || >=26.0.0` istiyor;
geliştirme makinesi v23.10.0 — `npm` EBADENGINE uyarısı veriyor. Build, tsc ve
lint çalışıyor, ama CI/Vercel Node sürümü bu aralığa sabitlenmeli.

### Bu revizyonda DEĞİŞMEYENLER

Kayıt için: aşağıdaki kararlara dokunulmadı ve hâlâ geçerli.

- §4a tek tablo `content_items` + sekiz durumlu birleşik durum makinesi
- §4b `parent_id` immutable trigger yaklaşımı (seçenek B)
- §4c iki katmanlı tekrar önleme ve `0.92 / 0.82` eşikleri (⚠ hâlâ kalibre edilmemiş)
- §1.2 `text + CHECK` (enum değil), platform değerleri küçük harf
- §1.8 `useId()` tabanlı SVG id benzersizleştirme
- §1.10 tek public `media` bucket'ı, `user_id` başta yol şeması
- §5 "RLS açık + SIFIR politika" deseni (`channel_credentials`,
  `provider_credentials`, `rate_limit_counters`)
- §9.1 port başına mod bayrağı, sunucuda çözülür, varsayılan `demo`

---

**Revizyon 3 — 2026-08-27 · Adım 5/6 oturumu, FAZ B (B4)**

İki düzeltme. İkisi de yeni karar getirmiyor; planın metnini **diskteki
gerçeğe** ve **şemaya** hizalıyor. Plan yetkili kaynaksa, gerçekle ayrışan
her satırı bir sonraki oturum sessizce yanlış uygular.

| # | Ne | Değişen bölümler |
|---|---|---|
| **D7** | §7.1'in hedef yol tablosu adım 4'te uygulanan gerçek yollarla güncellendi (5 grup, 12 satır) | §7.1 |
| **D8** | §1.2 metni 4 platform okunuyordu; şema 5 tanımlıyor (`youtube` dahil). Şema doğru, metin düzeltildi | §1.2 |

### D7 — §7.1 yol tablosu gerçekle ayrışmıştı

**Sorun:** adım 4 dosyaları taşırken beş yerde §7.1'in önerdiği yoldan saptı
(ADIM_34_RAPOR.md "VARSAYIM YAPTIĞIM HER NOKTA" 1. madde bunu kaydetmiş, ama
planı güncellememişti). Sonuç: plan `lib/core/calendar/tz.ts` diyordu, diskte
`lib/core/tz.ts` vardı. Bir sonraki oturumun bu tabloya bakıp var olmayan bir
yola dosya yazması an meselesiydi.

**Düzeltme:** tablo gerçeğe göre yeniden yazıldı ve altına gerekçeli bir
karşılaştırma eklendi. Değişen beş grup:

| Planın eski yolu | Gerçek yol |
|---|---|
| `lib/core/calendar/tz.ts` | `lib/core/tz.ts` |
| `lib/core/calendar/derive-{calendar,analytics}.ts` | `lib/core/derive/{calendar,analytics}.ts` |
| `lib/core/caption/caption.ts`, `lib/core/contracts{,-client}.ts` | `lib/core/ai/{caption,types,client}.ts` |
| `lib/core/caption/prompt.ts` | `lib/core/ai/prompt.ts` |
| `lib/providers/{kie,elevenlabs,fal,audio,instagram/*}` | `lib/core/providers/*` |

Sonuncusu yalnızca bir isim tercihi değil: sağlayıcı sarmalayıcıları adım 4'te
`process.env` okumayı bıraktığı için **saf**lar, ve `lib/core/` altında
oldukları için §12 adım 4'ün saflık grep'i onları da denetliyor. `lib/providers/`
dizini ve README'si duruyor — FAZ 2'de saf olmayan sağlayıcı kodu (ör. Instagram
OAuth yönlendirmesi) doğarsa hedefi orası.

### D8 — §1.2 dört platform diyordu, şema beş tanımlıyor

**Sorun:** §1.2'nin gerekçe paragrafı *"`platform`'a youtube/tiktok yayıncısı
eklenecek (§8.8)"* diyordu; bu cümle platform listesini dört değer olarak
okutuyordu. Şema ise iki tabloda da beş değer yazıyor
(`00_schema.sql:219-220`, `:369-370`).

**Hangisi doğru: şema.** `lib/core/types.ts`'in `PLATFORMS` union'ı adım 4'te
zaten şemaya göre yazılmıştı (ADIM_34_RAPOR.md "ENUM KÜÇÜK HARF DÖNÜŞÜMÜ"
4. madde). TS union'ı ile CHECK listesi ayrışsaydı sonuç sessiz bir
`constraint violation` olurdu — kod tarafı geçerli sayardı, DB reddederdi.

**Düzeltme:** §1.2 tablosunun KARAR hücresi beş değeri açıkça sayıyor, gerekçe
paragrafı düzeltildi. Ayrıca metin artık iki listeyi ayırıyor:

- **`platform` CHECK listesi (5)** — bir içeriğin hangi platform için
  *planlanabileceği*. `tiktok` ve `youtube` bugün de geçerli.
- **`PUBLISHABLE_PLATFORMS` (1)** — hangisine *yayın yapılabileceği*.
  `lib/core/publishing.ts`, bugün yalnızca `instagram`.

§8.8'in genişlettiği liste **ikincisidir**, CHECK değil.

### Bu revizyonda DEĞİŞMEYENLER

- D1-D6'nın tamamı geçerli.
- §9.1 adapter deseni ve port listesi — adım 5 bu oturumda onu **uyguluyor**,
  değiştirmiyor.
- §12 adım sıraları ve numaralandırma.
- §4c eşikleri, §11 S3'ün "⚠ DOĞRULANMALI · §12 adım 15'ten önce" notu
  (üç yerde de yerinde: §4c, §11 S3, REVİZYON D3).
