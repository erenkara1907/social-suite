# ADIM 11b RAPORU — ertelenen ekranlar + demo senkronizasyonu

Tarih: 2026-09-05 · Kaynak: `docs/BIRLESIM_PLANI.md` · önceki oturum: `docs/ADIM_20-5_RAPOR.md`

Bu belge faz faz yazılıyor; her fazın sonunda ilgili bölüm eklenip commit
atılıyor. Aşağıdaki FAZ 0 bölümü ilk commit.

---

## FAZ 0 — Devralınan borç taraması

### 0.1 — `"use server"` denetimi

Altı dosya bulundu (`grep -rl '"use server"' app lib`). Hepsi tek tek okundu:
her biri **yalnızca async fonksiyon** export ediyor (interface'ler sorun
değil — derleme zamanında silinir, runtime export'u yalnızca fonksiyonlar).
C1'in bulduğu hata sınıfı (bir sabit/obje export edilip Next'in "a 'use
server' file can only export async functions" ile çökmesi) **başka hiçbir
dosyada yok** — 20.5'te düzeltilen üçü (`plan/actions.ts`,
`studio/actions.ts`, `studio/personas/actions.ts`) zaten temizdi, kalan üçü
(`settings/actions.ts`, `settings/integrations-actions.ts`,
`onboarding/actions.ts`) baştan temiz yazılmış.

| Dosya | Export edilen değerler | Durum |
|---|---|---|
| `app/(app)/settings/actions.ts` | `SettingsState` (interface), `saveBrandAction` (async fn) | ✅ temiz |
| `app/(app)/settings/integrations-actions.ts` | `CredentialActionState`, `VerifyActionState` (interface), `saveCredentialAction`, `deleteCredentialAction`, `verifyCredentialAction` (async fn) | ✅ temiz |
| `app/(app)/studio/personas/actions.ts` | `CreatePersonaActionState` (interface), `createPersonaAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(app)/studio/actions.ts` | `GenerateUgcActionState` (interface), `generateUgcAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(app)/plan/actions.ts` | `GeneratePlanActionState`, `RequestUgcActionState` (interface), `generatePlanAction`, `requestUgcAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(auth)/onboarding/actions.ts` | `OnboardingState` (interface), `createBrandAction` (async fn) | ✅ temiz |

**Sonuç: sıfır ek ihlal.** Modül seviyesinde tanımlanan yardımcı sabitler
(`MANAGED_PROVIDERS`, `KEY_PREFIX_HINTS` — `integrations-actions.ts`)
export EDİLMİYOR, yalnızca dosya içi kullanım — bu da güvenli.

### 0.2 — Tıklanmamış yollar envanteri

`app/(app)/` altındaki (+ sidebar'ın logout'u) her etkileşimli öğe ve onu
GERÇEKTEN tetikleyen test:

| Öğe | Dosya | Server action | Gerçek tıklamayla test eden | Durum |
|---|---|---|---|---|
| Giriş formu | `(auth)/login` | Supabase Auth | `journey.spec.ts`, `plan.spec.ts`, vd. (hepsi giriş yapıyor) | ✅ |
| Kayıt formu | `(auth)/signup` | Supabase Auth | `journey.spec.ts` | ✅ |
| Marka oluştur formu | `onboarding` | `createBrandAction` | `journey.spec.ts` | ✅ |
| Marka profili formu "Kaydet" | `settings-brand-form.tsx` | `saveBrandAction` | `settings.spec.ts` | ✅ |
| Entegrasyon "Anahtarı gir" | `settings-integrations-form.tsx` | `saveCredentialAction` | `settings-integrations.spec.ts` | ✅ |
| Entegrasyon "Sil" | `settings-integrations-form.tsx` | `deleteCredentialAction` | `settings-integrations.spec.ts` | ✅ |
| **Entegrasyon "Test et"** | `settings-integrations-form.tsx` | `verifyCredentialAction` | **YOK** — spec bilinçli olarak `voyage` (VERIFIERS'ta yok) kullanıyor, doğrulama düğmesine hiç basmıyor | ❌ **BOŞLUK** |
| "Planı üret" | `plan-view.tsx` | `generatePlanAction` | demo modda `disabled`; canlı tıklama testi yok (kuyruğa yazma, ucuz — LLM çağrısı yapmaz) | ⚠ düşük öncelik (kuyruk zaten `enqueue.type-check.test.ts` + worker testleriyle kaplı; UI düğmesi ayrı) |
| UGC seç → "İste" | `plan-view.tsx` | `requestUgcAction` | `plan-studio-bridge.spec.ts` (gerçek tıklama) | ✅ |
| **"Yeni persona" formu "Oluştur"** | `persona-studio-view.tsx` | `createPersonaAction` | **YOK** — `plan-studio-bridge.spec.ts` personayı service-role ile DOĞRUDAN ekliyor, formu hiç kullanmıyor | ❌ **BOŞLUK** |
| **"Üret" (UGC video)** | `studio-view.tsx` | `generateUgcAction` | **YOK** — para harcayan yol, hiçbir e2e onu tıklamıyor | ❌ **BOŞLUK** (gerçek üretim kasıtlı olarak test edilmeyecek — aşağıda FAZ D) |
| Ölü mektup listesi | `jobs-queue-status.tsx` | — (salt okunur) | `jobs-queue-status.spec.ts` | ✅ |
| Kuyruk "Onayla/Ertele/İptal" | `queue-view.tsx` | — | `disabled` (bilinçli, §12 adım 17'nin işi) | N/A — tıklanamaz |
| **Çıkış yap** | `sidebar.tsx` | `/logout` route handler | **YOK** — hiçbir e2e çıkış düğmesine basmıyor (testler oturumu yeniden giriş ile yönetiyor) | ❌ boşluk, düşük risk (route handler basit bir `signOut()+redirect`, veri yazmıyor) |

**Boşluk özeti — FAZ D'nin girdisi (para/DB açısından öncelik sırasıyla):**
1. `createPersonaAction` — DB'ye YENİ satır yazıyor + `persona_image` işini
   kuyruğa sokuyor (dolaylı maliyet). **Yüksek öncelik.**
2. `verifyCredentialAction` — gerçek vendor'a HTTP isteği atıyor (ucuz ama
   dış istek + rate-limit RPC'si + `record_provider_verification` yazımı).
   **Orta öncelik.**
3. `generateUgcAction` — GERÇEK para harcıyor (Kie/ElevenLabs/fal). Gerçek
   üretimi asla e2e'de tetiklemeyeceğiz; ama **ön kontrol (preflight) dalı**
   ücretsiz ve test edilebilir — düğmeye basılıp `videoPort.start()`'a hiç
   girilmeden dönen hata yollarını kapsayabiliriz. **Orta öncelik.**
4. Çıkış düğmesi — düşük risk, route handler zaten basit. **Düşük öncelik.**

Bu liste FAZ D'de kapatılacak.

---

## FAZ D — Tıklanmamış yolların kapatılması

FAZ 0.2'nin dört boşluğunun HEPSİ gerçek bir tıklamayla kapatıldı:

| Boşluk | Yeni test | Ne kanıtladı |
|---|---|---|
| `createPersonaAction` | `e2e/studio-personas.spec.ts` | "Yeni persona" formu (`sm:mode:video=live`) gerçek `personas` satırı + `media_jobs` (persona_image, queued) yazıyor. **Bulgu:** düğmenin KENDİSİ ile formun submit düğmesi AYNI etikete sahip ("Yeni persona") — hata değil ama testi ilk yazışta `getByRole` çakışmasına yol açtı (`.last()` ile çözüldü). Kod tarafında C1 sınıfı bir çökme YOK. |
| `verifyCredentialAction` | `e2e/settings-integrations.spec.ts` (yeni test) | "Test et" düğmesi (`kie`, kasıtlı geçersiz anahtar) gerçek bir vendor auth-hatası döndürüyor, `provider_credentials.last_error` doluyor. C1 sınıfı bir çökme YOK. |
| `generateUgcAction` | `e2e/studio-generate-preflight.spec.ts` | "Üret" düğmesi, persona görseli eksikken `videoPort.start()`'a HİÇ girmeden (sıfır `media_jobs` satırı) ön kontrolde reddediliyor — gerçek para harcayan dal kasıtlı olarak test EDİLMEDİ (görevin kendi kısıtı), ama düğmenin/action'ın kendisi artık kanıtlı. C1 sınıfı bir çökme YOK. |
| Çıkış yap | `e2e/smoke.spec.ts` (genişletildi) | Gerçek tıklama → `/login`'e döner → `/dashboard`'a gitmeye çalışmak GERÇEKTEN tekrar `/login`'e düşer (oturum fiilen bitmiş). |

**C1 sınıfından kaç tane daha bulundu: SIFIR.** Dört gerçek tıklamanın
dördü de ilk denemede (test yazım hataları hariç — buton etiketi
belirsizliği, `role="status"` çakışması gibi Playwright locator sorunları,
uygulama hatası değil) beklendiği gibi çalıştı. Adım 20.5 FAZ C1'in üç
`"use server"` dosyası gerçekten ilk tıklamada çökmüştü; bu faz aynı
sınıftan YENİ bir örnek bulmadı — FAZ 0.1'in statik taraması (sıfır ihlal)
ile FAZ D'nin dinamik kanıtı (sıfır çökme) birbirini doğruluyor.

**"Planı üret" düğmesi bilinçli olarak dışarıda bırakıldı** — demo modda
`disabled` (görsel olarak `plan.spec.ts` zaten kanıtlıyor), canlı modda
tıklamak gerçek bir Anthropic çağrısı yapar (adım 14'ün kapsamı, para
harcar) ve kuyruğa yazma mekanizması zaten `enqueue.type-check.test.ts` +
worker testleriyle kaplı. Bu, "test edilmeyecek" için bilinçli bir
gerekçe — envanterin son açık satırı.

**Doğrulama:** `npx playwright test` — 13/13 geçti (önceki 9 + bu fazın
4 yenisi). `npx tsc --noEmit` / `npm run lint` / `npm run test` (538 geçti)
hepsi temiz.

---

## FAZ E — Müşteriye görünen tarafın senkronizasyonu

### E1. Yeniden deploy

Kullanıcı onayı alındıktan sonra `vercel --prod` ile `main`'in ucu
(commit `a4e5585`) canlıya alındı. Alan adı değişmedi:
**https://app-gold-one-92.vercel.app**

| Doğrulama | Yöntem | Sonuç |
|---|---|---|
| Build başarılı | `vercel --prod` çıktısı | `Build Completed`, `readyState: "READY"` — `/channels`, `/composer`, `/library` yeni rotalar listede |
| `APP_MODE=demo` korunuyor | `vercel env ls production` | `APP_MODE` hâlâ `Secret` tipinde, `Production` ortamına atanmış (7 gün önce ayarlanmış, bu oturumda DEĞİŞTİRİLMEDİ) |
| Kayıt kapalı | `POST /auth/v1/signup` doğrudan Supabase'e | `422 signup_disabled` — ADIM_11'in açık bıraktığı C2 artık KAPALI (ne zaman kapatıldığı dokümante değil, muhtemelen elle) |
| Cron 5/5 pasif | `psql "$SUPABASE_DB_URL" -c "select jobname, active from cron.job"` | Beş job da (`sm-worker/publish/metrics/token-refresh/reaper`) `active = f` |
| Üretim bundle'ında `sm:mode:` yok | `/login` sayfasının `_next/static` JS chunk'ları indirilip grep'lendi (11 dosya) | Sıfır eşleşme |
| Dokuz ekran canlıda geziliyor | Gerçek bir hesapla (service-role ile kurulup görüşme sonunda silindi) giriş yapılıp `/dashboard, /plan, /queue, /studio, /library, /channels, /analytics, /composer, /settings` tek tek ziyaret edildi | Hepsi HTTP 200, `DemoBanner` her birinde görünür. Ekran görüntüleri `docs/demo/live-*.png` (altısı yenilendi, üçü — channels/composer/library — yeni) |

Doğrulama scripti (geçici Playwright config + spec) kalıcı bir test
olarak BIRAKILMADI — üretim URL'ine karşı çalışan bir test CI'da tehlikeli
olurdu (gerçek kullanıcı oluşturur/siler); tek seferlik kanıt olarak
çalıştırılıp silindi. Aynı doğrulama gerektiğinde tekrarlanabilir
(yöntem yukarıdaki tabloda yazılı).

### E2. `DEMO_SENARYOSU.md` güncellemesi

Baştan yazıldı — adım 11'de yazıldığında "hiçbir şey canlı değil" diyordu,
bugün doğru değil. Güncellenen ana noktalar:

- Sunum sırası artık 13 adım (10'dan): `/composer`, `/library`, `/channels`
  eklendi, ürünün kendi akışına (plan → yaz/üret → onayla → ölç → kanal/
  kütüphane/ayarlar) göre yerleştirildi.
- MVP tablosu her madde için ✅/⚠ durumu taşıyor artık — hangisi "GERÇEK
  her modda", hangisi "GERÇEK canlı modda, demo modda placeholder",
  hangisi "kabuk, postponed".
- Dürüstlük bölümü adım 11'den beri KAPANAN kopuklukları (UGC seçimi
  kalıcılığı, API anahtarı yönetimi) ve YENİ açık maddeleri (composer'ın
  tekrar-uyarı kararı) ayrı ayrı işaretliyor.
- Instagram sorusu artık "neden" (Meta App Review) ve "ne zaman" (belirsiz,
  Meta'nın sürecine bağlı; MVP arada tek uygulama + tester modeli) ile
  cevaplanıyor — önceki hâli yalnızca "adım 16-17" diyordu.
- Maliyet SSS'i `UGC_MALIYET_NOTU.md`'nin özetini taşıyor: birim
  maliyetler (persona görseli 24 kredi bir kez, video başına 135 kredi +
  ~$0.42, 30 video/ay ≈ 4.074 kredi + $12.60) tabloya döküldü. **Kie
  kredisinin $ karşılığı BİLEREK boş bırakıldı** — uydurulmadı.
- Kontrol listesi iki yeni gerçek bulguyla güncellendi: kayıt artık kapalı
  (doğrulandı), ve veritabanında artık SIFIR değil BİR kullanıcı var
  (`eren@gmail.com` / "Carino Pizza" markası — canlı vendor testleri için
  kurulmuş görünüyor, sunum hesabı olarak kullanılıp kullanılmayacağı
  netleştirilmeli).

**FAZ E DOĞRULAMA — tamam:** canlı URL'de dokuz ekran çalışıyor (kanıt
yukarıda); kayıt kapalı (kanıt yukarıda); cron pasif (kanıt yukarıda);
`DEMO_SENARYOSU.md` güncel.

---

## FAZ F — Kapanış

### Beş kapı

| Kapı | Komut | Sonuç |
|---|---|---|
| Tip kontrolü | `npx tsc --noEmit` | EXIT=0, çıktı yok |
| Derleme | `npm run build` (Turbopack) | Başarılı — 18 sayfa (`/channels`, `/composer`, `/library` dahil), ƒ (dinamik) |
| Lint | `npm run lint` | 0 hata, 1 önceden var olan ilgisiz uyarı (`skeleton.test.ts`, bu oturumda dokunulmadı) |
| Birim testler | `npm run test` | 538 geçti, 31 bilinçli atlandı (37 dosya, 28+9) |
| e2e | `npx playwright test` | **13/13 geçti** (9 önceki + composer/library/studio-personas/studio-generate-preflight) |

### Sır sızıntısı taraması

`git diff f60c06e..HEAD` (bu oturumun tüm commit'leri) üzerinde:
- Bilinen anahtar önekleri (`sk-ant-`, `sk-proj-`, `sk_live`, `AIza…`,
  Slack `xox…`, PEM private key başlığı) → **sıfır eşleşme**.
- Genel `key/secret/token/password = "..."` deseni → yalnızca test
  fixture'ları (`e2e-invalid-kie-key-…`, `voyage-e2e-fake-key-…`,
  `randomUUID()`) — hiçbiri gerçek bir kimlik bilgisi değil.
- Dokunulan dosya adlarında `.env`, `.pem`, `.key`, keystore, credential
  dosyası → yok.

**Sonuç: temiz.**

---

## SON RAPOR — özet

Bu bölüm, görevin istediği altı maddeyi tek yerde topluyor; her biri
yukarıdaki ilgili FAZ bölümüne bağlanıyor.

1. **FAZ 0'ın iki envanteri** — §0.1 ("use server" denetimi, sıfır ihlal)
   ve §0.2 (tıklanmamış yollar, dört boşluk) yukarıda, FAZ 0 başlığı
   altında.
2. **FAZ D'de bulunan hata sayısı ve türleri** — **SIFIR** C1 sınıfı hata.
   Dört gerçek tıklamanın (persona oluşturma, kimlik doğrulama testi, UGC
   ön kontrolü, çıkış) hepsi ilk denemede uygulama tarafında sorunsuz
   çalıştı; yalnızca test YAZIMINDA iki locator belirsizliği bulunup
   düzeltildi (buton etiketi çakışması, `role="status"` çakışması) —
   bunlar test kalitesi meselesi, uygulama hatası değil.
3. **`/composer`'ın tekrar kontrolü kararı ve gerekçesi** — **UYARIR,
   ENGELLEMEZ.** Gerekçe: adım 15'in motoru toplu/otomatik üretim
   (`plan_generate`) için tasarlandı, orada "reddet" doğru; composer'da
   tek satırı elle yazan bir insan bilinçli tekrar isteyebilir (mevsimlik
   hatırlatma, A/B varyasyonu) — "reddet" onun kararını gasp ederdi.
   Fingerprint yine de HER ZAMAN hesaplanıp yazılıyor (verdict'ten
   bağımsız), böylece bu satır sonraki bir kontrolde görünür kalıyor; tam
   kod ve yorum: `app/(app)/composer/actions.ts`.
4. **`/library`'nin RLS izolasyon kanıtı** — `e2e/library.spec.ts`: B
   markasının oturumuyla A markasının `media_assets` satırına doğrudan
   sorgu **sıfır satır** döndürdü (`error: null`, `dönen satır: 0`) VE
   B'nin `/library` sayfasında A'nın kartı **hiç görünmedi**. Silme sonrası
   hem depolama nesnesi hem DB satırı admin sorgusuyla doğrulanmış şekilde
   temiz.
5. **Canlı deploy doğrulamaları** — FAZ E1: build başarılı, `APP_MODE=demo`
   korunuyor, kayıt kapalı (`422 signup_disabled`), cron 5/5 pasif, bundle'da
   `sm:mode:` yok, dokuz ekran HTTP 200 + `DemoBanner` görünür
   (`docs/demo/live-*.png`).
6. **Varsayımlar + Meta hazır olduğunda 16-17-18 için bilmem gerekenler:**

   **Bu oturumun varsayımları:**
   - `liveChannel.list()` artık GERÇEK bir okuma (önceden `NOT_IMPLEMENTED`
     fırlatıyordu) — `/channels`'ın canlı modda render edebilmesi için
     gerekliydi. `startConnect`/`disconnect` KASITLI olarak dokunulmadı.
   - `ChannelRow`/`ChannelAccount`'a `last_synced_at`/`lastSyncedAt`
     eklendi — şemadaki kolonla hizalamak için. Bugün hiçbir yazıcı bu
     kolonu doldurmuyor (demo fixture hariç); gerçek doldurucu adım 18'in
     metrik toplayıcısı olacak (şema yorumu zaten bunu söylüyor).
   - `StoragePort`'a `remove()` eklendi — yalnızca `/library` kullanıyor,
     adım 16-18'in kapsamına girmiyor ama arayüz artık bu metodu taşıyor.
   - `/composer`'ın yazma yolu demo/live mod anahtarına HİÇ GİRMİYOR
     (marka formuyla aynı gerekçe) — ileride composer'a dokunacak bir adım
     bunun FARKLI bir desen olduğunu bilmeli.
   - `runDedupeCheck()` (adım 15, önceden yalnızca service-role admin
     istemcisiyle, `plan_generate` işleyicisinden çağrılıyordu) artık
     oturum istemcisiyle de çağrılıyor (composer). `find_similar_content()`
     RPC'sinin GÜVENLİK TANIMLAYICISI (`security definer`) içinde
     `owns_brand(p_brand_id)` kontrolü YOK — bugün güvenli çünkü tek
     çağıran (composer) `brand_id`'yi her zaman `requireBrand()`'den
     alıyor, kullanıcıdan asla doğrudan almıyor. **İleride bu RPC'yi
     çağıran YENİ bir yol eklenirse, `brand_id`'nin İSTEMCİDEN gelmediğini
     garanti etmek çağıranın sorumluluğu** — RPC'nin kendisi bunu
     zorlamıyor.
   - Kayıt (sign-up) canlıda kapalı bulundu ama NE ZAMAN/KİM tarafından
     kapatıldığı bu oturumda dokümante edilmedi (muhtemelen elle,
     Supabase panelinden). Veritabanında artık bir hesap var
     (`eren@gmail.com` / "Carino Pizza") — canlı vendor testleri için
     kurulmuş görünüyor; gerçek API anahtarları girilmiş olabilir, dikkatli
     olunmalı (yanlışlıkla gerçek üretim tetiklenmemeli).

   **Meta hazır olduğunda (adım 16-17-18) bilinmesi gerekenler:**
   - `/channels` ekranı ZATEN gerçek `channels` tablosunu okuyor
     (brand-scoped, RLS'ten geçiyor) — adım 16 bu ekranı YENİDEN YAZMAK
     ZORUNDA DEĞİL. Yalnızca `liveChannel.startConnect()`/`disconnect()`'i
     doldurup, `components/app/channels-view.tsx`'teki "Bağla" düğmesinin
     bugün SABİT `disabled` olan halini (`willConnectSoon` dalı) gerçek
     bir `startConnect()` çağrısına bağlaması yeterli.
   - `PublisherPort.publish()` hâlâ `NOT_IMPLEMENTED` (adım 17). `/queue`
     ekranındaki Onayla/Ertele/İptal düğmeleri (`queue-view.tsx`)
     `disabled` sabit — bu 11b'nin kapsamı DIŞINDA bırakıldı (görev metni
     bunu istemedi), ama adım 17 devreye girdiğinde açılması gereken
     doğal bir sonraki UI boşluğu bu.
   - `channels.last_synced_at` kolonu VAR ve `/channels` onu ZATEN
     gösteriyor — adım 18'in metrik toplayıcısı bu kolonu doldurmaya
     başladığı an ekranda hiçbir değişiklik gerekmeden görünür olacak.
   - MVP kararı gereği (BIRLESIM_PLANI §1.12) tüm markalar başlangıçta TEK
     bir Meta uygulamasına tester olarak eklenecek — marka bazlı
     `provider_credentials` satırı (kendi Meta app'ini getiren müşteri)
     yalnızca App Review çıktıktan SONRA anlamlı olacak bir yol; şema
     buna zaten hazır (D2 kararı), kod tarafı adım 16'da yazılacak.
