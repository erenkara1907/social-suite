# Kalibrasyon Envanteri

Adım 21 FAZ D — BIRLESIM_PLANI ADIM_18 madde 4'ün istediği envanter.
**Bu bir envanterdir, bir kalibrasyon değil.** Hiçbir değer bu belgeyle
DEĞİŞTİRİLMEDİ — elde yeterli gerçek veri yok (bir gönderi, birkaç plan).
Uydurma kalibrasyon, kalibre edilmemişten kötüdür.

Her satır: değer · nerede tanımlı · hangi adımda kondu · neye göre seçildi ·
kaç ölçüm birikince gözden geçirilmeli.

---

## 1. Tekrar önleme eşikleri (§4c)

| Değer | Tanım | Adım | Seçim gerekçesi | Gözden geçirme eşiği |
|---|---|---|---|---|
| `duplicateThreshold = 0.92` | `lib/core/dedupe/config.ts:34` | 15 | Kosinüs benzerliği bandı — sezgisel başlangıç, hiçbir gerçek embedding dağılımıyla doğrulanmadı | İlk ~200 gerçek `content_items` satırından sonra (dosyanın kendi notu) — yanlış-pozitif/negatif oranı gerçek embedding dağılımıyla ölçülebilir hâle geldiğinde |
| `continuationThreshold = 0.82` | `lib/core/dedupe/config.ts:35` | 15 | Aynı | Aynı — 200 satır |
| `minDaysSincePublish = 3` | `lib/core/dedupe/config.ts:36` | 15 | "Çok taze komşuya devam önerilmesin" sezgisi | 200 satırla birlikte |
| `maxChainDepth = 12` | `lib/core/dedupe/config.ts:37` | 15 | `content_items.chain_position` CHECK tavanıyla eşleşecek şekilde seçildi (DB'ye danışmadan motorun kendi kararı) | Yalnızca DB CHECK değişirse |
| `maxContinuationChecksPerRun = 5` | `lib/core/dedupe/config.ts:38` | 15 | Bir `plan_generate` çalışmasında LLM'e "devam mı?" sorusu için maliyet tavanı (her çağrı gerçek Anthropic isteği) | İlk gerçek plan üretim hacminden sonra — bir planın ortalama kaç "yakın aday" ürettiği ölçülünce |

## 2. Metrik → plan geri besleme (§8.3, Akış D)

| Değer | Tanım | Adım | Seçim gerekçesi | Gözden geçirme eşiği |
|---|---|---|---|---|
| `FEEDBACK_MIN_MEASURED = 5` | `lib/core/insights/build-feedback.ts:32` | 18 | "En az bir tam hafta örnekleme" sezgisi — 3 gönderiden "en iyi saat" çıkarmak uydurma sayılırdı | İlk ~50-100 gerçek ölçümden sonra (dosyanın kendi notu) |
| `FEEDBACK_WINDOW_DAYS = 45` (görev metninde `METRIC_WINDOW_DAYS`) | `lib/core/insights/build-feedback.ts:43` | 18 | `/analytics`'in adım 8'de seçtiği 45 günle BİLİNÇLİ olarak aynı tutuldu — `brand_latest_metrics(p_days)` ikisinin de tek okuma kaynağı, iki farklı pencere "aynı satırlara bakıyoruz" garantisini kırardı | §4f'nin 30 günlük toplama penceresi + birkaç günlük tampon dışında hiçbir ölçümle doğrulanmadı — ilk tam metrik döngüsünden (30-45 gün canlı veri) sonra |
| `TOP_SHARE = 0.2` | `lib/core/insights/build-feedback.ts:46` | 18 | Plan metninin kendi ifadesi ("üstteki %20'yi seç") — gerçek dağılımla doğrulanmadı | 50-100 ölçümle birlikte |
| `HOOK_LENGTH_SIGNAL_RATIO = 0.75` | `lib/core/insights/build-feedback.ts:49` | 18 | "top ortalaması rest'in en az %25 altında" sezgisi | Aynı |
| `QUESTION_HOOK_SIGNAL_DELTA = 0.25` | `lib/core/insights/build-feedback.ts:50` | 18 | "en az 25 puan fark" sezgisi | Aynı |
| Tier ağırlıkları: `final=1.0`, `d1/diğer=0.7` | `supabase/00_schema.sql` `brand_latest_metrics()` (~satır 1204) | 18 | "Olgunlaşmış ölçüm taze ölçümden daha çok söz söyler" sezgisi — oran (1.0/0.7) gerçek final-vs-d1 sapma büyüklüğüyle doğrulanmadı | İlk ~30 içerik hem `d1` hem `final` tier'a ulaştığında, iki ölçüm arasındaki gerçek sapma ölçülüp orana yansıtılabilir |
| `FINAL_WINDOW_DAYS = 30` | `lib/core/metrics/tier.ts:25` | 18 | §4f'nin toplama penceresi | 30-45 gün canlı veriden sonra |
| `H6_WINDOW_HOURS = 48`, `H6_INTERVAL_HOURS = 6`, `D1_INTERVAL_HOURS = 24` | `lib/core/metrics/tier.ts:22-24` | 18 | Bluesky/Instagram Insights'ın tipik "erken etkileşim eğrisi" sezgisi | İlk ~30 içeriğin gerçek etkileşim eğrisiyle karşılaştırıldığında |

## 3. İş kuyruğu / worker sabitleri (§8.5)

| Değer | Tanım | Adım | Seçim gerekçesi | Gözden geçirme eşiği |
|---|---|---|---|---|
| `TIME_BUDGET_MS = 45_000` | `lib/server/jobs/worker.ts:39` | 12 | 60sn'lik cron aralığının altında, ~15sn güvenli pay | `docs/CRON_AKTIVASYON.md`'nin kendi notu: "trafik gerçek verilerle ölçülünce (adım 14+) gözden geçirilmeli" — henüz yapılmadı |
| `PER_JOB_TIMEOUT_MS = 20_000` | `lib/server/jobs/worker.ts:56` | 12 | Tek işleyicinin `TIME_BUDGET_MS`'i tek başına tüketmesini önleme tavanı | Gerçek iş süreleri (özellikle `ugc_pipeline`'ın dispatch adımları) ölçülünce |
| `BATCH_SIZE = 5` | `lib/server/jobs/worker.ts:69` | 12 | "`TIME_BUDGET_MS` dolmadan hepsini işleyemeyecek kadar büyük parti almama" tavanı | Gerçek kuyruk derinliği/iş karışımı ölçülünce |
| `STUCK_THRESHOLD_MS = 10dk` | `lib/server/jobs/reaper.ts:41` | 13 | Normal bir işin (~65sn) belirgin üstü | İlk gerçek "çökme" olayından sonra — kaç dakikada bir insan/otomatik müdahale gerektiği görülünce |
| `CONTENT_PUBLISHING_STUCK_THRESHOLD_MS = 15dk` | `lib/server/jobs/reaper.ts:127` | 17a | Aynı mantık, yayın kilidi için | Aynı |
| `maxAttempts` — iş tipi başına | `lib/core/jobs/types.ts` `JOB_RETRY_POLICY` (aşağıda) | 12/17a | Aşağıya bakın | İlk `dead` birikimi analiz edilince |

