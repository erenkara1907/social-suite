# ADIM 8 RAPORU — ilk üç ekran (/queue, /analytics, /dashboard)

Tarih: 2026-08-28
Kapsam: FAZ A (hazırlık) · FAZ B (/queue) · FAZ C (/analytics) · FAZ D (/dashboard) · FAZ E (kapanış)
Kaynak: `docs/BIRLESIM_PLANI.md` §12 adım 8 · önceki oturum: `ADIM_27_RAPOR.md`

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — demo varlıkları + marka bağlamı | ✅ Tamam | `c632f9e` |
| FAZ B — `/queue` | ✅ Tamam | `633566c` |
| FAZ C — `/analytics` | ✅ Tamam | `b7a71d2` |
| FAZ D — `/dashboard` | ✅ Tamam | `33ebf5c` |

**Son kapı durumu (FAZ E):**

```
build   EXIT=0   APP_MODE=live · 13 rota; (app) altındaki 6'sı ƒ (dinamik)
tsc     EXIT=0   (çıktı yok)
lint    EXIT=0   (çıktı yok)
test    EXIT=0   12 dosya, 274 test   (önceki oturum: 12 dosya, 273 test)
audit   EXIT=0   found 0 vulnerabilities
git     temiz (rapor commit'i hariç)
```

ADIM_27'nin "adım 8'e geçmeden bilmen gerekenler" dokuz maddesinden ilgili
dördü (1, 2, 3, 4) bu oturumda kapandı. Kalanlar (5, 6, 7, 8, 9) bu adımın
kapsamı dışında — aşağıda "Adım 9'a geçmeden bilmen gerekenler"de tekrar
listelendi.

---

# A0 — ön kontrol

Test hesapları (`rls-a@ornek.test`, `rls-b@ornek.test`, `akis-c@ornekmarka.com`)
hâlâ duruyordu. Kullanıcıya soruldu, onayla silindi:

```
$ select id, email from auth.users;   (öncesi)  3 satır
$ (admin API DELETE × 3)
$ select id, email from auth.users;   (sonrası) 0 satır
```

`brands` ve `provider_credentials` cascade ile birlikte gitti.

Bu oturum boyunca render doğrulaması için **beş kez** geçici bir test hesabı
(`adim8-render@ornekmarka.com`) oluşturuldu ve her seferinde hemen silindi —
canlı veritabanında kalıcı bir artık **yok**. `select count(*) from
auth.users` şu an **0**.

---

# FAZ A — hazırlık

## A1 — demo varlıkları

Adapter kodundan çıkarılan tam liste (`grep -rn '"/demo/' lib/adapters/`):

| Yol | Boyut | Nasıl üretildi |
|---|---|---|
| `public/demo/generated/placeholder-1024.png` | 1024×1024 PNG | `sharp` ile SVG'den rasterize — jenerik degrade + ikon |
| `public/demo/personas/mira-01.png` | 1080×1920 PNG | Aynı yöntem — soyut baş/gövde şekli |
| `public/demo/personas/kerem-01.png` | 1080×1920 PNG | Aynı yöntem |
| `public/demo/ugc/v60-demleme.jpg` | 1080×1920 JPG | **Video DEĞİL** — S5 kararı gereği statik 9:16 poster + oynat ikonu + "DEMO ÇIKTI" rozeti |
| `public/demo/voice/aeropress-ada.mp3` | 3 sn, sessiz | `ffmpeg -f lavfi -i anullsrc` |
| `public/demo/uploads/cold-brew-raf.jpg` | 1440×1440 JPG | Aynı `sharp`/SVG yöntemi |

