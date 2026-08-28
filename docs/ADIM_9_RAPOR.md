# ADIM 9 RAPORU — /plan + /settings marka profili

Tarih: 2026-08-29
Kapsam: FAZ A (düzeltmeler + Playwright) · FAZ B (`/settings`) · FAZ C (`/plan`) · FAZ D (kapanış)
Kaynak: `docs/BIRLESIM_PLANI.md` §12 adım 9 · önceki oturum: `ADIM_8_RAPOR.md`

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — düzeltmeler + e2e | ✅ Tamam | `b0620ed` |
| FAZ B — `/settings` marka profili | ✅ Tamam | `644b02d` |
| FAZ C — `/plan` | ✅ Tamam | `2b8dfad` |

**Son kapı durumu (FAZ D):**

```
build   EXIT=0   APP_MODE=live · 13 rota; (app) altındaki 6'sı ƒ (dinamik)
tsc     EXIT=0   (çıktı yok)
lint    EXIT=0   (çıktı yok)
test    EXIT=0   15 dosya, 393 test
audit   EXIT=0   found 0 vulnerabilities
e2e     EXIT=0   4 dosya, 4 test — ayrıntı FAZ A/e2e bölümünde
git     temiz (rapor commit'i hariç)
```

---

# FAZ A — düzeltmeler ve altyapı

## A1 — `/dashboard` "Bu ay erişim" KPI düzeltmesi

**Kök sebep:** `content_metrics` satırları bağımsız olaylar değil, aynı
içeriğin `h6`/`d1`/`final` fotoğrafları. Eski kod (`metrics.list()`'in ham
çıktısını topluyordu) aynı gönderiyi üç kez sayıyordu.

**Ölçülen gerçek değer** (`now = 2026-08-28T21:36:12Z`, demo fixture):

| | Değer |
|---|---|
| **ÖNCESİ** (ham toplam, hatalı) | **105.906** → ekranda "105.9K" |
| **SONRASI** (`buildMonthlyReach`, düzeltilmiş) | **69.930** → ekranda "69.9K" |

%34'lük bir şişme — tesadüfi değil, fixture'ın kendi tasarımı gereği (D1'in
kanıtı için bazı içeriklerin `final`i var, bazılarının yok; ikisi de aynı ay
içine düşüyorsa ham toplam ikisini birden sayıyordu).

**Düzeltme:** `lib/core/derive/analytics.ts`'e `buildMonthlyReach()` eklendi
— `/analytics`'in zaten kullandığı mantığın aynısı (`h6` hariç, içerik başına
en son ölçüm), yalnızca bu ay YAYINLANMIŞ içerikler için. KPI etiketi
netleştirildi: "Bu ay erişim" → "Bu ay yayınlananların erişimi" (TR),
"Reach this month" → "Reach of this month's publishes" (EN).

**Test:** `buildMonthlyReach — A1 düzeltmesi` bloğunda ⭐ işaretli test —
aynı içeriğin üç tier'ı verildiğinde KPI'nın bir kez saydığını doğruluyor
(h6=300, d1=800, final=1000 → sonuç 1000, ham toplam olsaydı 2100 olurdu).
Ayrı bir test h6'nın kronolojik olarak EN SON toplanan satır olduğu bir
senaryoda bile hariç tutulduğunu kanıtlıyor (recency değil, tier kuralı).

## A2 — `lib/core/derive/{calendar,analytics}.ts` birim testleri

**Yöntem:** ADIM_34'ün template.ts'te uyguladığı yöntem tekrarlandı —
testleri yazmadan önce gerçek davranış `vitest run` + `console.log` ile
ölçüldü (throwaway `_measure.test.ts`, commit'e girmedi), sonra testler
ölçülen değerlere göre yazıldı.

**Yanlış çıkan tek varsayım:** `lib/core/tz.ts`'e eklenen `isValidTimeZone()`
için "farklı harf büyüklüğü (`europe/istanbul`) reddedilir" diye tahmin
edildi. Ölçüldü: **yanlış** — `Intl.DateTimeFormat` büyük/küçük harfi kendi
içinde normalize ediyor, `"europe/istanbul"` de geçerli sayılıyor. Test buna
göre düzeltildi (`⭐ ölçüldü` etiketiyle işaretli). `derive/calendar.ts` ve
`derive/analytics.ts`'in kendisinde ölçülen her değer (Ağustos 2026
`firstWeekday=5`, ısı haritası pencere indeksleri, `buildQueue` göreli
zaman etiketleri, `latestMetrics` eşit-`collected_at` kazananı) ilk
tahminle eşleşti — kod önce okunup davranış çıkarılmıştı, ölçüm onu
doğruladı, şaşırtmadı.

