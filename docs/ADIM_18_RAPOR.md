# ADIM 18 RAPORU — metrik toplama ve geri besleme

Yetkili kaynak: `docs/BIRLESIM_PLANI.md` §4f, §8.2/§8.3, Akış D, D1 düzeltmesi.
Önceki oturum: `docs/ADIM_17a_RAPOR.md` (yayın hattı, Bluesky).

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| A — metrik toplama | ✅ | `3256e8c` |
| A düzeltme — etkileşim tabanı + growth etiketi | ✅ | `6ce9d6b` |
| B — cron + analytics gerçek veri | ✅ | `ea4f9ad` |
| C — geri besleme | ✅ | `faec68a` |
| D — kapanış | ✅ | bu rapor |

Bu, MVP'nin 5. vaadinin (geçmişe göre üretim) ilk kez uçtan uca GERÇEK
olduğu adım: Bluesky metrikleri gerçekten toplanıyor, `/analytics` demo
fixture değil gerçek veri gösteriyor, ve bir sonraki plan üretimi bu
ölçümlerden çıkarılan bir sinyalle besleniyor.

---

## FAZ A — Metrik toplama

### Bluesky'nin verdiği / vermediği metrikler

Doğrulanmış kaynak: `app.bsky.feed.getPosts` resmi lexicon'u
(github.com/bluesky-social/atproto, `uris` en fazla 25) ve `@atproto/api`'nin
üretilmiş tipleri (`PostView.likeCount/replyCount/repostCount/quoteCount/
indexedAt`); kanal düzeyi için `app.bsky.actor.getProfile`
(`followersCount/followsCount/postsCount`).

| Verilen | Verilmeyen |
|---|---|
| `likeCount` → `likes` | `reach` — Instagram Insights'ın karşılığı YOK |
| `replyCount` → `comments` | `impressions` |
| `repostCount` → `shares` | `profile_visits` |
| `quoteCount` — yalnızca `raw`'da (hiçbir kolona zorlanmadı) | `video_views`, `saves` (Bluesky'de "save" kavramı yok) |
| `followersCount`/`followsCount`/`postsCount` (kanal düzeyi) | — |

