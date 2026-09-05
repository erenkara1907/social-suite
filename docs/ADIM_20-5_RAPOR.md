# ADIM 20.5 RAPORU — ön kontrol, kimlik doğrulama, doğrulama borçları

Tarih: 2026-09-05
Kaynak: `docs/BIRLESIM_PLANI.md` §12 · önceki oturum: `docs/ADIM_20_RAPOR.md`
(bu adımın kapattığı boşlukların kaynağı — özellikle "assumptions ve adım
16'dan önce bilinmesi gerekenler" bölümünün 1, 2, 4, 5 numaralı maddeleri).

⚠ Görev kısıtı uygulandı: **bu oturumda sıfır Kling (Kie persona_video)
çağrısı yapıldı.** Kie hesabı kredisiz kaldığı bildirilmişti — hiçbir
kontrol bu varsayıma dayanmadı, hepsi ya sıfır-vendor-çağrısı testleriyle
(FAZ A) ya ucuz/ücretsiz gerçek çağrılarla (FAZ B: hesap bilgisi okuma; FAZ
C2: ElevenLabs abonelik dahilinde) doğrulandı.

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — boru hattı ön kontrolü | ✅ Canlı doğrulandı (19+6 test) | `0e5c045` |
| FAZ B — kimlik bilgisi doğrulama | ✅ Canlı doğrulandı (8+5 test) | `1a60bfa` |
| FAZ C1 — tarayıcı E2E + 2 gerçek hata düzeltmesi | ✅ Playwright 8/8 PASS | `f90b37f` |
| FAZ C2 — retry-from-failed canlı kanıtı + 1 gerçek hata düzeltmesi | ✅ Canlı doğrulandı | `f90b37f` |
| FAZ C3 — maliyet notu | ✅ `docs/UGC_MALIYET_NOTU.md` | `f90b37f` |
| FAZ D — kapanış | ✅ Beş kapı + e2e + sır taraması | (bu rapor) |

**Beş kapı (bu oturumun sonunda):**
```
1. npx tsc --noEmit          0 hata
2. npx eslint .              0 hata (1 önceden var olan ilgisiz uyarı — skeleton.test.ts:25)
3. npx vitest run            533 PASS, 31 SKIP (37 dosya)
4. npm run build             ✓ derlendi (15 route)
5. npm audit --omit=dev      0 zafiyet
```
**Tarayıcı e2e:** `npx playwright test` — 8/8 PASS.
**Sır sızıntısı taraması:** `git diff 0e5c045~1..HEAD` üzerinde
`sk-ant-api...`/`sk_...`/`api_key=...`/PEM başlığı deseni — sıfır sonuç.

---

## FAZ A — boru hattı ön kontrolü

### Ön kontrolün yakaladığı durumlar ve tasarruf

ADIM_20'nin 2 ve 3 numaralı denemeleri `persona_video`'yu (Kling, 135
kredi) **iki kez** ödedi çünkü zincirin SONUNDAKİ ucuz kontroller
(metin uzunluğu, `default_voice_id`) yalnızca `voice` adımına
gelindiğinde çalışıyordu. Yeni ön kontrol (`lib/core/media/preflight.ts` +
`lib/server/media/preflight.ts`) zincirin GERİ KALANI için gereken TÜM
önkoşulları, ilk ücretli çağrıdan (`persona_video`) ÖNCE toplu değerlendirir:

| Kontrol | Ne zaman devreye girer | Önlediği çağrı |
|---|---|---|
| Kie anahtarı eksik | zincirde `persona_image`/`persona_video` varsa | `persona_video` (135 kredi) hiç dispatch edilmez |
| ElevenLabs anahtarı eksik | zincirde `voice` varsa | `persona_video` (135 kredi) — ADIM_20'nin TAM OLARAK yaşadığı senaryo |
| fal anahtarı eksik | zincirde `lipsync` varsa | `persona_video` (135 kredi) + gerçek ElevenLabs çağrısı |
| Persona görseli yok | zincirde `persona_video` varsa | `persona_video` (135 kredi) |
| `default_voice_id` yok | zincirde `voice` varsa | `persona_video` (135 kredi) |
| Script fal `cut_off` sınırını (65 karakter/5sn) aşıyor | zincirde `voice` varsa | `persona_video` (135 kredi) + kesik/bozuk bir video |

Kontrol "kalan adımlar" hassasiyetiyle çalışır: `fromStep=voice` iken
`kie` hiç istenmez (persona_video zaten bitmiş demektir) — canlı testte
(`preflight.live.test.ts` KONTROL 2) doğrulandı.

**Kullanıcı üretime basmadan ÖNCE görür:** `/studio` artık markanın eksik
sağlayıcı anahtarını (kie/elevenlabs/fal) bir banner'da, tıklamadan ÖNCE
gösteriyor (`studio/page.tsx`, `isProviderConfigured` — yalnızca "var mı"
sorgusu, üç ucuz DB okuması). `generateUgcAction` da AYNI kontrolü
(kullanıcı oturumuyla, service-role olmadan) tekrar uygular — defense in
depth, iş kuyruğa hiç girmeden hatayı gösterir.

**Kanıt:** `lib/core/media/preflight.test.ts` (19 birim testi, saf
fonksiyon) + `lib/server/media/preflight.live.test.ts` (6 canlı Supabase
testi, `RUN_UGC_PREFLIGHT_LIVE_TEST=1`, sıfır vendor çağrısı — `runUgcPipelineStep`
`PermanentJobError` ile durduğunda `media_jobs` satırının HİÇ açılmadığı
doğrulandı).

---

## FAZ B — kimlik bilgisi doğrulama

### Seçilen test uç noktaları ve gerekçe

| Sağlayıcı | Uç nokta | Gerekçe |
|---|---|---|
| **Anthropic** | `models.list({limit:1})` | Modelleri LİSTELER, hiçbir token FATURALANDIRMAZ — `messages.create()` (gerçek üretim) en ucuz haliyle bile en az bir token harcar |
| **Kie** | `getCredits()` (`/chat/credit`, zaten vardı) | Kredi bakiyesi zaten en ucuz uç nokta — salt okuma, render BAŞLATMAZ |
| **ElevenLabs** | `getVoiceQuota()` (`/v1/user/subscription`, zaten vardı) | Abonelik/kota bilgisi — salt okuma. `listTurkishVoices()` alternatifti ama daha ağır gövde döndürür |
| **fal** | `queue.status()` var OLMAYAN bir `requestId` için | fal'in okunacak bir bakiye uç noktası YOK (dosya başlığının kendi notu). Kuyruk DURUMU sorgusu yalnızca OKUR; auth katmanı istek gövdesine bakmadan ÖNCE anahtarı reddeder — 401/403 = geçersiz, başka HERHANGİ bir kod (tipik 404) = geçerli anahtar |

**Canlı kanıt** (`lib/core/providers/verify.live.test.ts`, 8 test,
gerçek+geçersiz anahtar): kie/elevenlabs/fal gerçek anahtarlarla `ok:true`,
uydurma anahtarlarla `ok:false` + net hata mesajı. Anthropic'in GEÇERSİZ
anahtarı `ok:false` ("API key is invalid") — beklenen. Anthropic'in
GERÇEK (Carino Pizza) anahtarı da `ok:false` döndü, ama BEKLENDİK bir
sebeple: ADIM_15'in zaten bildiği "identity-linked anahtar,
`anthropic-workspace-id` header'ı gerekiyor" sorunu HÂLÂ çözülmemiş —
bu oturumun kapsamı dışında, aşağıda tekrar not edildi.

**Rate limit + rozet:** `check_credential_verify_rate_limit` (marka
başına 10/saat) + `record_provider_verification` (last_verified_at/
last_error yazar, RAW anahtarı hiç görmez) — iki yeni SQL fonksiyonu,
`supabase/tests/credential_verify.sh` ile 5 iddia canlı doğrulandı
(yazma, hata korunumu, sahiplik reddi, hız sınırı, marka-başına kapsam).

**Biçim ön kontrolü:** ElevenLabs `sk_`, Anthropic `sk-ant-` — kaydetme
anında uyarır (bloklamaz). kie/fal için belgelenmiş bir önek bu oturumda
teyit edilemedi, TAHMİN YÜRÜTÜLMEDİ.

---

## FAZ C2 — retry-from-failed kanıtı

`lib/server/media/retry-from-failed.live.test.ts`: `persona_video` ELLE
`succeeded` (sahte `vendor_task_id`, Kie'ye HİÇ gidilmeden), `voice` ELLE
`failed` kuruldu, sonra GERÇEK `runUgcPipelineStep({step:"voice"})` ile
retry edildi (gerçek ElevenLabs, abonelik dahilinde — ek kredi yok).

**Kanıt:**
- `voice` satırı AYNI `id` ile `succeeded`'a geçti — retry yeni bir satır
  AÇMADI, var olanı yeniden kullandı.
- `persona_video` satırı BAYT BAYT aynı kaldı (`vendor_task_id`,
  `finished_at` retry ÖNCESİ/SONRASI birebir eşleşti) — retry onu ne
  yeniden denedi ne dokundu.
- (persona, step=voice) üçlüsü için TEK satır — ikinci bir satır YOK.

**Bu test sırasında bulunan gerçek hata:** retry başarıyla bitmesine
rağmen `media_jobs.error` sütunu attempt 1'in eski mesajını KORUYORDU
(`state='succeeded'` olsa da). Üç yazım noktası (`lib/server/storage.ts`
×2 — `persistBytesAsset`/`persistVendorAsset`, `lib/server/media/poll.ts`
×1 — `completePersonaVideo`) artık `succeeded` UPDATE'inde `error: null`
da yazıyor.

---

## FAZ C1 — tarayıcı E2E + iki gerçek hata

`e2e/plan-studio-bridge.spec.ts` yazılırken (ve GERÇEKTEN çalıştırılırken)
iki gerçek, üretimi etkileyen hata bulundu ve düzeltildi:

1. **`/plan`'ın UGC seçimi canlı modda hiç çalışmıyordu.** Seçim kutuları
   `plannerPort.generate()`'in KALICILAŞMAYAN AI önizlemesinden
   (sentetik `"skeleton-N"` id'ler) besleniyordu; canlı modda "İste"
   demek gerçek bir uuid FK sütununa geçersiz bir değer yazmaya çalışıp
   ANINDA patlıyordu (`psql` ile doğrulandı: "invalid input syntax for
   type uuid"). **ADIM_9 varsayım 5 aslında HİÇ kapanmamıştı.** Düzeltme:
   seçim artık gerçek `contentPort.list()` satırlarını kullanıyor
   (`app/(app)/plan/page.tsx`in `ugcCandidates`'i).
2. **Üç "use server" dosyası (`plan/actions.ts`, `studio/actions.ts`,
   `studio/personas/actions.ts`) Next.js'in "yalnızca async fonksiyon
   export edilebilir" kuralını ihlal ediyordu** — başlangıç state
   sabitleri doğrudan oradan export ediliyordu. Hiçbir önceki e2e testi
   ilgili action'ı GERÇEKTEN çağırmadığı için (düğmeler demoda disabled
   ya da hiç tıklanmamış) fark edilmemişti; canlı Playwright turu ilk kez
   tetikledi ("A 'use server' file can only export async functions,
   found object"). Sabitler ilgili istemci bileşenlerine taşındı.

Düzeltmelerden sonra tam akış (`npx playwright test`, 8/8 PASS):
seç → İste → `/studio`'da görünür → `/studio/personas` listeler →
`/plan`'a dönünce istenen içerik ARTIK seçim listesinde yok (kalıcı).
Demo mod izolasyonu mevcut `smoke.spec.ts`/`journey.spec.ts` tarafından
zaten kanıtlı (sıfır dış istek, `Kie/ElevenLabs/fal`'a hiç gidilmiyor).

---

## FAZ C3 — maliyet notu

Tam tablo: `docs/UGC_MALIYET_NOTU.md`. Özet:

| Adım | Birim maliyet |
|---|---|
| `persona_image` | 24 kredi (persona başına, bir kez) |
| `persona_video` | 135 kredi (video başına) |
| `voice` | 0 kredi (abonelik dahilinde) |
| `lipsync` | ~$0.42 (5sn klip) |

| Aylık video | Toplam Kie kredisi | fal ($) |
|---|---|---|
| 10 | 1.374 | $4.20 |
| 30 | 4.074 | $12.60 |
| 60 | 8.124 | $25.20 |

⚠ Kie kredisinin $ karşılığı **bilinçli olarak boş** — Kie panelinden
doldurulacak, uydurulmadı.

---

## Varsayımlar ve kalan adımların durumu

1. **Kie hesabı hâlâ kredisiz olabilir** — bu oturum hiç Kling çağırmadı,
   durumu değiştirmedi. Bir sonraki gerçek UGC üretimi (adım 20'nin TEST
   3'ü gibi) top-up gerektirebilir.
2. **Anthropic anahtarı (Carino Pizza) HÂLÂ workspace'e bağlı değil**
   (ADIM_15'in bildiği risk) — bu oturumda canlı doğrulandı
   (`verify.live.test.ts`), ÇÖZÜLMEDİ. `/settings`'teki yeni "test et"
   düğmesi bunu artık AÇIKÇA gösterir ("Hata verdi" rozeti +
   `anthropic-workspace-id` mesajı) — kullanıcı bunu görüp anahtarı
   değiştirebilir.
3. **`/plan`↔`/studio` köprüsü artık gerçekten çalışıyor** (FAZ C1) —
   ADIM_9 varsayım 5 GERÇEKTEN kapandı, kod okumasıyla değil canlı
   Playwright'la.
4. **Retry-from-failed'in gerçek mekanizması** artık canlı kanıtlı (FAZ
   C2) — ADIM_20'nin TEST 3'ünün kapattığı boşluk.
5. **`PERSONA_VIDEO_MOTION_PROMPT_EN` hâlâ `⚠ DOĞRULANMALI`** — bu
   adımın kapsamı dışında, değişmedi.
6. **Adım 11b (ertelenen ekranlar: `/library`, `/composer`, `/channels`,
   vb.)** — kritik yolda değil, bu oturumda dokunulmadı, hâlâ bekliyor.
7. **Adım 16-17-18 (Instagram bağlama/yayın/metrik)** — Meta App Review
   onayı beklemede (§1.12 MVP kararı: tek Meta uygulaması, tester
   limiti ~25). Bu oturum onları İLERLETMEDİ; sıradaki gerçek adım bu
   üçü, Meta hazır olduğunda.
8. **Adım 21 (güvenlik kapanışı)** — §10'un 16 maddesinin denetimi,
   henüz yapılmadı; adım 16-17-18'den SONRA planlı (BIRLESIM_PLANI'nın
   gerçek uygulama sırası: `... → 20 → 20.5 → 16 → 17 → 18 → 21 → 22`).