Hepsi doğrulandı (`file` çıktısı, boyut, `ffprobe` süresi). Hiçbiri stok
görsel/video değil — hepsi programatik üretildi, telifi belirsiz hiçbir
varlık yok. Markasız/jenerik: hiçbiri `sahne`/`siraya`/`threadly` filigranı
taşımıyor (ADIM_012'nin S5 bulgusu tekrarlanmadı).

`fixtures/media.ts`'teki `reelV60` kaydı `.mp4` yerine `.jpg`'ye çevrildi:
`kind: "video" → "image"`, `mime_type: "video/mp4" → "image/jpeg"`,
`duration_ms: 21_000 → null`.

`public/demo/README.md` yazıldı: bunların demo-only olduğunu, üretimde
kullanılmayacağını ve **adım 20**'de (`LIVE #4 — UGC boru hattı`) gerçek
Kie/ElevenLabs/fal çıktılarıyla değişeceğini belirtiyor.

## A2 — marka bağlamı: istemciye geçirilen alanlar

**Karar (literal öneriden bir sapmayla):** tek bir `lib/server/brand-context.tsx`
dosyası yerine **iki** dosya:

1. `lib/server/auth.ts` — `requireUser`/`requireBrand`/`currentBrand` React
   `cache()` ile sarıldı. Bu, **sunucu → sunucu** paylaşımı çözüyor: bir
   sayfa `brand.timezone`'a ihtiyaç duyup `requireBrand()`'i tekrar
   çağırırsa, aynı istek içinde React sonucu bellekte tutuyor — **ikinci
   bir Supabase sorgusu olmuyor**.
2. `components/app/brand-context.tsx` — gerçek React Context
   (`BrandProvider`/`useBrand`). Bu, **sunucu → istemci** paylaşımını
   çözüyor: `(app)/layout.tsx` `brand`'i bir kez çözüp Context'e koyuyor,
   bir Client Component (`Topbar`) `useBrand()` ile okuyor.

**Neden tek dosya değil:** Next.js'te bir Server Component (`page.tsx`)
`useContext()` çağıramaz — React Context yalnızca istemci ağacında çalışır.
`"use client"` (Context) ile `import "server-only"` (cache'li sorgu) aynı
modülde bir arada olamaz. Next'in kendi resmi önerisi de tam bu ayrım:
sunucu-sunucu paylaşımı için Context değil `cache()`.

**İstemciye geçirilen alanlar — yalnızca ikisi:**

```ts
interface BrandContextValue {
  name: string;
  timezone: string;
}
```

`industry`, `description`, `products`, `audience`, `voice`, `keywords`,
`links`, `id`, `isActive` istemciye **inmiyor** — hiçbir istemci bileşeni
onlara ihtiyaç duymuyor. Gerçek tüketici: `Topbar`, sayfa başlığının altında
marka adını gösteriyor (spekülatif bir soyutlama değil — şu an gerçekten
kullanılıyor).

Sunucu tarafında `brand.timezone`, `/queue` (`buildQueue`), `/analytics`
(`buildHeatmap`/`buildReach14d`/`buildTopPosts`) ve `/dashboard`
(`buildQueue`, ay sınırı hesapları) tarafından `requireBrand()`'in
`cache()`'li tekrar çağrısıyla okunuyor — Context'ten değil.

## A3 — §11 S6 bundle doğrulaması ⚠ BULGU + DÜZELTME

İlk çalıştırmada **gerçek bir sızıntı** bulundu:

```
$ APP_MODE=live npm run build   (temiz .next/ ile)
$ grep -rl "sm:mode:" .next/server .next/static  (sourcemap hariç)
.next/server/chunks/ssr/lib_0cy750p._.js
```

**Kök sebep:** `lib/adapters/mode.ts`'teki `readDevCookie()`'nin
`NODE_ENV === "production"` kapısı **kararı** etkisiz kılıyordu, ama
`lib/server/mode.ts`'teki `requestModeOverrides()` **mekanizmayı** (çerez
adını kurup okumayı) ortamdan bağımsız çalıştırıyordu — `modeCookieName()`'ın
döndürdüğü `sm:mode:` dize literali üretim bundle'ına sızıyordu.

İşlevsel risk yoktu (`readDevCookie` zaten üretimde `null` dönüyordu, çerez
set edilse bile hiçbir şey değişmezdi) ama S6'nın harfiyen istediği
("bundle'da bile olmamalı") ihlal ediliyordu.

**Kullanıcıya soruldu, "şimdi düzelt" seçildi.** `requestModeOverrides()`'a
aynı `NODE_ENV` kapısı eklendi — üretimde erken `{}` döner, `cookies()` ve
`modeCookieName()` hiç çağrılmaz. Regresyon testi eklendi
(`lib/server/mode.test.ts`, "⭐ üretimde erken {} döner").

**Temiz yeniden derleme sonrası:**

```
$ rm -rf .next && APP_MODE=live npm run build
$ grep -rl "sm:mode:" .next/server .next/static   (sourcemap hariç)
(boş)                                              ← TEMİZ
```

`.next/server/chunks/ssr/lib_*.js.map` (sourcemap) içinde hâlâ geçiyor —
beklenen ve zararsız: sourcemap orijinal kaynağı taşır, tarayıcıya
varsayılan olarak gönderilmez (`productionBrowserSourceMaps` açık değil) ve
"bundle" bu kontrolün kastettiği şey değil.

---

# FAZ B — `/queue`

`app/(app)/queue/page.tsx` + `components/app/queue-view.tsx`.

- **Durum makinesi (§4a):** sekiz durumun hepsi `STATUS_LABEL`/`STATUS_TONE`
  ile görsel karşılığını buluyor. `publishing` özel: aksiyon düğmeleri
  yerine kilit göstergesi (çifte yayın kalkanının anlamını taşıyor).
- **Devam zinciri (§4b):** `root_id` paylaşan satırlar `chain_position`
  sırasıyla "Devam zinciri" kartında (ok işaretleriyle bağlı üç halka);
  kuyruk satırında da "Zincir · N. halka" rozeti.
- **`duplicate_blocked` (§4c):** ayrı bir "Tekrar önleme" kartında,
  `port("content").listActivity()`'den filtrelenerek.
- **`media_jobs` `running`:** kuyruk satırında `.glow` animasyonlu
  ilerleme göstergesi (adım etiketi + N/toplam), `port("video").listJobs()`
  ile.
- **Aksiyon düğmeleri:** onayla/yeniden zamanla/iptal — hepsi `disabled`,
  `title` ipucuyla ("Demo modda devre dışı").

DOM tabanlı curl doğrulaması: `DemoBanner` 1, durum rozetleri (8 farklı
değer), "Devam zinciri" + "Zincir · 3. halka", "Tekrar önleme" + hedef
metni, "Video üretiliyor" göstergesi, 13 satır × 3 = 39 disabled buton.

---

# FAZ C — `/analytics`

`app/(app)/analytics/page.tsx` + `components/app/analytics-view.tsx`.
Grafik/görsel kısımları için **dataviz skill'i** yüklendi ve uygulandı.

- **⭐ D1 görünür:** `MetricsPort.latest()` (h6 hariç, içerik başına en son
  ölçüm) kullanılıyor. `latestMetrics()` ile her top-post'un tier'ı
  bulunup `final`/`d1 · erken ölçüm` rozeti olarak gösteriliyor. "Ölçüm
  durumu" KPI'sı ikisini ayrı sayıyor (fixture: **2 final, 8 d1**).
- **h6'nın hariç tutulduğunun kanıtı:** ham h6 satır sayısı (10) ekranda
  metinle gösteriliyor — "İlk 48 saatin erken ve gürültülü ölçümleri (h6)
  bu sayılara girmiyor. (10)".
- **Isı haritası:** tek-hue (marka hue'su 262) sıralı büyüklük rampası,
  açık→koyu. Dataviz skill'inin CVD doğrulayıcısı **kategorik** paletler
  için — sıralı rampalar zaten ona girmiyor (skill'in kendi notu: "running
  the categorical validator on a sequential ramp will FAIL by design").
- **Trend grafiği:** 6 haftalık, SVG, 2px çizgi + yuvarlak uç, %10 opak
  alan dolgusu, uç noktada değer etiketi, hairline taban çizgisi.
- **Boş durum ZORUNLU:** `publishedCount===0 || measuredCount===0` →
  dürüst metin (`emptyAnalytics`/`emptyAnalyticsHint`). Fixture'lar geçici
  boşaltılıp (`demoMetricRows` → `return []`) dev sunucusunda render
  edildi, **çökmedi** (HTTP 200, boş durum metni), sonra tam olarak
  orijinaline geri alındı (`git diff` boş, tsc/test tekrar yeşil).

---

# FAZ D — `/dashboard`

`app/(app)/dashboard/page.tsx` + `components/app/dashboard-view.tsx`.

## KPI'ların canlıda hangi adımda dolacağı

| KPI | Ekrandaki değer (demo) | Hesaplama | Canlıda dolduran adım |
|---|---|---|---|
| Bu ay planlanan | 15 | `content_items` içinde `scheduled_at`/`published_at` cari ayda olan, arşiv hariç tüm satırlar | **Adım 14** — LIVE #1 Anthropic: `PlannerPort.live` + `/api/ai/plan` `content_items`'a yazmaya başlar |
| Onay bekleyen | 2 | `status = 'needs_review'` sayısı | **Adım 14** — AI'ın yazdığı taslaklar review durumuna geçtiğinde |
| Bu ay yayınlanan | 8 | `status = 'published'` **ve** `published_at` cari ayda | **Adım 17** — LIVE #3 yayın: `PublisherPort.live` + `sm-publish` cron `status`'u `published`'a çeviriyor |
| Bu ay erişim | 105.9K | `content_metrics.reach` toplamı, `collected_at` cari ayda | **Adım 18** — Metrik toplama: `sm-metrics` job'ı `content_metrics`'e yazmaya başlıyor |

**ADIM_012'nin tuzağına düşülmedi:** siraya'nın "Otomatik kaydırma" KPI'sı
canlıda hep 0'dı çünkü onu yazan kod hiç yoktu. Buradaki dört KPI'nın
**hepsi**, yukarıdaki tabloda somut bir adıma bağlı — hangi kodun ne zaman
yazacağı belirsiz olan hiçbir metrik konmadı (ör. siraya/threadly'de olup da
hiç yazılmayan alanlar — "tıklama oranı", "otomatik kaydırma" gibi —
buraya taşınmadı).

## Diğer içerik

- **Yaklaşan yayınlar:** yalnızca `scheduled_at` dolu, yayınlanmamış
  satırlar; `buildQueue()` ile soonest-first (aynı türetme fonksiyonu
  `/queue` ile paylaşılıyor, ikinci bir sıralama mantığı yazılmadı).
- **Son aktiviteler:** `ACTIVITY_ACTION_LABEL`/`ACTIVITY_ACTION_ICON`
  ile (adım 8b'de `lib/core/types.ts`'e eklendi), marka saat dilimine göre
  `Intl.DateTimeFormat`.
- **Hızlı erişim:** D4'ün dört kritik ekranı (`/plan`, `/studio`, `/queue`,
  `/analytics`), `buildNav()` ile `app.config.ts`'in tek kaynağından —
  ikinci bir etiket/ikon kopyası yazılmadı.

---

# FAZ E — kapanış doğrulaması

## 1. Beş kapı

```
build (APP_MODE=live)  EXIT=0
tsc                     EXIT=0
lint                    EXIT=0
test                    EXIT=0   12 dosya, 274 test
audit                   EXIT=0   found 0 vulnerabilities
```

## 2. Gerçek tarayıcıyla ağ kontrolü

**Playwright köprüsü bu makinede hâlâ kurulu değil** — ADIM_27'nin bulduğu
aynı kısıt (`Extension connection timeout`, bu oturumda da tekrar denendi,
aynı hata). Yerine ADIM_27'nin **iki taraftan ölçüm** yöntemi tekrarlandı,
üç yeni ekran için:

**İstemci tarafı** (servis edilen HTML, üç ekranın hepsinde):

```
  script src toplam            : 17
  bunlardan /_next ile başlayan: 17   ← hepsi kendi kökümüzden
  http(s):// içeren src/href   : 0
  fonts.googleapis/gstatic     : 0
  supabase.co geçişi (HTML'de) : 0
```

**Sunucu tarafı** — dev sürecinin ESTABLISHED dış bağlantıları taransa da
`1e100.net` (Google) adreslerine **17 bağlantı** görüldü. İncelendi:
`app/layout.tsx` `next/font/google` (Plus Jakarta Sans, Fraunces, JetBrains
Mono) kullanıyor — bu, **dev sunucusunun ilk derleme sırasında** fontu
indirip yerel önbelleğe aldığı, tek seferlik bir aktivite; çalışma zamanında
sayfa başına tekrarlanmıyor. Üretim build'inde fontlar tamamen yerelde:

```
$ find .next/static/media -iname "*.woff*" | wc -l
16                                    ← üretimde hiç Google çağrısı yok
```

Bu, ADIM_27'nin zaten açık madde olarak bıraktığı 7. maddeyle aynı
("next/font Google'dan build zamanında indiriyor") — adım 8'in yeni bir
riski değil.

**Bu ölçüm DevTools'un yerini tam tutmuyor** (ADIM_27'nin kendi notu
korunuyor): istemci JS'inin çalışma zamanında attığı bir `fetch()` bu
yöntemle görünmez. Demo adapter'lar ağ çağrısı yapmadığı için (adım 5-6'da
test edildi, bu oturumda kod okunarak tekrar doğrulandı — `demo/*.ts`
içinde `fetch`/`XMLHttpRequest` grep'i sıfır sonuç) risk düşük.

```
$ grep -rn "fetch(\|XMLHttpRequest" lib/adapters/demo/
(sıfır sonuç)
```

## 3. Üç ekranda da `ScreenStub` yok

```
$ grep -rn "ScreenStub" app/\(app\)/queue app/\(app\)/analytics app/\(app\)/dashboard
(sıfır sonuç)

$ grep -rln "ScreenStub" app/
app/(app)/settings/page.tsx    ← adım 9
app/(app)/studio/page.tsx      ← adım 10
app/(app)/plan/page.tsx        ← adım 9
```

Beklenen — bu üçü adım 9-10'un kapsamı.

## 4. Doğrudan fixture importu yok

```
$ grep -rn "fixtures" app/ components/
(sıfır sonuç)
```

## 5. Kapsam raporu

```
Statements   : 38.3%  (349/911)
Branches     : 28.09% (143/509)
Functions    : 40.07% (107/267)
Lines        : 40.2%  (314/781)
```

`lib/core/derive/{calendar,analytics}.ts` **%0** görünüyor — bu adımda üç
ekran onları yoğun şekilde çalıştırdı ama birim test **eklenmedi**; bunun
yerine canlı HTTP + DOM doğrulaması yapıldı (yukarıdaki curl kanıtları).
Bu iki dosya ADIM_27 öncesinde siraya'dan **aynen** taşındı (§7.1), bu
oturumda tek satır değişmedi — TDD kuralı "yeni özellik/bug fix" için
zorunlu, bu ikisi ne biri ne diğeri. Yine de saf, sıfır bağımlılıklı
fonksiyonlar oldukları için ucuz test edilebilirler; **açık bir madde**
olarak aşağıda bırakıldı. `lib/server/mode.ts` bu oturumda gerçek bir bug
fix aldığı için (A3) TDD kuralına uyuldu, testi eklendi.

`%80` hedefi ADIM_27'nin de dediği gibi adım 14'ten sonra yeniden
ölçülmeli — Next'e bağlı kod (`lib/server/*`, `lib/supabase/*`, page.tsx'ler)
birim testte mock yığını olur, canlı HTTP ile doğrulanması daha dürüst.

