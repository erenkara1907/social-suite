# ADIM 12 RAPORU — iş kuyruğu

Tarih: 2026-08-29 · Kaynak: `docs/BIRLESIM_PLANI.md` §12 adım 12 · önceki
oturumlar: `docs/ADIM_012_RAPOR.md` (adım 0-1-2), `ADIM_34_RAPOR.md`
(adım 2.5·3·4), `ADIM_56_RAPOR.md` (adım 5·6), `ADIM_27_RAPOR.md`
(adım 2·7), `ADIM_8/9/10/11_RAPOR.md` (adım 8-11).

Kapsam: FAZ A (iş tipleri + kuyruğa ekleme) · FAZ B (worker) · FAZ C
(görünürlük) · FAZ D (cron hazırlığı, çalıştırılmadı) · FAZ E (kapanış).

Bu adımda **hiçbir dış servise** (Anthropic, Kie, fal, ElevenLabs, Instagram)
çağrı yapılmadı. Tüm doğrulama canlı Supabase'e karşı çalıştı (kuyruk
altyapısının kendisi bu adımın işi).

---

## ÖZET

| Faz | Durum | Doğrulama |
|---|---|---|
| A — iş tipleri + kuyruğa ekleme | ✅ | tip uyuşmazlığı `tsc` hatası (TS2353), idempotency tek satır, cross-brand 42501→403 |
| B — worker | ✅ | 401 boş gövde, 5/5 noop_test done, ölü mektup 3 denemede, 2 worker sıfır çakışma, süre bütçesi testi |
| C — görünürlük | ✅ | ölü mektup `/queue`'da görünür (e2e ile kanıtlı) |
| D — cron | ✅ | 5/5 `active=false`, aktivasyon rehberi `docs/CRON_AKTIVASYON.md` |
| E — kapanış | ✅ | 5 kapı + e2e (6/6) yeşil, `process.env` grep sıfır |

Commit'ler: `f7374c2` (12a) · `8d523ae` (12b) · `77a1ebc` (12c) · bu rapor (12d/e).

---

## İş tipi tablosu

`lib/core/jobs/types.ts` — `supabase/00_schema.sql` `jobs.kind` CHECK'inden
türetildi + `noop_test` (bu adımda eklendi, şemaya da işlendi).

| Tip | Adım | maxAttempts | expectedDurationMs | backoffBaseMs | Gerekçe |
|---|---|---|---|---|---|
| `plan_generate` | 14 | 3 | 20 000 | 5 000 | AI çağrısı, 429/5xx olası |
| `caption_write` | 14 | 3 | 8 000 | 3 000 | AI çağrısı, hızlı |
| `ugc_pipeline` | 20 | 2 | 180 000 | 30 000 | Vendor kredisi harcar — az deneme |
| `media_poll` | 20 | 5 | 3 000 | 10 000 | Ucuz durum sorgusu, çok deneme güvenli |
| `publish` | 17 | 3 | 10 000 | 15 000 | Müşteri hesabına yazar — az deneme, dedupe_key + içerik kilidi ikinci savunma |
| `metrics_collect` | 18 | 2 | 15 000 | 20 000 | Sweep — bir sonraki cron turunda zaten tekrar dener |
| `token_refresh` | 16/17 | 2 | 5 000 | 30 000 | Sweep, günlük |
| `embed_backfill` | 15 | 5 | 4 000 | 5 000 | Ucuz, çok deneme güvenli |
| `noop_test` | 12 (bu adım) | 3 | 100 | 1 000 | Yalnızca döngü kanıtı |

⚠ **`content.dedupe` bilinçli olarak YOK.** Tekrar önleme (§4c/§8.1)
`lib/core/dedupe/*` içinde SENKRON çalışacak — `plan_generate` işleyicisinin
İÇİNDE (adım 15), kendi kuyruk işi değil. Kuyruğa yalnızca "embedding'i
sonradan doldur" ihtiyacı düşüyor (`embed_backfill`).

⚠ **İsimlendirme sapması.** Görev metni örnekleri nokta gösterimiyle verdi
(`plan.generate`, `publish.post`…). Gerçek `jobs.kind` CHECK listesi alt
çizgili (`plan_generate`, `publish`) — yeni `noop_test` de bu sözleşmeye
uydu, nokta gösterimi kullanılmadı. Gerekçe `lib/core/jobs/types.ts`'te.

---

## Idempotency + çifte yayın koruması — iki katman

**Şemada alan zaten vardı** (`jobs.dedupe_key`, adım 2'de yazıldı, kısmi
UNIQUE indeksle: `queued`/`running` durumundaki satırlarda benzersiz). Bu
adımda ona bir YAZMA yolu eklendi: `enqueue_job()` SECURITY DEFINER
fonksiyonu — aynı `dedupe_key` ile `queued`/`running` bir satır varsa yeni
satır AÇMAZ, var olanı döner (yarış durumu `unique_violation` yakalanarak
kapatıldı).