### `JOB_RETRY_POLICY` — iş tipi başına `maxAttempts`

| İş tipi | `maxAttempts` | `reaperOnStuck` | Gerekçe |
|---|---|---|---|
| `plan_generate` | 3 | requeue | Ucuz/hızlı AI çağrısı, 429/5xx için orta deneme |
| `caption_write` | 3 | requeue | Aynı |
| `ugc_pipeline` | 2 | **dead** | Her deneme gerçek kredi harcayabilir; çökme anı vendor çağrısından önce/sonra ayrılamaz — kör requeue çift ücretlendirebilir |
| `media_poll` | 5 | requeue | Ucuz sorgu, agresif deneme güvenli |
| `publish` | 3 | requeue | Müşteri hesabına yazıyor — az deneme + `dedupe_key`/durum kilidi ikinci katman |
| `metrics_collect` | 2 | requeue | Bir sonraki cron turunda zaten yeniden denenecek |
| `token_refresh` | 2 | requeue | Aynı |
| `embed_backfill` | 5 | requeue | Ucuz, çok deneme güvenli |
| `noop_test` | 3 | requeue | Yalnızca test |

Hiçbiri ölçüme dayanmıyor — hepsi "bu iş tipi ne kadar pahalı/kritik"
sezgisiyle atandı (`lib/core/jobs/types.ts`'in kendi yorumu).

## 4. Hız sınırı (§8.7) — `rate_limit_policies` BOŞ, hepsi kod-içi varsayılan

`enqueue_job()` (`00_schema.sql`) önce `rate_limit_policies` tablosuna bakar;
üretimde bu tablo **sıfır satır** (doğrulandı, adım 21 FAZ C4) — yani
aşağıdaki değerler şu an TEK aktif değerler, marka bazlı override hiç
kullanılmadı:

| Bucket | Limit | Pencere | Adım | Gerekçe | Gözden geçirme eşiği |
|---|---|---|---|---|---|
| `plan_generate` | 10 | 3600sn (saatlik) | 14 | §8.7 başlangıç değeri | İlk gerçek müşteri kullanım deseni (kaç plan/saat gerçekte istenir) |
| `caption_write` | 100 | 3600sn | 14 | Aynı | Aynı |
| `ugc_pipeline` | 20 | 86400sn (günlük) | 20 | Video üretimi pahalı — günlük tavan | İlk gerçek UGC hacmi + vendor faturası karşılaştırılınca |
| `credential_verify` | 10 | 3600sn | 13 | "Anahtar doğrula" düğmesine kötüye kullanım tavanı | Gerçek kullanım deseninden sonra |

⚠ Ek bulgu (bu envanterin parçası değil ama ilişkili): `rate_limit_counters`
tablosunda artık var olmayan (silinmiş test) markalara ait satırlar birikmiş
— tabloya retention/temizlik job'ı yok. Güvenlik riski değil (yalnızca
depolama), ama not edildi.

## 5. Cron sağlık eşikleri (adım 21 FAZ A — bu oturumda kondu)

| Değer | Tanım | Gerekçe | Gözden geçirme eşiği |
|---|---|---|---|
| `STALE_THRESHOLD_SECONDS` — her job'ın kendi zamanlama aralığının **4 katı** | `app/api/cron/health/route.ts` | "Hiç ateşlenmemiş" gürültüsünü bastırmak için kaba güvenlik payı — hiçbir gerçek kesinti olayıyla doğrulanmadı | İlk gerçek kesinti/gecikme olayından sonra — 4 kat çok erken mi geç mi alarm verdi görülünce |

## 6. Bu envanterde OLMAYAN ama ilişkili olabilecekler

- Vault/`provider_credentials` doğrulama akışının kendi rate limiti (§4 sırasında
  bulunan `check_credential_verify_rate_limit`) — madde 4'e eklendi.
- `personas`/UGC script uzunluğu tavanları (`maxScriptCharsForClip`,
  `lib/core/providers/kie.ts`) — bu adımda taranmadı, ayrı bir kalibrasyon
  envanteri geçişinde ele alınmalı.