Eksik alanlar **`0` yazılıyor, hata SAYILMIYOR** (§4f'in kuralı) — ama bu
"sıfır ölçüldü" ile karışmasın diye ayrı bir mekanizma kuruldu (aşağıda,
Düzeltme 1).

### Tier atama mantığı

`lib/core/metrics/tier.ts` — tek gerçek kaynak, hem tarayıcı
(`lib/core/metrics/schedule.ts`) hem işleyici (`lib/server/metrics/
collect.ts`) aynı fonksiyonu (`metricsCollectionStatus`) çağırır. İşleyici
tier'ı payload'tan DEĞİL, çalıştığı ANDA yeniden hesaplar (kuyrukta bekleme
süresi tier'ı bayatlatabilir).

```
0–48 saat  : 6 saatte bir → h6
2–30 gün   : günde bir    → d1
30. gün    : son ölçüm, sonra durur → final
```

**`final` UNIQUE kanıtı** (`lib/server/metrics/collect.live.test.ts`, gerçek
Supabase + gerçek Bluesky):

```
[metrics canlı] ikinci final INSERT hatası — 23505 duplicate key value violates
  unique constraint "content_metrics_final_idx"
```

**`final` sonrası taranmıyor:** `metricsCollectionStatus` `latest.tier ===
'final'` gördüğünde `due:false` döner — ikinci `collectContentMetrics`
çağrısı Bluesky'ye HİÇ ÇIKMADAN `skipped_final_exists` ile çıkar (aynı canlı
testte kanıtlı): `{"status":"skipped_final_exists"}`.

### Sweep dayanıklılığı

- **Silinmiş/erişilemeyen gönderi:** `getPosts` bulunamayan URI'yi sessizce
  dizi dışında bırakıyor (resmi lexicon bunu belgelemiyor, topluluk
  kaynağından doğrulandı). `collectContentMetrics` bunu iş HATASI SAYMAZ —
  içerik `tier='final'`, `raw.status='not_found'` ile işaretlenip bir daha
  taranmaz. Canlı kanıt: `{"status":"not_found","tier":"final"}`.
- **Tek içeriğin hatası sweep'i düşürmez:** her içerik AYRI bir
  `metrics_collect` işi (`publish`'le aynı granülerlik) — worker'ın normal
  retry/dead-letter mantığı zaten izole ediyor.
- **Rate limit:** adım 17a'nın belgelediği 5000 puan/saat YAZMA
  (`createRecord`/`putRecord`) çağrılarına uygulanıyor; `getPosts`/
  `getProfile` AppView SORGU uç noktaları — resmi kaynak + topluluk
  taraması bunların ayrı ve "cömert" (numarası yayımlanmamış) bir sınıra
  tabi olduğunu doğruluyor. Sweep yine de muhafazakâr: içerik başına ayrı
  iş, kanal başına saatte tek `getProfile`.

### Gerçek gönderinin metrikleri — canlı kanıt

```
[metrics canlı] GERÇEK ÇEKİLEN SATIR — {"tier":"h6","likes":0,"comments":0,
  "shares":0,"reach":0,"raw":{"uri":"at://did:plc:h4uy2bqzvjobgsyhzslvloys/
  app.bsky.feed.post/7dq3qqlzljuz2","indexedAt":"2026-09-06T21:46:03.659Z",
  "likeCount":0,"quoteCount":0,"replyCount":0,"repostCount":0,
  "engagementRateBasis":"unavailable"}}
```

Ayrıca **production'da**, `/api/cron/metrics` GERÇEKTEN tetiklenip
(`curl` ile, elle) adım 17a'nın gerçek gönderisini taradı, `metrics_collect`
işi açtı, `sm-worker` onu işledi:

```
$ curl .../api/cron/metrics  → {"scanned":1,"enqueued":1,"channelsRefreshed":1,...}
$ curl .../api/cron/worker   → {"claimedBatches":1,"claimed":1,"succeeded":1,...}

content_item_id                       | tier | likes | comments | shares | reach | basis
e1fa26a3-6485-414d-aa46-f3d003aee79d  | h6   | 0     | 0        | 0      | 0     | unavailable
```

---

## FAZ A DÜZELTME — kullanıcı incelemesi (18a düzeltme)

FAZ A onaylandı, iki sapma için karar istendi ve uygulandı.

### Düzeltme 1 — `engagement_rate_basis` birinci sınıf kolon

Bluesky reach vermediği için toplayıcı, reach yoksa **takipçi tabanlı** bir
oran hesaplıyor: `(likes+comments+shares)/followers×100` — §4f'in Instagram
formülünden (`.../reach×100`) FARKLI bir ölçek. İlk yazımda bu yalnızca
`raw` JSON'una gömülüydü; sıralama/ortalama alan kod `raw`'a bakmadığı için
iki farklı ölçekteki sayı sessizce karışabilirdi.

**Karar:** `content_metrics.engagement_rate_basis`
(`'reach'|'followers'|'unavailable'`) idempotent bir migration'la eklendi,
`brand_latest_metrics()` onu da döndürüyor, `MetricRow.engagement_rate_basis`
TS tarafında ZORUNLU alan. `lib/core/metrics/basis.ts`
(`groupByEngagementBasis`/`dominantEngagementGroup`/`withMeasurableEngagement`)
kuralı kod + testle uyguluyor: farklı tabanlar asla aynı ortalamaya/sıralamaya
girmiyor, `unavailable` (ölçülemedi, `0` gerçek değil) hiçbir gruba girmiyor.
Bugün tek platform olduğu için görünmez ama `basis.test.ts` (8 test) sentetik
çok-tabanlı girdilerle kanıtlıyor. `refreshBlueskyChannelStats()`'in kanal
ortalaması da aynı kuraldan geçiyor.

### Düzeltme 2 — `channels.growth` etiketi

Şema yorumu "% / 30 gün" diyordu; gerçek yazan kod SON SENKRONDAN bu yana
değişimi yazıyor (`sm-metrics` saatte bir çalıştığı için pratikte "~son 1
saatteki değişim"). Kod DOĞRUYDU, etiket YANLIŞTI — düzeltildi. Gerçek
30 günlük büyüme bir takipçi geçmişi (zaman serisi) tablosu gerektirir —
bu adımın kapsamı DEĞİL, `docs/BIRLESIM_PLANI.md` §REVİZYON KAYDI D11'e
ileride-değerlendirilecek madde olarak eklendi.

### Kalıcı kural (D11)

`docs/BIRLESIM_PLANI.md`'ye eklendi: bir metriğin etiketi ölçtüğü şeyi
birebir söylemeli; ölçülemiyorsa gösterilmez, tahminse tahmin olduğu
yazılır. Bu, aynı hatanın üçüncü örneğiydi (siraya'nın "Otomatik kaydırma"
KPI'sı, adım 8'in ilk yazımında üç kez sayan erişim kartı, şimdi growth).

---

## FAZ B — Cron aktivasyonu + `/analytics`/`/dashboard` denetimi

### ⚠ Bulunan ve düzeltilen gerçek bir hata: kendi migration'larım cron'u kapattı

Bu oturumdaki iki `bash supabase/apply.sh` çalıştırması (Düzeltme 1/2'nin
şema migration'ı için) `CRON_ACTIVE` bayrağını GEÇMEDİ — betiğin varsayılanı
`false`, yani her çalıştırma TÜM cron job'larını `active=false`'a
DÜŞÜRÜYOR. Bu, adım 17a'nın kalıcı sonucu olarak aktif bıraktığı
`sm-worker`/`sm-publish`/`sm-reaper`'ı YANLIŞLIKLA pasife düşürdü — kontrol
edilene kadar fark edilmedi.

**Düzeltme:** dördü (`sm-worker`, `sm-publish`, `sm-reaper`, `sm-metrics`)
`cron.alter_job(jobid, active := true)` ile yeniden aktive edildi.

### Kademeli izleme — gerçek zaman damgalarıyla

```
13:00–13:13  sm-worker   (dakikada bir)     → hepsi succeeded, hata YOK
13:00, 13:05, 13:10       sm-publish        → succeeded
13:00, 13:10              sm-reaper         → succeeded
```

`net._http_response`'ta bu pencerede sıfır hata (izleme sürekli, her tur
`cron.job_run_details`/`net._http_response` sorgulanarak yapıldı).

`sm-metrics`'in İLK gerçek turu (saatte bir, `17 * * * *`) — hiçbir elle
tetikleme OLMADAN, `psql` ile canlı gözlemlendi:

```sql
select jobname, status, start_time, return_message from cron.job_run_details
  jrd join cron.job j on j.jobid=jrd.jobid where jobname='sm-metrics' ...;

  jobname   |  status   |          start_time           | return_message
------------+-----------+-------------------------------+----------------
 sm-metrics | succeeded | 2026-09-07 13:17:00.023583+00 | 1 row
```

Gerçek HTTP yanıtı (`net._http_response`):

```
{"scanned":1,"enqueued":0,"channelsRefreshed":1,"retentionDeleted":0}
```

`enqueued:0` BEKLENEN — üretimdeki tek gerçek içerik (adım 17a'nın
gönderisi) 13:00 civarında elle tetiklenen `/api/cron/metrics` çağrısıyla
zaten `h6` olarak toplanmıştı, 6 saat dolmadan bir daha "due" değil. Bu,
`sm-metrics`'in kendi başına gereksiz yere aynı içeriği yeniden
TOPLAMADIĞININ kanıtı — sweep mantığı gerçek zamanlı, gerçek üretim
verisiyle doğru çalışıyor. `channelsRefreshed:1` — bağlı tek Bluesky
kanalının `getProfile` tazelemesi de gerçekten çalıştı.

### `/analytics` gerçek veriyle — canlı Playwright kanıtı

Geçici bir kanal (gerçek Bluesky test hesabı) + iki gerçek içerik (biri d1
penceresinde, biri final penceresinde, `collectContentMetrics()` ile
GERÇEKTEN toplanmış) bir ephemeral test hesabına bağlandı, giriş yapıldı,
ekran görüntüsü alındı:

```
ERİŞİM · 14 GÜN
—
Bağlı platformlar erişim ölçümü sağlamıyor (Bluesky beğeni/yanıt/repost
veriyor, erişim vermiyor).

ORTALAMA ETKİLEŞİM   0%      (takipçi=0 → dürüst taban, uydurma değil)
YAYINLANAN İÇERİK     2
ÖLÇÜM DURUMU          1 / 1
İlk 48 saatin erken ve gürültülü ölçümleri (h6) bu sayılara girmiyor. (0)
```

D1'in kanıtı: final ve d1'in ikisi de "Ölçüm durumu"na girdi (1/1); h6
sayısı 0 (bu senaryoda h6 satırı hiç yazılmadı, doğru). Reach kartı "0"
DEĞİL "—" gösterdi — Düzeltme 1'in D11 kuralının canlı kanıtı.

TopPosts/Isı haritası/Trend boş göründü — bu bir HATA DEĞİL: bu test
hesabının takipçisi 0 olduğu için `engagement_rate_basis='unavailable'`,
ve D11 kuralı gereği ölçülemeyen satırlar sıralamaya/ortalamaya HİÇ
girmiyor (`withMeasurableEngagement`). Dürüst boş durum.

### `/dashboard` KPI'sı — tek sefer sayma kanıtı

```
BU AY PLANLANAN 1   ONAY BEKLEYEN 0   BU AY YAYINLANAN 1
BU AY YAYINLANANLARIN ERİŞİMİ —
```

d1 içeriği (3 gün önce, bu ay) sayıldı; final içeriği (31 gün önce, GEÇEN
ay) dışlandı — `buildMonthlyReach`'in ay-scoped filtresi doğru çalışıyor,
aynı içeriğin farklı tier'ları TEK sayılıyor (adım 8'in D1 düzeltmesinin
canlı doğrulaması).

### D11 denetimi — `/analytics` ve `/dashboard`'daki her kart

| Kart | Denetim sonucu |
|---|---|
| Erişim · 14 gün | ✅ düzeltildi — "—" + dürüst ipucu |
| Ortalama etkileşim | ✅ `unavailable` satırlar ortalamaya girmiyor |
| Yayınlanan içerik | zaten dürüst — ham sayım |
| Ölçüm durumu (final/d1) | zaten dürüst — gerçek sayaç |
| h6 hariç tutma notu | zaten dürüst — gerçek sayaç |
| En iyi performans (top posts) | ✅ düzeltildi — reach yoksa etkileşime göre sıralar, ölçülemeyenler listeden düşer |
| Isı haritası | ✅ düzeltildi — `unavailable` satırlar ortalamaya girmiyor |
| Etkileşim trendi | ✅ düzeltildi — aynı |
| Dashboard "Bu ay erişim" | ✅ düzeltildi — "—" + dürüst ipucu, "hiç yayın yok" durumundan ayrıştırıldı |
| `channels.growth`/`engagement` | ✅ düzeltildi (18a düzeltme) |
| `buildReachByPlatform`/`buildMix` | denetlendi — HİÇBİR ekran onları render ETMİYOR (ölü kod), D11 riski yok, dokunulmadı |

---

## FAZ C — Geri besleme

### Sinyal eşiği ve gerekçesi

`FEEDBACK_MIN_MEASURED = 5` — ⚠ **kalibre edilmemiş**, §4c'nin 0.92/0.82
eşikleriyle aynı statüde. "En az bir tam hafta örnekleme" sezgisiyle
seçildi. Görev metninin uyarısı doğrudan test edildi: gerçek Carino Pizza
verisiyle (bugün 1 yayın, eşiğin çok altında) sinyal `null` döndü:

```
[FAZ C canlı] gerçek yayınlanmış içerik sayısı: 1
[FAZ C canlı] gerçek ölçüm satırı sayısı: 0
[FAZ C canlı] sinyal: null
[FAZ C canlı] prompt bloğu (boş olmalı): ""
```

### Dedupe ile çakışma — nasıl çözüldü

`lib/core/insights/build-feedback.ts` **hiçbir alanda** `title`/`hook`/
`topic_key` METNİ taşımaz — yalnızca yapısal gözlemler: hook uzunluğu, hook
soru mu, baskın `kind`, baskın saat penceresi. `build-feedback.test.ts`'in
"DEDUPE İLE ÇAKIŞMAZ" testi bunu doğrudan kanıtlıyor: sinyal serialize
edilip her içeriğin EŞSİZ hook/title metninin sonuçta HİÇ geçmediği
doğrulanıyor. Böylece geri besleme "bu konuyu tekrarla" DEMEZ, "bu
YAKLAŞIMI tekrarla" der — dedupe motoru konu tekrarını hâlâ serbestçe
engelleyebilir.

### Prompt'un tam metni (sentetik, yeterli veriyle — mock'lanmış Anthropic çağrısından yakalandı)

```
Write every title and hook in Turkish.

The brand every post must serve:
Business: Kahve Durağı
What it does: Kadıköy'de kahveci
Content language: Turkish

What worked in recent published content — apply the APPROACH, not the topic:
- Shorter opening lines (hooks) got more engagement.

The theme to plan around:
kahve dükkanı yeni menü

The calendar is already fixed. Fill in all 8 slots below, exactly once each, using the slot number.
Respect each slot's channel and format — a story slot must be story-shaped, a reel slot must be a reel idea.

Slot 0: day 1 (Monday) 09:00 — Instagram image (a single feed image with a caption)
Slot 1: day 1 (Monday) 12:30 — LinkedIn text (a plain feed post, no image needed)
Slot 2: day 2 (Tuesday) 11:00 — Instagram story (a 24-hour vertical story frame — casual, behind the scenes, often a poll or a question sticker)
Slot 3: day 3 (Wednesday) 18:30 — Instagram reels (a short vertical video with a hook in the first two seconds)
Slot 4: day 4 (Thursday) 09:30 — LinkedIn carousel (a swipeable deck of 5-8 slides)
Slot 5: day 5 (Friday) 17:00 — Instagram image (a single feed image with a caption)
Slot 6: day 5 (Friday) 12:00 — X text (a plain feed post, no image needed)
Slot 7: day 6 (Saturday) 13:00 — Instagram story (a 24-hour vertical story frame — casual, behind the scenes, often a poll or a question sticker)
```

(`lib/core/plan/skeleton.test.ts`'in "TAM PROMPT METNİ" testi — bu tam
çıktı `console.log` ile teste yazıldı, tekrarlanabilir kanıt.)

Yetersiz veriyle (`insightBlock: ""`) aynı prompt'ta "APPROACH" ibaresi
HİÇ geçmiyor — ayrı bir testle kanıtlandı.

### Kullanıcı görünürlüğü

`/plan` sayfasına `FeedbackSignalCard` eklendi — "Sonraki plan şunları
öğrendi" başlığıyla notları listeliyor; sinyal yoksa "Henüz yeterli
ölçülmüş veri yok" mesajı gösteriyor (kart sessizce kaybolmuyor).
`plans.insight_snapshot` her `plan_generate` çalışmasında kullanılan
sinyali (veya `null`) izlenebilirlik için kaydediyor.

### Pencere değerlendirmesi

`FEEDBACK_WINDOW_DAYS = 45` — `/analytics`'in adım 8'de seçtiği 45 günle
AYNI değer BİLİNÇLİ korundu; `brand_latest_metrics(p_days)` ikisinin de
TEK okuma kaynağı, iki farklı pencere "aynı satırlara bakıyoruz"
garantisini kırardı. Değerlendirildi, değiştirilmedi.

---

## FAZ D — Kapanış

### Beş kapı + e2e

```
$ npx tsc --noEmit        çıktı yok
$ npx eslint .             1 önceden var olan, ilgisiz uyarı (skeleton.test.ts _opts)
$ npx vitest run           599 geçti, 0 kırık, 43 skip (gerçek kimlik bilgisi gerektiren canlı testler)
$ npm run build            başarılı, /api/cron/metrics dahil tüm rotalar üretildi
$ npx playwright test --project=chromium   15 geçti, 0 kırık (3.7dk) — smoke.spec.ts
    hâlâ sıfır yabancı ağ isteği kanıtlıyor
```

### Sır sızıntısı taraması

`git diff 57902f4..HEAD` (adım 18'in TÜM commit'leri) üzerinde bilinen sır
desenleri (`sk-`, `Bearer <uzun-token>`, JWT benzeri, hardcoded şifre)
tarandı — sıfır eşleşme. `.env.local` hiçbir zaman git'e girmedi.

### Deploy

`vercel --prod` — iki kez (FAZ A'nın kodu için bir kez, FAZ B/C'nin kodu
için bir kez daha), `https://app-gold-one-92.vercel.app`. `/`, `/login`
gerçek HTTP isteğiyle doğrulandı (200/307). Deploy sonrası cron
(o sırada zaten aktif) kesintisiz çalışmaya devam etti.

### `DEMO_SENARYOSU.md`

Güncellendi: MVP'nin 5. vaadi artık GERÇEK olarak işaretlendi (analytics
+ geri besleme), erişim kartının Bluesky'de "—" gösterdiği not edildi,
Katman 2 (embedding, anlamsal tekrar önleme) hâlâ KAPALI olduğu açıkça
korundu (bu adım onu değiştirmedi).

---

# VARSAYIMLAR

1. **`engagement_rate_basis='followers'` formülü plan metninde YOKTU** —
   bu oturumun kararı, Bluesky'nin reach vermemesinin doğal sonucu.
   Endüstride "erişim yoksa takipçiye göre etkileşim" bilinen ama ayrı bir
   metrik türü. ⚠ Kalibre edilmedi.
2. **`channels.growth`'un gerçek 30 günlük hesaplanması bu adımın kapsamı
   dışında bırakıldı** — takipçi geçmişi tablosu gerektirir,
   `BIRLESIM_PLANI` D11'e ileride-değerlendirilecek madde olarak eklendi.
3. **`FEEDBACK_MIN_MEASURED=5` ve `FEEDBACK_WINDOW_DAYS=45` kalibre
   edilmedi** — §4c'nin eşikleriyle aynı statüde, ilk gerçek veri
   birikince (~50-100 ölçüm) gözden geçirilmeli.
4. **`buildTopPosts`/`buildHeatmap`/`buildEngagementTrend` tam
   taban-gruplaması YOK** — yalnızca `unavailable` satırları dışlıyorlar;
   `reach`-tabanlı ve `followers`-tabanlı satırların AYNI listede/ortalamada
   karışmaması Instagram (adım 17b) gerçek veriyle geldiğinde YENİDEN
   gözden geçirilmeli. `lib/core/insights/build-feedback.ts` bu ayrımı TAM
   uyguluyor (`dominantEngagementGroup`) — derive/analytics.ts'in geri
   kalanı daha hafif bir korumaya sahip, kod içinde ⚠ olarak işaretlendi.
5. **`refreshBlueskyChannelStats()` doğrudan çağrılıyor, kuyruğa
   GİRMİYOR** — `getProfile` tek/ucuz bir çağrı, kendi retry politikasına
   ihtiyacı yok (bilinçli tasarım kararı, `sm-reaper`'ın iki-sweep-tek-rota
   deseninin aynısı).
6. **Bu oturumda kendi migration çalıştırmalarım production cron'u
   yanlışlıkla kapattı** (apply.sh'ın CRON_ACTIVE varsayılanı) — fark
   edilip düzeltildi, ama gelecekte HER `bash supabase/apply.sh`
   çalıştırmasından SONRA cron durumu kontrol edilmeli
   (`select jobname,active from cron.job`).

# ADIM 21'E (GÜVENLİK DENETİMİ) GEÇMEDEN BİLMEN GEREKENLER

1. Bluesky metrik toplama YALNIZCA okuma (`getPosts`/`getProfile`) —
   yazma yok, ek bir güvenlik yüzeyi açmıyor.
2. `plans.insight_snapshot` jsonb — bugün yalnızca yapısal notlar/sayılar
   taşıyor, PII/sır YOK; yine de adım 21'de RLS'in bu kolonu da
   kapsadığı doğrulanmalı (zaten `plans` tablosunun genel RLS'i altında).
3. `engagement_rate_basis` CHECK kısıtı canlıda doğrulandı (23514, geçersiz
   değer reddedildi).
4. Kalibre edilmemiş eşiklerin listesi büyüyor (§4c 0.92/0.82,
   `FEEDBACK_MIN_MEASURED`, `FEEDBACK_WINDOW_DAYS`, tier ağırlıkları
   final/d1) — adım 21 bunları toplu gözden geçirmenin doğal yeri olabilir.