**İki katman, farklı yarış koşulları:**

1. **Kuyruk katmanı** (`enqueue_job` + `dedupe_key`) — aynı işin **iki kez
   KUYRUĞA GİRMESİNİ** engeller (örn. kullanıcı "yayınla"ya çift tıklarsa).
2. **İçerik katmanı** (§4a, `content_items.status`) — `scheduled →
   publishing` koşullu `UPDATE ... where status='scheduled'`; kuyruğa bir
   kez giren işin worker tarafından **iki kez İŞLENMESİNİ** engeller (örn.
   `claim_jobs` çağrısı takılıp iş yeniden kuyruğa düşerse).

Yalnızca birine güvenmek yetmez: (1) olmadan çift tıklama iki ayrı iş satırı
açar (güvenli ama israf — ikisi de content'i kilitlemeye çalışır, biri
kaybeder); (2) `claim_jobs`'un `SKIP LOCKED`'ı zaten bunu engelliyor ama
içerik kilidi kuyruk-dışı bir çağrıya (örn. elle retry) karşı da savunma
derinliği sağlıyor. Ayrıntı: `lib/server/jobs/enqueue.ts` docstring'i.

---

## Süre bütçesi + iş sayısı kararları

`lib/server/jobs/worker.ts`:

| Sabit | Değer | Gerekçe (özet) |
|---|---|---|
| `TIME_BUDGET_MS` | 45 000 | `cron_fire()`'ın `pg_net` zaman aşımı 55 000ms (`00_schema.sql`) — altında ~10sn güvenli pay, `sm-worker`'ın 60sn'lik tetikleme aralığından da kısa |
| `PER_JOB_TIMEOUT_MS` | 20 000 | Bütçenin ~%44'ü — tek işleyici bütçeyi yiyemez; en kötü ihtimalle art arda 2 zaman aşımı bile worker'ı düzgün kapatmaya yetecek bütçe bırakır |
| `BATCH_SIZE` | 5 | `claim_jobs`'un adım 2'de test edilen varsayılanı; küçük parti + döngü, tek seferde büyük taahhüt yok |
| `MAX_BACKOFF_MS` | 600 000 (10dk) | `sm-worker` zaten dakikada bir dönüyor — 10dk'dan uzun bekletmenin anlamı yok |

