# ADIM 15 RAPORU — tekrar önleme motoru ve devam zinciri

Tarih: 2026-09-01
Kaynak: `docs/BIRLESIM_PLANI.md` §4b/§4c/§8.1/§8.6/§9.1/§11 S3, Akış E ·
görev metninin FAZ A revizyonu (BYOK gerçeği: Voyage girilmedi).

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — embedding portu + zarif düşüş | ✅ Tamam | `885e263` |
| FAZ B — üç katmanlı tespit motoru | ✅ Tamam | `ca89b16` |
| FAZ C — plan_generate'e bağlama | ✅ Tamam (kısmi canlı doğrulama, aşağıda) | `2c91c54` |
| FAZ D — kapanış | ✅ Beş kapı + e2e yeşil | (doğrulama, ayrı commit yok) |

**Beş kapı + e2e:**
```
1. npx tsc --noEmit          exit 0
2. npx eslint .               0 hata (1 önceden var olan, ilgisiz uyarı — skeleton.test.ts)
3. npx vitest run              480 PASS, 3 SKIP (29 dosya)
4. npm run build                ✓ derlendi
5. npx playwright test          7/7 PASS
```

---

## 1. Voyage teyidi — SONUÇ: ERTELENDİ (revize A2 kararı)

Bu oturumda **hiçbir sağlayıcıya özgü kod/model adı yazılmadı**. Nedeni
görev metninin kendi revizyonu: bugün hiçbir markada `VOYAGE_API_KEY`/Vault
satırı yok (doğrulandı — `provider_credentials` tablosunda `provider='voyage'`
hiç satır yok), dolayısıyla `output_dimension` parametresini doğrulayacak bir
canlı çağrı yapılamazdı ve "⚠ Model adlarını uydurma" kuralı gereği
uydurulmadı.

`docs/BIRLESIM_PLANI.md` §11 S3 **güncellendi**: önceki oturumun kapattığı
"Voyage `voyage-3.5`, `output_dimension=1024`" kararı **AÇIK**'a çevrildi —
sağlayıcı seçilene kadar açık, **kolon sözleşmesi (`vector(1024)`) sabit**.

**D3 kararı DEĞİŞMEDİ, teyidi ERTELENDİ:** `content_items.embedding
vector(1024)` sabit kalıyor. Hangi sağlayıcı seçilirse seçilsin, `embed()`
tam 1024 boyut döndürmek ZORUNDA — bu sözleşme `lib/adapters/ports.ts`'in
`DedupePort` yorumunda ve `00_schema.sql`'in kolon yorumunda aynen duruyor.

### Boyut kanıtı
Sağlayıcı gerçek bir HTTP çağrısı yapmadığı için "gerçek 1024" kanıtı yok —
bunun yerine **demo implementasyonun sözleşmeye uyduğunun** kanıtı var:
`lib/core/dedupe/demo-embedding.test.ts` → `demoEmbed(...).length === 1024`
(`EMBEDDING_DIMENSIONS` sabitine karşı, 5 test, hepsi yeşil).

---

## 2. `EmbeddingPort` — üç implementasyon (revize A3)

| İmplementasyon | `isAvailable()` | `embed()` | Dış istek |
|---|---|---|---|
| **live** (bugünkü hâl) | HER ZAMAN `false` — yalnızca kimlik bilgisi kontrolü değil, "bu implementasyon gerçekten embed üretebiliyor mu" sorusuna da bağlı; Voyage entegrasyonu yazılmadığı için ikincisi bugün hep hayır | `not_configured` `ApiResult` döner (FIRLATMAZ) | Sıfır |
| **demo** | HER ZAMAN `true` | Deterministik sahte vektör (`demoEmbed`, hash tabanlı PRNG, birim uzunluğa normalize) | Sıfır |
| **null/yapılandırılmamış** | Live implementasyonun bugünkü hâliyle AYNI durum — ayrı bir üçüncü dosya YOK, `liveDedupe` zaten bu modu temsil ediyor | — | Sıfır |