---

# VARSAYIMLAR

1. **`lib/server/brand-context.tsx` tek dosya değil, iki dosya oldu**
   (`lib/server/auth.ts`'in `cache()`'i + `components/app/brand-context.tsx`).
   Gerekçe: Next.js'te Server Component'ler React Context tüketemiyor;
   "use client" ile "server-only" aynı modülde olamıyor. Geri almak:
   pratik olarak geri alınamaz — bu, Next'in mimari kısıtı, tercih değil.

2. **Context'e yalnızca `{name, timezone}` geçirildi.** Diğer sekiz `Brand`
   alanı (industry, description, products, audience, voice, keywords,
   links) + kimlik alanları (id, isActive) istemciye inmiyor. Gerekçe:
   hiçbir istemci bileşeni onlara ihtiyaç duymuyor; genişletmek gerekirse
   `BrandContextValue`'ya tek satır eklemek yeterli.

3. **A3 bulgusu düzeltildi** (kullanıcı onayıyla), ertelenmedi. `requestModeOverrides()`
   artık üretimde erken `{}` dönüyor.

4. **Dashboard KPI'ları dörtle sınırlı tutuldu.** siraya/threadly'nin
   sundukları daha fazla KPI olabilirdi (ör. "en çok etkileşim alan
   platform", "ortalama yanıt süresi") ama her biri için "canlıda hangi kod
   yazacak" sorusuna net bir adım numarası veremediğim için konmadı —
   ADIM_012'nin tuzağını tekrarlamamak adına bilinçli bir kısıtlama.

5. **`/queue`'nun "Devam zinciri" kartı `root_id` paylaşan TÜM satırları
   gösteriyor**, yalnızca kuyruktakileri değil (yayınlanmış halkalar dahil).
   Gerekçe: zincirin görünürlüğü, bir halkanın önceki halkalara atıf
   yaptığını göstermek — yayınlanmış olan halkalar bu bağlamdan
   çıkarılırsa zincir kırık görünür.

6. **`/analytics`'in metrik penceresi 45 gün** (`METRIC_WINDOW_DAYS`).
   Fixture'daki en eski `final` ölçümü (yayından 30 gün sonra toplanan,
   `-38+30=-8` gün önce) rahatça kapsıyor. Canlıda 30 günlük toplama +
   birkaç günlük tampon olarak düşünülebilir; kalibre edilmiş bir değer
   değil.