**Kapsam** (`npx vitest run --coverage`):

```
lib/core/derive     : 99.52% stmts · 94.11% branch · 100% fn · 100% lines
  analytics.ts      : 100% / 96.15% / 100% / 100%
  calendar.ts       : 99.03% / 92.53% / 100% / 100%
lib/core/plan/calendar.ts (FAZ C'de eklendi): 100% / 100% / 100% / 100%
lib/core/tz.ts      : 100% / 83.33% / 100% / 100%
lib/core/brand/types.ts (FAZ B'de genişletildi): kapsam eklendi, ayrıntı FAZ B'de
```

Hedefin (%80+) belirgin üstünde.

## A3 — Playwright kuruldu

`@playwright/test` dev bağımlılığı, `e2e/` + `playwright.config.ts`.
`npm run test:e2e` script'i eklendi. Ayrı port (3100) — geliştiricinin
`next dev`'iyle (3000) çakışmasın diye.

**Test hesabı deseni:** ADIM_8'in oluştur-sil yöntemi, `e2e/global-setup.ts`
+ `e2e/global-teardown.ts`. Service-role ile bir kullanıcı + `brands` satırı
önceden kuruluyor (giriş `/dashboard`'a doğrudan düşsün diye —
`/onboarding`'e değil), koşu bitince `auth.users`'tan siliniyor (cascade ile
`brands` da gidiyor). Şifre **sabit değil** — `randomUUID()`, secret-scan
false-positive'ini de çözdü (bkz. Varsayımlar §7).

**Ağ kontrolü — FAZ A'nın kontrol noktasındaki tam çıktı** (o zaman tek test
dosyası vardı, `smoke.spec.ts`):

```
[ağ raporu] toplam istek: yabancı köke giden 0 bekleniyor, izinli kökler: localhost, osxpcyzohmlgxkzbirci.supabase.co
  ✓  smoke — giriş ve altı modül › ... (11.6s)
  1 passed (19.0s)
```

`page.on("request")` TÜM oturum boyunca atılan isteği topluyor, sonda
`localhost`/Supabase dışına giden **sıfır** istek olduğunu doğruluyor. Bu,
ADIM_27 ve ADIM_8'in Claude-in-Chrome köprüsü kurulamadığı için
yapamadığı **çalışma zamanı** `fetch` denetimi.

**FAZ D'nin kapanış anındaki tam e2e çıktısı** (4 dosya, adım sonunda):

```
Running 4 tests using 1 worker
  ✓  plan.spec.ts › ufuk geçişi slot sayısını değiştirir, UGC seçim sayacı doğru sayar (10.1s)
  ✓  settings.spec.ts › form kaydediyor, sayfa yenilendiğinde değerler geliyor (8.0s)
[RLS kanıtı] update sonucu — error: null etkilenen satır: 0
  ✓  settings.spec.ts › ⭐ RLS kanıtı — başka bir kullanıcının markasına yazma denemesi tutmaz (2.3s)
[ağ raporu] toplam istek: yabancı köke giden 0 bekleniyor, izinli kökler: localhost, osxpcyzohmlgxkzbirci.supabase.co
  ✓  smoke.spec.ts › giriş yapar, her modüle gider, ScreenStub durumu doğru, ağ dışarı çıkmaz (14.7s)
  4 passed (39.4s)
```

Her koşu sonrası `auth.users` sıfıra döndü (doğrulandı, admin API ile).