`lib/adapters/ports.ts`'teki eski `DedupePort.check()`/`DedupeCandidate`/
`DedupeVerdict` (§9.1'in erken iskelet fazından kalma, Akış E'nin gerçek
tasarımından ÖNCE yazılmıştı) **kaldırıldı**. Gerekçe: `check()`'in imzasında
`brandId` yoktu, chain-derinliği/gün-kapısı/LLM adımı kavramı yoktu — gerçek
motorla (`lib/core/dedupe/checkDuplicate()`) uyuşmuyordu. `DedupePort` artık
yalnızca "1024 boyut dönen bir embedding üreticisi" sınırı (`embed` +
`isAvailable`) — görev metninin kendi tabiriyle "EmbeddingPort".

⚠ **Bu port'un demo/live/`checkDuplicate()` ile ilişkisi ince bir nokta:**
`plan_generate` bir kuyruk işi, HER ZAMAN gerçek altyapıya karşı çalışır —
"demo bir plan_generate" diye bir şey yok (`planSkeleton()`/`writeCaption()`
de aynı şekilde `port("planner")`/`port("copy")` ÜZERİNDEN değil, doğrudan
çağrılıyor). Bu yüzden `lib/server/dedupe/run.ts` `port("dedupe")` DEĞİL,
`liveDedupe`'i DOĞRUDAN import ediyor — `MODE_DEDUPE` çerezi/env'i
`plan_generate`'in dedupe kararını ETKİLEMEZ. `DedupePort`'un demo/live
ayrımı yalnızca (a) §9.1'in 12 port sözleşmesini tamamlamak, (b) testlerin
`demoDedupe.embed()`'i doğrudan import edip mock'suz sınaması için var.

**Doğrulama:** `lib/adapters/live/dedupe.test.ts` (isAvailable() false,
embed() not_configured, sıfır dış istek), `lib/core/dedupe/demo-embedding.test.ts`
(deterministik, 1024 boyut, sıfır dış istek).

---

## 3. Fingerprint neyden üretiliyor, neden

`title + "\n" + hook` → Türkçe-duyarlı küçük harf (`toLocaleLowerCase("tr-TR")`,
İ→i, I→ı) → hashtag/emoji/noktalama atılır → çoklu boşluk teke iner →
SHA-256 hex (`lib/core/dedupe/fingerprint.ts`).

**Gövde neden fingerprint'e girmiyor — bu MECBURİYET, "genişletmedim" değil:**
Katman 1, `plan_generate` handler'ının İÇİNDE, `content_items`'a satır
YAZILMADAN ÖNCE çalışıyor. O anda gövde henüz YOK — `caption_write` onu
SONRA dolduruyor (§4a: `idea` → `draft`). Tekrar kontrolünün tek çalıştığı
nokta budur (`lib/core/jobs/types.ts`'in "content.dedupe YOK, tek kontrol
noktası plan_generate içinde" notu, bu oturumdan ÖNCE zaten yazılmıştı).
Gövdeyi dahil etmek isteseydim bile o an elimde gövde yok. Gövde farklı olup
başlık+kanca aynı kalan (nadir) durum zaten Katman 2'nin (embedding,
title+hook+topic_key üzerinden) yakın-ama-birebir-değil bandına düşer.

`content_fingerprint_idx (brand_id, content_fingerprint)` **UNIQUE DEĞİL**
(bilinçli, plan 7-30 satırı tek transaction'da yazar — bkz. `00_schema.sql`
yorumu) — motor bu indeksi SORGULAR, DB reddetmez.

---

## 4. Üç katmanın sırası ve atlanma koşulları

`lib/core/dedupe/checkDuplicate()` — Akış E'nin tam uygulaması:

```
Kontrol 1 (fingerprint)  — HER ZAMAN çalışır, ücretsiz (indeks sorgusu).
  eşleşme VARSA           → duplicate(reason: "fingerprint")  [Katman 2/3'e HİÇ gidilmez]

Katman 2 kapalıysa (EmbeddingPort.isAvailable() false — BUGÜN HER ZAMAN)
  → new  [Katman 2/3 TAMAMEN atlanır; embed()/findSimilar() HİÇ çağrılmaz]

Katman 2 açıksa (gelecekte, Voyage bağlanınca):
  embed() BAŞARISIZ olursa → new (AÇIK tarafa düşülür — aşağıda gerekçe)
  en yakın komşu YOKSA      → new
  similarity >= 0.92         → duplicate(reason: "similarity")  [Katman 3'e gidilmez]
  similarity < 0.82          → new
  0.82 <= similarity < 0.92 (Kontrol 3 — devam adayı):
    komşu 'published' DEĞİLSE           → duplicate  [LLM'e SORULMAZ]
    zincir derinliği >= 12 İSE           → duplicate  [LLM'e SORULMAZ]
    yayınından < 3 gün geçtiyse          → duplicate  [LLM'e SORULMAZ]
    LLM çağrı bütçesi tükendiyse         → duplicate(reason: "budget_exhausted")  [LLM'e SORULMAZ]
    LLM "devam" derse                    → continuation(parentId, continuationNote, similarity)
    LLM "hayır" derse / çağrı başarısız  → duplicate(reason: "continuation_declined")
```

**Katman 2 para harcıyor, Katman 1 zaten yakaladıysa hiç çalışmıyor** —
görev metninin kendi kuralı, `findByFingerprint()` bulduğu anda fonksiyon
`return` ediyor, `embed()` çağrılmıyor (testle kanıtlı:
`checkDuplicate — Kontrol 1` grubu, "embed HİÇ çağrılmaz" iddiası).

**Embed çağrısı BAŞARISIZ olursa AÇIK tarafa düşülür (`new`), KAPALI tarafa
değil.** Gerekçe: geçici bir sağlayıcı hatasında (rate limit, timeout)
meşru bir içeriği sessizce engellemek, "içerik üretilemedi" hatasından çok
daha kötü bir kullanıcı deneyimi olurdu — Katman 1 zaten en ucuz/en kesin
savunma, Katman 2'nin arızası "hiç kontrol yok" değil "yalnızca bu kontrol
yok" demek.

---

## 5. Devam kararının eşikleri ve zincir kuralları