7. **`/dashboard`'ın "Bu ay erişim" KPI'sı ham metrik satırlarının
   toplamı**, D1'in "en son ölçüm" mantığını uygulamıyor (o mantık
   `/analytics`'in işi). Burada amaç "bu ay ne kadar ölçüm topladık"
   sinyali — bir içeriğin h6+d1+final'i aynı ay içine düşerse üçü de
   toplanıyor. Bu bilinçli bir basitleştirme; `/analytics` D1'i doğru
   uyguluyor, dashboard KPI'sı ayrı bir soru soruyor ("bu ay toplam
   erişim aktivitesi", "içerik başına nihai erişim" değil).

8. **Playwright köprüsü kurulamadı**, ADIM_27'nin bulduğu kısıt aynen
   sürüyor. İki taraflı ölçüm (istemci HTML taraması + sunucu ESTABLISHED
   bağlantı taraması) uygulandı, sınırları raporda açıkça yazıldı.

---

# ADIM 9'A GEÇMEDEN BİLMEN GEREKENLER

1. **`/plan` ve `/settings` (marka formu) hâlâ `ScreenStub`.** Adım 9'un
   işi. `/settings`'in yalnızca marka profili bölümü — entegrasyon
   rozetleri ve API anahtarı 11b/adım 13'e kalıyor (ADIM_27'nin madde
   5'i hâlâ geçerli).