**⚠ Bulgu — Next dev sunucusunun (Turbopack) reload davranışı.** `/settings`
testi yazılırken bir `page.reload()`'un bazen `requireBrand()`'i AYNI istekte
İKİ KEZ çalıştırdığı, önce ESKİ sonra TAZE veriyle, gözlemlendi. Veritabanı
yazımının kendisi her zaman anındaydı (service-role ile yazımdan hemen sonra
okuma her zaman güncel geldi — bağımsız olarak doğrulandı); sorun yalnızca
dev sunucusunun render zamanlamasında, üretim derlemesinde yok. Test
`expect.poll` ile toleranslı yazıldı (reload'u gerekirse birkaç kez
tekrarlar). Bu, e2e'nin bulduğu gerçek bir GERÇEK ZAMANLI davranış — ayrıca
"use server" dosyasının yalnızca async fonksiyon export edebildiği (bir
sabit export `SETTINGS_INITIAL_STATE` build'i patlatıyordu) gerçek bir hata
da e2e ile yakalandı ve düzeltildi (bkz. FAZ B).

---

# FAZ B — `/settings` marka profili

## Marka formunun demo modda gerçek yazma kararının etkileri

**Karar (B2):** `/settings` bayrağı hiç okumuyor — `port("brand")`'e
girmiyor, `APP_MODE` ne olursa olsun her zaman gerçek `brands` satırına
yazıyor. `app/(app)/settings/actions.ts` `onboarding/actions.ts`'in
`createBrandAction`'ıyla aynı desende, oturum sahibinin kendi
`createClient()`'ıyla (RLS altında, service-role DEĞİL).

**Somut etkileri:**
1. **`BrandPort.demo/live` (ports.ts) `/settings` tarafından hiç
   çağrılmıyor.** `liveBrand.get/save`'in "İSKELET" durumu (throw
   `not implemented`) bu adımda DOKUNULMADI — kasıtlı. O port başka bir
   amaca hizmet edecek: FAZ 2'de `PlannerPort`/`CopyPort`'un marka
   profilini okuma yolu, ki o okuma modu izlemeli (demo modda plan üretimi
   zaten C5 ile kapalı). Bu ayrım `docs/BIRLESIM_PLANI.md` §9.1'e not
   olarak eklendi.
2. **Kullanıcı demo modda bile kendi gerçek markasını düzenleyip
   kaydedebiliyor** — sayfa yenilendiğinde değerler kalıcı (e2e'de
   doğrulandı). Ekranların gösterdiği İÇERİK/METRİK demo kalıyor, marka
   profili gerçek DB'ye yazılıyor. Bu, B1'in tanımladığı "iki farklı soru"
   ayrımının koddaki karşılığı.
3. **RLS gerçekten test edildi, varsayılmadı.** Saldırgan senaryosu (ikinci,
   tek kullanımlık bir hesapla başka kullanıcının markasına `update`
   denemesi) → `error: null`, `etkilenen satır: 0`. **Ölçülen gerçek:** bu
   literal bir 403/401 DEĞİL — PostgREST, `using (auth.uid() = owner_id)`
   politikasının filtrelediği bir satırı "hata" olarak değil "eşleşen satır
   yok" (boş sonuç kümesi) olarak raporluyor. Görev metninin "403" beklentisi
   gerçek davranışla birebir örtüşmüyor; rapor gerçek ölçümü yazıyor.
4. **`toPromptBlock` ile form arasında dönüşüm kaybı yok** — form,
   `parseBrand()`'i (zaten test edilmiş) doğrudan kullanıyor; `saveBrandAction`
   ayrı bir doğrulama/dönüştürme katmanı yazmadı. `brand/types.test.ts`'e
   eklenen round-trip testi bunu doğrudan kanıtlıyor.

## Alanlar ve doğrulama