Bu değerler **ölçülmedi, muhafazakâr seçildi** (görev talimatı: "sınırı kodda
öğrenmeye çalışma"). Adım 14+'te gerçek işleyicilerle kalibre edilmeli.

`docs/CRON_AKTIVASYON.md`'de ayrıca değerlendirildi: `sm-worker`'ın 1
dakikalık sıklığı **doğru** — `TIME_BUDGET_MS` zaten bu aralığa göre
tasarlandı, çakışsa bile `SKIP LOCKED` zararsız kılıyor.

---

## Ölü mektup testinin çıktısı

Sürekli **geçici** hata veren bir iş (`noop_test`, `forceFailure:"transient"`,
`max_attempts=3`) — worker 3 kez elle tetiklendi (aradaki `run_after`
gecikmesi test için SQL ile öne çekildi):

```
çağrı 1: {"claimed":1,"succeeded":0,"requeued":1,"dead":0} → state=queued attempts=1
çağrı 2: {"claimed":1,"succeeded":0,"requeued":1,"dead":0} → state=queued attempts=2
çağrı 3: {"claimed":1,"succeeded":0,"requeued":0,"dead":1} → state=dead   attempts=3
```

Sayaç tam `max_attempts`'te ölü mektuba düştü — israf yok, erken vazgeçme
yok. **Kalıcı** hata (`forceFailure:"permanent"`, `max_attempts=5`) ise TEK
çağrıda dead-lettered oldu (`attempts=1`), `max_attempts`'i beklemedi —
`PermanentJobError` ayrımının çalıştığının kanıtı.

## Eşzamanlılık testinin çıktısı

20 `noop_test` işi kuyruğa alındı, `/api/cron/worker`'a 2 eşzamanlı `curl`
isteği gönderildi:

```
worker A: {"claimedBatches":2,"claimed":10,"succeeded":10,...}
worker B: {"claimedBatches":2,"claimed":10,"succeeded":10,...}
sonuç: succeeded=20, attempts>1 olan satır sayısı = 0
```

10/10 bölündü, çakışma sıfır — adım 2'nin `claim_jobs` testinin worker
seviyesindeki karşılığı.

## Süre bütçesi testinin çıktısı

4 iş, her biri 15sn yapay gecikmeli (`delayMs`, yalnızca test amaçlı):

```
{"claimedBatches":1,"claimed":4,"succeeded":2,"requeued":2,"elapsedMs":32054}
real 0m32.101s
budget:1 succeeded · budget:2 succeeded · budget:3 queued · budget:4 queued
```

Worker 32sn'de döndü (45sn bütçenin altında), kalan 2 iş `queued`'da
bırakıldı — bir sonraki tetiklemeye devredildi, `running`'de askıda kalan
satır yok.

---

## Hata mesajlarının sır sızdırmadığının kanıtı

`lib/server/jobs/worker.ts` `sanitizeErrorMessage()`:
- `err.stack` **hiçbir zaman** kaydedilmez, yalnızca `.message`.
- Bilinen sır desenleri (`Bearer <token>`, `sk-...`, JWT benzeri üçlü nokta
  ayraçlı diziler, 40+ karakterlik base64/hex bloklar) `[REDACTED]` ile
  değiştirilir.
- Mesaj 500 karakterde kırpılır.

`CRON_SECRET` doğrulaması: yanlış/eksik sır → `401`, **gövde boş**
(`new Response(null, {status:401})`) — hangi kontrolün başarısız olduğu
söylenmiyor. `curl -i` ile doğrulandı (Faz B).

---

## Varsayımlar + adım 13'e (rate limit + müşteri anahtarları) geçmeden bilmen gerekenler

1. **`jobs.state='failed'` şemada var ama worker onu hiç üretmiyor.**
   Tasarım gereği: geçici hata → doğrudan `queued` (backoff ile), kalıcı/
   tükenmiş hata → doğrudan `dead`. Ara `failed` durumu gözlenmiyor — Faz C
   görünürlük ekranında bu bilinçli olarak belgelendi. Eğer ileride bir
   handler `failed`'i AYRI bir anlamda kullanmak isterse (örn. "bu belirli
   deneme başarısız oldu ama henüz karar verilmedi") bu tasarım kararı
   gözden geçirilmeli.

2. **`jobs` tablosunun genel bir "stuck running" süpürücüsü YOK.** `sm-reaper`
   yalnızca `content_items.status='publishing'` kilidini süpürüyor (§4a),
   `jobs.state='running'` için karşılığı yok. Worker kodu bunu normal
   akışta engelliyor (`requeueUnprocessed`, try/catch her zaman bir durum
   geçişiyle biter) ama süreç TAMAMEN çökerse (örn. OOM, Vercel fonksiyon
   sonlandırması) bir satır `running`'de askıda kalabilir. Bugün risk düşük
   (hiçbir handler gerçek iş yapmıyor) ama adım 14+ gerçek işleyiciler
   eklenince değerlendirilmeli — gerekirse `sm-reaper`'a `jobs` desteği
   eklenir ya da ayrı bir süpürücü yazılır.

3. **`getJobsSummary()` yalnızca oturum sahibinin işlerini gösteriyor**
   (`own jobs read` RLS, `auth.uid()=user_id`, marka bazlı DEĞİL). Bugün
   marka:kullanıcı 1:1 olduğu için fark etmiyor; §4e'nin organizasyon
   katmanı gelince (çok kullanıcılı marka) bu görünüm EKSİK kalır — adım
   21'in tam panel işi marka bazlı bir RLS politikasıyla çözmeli.

4. **Cron 5/5 pasif kaldı, yalnızca `/api/cron/worker` rotası var.**
   `docs/CRON_AKTIVASYON.md`'e göre diğer 4 job kendi rotaları
   yazılmadan (adım 16-18) aktive edilmemeli — aktive edilirse hedefleri
   404 döner ve görünürlük ekranını gürültüyle doldurur.

5. **`JOB_RETRY_POLICY` ve worker sabitleri (TIME_BUDGET_MS,
   PER_JOB_TIMEOUT_MS) kalibre EDİLMEDİ** — muhafazakâr başlangıç
   değerleri. Adım 14+ gerçek işleyicilerle ölçülüp gözden geçirilmeli.

6. **`enqueue()` bugün hiçbir yerden çağrılmıyor** — adım 14'ün ilk işi
   `PlannerPort.live`'ı `enqueue("plan_generate", ...)`'e bağlamak olacak.
   `lib/server/jobs/handlers.ts`'teki sekiz `NOT_IMPLEMENTED` gövdesi o
   zaman tek tek dolacak.

---

## Beş kapı + e2e

```
1. npx tsc --noEmit          exit 0
2. npx eslint .               exit 0
3. npx vitest run             423/423 PASS (18 dosya)
4. npm run build               ✓ derlendi, /api/cron/worker rotası listede
5. npx playwright test         6/6 PASS (journey, plan, settings×2, smoke, jobs-queue-status)

$ grep -rn "process.env" lib/core/jobs/
(sıfır eşleşme)
```

## DEĞİŞTİRİLMEYENLER

- `sahne/`, `siraya/`, `threadly/` — dokunulmadı.
- Hiçbir dış servis (Anthropic/Kie/fal/ElevenLabs/Instagram) çağrılmadı.
- Cron job'lar aktive EDİLMEDİ (5/5 `active=false`, korundu).
- Sekiz gerçek iş tipinin işleyicisi yazılmadı — hepsi `NOT_IMPLEMENTED`
  (adım 14+'nin işi).