2. **`/studio`, `/studio/personas` hâlâ `ScreenStub`.** Adım 10'un işi.

3. **`lib/core/derive/{calendar,analytics}.ts` birim testsiz.** Üç ekran
   onları yoğun kullanıyor ama kapsam raporu %0 gösteriyor — canlı HTTP
   doğrulaması yapıldı, birim test değil. Adım 9-10'da aynı desen
   tekrarlanacaksa (yeni bir derive fonksiyonu ekleniyorsa) o fonksiyon
   için TDD uygulanmalı; mevcut ikisi bu oturumda **değiştirilmedi**, o
   yüzden zorunlu tutulmadı.

4. **A3'ün düzeltmesi genel bir kalıp oluşturdu:** `resolveMode`'un
   `NODE_ENV` kapısı yalnızca KARARI değil, MEKANİZMAYI da (çerez
   okuma/adı kurma) kapsamalı. İleride port sayısı artarsa veya yeni bir
   dev-only çerez/bayrak eklenirse aynı kontrolü tekrar çalıştırmak lazım
   (`APP_MODE=live npm run build` + `.next/server` + `.next/static` grep,
   sourcemap hariç).

5. **Beş test hesabı bu oturumda oluşturulup silindi**, canlı veritabanında
   hiçbir artık kalmadı (`select count(*) from auth.users` = 0). Adım 9
   kendi render doğrulamasını yaparken aynı geçici-hesap-oluştur-sil
   desenini kullanabilir; `@supabase/ssr`'ın `createServerClient` + bellek
   içi çerez kavanozu yöntemi (bu raporun A0 bölümünde ve ADIM_27'de
   anlatılan) tekrar kullanılabilir.

6. **`brand.timezone` artık `requireBrand()` üzerinden sayfalarda ucuz.**
   Adım 9'un `/plan` ekranı da tarih/saat hesabı yapacaksa (plan
   üretiminin gün/saat ızgarası) `requireBrand()`'i tekrar çağırmaktan
   çekinmemeli — `cache()` sayesinde ikinci sorgu olmuyor.

7. **`ACTIVITY_ACTION_LABEL`/`ACTIVITY_ACTION_ICON` ve
   `MEDIA_JOB_STEP_LABEL`** artık `lib/core/types.ts`'te hazır — adım 9-10
   aktivite/iş göstergesi gösterecekse tekrar tanımlamasın.

8. **Node sürümü hâlâ v23**, `package.json` `>=22.22.2 <23` istiyor.
   ADIM_27'nin B2 uyarısı geçerliğini koruyor.

9. **Önceki oturumlardan devam eden açıklar değişmedi** (D3 embedding
   teyidi, Instagram metrik adları, S7 lisans, kalibre edilmemiş eşikler,
   S1 ürün adı) — ADIM_27'nin listesine bakınız.