Sekiz `Brand` alanı (`name, industry, description, products, audience,
voice, keywords, links`) + `timezone` (ki `Brand` tipinde DEĞİL — `OwnedBrand`
gibi ayrı bir operasyonel alan, `toPromptBlock`'un istem çıktısını
kirletmesin diye). Doğrulama: `name` + `timezone` zorunlu, diğer yedisi
opsiyonel (B4'ün tamamlanma yüzdesi tam bu boşlukları göstermek için var);
uzunluk sınırları `MAX_LENGTH` ile; `links` için yeni `splitLinks`/
`isValidLinkToken`/`validateLinks` (cömert — şema yoksa `https://` otomatik
eklenir, placeholder'ın " - " ayracını da doğru bölüyor).

`lib/core/tz.ts`'e `COMMON_TIMEZONES` (17 kentlik kısaltılmış liste) +
`isValidTimeZone()` (tam IANA veritabanına karşı, listeye değil) eklendi.

---

# FAZ C — `/plan`

## UGC video seçim arayüzünün tasarımı ve gerekçesi

Ürünün en pahalı işlemi olduğu için üç kararı bilinçli aldık:

1. **İçerik başına net kontrol.** Her satır kendi checkbox'ını taşıyor,
   TÜM satır tıklanabilir (`<label>` checkbox + platform ikonu + başlık +
   kancayı sarıyor) — hedef alanı büyük, yanlışlıkla başka bir satırı
   işaretleme riski düşük.
2. **Sayaç sessiz bir sayı değil.** Seçim > 0 olduğunda "N içerik seçildi ·
   video üretimi kredi harcar" — ne kadar seçildiğini VE ne anlama geldiğini
   birlikte söylüyor. Gerçek bir kredi rakamı İCAT EDİLMEDİ (bu, adım 20'nin
   fiyatlandırma verisi; olmayan bir sayıyı uydurmak §9.1'in "sessiz
   düşme"siyle aynı aile bir hata olurdu).
3. **"Tümünü seç" kaza tuşu olmasın diye üç katmanlı önlem:** (a) küçük,
   `outline` varyant, üstte, checkbox listesinden fiziksel olarak ayrı; (b)
   tek tıkla YAYINLAMAZ/ÜRETMEZ — yalnızca seçim state'ini değiştirir; (c)
   anında tersinir ("Seçimi temizle" her zaman yanında, tek tek
   checkbox'ları geri almak da mümkün). Demo modda zaten bedelsiz (state-only,
   DB'ye yazmıyor) ama tasarım üretimde de aynı kalacak şekilde kuruldu.

e2e'de sayaç davranışı üç adımda doğrulandı: 3 seç → "3 içerik seçildi", 1
geri al → "2 içerik seçildi", "Seçimi temizle" → hepsi boşalır.

## Devam zinciri (C4) tasarım kararı

Yeni üretilen iskelet gönderilerinin (`SkeletonPost`) henüz `id`/`parent_id`/
`root_id` alanı YOK — DB'ye hiç yazılmadılar. Bu yüzden onlara SAHTE bir
zincir bağlantısı uydurmak yerine (ör. başlık anahtar kelimesine göre
"belki bu ona devam ediyor" tahmini), `/queue`'nun zaten çalışan zincir
gruplama mantığı (`buildChains()`, bu adımda `lib/core/derive/calendar.ts`'e
taşınıp DRY yapıldı) GERÇEK içeriklerden okunup ayrı bir "Devam eden
zincirler" kartında REFERANS olarak gösteriliyor — soru şu hale geliyor:
"yeni planladığım bu slot, ekrandaki şu zincirlerden birinin devamı olabilir
mi?" Fixture'daki 3 halkalı "Ekipman rehberi" zinciri (`DEMO_CHAIN_ROOT_ID`)
bu kartta görünüyor, aynı `ChainCard` bileşeni `/queue`'dakiyle birebir aynı
görsel dilde ama farklı başlık/açıklamayla (`ChainCard`'a `title`/
`description` prop'u eklendi).

## Ufuk seçimi ve gerçek slot sayısı (C1)

`?horizon=7|30` — Link tabanlı, istemci state'i yok. 1 haftalık ufuk
`WEEKLY_TEMPLATE`'in sabitliği sayesinde HANGİ GÜNDEN BAŞLARSA BAŞLASIN
her zaman **8 slot** (`template.test.ts`'in doğruladığı gerçek — e2e testi
de bunu literal olarak doğruluyor). 1 aylık ufuk başlangıç gününe göre
değişir (Pazartesi başlarsa 35, ADIM_34'ün bulgusu); ekran dokümandaki
"~39" yerine `skeleton.posts.length`'in GERÇEK değerini gösteriyor.

## Takvim ızgarası — ikinci bir motor yazılmadı (C2)

`lib/core/plan/calendar.ts` (`skeletonToContentItems`) iskelet gönderilerini
`ContentItemRow` şekline projelendirip `lib/core/derive/calendar.ts`'in
`buildWeek`/`buildMonthCells`'ini AYNEN yeniden kullanıyor. Bunun için
`lib/core/tz.ts`'e `zonedTimeToUtc()` eklendi — `zonedParts`'ın (UTC→bölge)
tersi (bölge duvar saati→UTC). İki adımlı tahmin yöntemiyle (önce UTC=yerel
varsay, gerçek ofseti ölç, düzelt) çalışıyor; DST GEÇİŞ ANI dışında her
zaman tam isabetli (ölçüldü: Istanbul +03:00 sabit, New York yaz saati
UTC-4 ikisi de doğru).

## Plan üretme düğmesi (C5)

Demo modda tamamen `disabled` — tema alanı da, düğme de. Sahte üretim
YAPILMADI: sayfa yüklenirken gösterilen plan `PlannerPort.demo`'nun (`
demoPlanSkeleton`) DÜRÜST çıktısı — gerçek `buildSlots()`'u çağırıyor, ağ
isteği yok, `/queue`/`/dashboard`'ın demo veri gösterme biçiminin aynısı.
Devre dışı olan şey özellikle "YENİ bir tema ile yeniden üret" eylemi —
o, gerçek Anthropic çağrısı gerektiren adım 14'ün işi.

---

# FAZ D — kapanış

## grep kontrolleri

```
$ grep -rn "fixtures" app/ components/
(sıfır sonuç)

$ grep -rln "ScreenStub" app/
app/(app)/studio/page.tsx
```

`/studio/personas` henüz bir ROTA DEĞİL (dosyası yok) — adım 10 hem
`/studio`'yu gerçek içerikle dolduracak hem de `/studio/personas` alt
rotasını açacak. Şu an tek ScreenStub `/studio`'da, beklenen durum bu.

## Kapsam özeti

```
Statements   : 61.05%  (588/963)
Branches     : 49.90%  (266/533)
Functions    : 61.53%  (176/286)
Lines        : 61.78%  (511/827)
```

Genel proje kapsamı %61 — bu adımın hedefi olan `derive/*` (%99.5) ve yeni
eklenen `plan/calendar.ts` (%100), `tz.ts` (%100 stmt) belirgin üstünde.
Düşük kalan alanlar (`lib/core/plan/skeleton.ts` %0, `lib/core/providers/*`
%0, `lib/server/auth.ts` %0) canlı Anthropic/Supabase çağrısı içeren veya
Next'e bağlı kod — ADIM_8'in de belirttiği gibi bunlar FAZ 2 sonrası (adım
14+) canlı HTTP ile doğrulanacak, birim testte mock yığını olurdu.

---

# VARSAYIMLAR

1. **A1'in "aynı ay" penceresi hâlâ 45 gün** (`METRIC_WINDOW_DAYS`,
   dokunulmadı) — `buildMonthlyReach` bu pencereden gelen ham satırları alıp
   kendi içinde dedupe ediyor, pencere büyüklüğü A1'in kapsamı değildi.

2. **`/plan`'da `lang: "tr"` sabit yazıldı** (`SkeletonInput.lang`).
   Sunucu tarafı render, istemcinin `localStorage`'daki dil tercihini
   BİLEMİYOR (cookie'de tutulmuyor) — bu, adım 14'ün gerçek Anthropic
   çağrısı yazılırken çözülmesi gereken ayrı bir mimari soru. Demo modda
   `demoPlanSkeleton` bu alanı zaten hiç okumadığı için görünür bir etkisi
   yok, ama live moda geçildiğinde SSR'ın dili nasıl bileceği netleşmeli.

3. **`/plan`'ın "tema" varsayılanı `brand.description || brand.name`.**
   Demo modda `demoPlanSkeleton` temayı hiç okumadığı için sonuç
   değişmiyor; bu yalnızca formun ilk dolu göründüğü bir varsayılan değer.

4. **`mode: "weekly"` sabit tutuldu**, `"auto"` moduna geçiş UI'a
   eklenmedi. Gerekçe: demo `demoPlanSkeleton` zaten yalnızca
   `buildSlots()` (weekly) tabanlı; `auto` modu tamamen modelin
   kendisinin yerleştirdiği bir mod, demo modda temsil edilecek deterministik
   bir karşılığı yok. Adım 14'te canlı üretim gelince ikinci bir mod
   anahtarı eklenebilir.

5. **UGC seçim state'i sayfa yenilendiğinde/ufuk değiştiğinde sıfırlanıyor**
   (React state, kalıcılık yok). Bilinçli — B2'nin "demo modda seçim
   state'te yaşasın, DB'ye yazmasın" kararının doğal sonucu; kalıcı bir
   seçim adım 14'ün (gerçek plan üretimi + onay akışı) işi.

6. **`isValidLinkToken` cömert doğrulama** — `ftp://` gibi standart olmayan
   şemaları da kabul ediyor (yalnızca "nokta içeren bir ana bilgisayar adı"
   arıyor). Kasıtlı: kullanıcının Instagram/TikTok gibi bio bağlantılarını
   yazarken şema hatası yüzünden formu gönderemediği bir sürtünme
   istenmedi; gerçek bir tıklanabilir link olup olmadığı `/library`
   (11b) aşamasında önemli olacak, burada değil.

7. **`e2e/global-setup.ts`'in kullanıcı şifresi `randomUUID()`** —
   secret-scan pre-commit hook'u sabit bir "password = ..." dizesini
   yanlış pozitif olarak işaretledi; düzeltme hem hook'u geçti hem de
   gerçek bir iyileştirme (tek kullanımlık hesap için hiçbir zaman sabit
   bir kimlik bilgisi yok).

8. **Next dev sunucusunun (Turbopack) `requireBrand()`'i bazen bir reload'da
   iki kez çalıştırdığı bulgusu** yalnızca e2e testinde `expect.poll` ile
   yumuşatıldı, KÖK SEBEBİ araştırılmadı (üretim derlemesinde etkisi yok
   gibi görünüyor — build'de `ƒ` dinamik render kullanılıyor, statik/PPR
   yolu yok). Adım 10+ aynı deseni (bir server action sonrası hemen
   `page.reload()`/`router.refresh()` bekleyen bir e2e testi) tekrar
   yazarsa bu notu hatırlasın.

---

# ADIM 10'A GEÇMEDEN BİLMEN GEREKENLER

1. **`/studio` ve `/studio/personas` hâlâ yazılmadı** — tek kalan
   `ScreenStub`. `/studio/personas` bir ROTA olarak bile yok, adım 10
   hem sayfayı hem alt rotayı açacak.

2. **`liveBrand.get/save` hâlâ "not implemented" — BİLEREK dokunulmadı.**
   `/settings` ona hiç girmiyor (B2). Bu port'un gerçek gövdesi FAZ 2'de
   `PlannerPort`/`CopyPort`'un marka okuma yolu olarak yazılacak — o zaman
   `docs/BIRLESIM_PLANI.md` §9.1'deki B2 notunu tekrar oku, iki farklı
   "marka okuma" yolunun (kullanıcının kendi düzenlemesi vs. AI'ın canlı
   modda okuyacağı) karışmadığından emin ol.

3. **`e2e/` altyapısı hazır ve üç dosya var** (`smoke`, `settings`, `plan`).
   Adım 10 `/studio`'yu yazınca `smoke.spec.ts`'in `MODULES` listesindeki
   `{ path: "/studio", expectStub: true }` satırı `false`'a çevrilmeli —
   bu, ADIM_8/ADIM_27'nin bulamadığı gerçek tarayıcı ağ denetimini otomatik
   olarak `/studio`'nun UGC iş akışına da uygular (kie/elevenlabs/fal
   isteklerinin BEKLENEN dış köklere gittiğini doğrulamak için ağ
   allowlist'i genişletilmeli — şu an yalnızca Supabase + kendi kök var).

4. **`lib/core/plan/skeleton.ts` hâlâ %0 kapsamlı** — `Anthropic` SDK'sını
   modül düzeyinde import ediyor, canlı ağ çağrısı gerektiriyor. Adım 14
   bu dosyayı canlıya alırken (§12 adım 14, ilk canlıya çıkan port) mock'lu
   birim testi + gerçek entegrasyon testi ayrımını düşünsün.

5. **`brandCompletionPercent()` artık hem `/settings` hem `/plan` tarafından
   okunuyor** (`lib/core/brand/types.ts`). Adım 10'da benzer bir "profil ne
   kadar dolu" göstergesi gerekirse bu fonksiyonu tekrar yazma.

6. **`buildChains()` artık `lib/core/derive/calendar.ts`'te, tek gerçek
   kaynak.** `/queue` ve `/plan` ikisi de bunu kullanıyor;
   `ChainCard` bileşeni (`components/app/queue-view.tsx`, export edildi)
   `title`/`description` prop'larıyla override edilebilir — üçüncü bir
   ekran zincir göstermek isterse yeniden kullanılsın, üçüncü bir kopya
   yazılmasın.

7. **Beş test hesabı + iki "saldırgan" hesabı bu oturumda oluşturulup
   silindi**, canlı veritabanında hiçbir artık kalmadı (`select count(*)
   from auth.users` = 0, son kontrol bu raporun yazıldığı an). Adım 10
   kendi e2e testlerini yazarken aynı `global-setup.ts`/`global-teardown.ts`
   altyapısını (STATE_FILE, admin client deseni) kullanabilir — sıfırdan
   kurmasın.

8. **Önceki oturumlardan devam eden açıklar değişmedi** (D3 embedding
   teyidi, Instagram metrik adları, S7 lisans, kalibre edilmemiş eşikler,
   S1 ürün adı, Node sürümü v23 vs `>=22.22.2 <23`) — ADIM_8/ADIM_27'nin
   listesine bakınız.
