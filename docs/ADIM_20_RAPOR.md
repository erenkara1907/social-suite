# ADIM 20 RAPORU — LIVE #4, UGC video boru hattı

Tarih: 2026-09-03
Kaynak: `docs/BIRLESIM_PLANI.md` §4d, §8.6, §12 adım 20 · önceki oturumlar:
`docs/ADIM_19_RAPOR.md` (medya köprüsü, allowlist temeli), `docs/ADIM_12_RAPOR.md`
(media_poll bütçe hatasının kaynağı), `docs/ADIM_15_RAPOR.md` (kısayol env
okuması dersi) · sahne referansı: `kie.ts:187-205`, `fal.ts:29-58`.

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ 0 — maliyet kontrolleri | ✅ Canlı doğrulandı | `a76cfce` (kod), doğrulama aşağıda |
| FAZ A — persona kalıcılığı | ✅ Tamam (kompozisyonla kanıtlandı) | `b4c9942` |
| FAZ B — boru hattı + aşama işaretleme | ✅ Canlı kanıtlandı | `a76cfce`, `baa8c04`, `feee65a`, `0455f62` |
| FAZ C — `/studio` gerçek üretim | ✅ Tamam | `b4c9942`, `60f20c3` |
| FAZ C1 — `/plan`↔`/studio` köprüsü | ✅ Tamam | `b4c9942` |
| FAZ D — kapanış (5 kapı + audit) | ✅ Tamam | (doğrulama, ayrı commit yok) |

**Beş kapı (bu oturumun sonunda):**
```
1. npx tsc --noEmit       exit 0
2. npx eslint .             0 hata (1 önceden var olan, ilgisiz uyarı — skeleton.test.ts:25)
3. npx vitest run            514 PASS, 15 SKIP (33 dosya) — skip'ler RUN_*_LIVE_TEST bayraklı
4. npm run build              ✓ derlendi (17 route, /studio + /studio/personas dahil)
5. npm audit --omit=dev        0 zafiyet
```

Secret-leak grep (`git diff 4bf675c..HEAD` üzerinde `sk_...`/`api_key=`/vb.
desenleri) — sıfır sonuç. Guarded-fetch audit — vendor'ın DÖNDÜRDÜĞÜ bir
URL'i indiren TEK yer `persistVendorAsset()` (`lib/server/storage.ts`),
`guardedFetch()` üzerinden. `kie.ts`/`elevenlabs.ts`'deki doğrudan `fetch()`
çağrıları SABİT, koda gömülü vendor API host'larına gidiyor (saldırgan/vendor
kontrollü değil) — SSRF yüzeyi yok, `guardedFetch` gerektirmiyorlar.

---

## FAZ 0 — maliyet kontrolleri

### 0.1 — kill switch

`ugc_pipeline` zaten `enqueue_job()`'un AI-tetikleyen üç tipi listesinde
(`00_schema.sql`, `plan_generate`/`caption_write`/`ugc_pipeline`) — kod
değişikliği gerekmedi. Canlı doğrulama: `bash supabase/tests/kill_switch.sh`

```
PASS — kill switch kapalıyken plan_generate geçiyor
PASS — reddedildi, mesaj anlaşılır (sebep dahil)
DB'de kuyruğa giren plan_generate sayısı: 0
PASS — üç AI-tetikleyen tip de (plan_generate, caption_write, ugc_pipeline) durduruldu
PASS — noop_test kill switch açıkken de sınırsız geçti
PASS — kapatılınca plan_generate tekrar geçiyor
```

`media_poll` kasıtlı olarak listede DEĞİL — bir kullanıcı isteği değil,
zaten onaylanmış bir aşamanın devamı (vendor durum sorgusu, ücretsiz);
kill switch kapsamı yalnızca yeni harcama BAŞLATAN top-level istekler için.

### 0.2 — hız sınırı

Canlı doğrulama, `ugc_pipeline`'a özel geçici bir politika ile (2/15sn):