- Eşikler: `duplicateThreshold=0.92`, `continuationThreshold=0.82` (Akış
  E'nin önerdiği, **kalibre EDİLMEMİŞ** başlangıç değerleri).
- Zincir kuralları (Kontrol 3a/3b, `lib/core/dedupe/continuation.ts`):
  komşu `status='published'` OLMALI; komşunun `chain_position < 12` OLMALI
  (`00_schema.sql`'in `chain_position between 1 and 12` CHECK'iyle aynı
  tavan — motor DB'nin reddedeceği bir INSERT'i denemeden önce kendi
  kararını verir); komşunun yayınından bu yana **>= 3 gün** geçmiş OLMALI.
- Zincir KURULUMU: `content_items.parent_id` yazılır, `root_id`/
  `chain_position` **trigger** (`content_chain_guard`) tarafından türetilir
  — uygulama bu ikisini hiç HESAPLAMAZ (INSERT'te ne yazarsa yazsın trigger
  ezer). `parent_id` **UPDATE'te kilitli** (trigger reddeder) — döngü
  yapısal olarak imkânsız, tarayıcıya gerek yok. Bu, gerçek DB'ye karşı
  canlı testte kanıtlandı (§8).

### Katman 2 kapalıyken "devam" nasıl kuruluyor? (revize B3 kararı)

Otomatik "devam mı?" kararı Katman 2'ye (benzerlik bandı) bağlı — Katman 2
kapalıyken bu karar hiç TETİKLENMİYOR. **Elle işaretleme HER ZAMAN çalışıyor**
ve YENİ bir mekanizma YAZILMADI — çünkü zaten VARDI: `ContentPort.create()`'in
`NewContent` tipi `parent_id`'yi zaten yazılabilir alan olarak içeriyor
(`lib/adapters/ports.ts`), ve `content_chain_guard` trigger'ı bunu DB
seviyesinde doğruluyor (derinlik/marka sınırı). Yani "kullanıcı `/plan`'da
bir içeriği açıkça 'bunun devamı' olarak işaretler" akışı — mimari olarak
HAZIR, yalnızca `/plan` UI'ında bir "bunun devamı" düğmesi henüz YOK (o bir
UI özelliği, adım 15'in kapsamı dışında — bir sonraki ekran/UI adımının işi).

---

## 6. Sonsuz döngü tavanı (FAZ B4)

**Bu oturumda tespit edilen gerçek: klasik "üret → engellendi → yeniden
üret" döngüsü bu mimaride YOK.** `plan_generate` TEK bir Anthropic çağrısıyla
TÜM planı üretiyor (`planSkeleton()`), duplicate bulunan satır atlanıp
(`continue`) sonraki satıra geçiliyor — engellenen bir satır için AYRI bir
"yeniden üret" çağrısı YAPILMIYOR (böyle bir per-satır yeniden üretim
primitive'i bugün yok, eklemek bu adımın kapsamı dışında bir büyütme
olurdu). Yani fingerprint kaynaklı bir sonsuz döngü riski **yapısal olarak
zaten yok** (deterministik fingerprint, ya eşleşir ya eşleşmez — revize
B4-EK'in kendi tespiti).

**Gerçek risk, tespit edip tavan koyduğum yer:** Kontrol 3c'nin LLM çağrısı
(`judgeContinuation`). Bir plan onlarca "yakın" aday üretebilir (30 günlük
planda ~20-26 satır) — tavan olmasaydı TEK bir `plan_generate` çalışması
onlarca EK Anthropic çağrısına çıkabilirdi. `DedupeRunBudget`
(`continuationChecksUsed`) bunun için var: `handlePlanGenerate`'in
döngüsünden ÖNCE bir kez oluşturulup (`createDedupeRunBudget()`) TÜM satırlar
boyunca AYNI nesne olarak paylaşılıyor. `DEFAULT_DEDUPE_CONFIG.
maxContinuationChecksPerRun = 5` (⚠ kalibre edilmedi) — aşılınca kalan
adaylar LLM'e SORULMADAN `duplicate(budget_exhausted)` sayılır (muhafazakâr
taraf — para harcamamak, yanlışlıkla bir devam içeriğini reddetmekten daha
önemli).

Ayrıca zaten var olan bir ikinci savunma katmanı: `JOB_RETRY_POLICY.
plan_generate.maxAttempts = 3` (`lib/core/jobs/types.ts`, adım 12'den) —
bir `plan_generate` işi geçici bir hatada en fazla 3 kez denenir, kuyruk
seviyesinde de bir tavan var.

**Tavana ulaşınca ne olur:** slot BOŞ kalır (satır hiç yazılmaz, `blocked`
sayacı artar, `activity`'ye `duplicate_blocked` yazılır, `meta.reason:
"budget_exhausted"`) — kullanıcıya SORULMAZ (henüz o UI yok, adım 15'in
kapsamı dışında). `/plan`'ın kendisi zaten "üretilen X, engellenen Y"
özetini `plan_generated` aktivitesinde taşıyor.

---

## 7. Embedding'in senkron/asenkron kararı ve gerekçesi

**SENKRON** — `plan_generate` handler'ının kendi içinde, satır
`content_items`'a yazılmadan ÖNCE hesaplanır (Katman 2 açıkken).

Gerekçe: `find_similar_content()` karşılaştırma yapabilmesi için adayın
KENDİ embedding'ine ihtiyaç duyar — bu doğası gereği ERTELENEMEZ. Asenkron
(`embed_backfill`'e bırakmak) iki gerçek zayıflık doğururdu: (1) YENİ yazılan
satırlar KENDİ planındaki kardeşleriyle bile karşılaştırılamazdı (backfill
kuyruğa girip işlenene kadar `embedding IS NULL`), (2) Katman 2'nin TÜM amacı
tam olarak "yeni üretilen bu satır daha önce üretilmiş bir şeye çok mu
benziyor" sorusu — bu soruyu üretim ANINDA sormazsan özelliğin kendisini
kaybedersin.

`embed_backfill` iş tipi (`lib/core/jobs/types.ts`'te zaten TANIMLI,
`00_schema.sql`'in `jobs.kind` CHECK'inde zaten VAR) bunun YERİNE değil,
TAMAMLAYICISI: bir marka Voyage'ı **SONRADAN** eklerse, o ana kadar
`embedding IS NULL` yazılmış ESKİ satırları geriye dönük doldurmak için.
**Bu oturumda handler'ı (`JOB_HANDLERS.embed_backfill`) YAZILMADI** —
`NOT_IMPLEMENTED` olarak kaldı, görev metninin "şimdi uygulama, sadece yolu
tarif et" talimatı gereği. Yolu: bir marka `/settings`'ten Voyage anahtarı
girdiğinde (ya da bir sonraki oturumda bir "geriye dönük doldur" düğmesi
eklendiğinde), o markanın `embedding IS NULL and content_fingerprint IS NOT
NULL` olan tüm satırları için `embed_backfill` işleri KUYRUĞA eklenir
(`enqueue_job`), her biri `EmbedBackfillPayload{contentItemId}` taşır, işleyici
`liveDedupe.embed(title+hook+topicKey, brandId)` çağırıp sonucu
`content_items.embedding`'e YAZAR. Retry politikası zaten tanımlı
(`maxAttempts:5, reaperOnStuck:"requeue"` — ucuz, çok deneme güvenli).

---

## 8. Canlı doğrulama — ne kanıtlandı, ne kanıtlanamadı

FAZ C'nin görev metnindeki DOĞRULAMA kriteri "aynı temayla iki kez plan
üret → gerçek çağrı, çıktıyı göster" idi. Deneme sırasında **iki bağımsız,
adım 15'in kapsamı DIŞINDA** engelle karşılaşıldı — ikisi de kullanıcı
onayıyla ele alındı:

### 8.1 Bulgu 1 — `get_provider_secret()` kolon/OUT-parametre çakışması (DÜZELTİLDİ)
`returns table (secret text, config jsonb)` bir `config` OUT parametresi
tanımlıyordu; fonksiyon gövdesindeki `select vault_secret_id, config into
...` bare `config` kolon referansı bu OUT parametreyle ÇAKIŞIYORDU — Postgres
her çağrıda `column reference "config" is ambiguous` (42702) fırlatıyordu.
**Sonuç: bu düzeltmeden ÖNCE, canlı moddaki (demo değil) HER Anthropic
çağrısı (`plan_generate`, `caption_write`) `resolveProviderCredential()`
içinde fırlıyordu** — `set_provider_credential`'ın kendi yorumunda zaten
belgelenen AYNI hata sınıfının (bir OUT parametresi + bare kolon adı
çakışması) `get_provider_secret`'e uygulanmamış hâli.

Düzeltme: aynı takma ad deseni (`pc.vault_secret_id, pc.config ... from
public.provider_credentials pc where pc.brand_id = ... `). Kullanıcı
onayıyla `00_schema.sql`'e işlendi ve `supabase/apply.sh` ile CANLI
Supabase'e uygulandı (bu oturumda, `verify.sql` temiz çıktı verdi).

**Muhtemel sebep:** adım 14'ün "gerçek çağrı" doğrulaması
(`skeleton.live.test.ts`) `resolveProviderCredential()`'ı HİÇ ÇAĞIRMIYOR —
raw bir `ANTHROPIC_API_KEY_LIVE_TEST` alıp `planSkeleton()`'u doğrudan
çağırıyor. Yani adım 14'ün "canlı" doğrulaması gerçek `/settings`-kaydı
kimlik bilgisi yolunu HİÇ egzersiz etmemiş — bu bug o yüzden şimdiye kadar
YAKALANMAMIŞ.

### 8.2 Bulgu 2 — Anthropic "identity-linked" anahtar (DÜZELTİLMEDİ, ayrı oturuma bırakıldı)
Bulgu 1 düzeltildikten sonra gerçek bir Anthropic isteği GERÇEKTEN gitti —
ama Anthropic 400 ile reddetti: `"anthropic-workspace-id is required when
authenticating with an identity-linked API key"`. `/settings`'e girili
anahtar standart bir konsol anahtarı (`sk-ant-...`) değil, workspace/OAuth
bağlı bir kimlik anahtarı gibi görünüyor — ürün kodu (`lib/core/plan/
skeleton.ts`, `lib/core/ai/caption.ts`, `lib/core/dedupe/judge-continuation.ts`
— hepsi aynı `new Anthropic({apiKey})` deseni) bu tür anahtarlar için gereken
`anthropic-workspace-id` header'ını GÖNDERMİYOR.

Kullanıcı onayıyla bu adımın kapsamı DIŞINDA bırakıldı — anahtar yönetimi
kararı (doğru tür bir anahtar mı girilecek, yoksa ürün workspace header'ını
mı destekleyecek) ayrı bir oturuma kaldı.

### 8.3 Ne KANITLANDI (gerçek Supabase'e karşı, Anthropic olmadan)
`lib/server/jobs/handlers.dedupe.live.test.ts`
(`RUN_DEDUPE_LIVE_TEST=1 npx vitest run ...`, gerçek, var olan bir markaya
karşı, oluşturduğu satırları `afterAll`'da SİLEREK):

```
[dedupe live test] aynı title+hook GERÇEK DB'ye karşı:
  {"verdict":"duplicate","reason":"fingerprint","matchedId":"23579eea-c133-4c11-bfc4-1c1eb7ec5d97"}
[dedupe live test] zincir satırı (trigger'dan):
  {"id":"d3b74e56-...","root_id":"23579eea-...","chain_position":2,"parent_id":"23579eea-..."}
```

Yani: Katman 1'in `content_fingerprint_idx` sorgusu GERÇEK Postgres'e karşı
doğru çalışıyor; `content_chain_guard` trigger'ı GERÇEK bir INSERT'te
`root_id`/`chain_position`'ı doğru türetiyor. Temizlik doğrulandı (test
sonrası kalan satır sayısı: 0).

**KANITLANAMAYAN:** `plan_generate`'in Anthropic'ten dönen GERÇEK
başlık/kancalarla UÇTAN UCA bir "aynı temayı iki kez üret" senaryosu —
Bulgu 2 yüzünden. Bir sonraki oturumda (ya doğru tür bir anahtar girilince,
ya da workspace header desteği eklenince) `handlers.dedupe.live.test.ts`
Bulgu 2'nin blokajını AŞACAK şekilde `JOB_HANDLERS.plan_generate`'i gerçekten
çağırıp tekrar denenebilir — dosyanın kendi başlığı bu geriye dönüşü zaten
belgeliyor.

### 8.4 `/queue` ve `/plan`'da görünürlük
Kod incelemesiyle doğrulandı (bu oturumun araştırma turunda): `app/(app)/
queue/page.tsx` `duplicate_blocked` aktivitesini GERÇEK `contentPort.
listActivity()`'den okuyor (demo modda fixture, live modda gerçek `activity`
tablosu) — fixture'dan DEĞİL. `handlePlanGenerate` artık gerçek
`duplicate_blocked`/`continuation_created` satırları YAZIYOR (§8.1'in
düzeltmesinden bağımsız, bu adımın 15c commit'i zaten doğru meta içeriğiyle
yazıyor — kanıt: FAZ B'nin 37 birim testi + typecheck + build). Ekranın
gerçekten bunu GÖSTERDİĞİ bir tarayıcı ekran görüntüsü ALINMADI — bu oturumun
zaman/bütçe sınırı içinde DB-seviyeli kanıt + statik kod okuması yeterli
görüldü.

---

## 9. Kalibre edilmemiş değerlerin listesi

Hepsi `lib/core/dedupe/config.ts`'te TEK yerde:

| Değer | Bugünkü | Kaynak |
|---|---|---|
| `duplicateThreshold` | 0.92 | Akış E önerisi, ADIM_012 |
| `continuationThreshold` | 0.82 | Akış E önerisi, ADIM_012 |
| `minDaysSincePublish` | 3 gün | Akış E önerisi |
| `maxChainDepth` | 12 | §4b / `chain_position` CHECK'iyle EŞLEŞMESİ ZORUNLU |
| `maxContinuationChecksPerRun` | 5 | Bu oturumda seçildi (FAZ B4) — hiçbir gerçek veriye dayanmıyor |

İlk ~200 gerçek içerikten sonra ölçülüp güncellenmeli (dosyanın kendi
yorumu). Voyage bağlanmadan ÖLÇÜLEMEZ (Katman 2 çalışmadan benzerlik skoru
üretilmiyor).

---

## 10. Varsayımlar + adım 16'ya (Instagram bağlama) geçmeden bilmem gerekenler

1. **§11 S3 hâlâ açık.** Voyage teyidi ertelendi — adım 15'in "kapsam
   dışı bug"ları (§8) çözülünce ya da Voyage anahtarı girilince YENİDEN
   ele alınmalı; o zaman D3'ün "tam 1024" doğrulaması gerçek bir HTTP
   yanıtına karşı yapılabilir.
2. **`get_provider_secret()` bugı canlıya UYGULANDI ama bu, `set_provider_
   credential()`/`get_provider_secret()`'in DIŞINDA benzer bir çakışma
   OLMADIĞININ kanıtı değil** — bu iki fonksiyon dışında OUT-parametre
   isimlendirmesi kullanan başka bir `RETURNS TABLE` fonksiyonu varsa
   (`brand_latest_metrics`, `find_similar_content`, `claim_jobs`,
   `enqueue_job`, `rate_limit_hit`) AYNI sınıf hataya karşı TARANMADI bu
   oturumda — bu oturumun bulduğu şey rastlantısal (FAZ C'nin gerçek çağrı
   denemesi sırasında).
3. **Anthropic "identity-linked anahtar" sorunu adım 16'yı DA etkileyebilir**
   — eğer Instagram bağlama akışının HERHANGİ bir noktasında (örn. yayın
   sonrası bir AI özetleme adımı varsa) yine `resolveProviderCredential
   (brandId, "anthropic")` yoluna girilirse AYNI 400 hatası beklenir; bu
   markanın gerçek bir konsol anahtarına geçmesi ya da ürünün workspace
   header desteği kazanması gerekiyor.
4. **`plan_generate`'in Anthropic'ten dönen gerçek metinlerle üretilmiş
   gerçek bir "aynı temayı iki kez üret" senaryosu HİÇ GÖRÜLMEDİ** — Katman
   1'in DB entegrasyonu kanıtlı ama modelin gerçekte NE SIKLIKTA birebir
   aynı title+hook ürettiği (Katman 1'in gerçek dünyada ne kadar sıklıkla
   tetikleneceği) ÖLÇÜLMEDİ.
5. **`embed_backfill` handler'ı hâlâ `NOT_IMPLEMENTED`.** Yolu §7'de
   tarif edildi, kod yazılmadı — Voyage bağlanmadan önceliği yok.
6. **`/plan`'da "bunun devamı" düğmesi (manuel zincir işaretleme UI'ı)
   YOK.** Mimari hazır (`NewContent.parent_id` zaten yazılabilir alan) ama
   hiçbir ekran bunu KULLANMIYOR — bir sonraki UI adımının işi.
7. **`DEMO_SENARYOSU.md`'nin "Dürüstlük" bölümüne yeni bir madde eklendi**
   (bu oturumda) — Katman 2'nin kapalı olmasının vaat üzerindeki etkisi
   müşteriye açıkça anlatılabilsin diye.

---

## 11. Bu oturumda harcanan token/çağrı sayısı

Gerçek Anthropic spend: **$0 / 0 tamamlanmış çağrı.** §8.1/§8.2'nin iki
bulgusu yüzünden denenen tek gerçek `plan_generate` çağrısı Anthropic'in
KENDİ 400 doğrulama hatasında durdu — doğrulama hataları FATURALANMAZ,
tamamlanan tek bir completion YOK.

Gerçek Supabase yazma/silme: `vector-probe.mjs` (2 geçici satır, temizlendi)
+ `handlers.dedupe.live.test.ts`'in iki çalıştırması (ilkinde 0 satır kaldı
— hata erken oldu; ikincisinde 2 geçici satır, `afterAll`'da temizlendi,
temizlik ayrıca doğrulandı) + bir şema uygulaması (`supabase/apply.sh`).

Bu oturumun KENDİ token/çağrı sayısı (Claude Code'un bu konuşma için
harcadığı) bu araçtan İÇE DÖNÜK gözlemlenemiyor — kesin bir sayı UYDURMAK
yerine boş bırakıyorum; `/cost` ya da oturum meta verisinden sen
okuyabilirsin.