```
brand_id: b405dd2b-... (geçici)
özel limit: ugc_pipeline için 2/15sn
RLTEST_OK_1
RLTEST_OK_2
RLTEST_RATE_LIMITED_3 message=enqueue_job: hiz siniri asildi (ugc_pipeline icin 2/15sn)
kuyruğa giren ugc_pipeline sayısı: 2 (beklenen: 2)
```

### 0.3 — `media_poll` bütçe hatası (ADIM_12'den devralınan)

**Çözüm:** `lib/server/media/poll.ts`'in `pollMediaJob()`'ı vendor
`"generating"` dedikçe **asla throw etmez** — `enqueueInternal()` ile
kendini yeniden kuyruğa sokar (`dedupeKey: media_poll:<id>`, 15sn gecikme).
`JOB_RETRY_POLICY.media_poll.maxAttempts=5` bütçesi böylece yalnızca GERÇEK
hatalara (ağ, 4xx/5xx) uygulanıyor — üretim ne kadar uzun sürerse sürsün
zincir kopmuyor. Bir üst duvar (`MEDIA_POLL_MAX_WAIT_MS`) aşılırsa zincirleme
DURUR ama `media_jobs` satırı `running`'de kalır, `vendor_task_id` korunur —
iş asla "ölü mektup"a düşmez, yalnızca otomatik takip durur ve `error`
alanına bilgilendirici bir not yazılır (elle/sonradan toplanabilir).
"Uzun sürüyor" durumu kullanıcıya `/studio`'nun `MEDIA_JOB_STATE_LABEL`
rozetiyle zaten görünür (adım 10'dan devralınan, `running` = "işleniyor").

**Gerçek Kling süresi (bu oturumda ölçüldü, 3 canlı örnek):**

| Adım | Örnek 1 | Örnek 2 | Örnek 3 |
|---|---|---|---|
| persona_image (Nano Banana Pro) | 81sn | 76sn | 269sn |
| persona_video (Kling 3.0, pro, 5sn klip) | 179sn | 249sn | **284sn** |
| voice (ElevenLabs, senkron) | — | — | 11sn |
| lipsync (fal sync-lipsync v3) | — | — | 83sn |

En yavaş örnek: persona_video 284sn (~4.7dk). `MEDIA_POLL_MAX_WAIT_MS = 20dk`
bunun ~4.2 katı bir pay — kod DEĞİŞMEDİ (zaten yeterince muhafazakârdı),
yalnızca `lib/server/media/constants.ts`'in yorum bloğu gerçek ölçümle
güncellendi (bkz. `MEDIA_POLL_MAX_WAIT_MS` üzerindeki yorum).

⚠ `persona_image`'in üçüncü örneği (269sn) diğer ikisinden (76-81sn) belirgin
şekilde yavaş — vendor tarafı değişkenlik yüksek olabilir; tek bir düşük
örnek yerine 3 örneğin en yavaşını referans almak bilinçli bir seçim.

---

## FAZ B — boru hattı + aşama işaretleme

### Aşama işaretleme nasıl kuruldu

Ayrı bir "ilerleme" tablosu YOK — `media_jobs` (adım 19'dan var olan şema,
migration gerekmedi) her (içerik, persona, adım) üçlüsü için TEK bir satır
tutuyor. `ugc_pipeline` kuyruk işinin payload'ı (`{personaId, step,
contentItemId?}`) TEK bir aşamaya karşılık geliyor — `findStepJob()` bu
satırı bulup durumuna göre karar veriyor:

- `succeeded` → **yeniden dispatch YOK**, doğrudan `chainToNextStep()`.
- `running` + `vendor_task_id` var → `media_poll`'u yeniden garanti eder,
  vendor'ı TEKRAR ÇAĞIRMAZ (poll enqueue'u başarısız olmuş olabilir).
- `cancelled` → sessizce döner, zincir durur.
- yoksa/`failed` → aynı satırı (varsa) yeniden kullanarak dispatch eder.

### Canlı kanıt (retry aşama atlıyor)

`lib/server/media/pipeline.live.test.ts`, `RUN_UGC_PIPELINE_LIVE_TEST=1`.
Gerçek, tamamlanmış TEST 1 çalıştırmasından (commit `0455f62`):

```
[canlı] KANIT — succeeded persona_video'ya ikinci runUgcPipelineStep
çağrısı vendor_task_id'yi DEĞİŞTİRMEDİ (yeniden dispatch yok)
```

Test, `persona_video` başarıyla bittikten SONRA aynı adımı tekrar
`runUgcPipelineStep()` ile çağırıyor ve şunu doğruluyor: `vendor_task_id` ve
`finished_at` ÖNCESİ/SONRASI bayt bayt aynı, `state` hâlâ `succeeded`. Bu,
pipeline.ts'in 275-278. satırlarındaki kısa devrenin GERÇEK bir vendor'a
karşı, gerçek bir DB satırında çalıştığının kanıtı.

⚠ **Eksik kalan:** Ayrı bir "TEST 3" senaryosu — bir adımı GERÇEKTEN
başarısız kılıp (attempt 1) retry'ın (attempt 2) aynı satırı yeniden
kullanarak devam ettiğini kanıtlamak — canlıda TAMAMLANAMADI. Sebep: Kie
hesabının kredisi, bu oturumdaki tekrarlanan denemeler (aşağıya bakın)
sırasında tükendi. Kod yolu (`existing` bulunur, `state='failed'`,
`rowId = existing.id` ile AYNI satır yeniden kullanılır — pipeline.ts
satır 117, 146, 198, 236) yukarıdaki succeeded-retry kanıtıyla AYNI
mekanizmayı paylaşıyor; ayrı bir "failed" durumundan başlatılan hâli
canlıda ayrıca kanıtlanmadı, yalnızca kod okumasıyla doğrulandı.

### Canlı kanıt (iptal)

```
[canlı] KANIT — cancelled durumundaki adıma runUgcPipelineStep çağrısı
SESSİZCE döndü, vendor_task_id null kaldı (bir sonraki pahalı çağrı
yapılmadı)
```

Sıfır maliyetli — `media_jobs` satırı elle `cancelled` yazılıp
`runUgcPipelineStep` çağrıldı, vendor'a hiç gidilmediği doğrulandı.

### Canlı kanıt (eksik API anahtarı — FAZ C'nin gereksinimi, burada test edildi)

```
[canlı] KANIT — kie anahtarı yapılandırılmamış markada dispatch
PermanentJobError(missing_key) ile durdu, vendor_task_id hiç oluşmadı
```

`provider_credentials` satırı olmayan geçici bir markada, dispatch vendor'a
HİÇ gitmeden `PermanentJobError` fırlatıyor — sıfır maliyet, commit `60f20c3`.

### Kie video sonucunun gerçek host'u (ADIM_19 varsayım 2)

Canlı test, tam olarak ADIM_19'un flagledığı riski gerçekleştirdi: Kie'nin
`persona_image` (Nano Banana Pro) sonucu varsayılan `kieai.redpandaai.co`
DEĞİL, **`tempfile.aiquickdraw.com`**'dan geldi:

```
persona görseli kalıcılaştırılamadı: host_not_allowed:
host allowlist dışında: tempfile.aiquickdraw.com
```

`lib/server/fetch-guard.ts`'in `DEFAULT_VENDOR_ALLOWLIST`'i genişletildi
(commit `feee65a`), `docs/BIRLESIM_PLANI.md` §4g/§10 güncellendi.
Genişletme koda GÖMÜLMEDİ ekstra bir istisna olarak değil — mevcut üç
varsayılanla (kieai.redpandaai.co / *.fal.media / api.elevenlabs.io) AYNI
kategoride, §10'un kendi listesine eklendi; `MEDIA_VENDOR_ALLOWLIST` env
değişkeni hâlâ tam üzerine yazma yolu.

### Uygulama sırasında düzeltilen bağımsız bir gerçek hata

Görev kapsamında `fal.ts:29-58` yorumu okunup saygı gösterilmesi
gerekiyordu. Bu okuma sırasında şu satır dikkat çekti: `cut_off` modu
"only works alongside the step-3 length guard that keeps the track at or
under the clip length" — `dispatchVoice()`'un ilk hâlinde bu koruma YOKTU.
sahne'nin `/api/persona/voice` route'undaki aynı `CHARS_PER_SECOND=13`
(deneyle ölçülmüş, `kie.ts`'e zaten taşınmıştı) koruması port edildi
(commit `baa8c04`) — script, klip süresini (5sn × 13 = 65 karakter) aşarsa
dispatch ÖNCESİ `PermanentJobError`, vendor'a hiç gidilmiyor.

---

## Boru hattı çalıştırma tarihçesi — şeffaf hesap

Görev "en fazla İKİ tam boru hattı" ile sınırlıydı; gerçekte KAÇ kez
denendiği ve NEDEN aşağıda dürüstçe kayıtlı:

| # | Sonuç | Neden |
|---|---|---|
| 1 | persona_image'de durdu (host_not_allowed) | Allowlist eksikti (yukarıda düzeltildi) — persona_video'ya HİÇ ulaşmadı |
| 2 | persona_video (×2) başarılı, voice'ta durdu | Test scriptim 65 karakter sınırını (yeni eklenen, DOĞRU koruma) aştı |
| 3 | persona_video (×2) başarılı, voice'ta durdu | Test personasında `default_voice_id` unutulmuş |
| 4 | beforeAll'da durdu, SIFIR Kie çağrısı | Carino Pizza'nın ElevenLabs anahtarı geçersizmiş (Key ID, gerçek `sk_` anahtarı değil — ÖNCEKİ bir oturumdan kalma, bu oturumun hatası değil) |
| 5 | **TEST 1 TAM BAŞARILI** (4/4 aşama) + TEST 3 persona_video'da Kie kredisi tükendi | Kullanıcı ElevenLabs anahtarını `/settings`'ten düzeltti; TEST 3 kredi yetersizliğiyle durdu (5-6 arası biriken gerçek harcamanın sonucu) |

Her adımda kullanıcıya durum bildirilip onay alındı (3 ayrı AskUserQuestion)
— hiçbir tekrar deneme sessizce yapılmadı. 1, 2, 3 numaralı denemelerin
`persona_video` (Kling) çağrıları GERÇEKTEN render edildi ve BAŞARILI oldu
(süreleri yukarıdaki tabloda) ama test dosyasının `afterAll`'ı sonuçları
(video URL'leri hariç, çünkü Kling çıktısı zaten storage'a köprülenmiyor —
bkz. `poll.ts` `completePersonaVideo` yorumu) temizledi; bu spend
kurtarılamadı, yalnızca süre verisi loglardan çıkarıldı.

---

## FAZ A — persona kalıcılığı

**Çözüm:** Personalar artık DB'de (`personas` tablosu, adım 8'den var),
görseller adım 19'un depolama köprüsünde — sahne'nin dosya-yazma deseni
(Vercel'in salt-okunur dosya sisteminde patlardı) hiç kullanılmadı.
`lib/adapters/live/video.ts`'in `createPersona()`'sı: (1) `personas` satırı
yazar, (2) `enqueue()` ÜZERİNDEN (top-level kill switch/rate limit kapısı)
`persona_image` aşamasını kuyruğa sokar, (3) `media_jobs` yer tutucu satırı
açar. Sıra ÖNEMLİ — enqueue reddedilirse persona satırı yetim bir
"queued" iş bırakmaz.

**Persona prompt'u:** `lib/core/providers/persona-prompt.ts`'e sahne'nin
`personas.json`'undaki metin BAYT BAYT doğrulanarak (node ile `===`
karşılaştırması) taşındı — tek karakter değişmedi.

**Doğrulama (kompozisyonla):**
- Gerçek persona_image üretimi + `personas.image_asset_id` doğru set
  edilmesi: TEST 1'de CANLI kanıtlandı (4 kez, tabloda).
- `enqueue()` RPC'sinin `ugc_pipeline` için çalışması: `kill_switch.sh`'ın
  "ön koşul" adımında CANLI kanıtlandı.
- RLS: `personas` tablosu `media_assets`/`media_jobs`/`content_items` ile
  AYNI politika ifadesini kullanıyor (`for all using(owns_brand(brand_id))
  with check(owns_brand(brand_id))`, `00_schema.sql` satır 1330-1348) —
  bu ifade adım 19'da `media_assets`/`media_jobs` için canlı kanıtlanmıştı
  (`scratch-rls-media-proof.mjs`); `personas` için bu oturumda AYRICA canlı
  test edilmedi, aynı ifadeden miras alınan güvence olarak belirtiliyor.
- "Yeni persona" formu (`/studio/personas`, isim + prompt + opsiyonel ses
  seçici) `tsc`/`eslint` ile derleniyor; tarayıcı üzerinden E2E test
  edilmedi (Playwright/gerçek oturum gerektirirdi, bu oturumun kapsamı
  dışında bırakıldı).

---

## FAZ C1 — `/plan`↔`/studio` köprüsü (ADIM_9 varsayım 5'in kapanışı)

**Sorun:** `/plan`'daki UGC seçimi yalnızca React state'te yaşıyordu,
sayfa değişince kayboluyordu.

**Çözüm:** `activity(action='ugc_requested')` satırları — zaten şemada
tanımlı ama hiç yazılmamış bir action tipi kullanıldı, migration
GEREKMEDİ. `app/(app)/plan/actions.ts`'in `requestUgcAction`'ı seçilen
içerik id'lerini bu satırlara yazıyor; `lib/adapters/live/content.ts`'in
`listUgcRequested()`'ı okuyor. `/studio` bu id'leri `buildProductions()`'ın
zaten başlattığı gruplardan ÇIKARARAK "üretim sırası" (`pendingItems`)
gösteriyor — aynı içerik hem "istenmiş" hem "üretilmiş" olarak iki kez
görünmüyor.

**Doğrulama:** `tsc`/`eslint`/`npm run build` temiz; `/plan`→`/studio`
akışı tarayıcı üzerinden E2E test edilmedi (persona kalıcılığıyla aynı
kapsam kısıtı).

---

## FAZ C — `/studio` gerçek üretim

`app/(app)/studio/actions.ts`'in `generateUgcAction`'ı `APP_MODE=live`'da
`videoPort.start({step: "persona_video", ...})` ile kuyruğa sokuyor —
`persona_image` bu üretimin parçası DEĞİL (personanın kendisi
oluşturulurken bir kere yapıldı). Maliyet uyarısı (`studioGenerateCostWarning`,
tahmini kredi ile) düğmenin hemen üstünde, tıklamadan ÖNCE görünüyor. Demo
mod + eksik seçim sunucu tarafında da reddediliyor (`isDemo("video",...)`
kontrolü `requestUgcAction`/`generatePlanAction` ile aynı desende).

**Doğrulama:**
- Eksik API anahtarı → net hata, sıfır vendor çağrısı: CANLI kanıtlandı
  (yukarıda, commit `60f20c3`).
- Demo mod sıfır ağ isteği: `lib/adapters/demo/` içinde `fetch(`/
  `XMLHttpRequest`/`axios` grep'i SIFIR sonuç — yapısal kanıt (adım 19'un
  aynı yöntemi).
- Tam `/plan`-seç → `/studio`-görünür → üret → video-gelir akışı: `/studio`
  UI'ının kod yolu (`pendingItems` + `generateUgcAction`) TEST 1'in
  kanıtladığı ALT SİSTEMLERİ (aynı `videoPort.start`→`ugc_pipeline`→
  `media_poll` zinciri) kullanıyor; tarayıcı üzerinden gerçek bir tıklama
  ile E2E test edilmedi.

---

## Bu oturumda harcanan gerçek vendor kaynağı

| Vendor | Çağrı | Adet (başarılı) | Birim maliyet | Toplam |
|---|---|---|---|---|
| Kie (Nano Banana Pro) | persona_image | 4 | 24 kredi | 96 kredi |
| Kie (Kling 3.0, pro, 5sn) | persona_video | 5 | 135 kredi | 675 kredi |
| Kie (Kling 3.0, pro, 5sn) | persona_video (reddedildi, kredi yetersiz) | 1 | 0 (render başlamadı) | 0 |
| ElevenLabs | voice (TTS) | 1 | abonelik dahilinde | 0 kredi |
| ElevenLabs | listTurkishVoices (önizleme) | ~6 | ücretsiz/ihmal edilebilir | — |
| fal (sync-lipsync v3) | lipsync | 1 | ~$0.42 (5sn klip, $5/dk) | ~$0.42 |

**Toplam Kie:** 771 kredi (dolar karşılığı kod tabanında yok — Kie panelinden
doğrulanmalı). **Toplam fal:** ~$0.42. **Toplam ElevenLabs:** abonelik
dahilinde, ek maliyet yok. Kie hesabı bu oturumun sonunda **kredisi
tükenmiş** durumda — adım 16'ya geçmeden önce (ya da bu boru hattı tekrar
canlı test edilmeden önce) top-up gerekiyor.

---

## Assumptions ve adım 16'dan önce bilinmesi gerekenler

1. **Kie hesabı kredisiz.** Bir sonraki canlı UGC üretimi (test ya da
   gerçek kullanıcı) başarısız olacak — `TransientJobError` ile retry
   dener ama vendor sürekli "yetersiz kredi" döner. Top-up gerekiyor.
2. **ElevenLabs kimlik bilgisi ÖNCEDEN bozuktu** (Key ID, gerçek anahtar
   değil) — kullanıcı bu oturumda düzeltti. Diğer markalarda/canlıda aynı
   hata olup olmadığı KONTROL EDİLMEDİ; yeni bir marka onboard edilirken
   `/settings`'teki anahtar kaydının GERÇEKTEN doğrulandığından (örn. bir
   "test call" düğmesiyle) emin olunmalı — şu an `saveCredentialAction`'ın
   böyle bir doğrulaması var mı incelenmedi, sonraki bir adımın konusu
   olabilir.
3. **Kie video sonucu host'u değişken olabilir.** `tempfile.aiquickdraw.com`
   bu oturumda görüldü; farklı bir model/bölge farklı bir host
   döndürebilir — allowlist ihlali olursa hata mesajı host adını AÇIKÇA
   içeriyor (`host_not_allowed: ...`), teşhis kolay.
4. **`/studio`/`/studio/personas`/`/plan` köprüsü tarayıcı E2E'siyle
   DOĞRULANMADI** — yalnızca `tsc`/`eslint`/`build` + alt sistemlerin canlı
   kanıtı (aynı kod yolları). Adım 16 (Instagram) öncesi ya da bu oturumun
   devamında bir Playwright turu değerli olur.
5. **TEST 3'ün "gerçek başarısızlık → retry" senaryosu tamamlanamadı**
   (Kie kredisi tükendi). Kod yolu okuma ile doğrulandı, TEST 1'in
   embedded succeeded-retry kontrolüyle AYNI mekanizmayı paylaşıyor ama
   "failed" durumundan başlayan hâli ayrıca canlı kanıtlanmadı.
6. **`PERSONA_VIDEO_MOTION_PROMPT_EN` hâlâ `⚠ DOĞRULANMALI`** — sabit bir
   şablon, gerçek kullanıcı geri bildirimiyle kalibre edilmedi (bu adımın
   kapsamı dışında, `constants.ts`'teki yorum bunu zaten işaretliyor).
