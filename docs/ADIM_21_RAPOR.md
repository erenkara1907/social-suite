# ADIM 21 RAPORU — güvenlik kapanışı ve kalibrasyon

Kaynak: `docs/BIRLESIM_PLANI.md` §10 (16 madde) + §12 adım 21.
Bu adım yeni özellik yazmadı — denetledi, sertleştirdi, borç kapattı.

Durum: FAZ A ✅ · FAZ B ✅ · FAZ C ✅ · FAZ D ✅ · FAZ E (bu bölüm sonda tamamlanacak).

---

## FAZ A — apply.sh cron tuzağı

Ayrı commit: `fix: apply.sh cron koruması (21a)`. Özet:

- **Bulgu**: `apply.sh` her çalıştırmada 5 `sm-%` cron job'ını `unschedule`+
  `schedule` ile YENİDEN kuruyordu ve hemen ardından `cron.alter_job(...,
  active := $CRON_ACTIVE)` ile ezdi. `CRON_ACTIVE` varsayılanı `false` —
  üretimde dönen bir kurulumda sonraki bir `apply.sh` çalıştırması cron'u
  sessizce kapatabiliyordu (hata yok, log yok).
- **Düzeltme**: `00_schema.sql`'in cron bloğu artık mevcut bir job'ın
  `active` durumunu korur (yalnızca YENİ job varsayılan pasif kurulur);
  `apply.sh` cron durumuna yalnızca açık `--set-cron-active=true|false`
  bayrağıyla dokunuyor.
- **Görünürlük**: `cron_fire()` her tetiklenmede `public.cron_heartbeats`'e
  yazıyor; `/api/cron/health` (CRON_SECRET korumalı) bu yaşı okuyup iş tipi
  başına kalibre edilmemiş bir eşikle "stale" işaretliyor.
- **Doğrulama (üretime karşı, kullanıcı onayıyla)**: `apply.sh` bayraksız ×2
  → `cron.job.active` değişmedi (4 aktif, `sm-token-refresh` pasif, ikisinde
  de aynı); `apply.sh --set-cron-active=false` → 5/5 pasif oldu (görünür
  değişim kanıtı); üretim orijinal duruma manuel geri alındı;
  `/api/cron/health` authsız/yanlış sır → 401 boş gövde, doğru sır → 200 +
  canlı heartbeat yaşları.

---

## FAZ B — §10'un 16 maddesinin denetimi

Kanıt **çalıştırılmış** — kod okuması tek başına kabul edilmedi (bkz. iki
paralel denetim ajanının curl/psql/vitest çıktıları, aşağıda özetlendi).

| # | Bulgu | Durum | Kanıt | Açıksa çözüm / not | Öncelik |
|---|---|---|---|---|---|
| 1 | SSRF (`videoUrl`/`audioUrl`) | **KAPALI** | Mimari değişti: `lib/server/media/pipeline.ts` `dispatchLipsync`/`succeededStepOutput` (satır 98-112, 239-262) URL'i istemciden almıyor, `media_jobs`/`media_assets`'ten okuyor. `lib/server/fetch-guard.ts` — host allowlist + DNS-rebinding-güvenli IP pinleme + özel IP reddi. `npx vitest run lib/server/fetch-guard.test.ts` → **34 passed, 2 skipped** | — | — |
| 2 | 12 rotanın 12'sinde auth yok | **KAPALI** | Bugünkü mimaride 6 rota + server action'ların tamamı `requireUser`/`requireBrand`/`verifyCronSecret` guard'lı; curl ile cookie'siz istek → 401/307 doğrulandı (aşağıda C2) | — | — |
| 3 | `/api/caption`, `/api/image` auth'suz | **KAPALI/MOOT** | Bu rotalar bugünkü kod tabanında yok — birleşim sırasında server action'lara taşındı (`requireBrand()` korumalı) | — | — |
| 4 | `(app)/layout.tsx` guard yok | **KAPALI** | `curl /dashboard`, `/channels`, `/settings`, `/onboarding` cookie'siz → hepsi `307 → /login?next=...` (gerçek curl çıktısı) | — | — |
| 5 | Rate limit yok | **KAPALI** | `enqueue_job()` DB seviyesinde (app kodu atlayamaz). Canlı test (BEGIN…ROLLBACK, sıfır kalıcı etki): 10 `plan_generate` isteği kabul, 11. `RLIM1` ile red | — | — |
| 6 | Cron idempotency kilidi yok | **KAPALI** | `content_items.status='publishing'` + koşullu UPDATE (`publish-item.ts`). ADIM_17a'nın canlı çifte-yayın testi ("iki eşzamanlı çağrı → tek gönderi") — kod o tarihten beri değişmedi (`git log` tek commit); yeniden test EDİLMEDİ (gerçek bir Bluesky gönderisi daha açardı) | — | — |
| 7 | Kalıcı depolama yok | **KAPALI** | `lib/server/storage.ts` → `media_assets` + Storage `public_url` | — | — |
| 8 | `public/personas/` yazımı | **KAPALI** | `grep` — dosya sistemi yazımı yok, yalnızca eski proje adı yorumlarda | — | — |
| 9 | Token sızıntısı | **KAPALI** | `channel_credentials`: `relrowsecurity=t`, 0 politika (gerçek `pg_policies` sorgusu) | — | — |
| 10 | Müşteri API anahtarları | **KAPALI** | `provider_credentials`: `relrowsecurity=t`, 0 politika; Vault erişimi `get_provider_secret`/`set_provider_credential` (SECURITY DEFINER, `search_path` sabit) üzerinden | — | — |
| 11 | Service-role RLS baypası | **KAPALI (gerekçeli)** | 17 çağrı sitesi enumerate edildi. 15/17 dokümante edilen 3 kategoriye tam oturuyor. 2'si ilk bakışta "kategori dışı" görünüyordu (`run-provider-call.ts`, `publisher.ts`) — ikisi de incelendi, ikisi de doğru tasarım (aşağıda C3) | `admin.ts`'in "3 kategori" yorumu bu adımda genişletildi, gelecekte yanlış pozitif "ihlal" olarak işaretlenmesin diye | — |
| 12 | `.env.local` gerçek anahtarlarla dolu | **KAPALI/MOOT** | Üç kaynak projenin birleşimi tamamlandı; anahtarlar zaten Vault/`provider_credentials` modeline taşındı (9/10) — migration-dönemi riski artık geçerli değil | — | — |
| 13 | `004-cron.sql` hardcode prod URL | **KAPALI** | `grep '__APP_URL__'` — yalnızca placeholder var, hardcode yok | — | — |
| 14 | Token yenileme job'ı yok | **KISMEN (bilinçli erteleme)** | Bugünkü tek canlı platform Bluesky: `refreshBlueskySession()` `publish-item.ts:153` ve `metrics/collect.ts:81` içinde INLINE çağrılıyor (grep ile doğrulandı) — ayrı bir cron'a ihtiyaç yok. `sm-token-refresh` kurulu ama PASİF (doğru — hedefi `/api/cron/tokens` henüz YOK) | Instagram (16/17b) canlı olduğunda `/api/cron/tokens` yazılıp job aktive edilmeli; önce aktive edilirse `CRON_AKTIVASYON.md`'nin uyardığı 404 gürültüsü oluşur | ORTA (16/17b'ye bağlı) |
| 15 | Test yok, CI yok | **KISMEN AÇIK** | Test: KAPALI — `npm test` → 599 passed, 43 skipped. CI: **AÇIK** — `.github/` dizini yok, hiçbir otomatik pipeline yok | GitHub Actions workflow'u (`npm test` + `npx tsc --noEmit` + `npm run lint`) eklenmeli — bu oturumun kapsamı dışında bırakıldı (kod değişikliği değil, altyapı kararı; kullanıcı onayı gerekir) | ORTA |
| 16 | Demo bypass üretimde | **KAPALI** | `auth-screen.tsx`'te bypass yok. `lib/adapters/mode.ts:74-79` çerez override'ı `NODE_ENV !== "production"` guard'lı, prod derlemede dead-code-eliminated; yalnızca VERİ modunu etkiliyor, kimlik doğrulamayı hiç etkilemiyor. `npx vitest run lib/adapters/mode.test.ts` → **26 passed** (dahil `NODE_ENV=production` senaryoları) | — | — |

**Özet**: 16 maddeden 12'si tam KAPALI, 2'si KAPALI/MOOT (mimari değişikliği
nedeniyle konu dışı kaldı), 1'i bilinçli erteleme (14 — Instagram'a bağlı),
1'i gerçek açık (15 — CI).

---

## FAZ C — Üretim yüzeyi denetimi

### C1. Sır yönetimi

- **Tam tarama**: `grep -rnE "sk-[A-Za-z0-9]{20,}|AIza...|xoxb-|BEGIN...PRIVATE KEY"` repo genelinde → **0 sonuç**. Hiçbir yanıtta/logda/bundle'da hardcode sır yok.
- **`sanitizeErrorMessage()` gerçek sağlayıcı hatasında**: Gerçek (geçersiz) anahtarla fal.ai/ElevenLabs'e canlı istek atıldı (kredi harcanmadan — `verifyFalKey`/`verifyElevenLabsKey` zaten bunun için tasarlanmış preflight'lar). Sonuç: fal.ai → `"invalid key credentials"`, ElevenLabs → `"Invalid API key"` — **ikisi de zaten temiz**, gönderilen anahtarı yankılamıyor. Ayrı bir sentetik testte, sağlayıcı yanıtı anahtarı yankılasaydı `sanitizeErrorMessage()`'ın `[REDACTED]`'a çevirdiği doğrulandı (Bearer token + uzun base64 desenleri). Geçici prob dosyası (`_tmp-sanitize-probe.live.test.ts`) denetim sonunda silindi.
- **Vercel ortam değişkenleri** (`vercel env ls production`): 8 değişken — `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PERSONA_PHONE_EFFECT`, `PERSONA_PIPELINE_ENABLED`, `APP_MODE` (Hidden/Secret); `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` (Config, kasıtlı açık — Supabase anon key + RLS zaten client-safe). Gereksiz değişken yok. **`SUPABASE_DB_URL` (en büyük blast radius) bilinçli olarak Vercel'de YOK** — doğru, app doğrudan Postgres bağlantısı hiç kullanmıyor. `INSTAGRAM_*` değişkenleri henüz Vercel'de yok — eksik değil, 16/17b henüz canlı değil.

### C2. Rota ve yetkilendirme

Tam tablo yukarıda (FAZ B madde 2/4). Ek kanıt: `app/auth/callback/route.ts` — `code` yok / sahte `code` → `/login`'e redirect; `lib/routes.test.ts` (`safeNextPath` — açık yönlendirme reddi, `//evil.com` dahil) → **16 passed**. Cron rotaları: `CRON_SECRET` sabit-zamanlı karşılaştırma (`lib/server/cron-auth.ts` — SHA-256 digest'e indirgeyip `timingSafeEqual`), başarısızlıkta HER ZAMAN boş gövde + 401 (hangi kontrolün başarısız olduğu sızdırılmıyor) — `/api/cron/health` üzerinden gerçek istekle doğrulandı.

### C3. RLS bütünlüğü

- **18 public tablonun tamamında RLS açık** (`relrowsecurity=t`). `channel_credentials`, `provider_credentials`, `rate_limit_counters` (istenen 3) + `ai_kill_switch`, `cron_heartbeats`, `rate_limit_policies` (ek 3) sıfır politikayla — hepsi yalnızca service-role veya SECURITY DEFINER RPC üzerinden erişiliyor (kod taraması + gerçek `pg_policies` sorgusuyla doğrulandı).
- **Politika mantığı**: her tablo `auth.uid()` doğrudan karşılaştırması (`brands`, `jobs`, `profiles`) ya da `owns_brand(brand_id)` (SECURITY DEFINER, `auth.uid()`'a dayalı) ile kısıtlı — A kullanıcısı B'nin satırını göremez.
- **`find_similar_content` / `brand_latest_metrics`**: fonksiyon İÇİNDE `owns_brand()` yok — **KISMEN**, ama bilinçli: her ikisi de worker/cron bağlamında admin (service-role) client ile, OTURUMSUZ çağrılıyor (`handlers.ts:92,169`) — `auth.uid()` orada NULL döner, içeriye bir `owns_brand()` kontrolü eklemek bu çağrıları KIRARDI (production regresyonu — bu adımda doğrulandı, uygulanmadı). Savunma bilinçli olarak çağıran tarafta: bugünkü tüm çağıranlar `brand_id`'yi `requireBrand()`'dan veya zaten doğrulanmış bir `jobs` satırından alıyor. Gelecekte yeni bir çağıran eklenirse O çağıran kendi `owns_brand()` kontrolünü yapmalı. `admin.ts`'in yorumu bu netliği kayıt altına almak için genişletildi.
- **`plans.insight_snapshot`**: ayrı bir view/RPC yok, `plans` tablosunun tek politikası (`owns_brand`, ALL) tüm satırı (dolayısıyla bu kolonu da) kapsıyor — **KAPALI**, ayrı bir sızıntı yüzeyi açmıyor.
- **SECURITY DEFINER search_path**: 14/14 fonksiyonda `search_path` sabit (`{search_path=public}` veya `{"search_path=public, extensions"}`) — arama-yolu enjeksiyonuna açık fonksiyon yok.

### C4. Harcama koruması

- **Rate limit gerçekten çalışıyor mu**: Evet — canlı test (BEGIN…ROLLBACK, sıfır kalıcı etki, `run_after` +1 yıl ikinci güvenlik payı): `plan_generate` limiti (10/saat) 10 istekle dolduruldu, 11. istek `enqueue_job: hiz siniri asildi` (`RLIM1`) ile reddedildi. Rollback sonrası `rate_limit_counters`'ta test bucket'ı **0 satır**, `jobs`'ta test `dedupe_key`'i **0 satır** — hiçbir kalıcı etki yok.
- **Kill switch her pahalı yolu kapsıyor mu**: `ai_kill_switch.is_paused` `enqueue_job()` içinde `plan_generate`/`caption_write`/`ugc_pipeline` için kontrol ediliyor (rate limitTEN ÖNCE — kapalıyken sayaç hiç artmıyor). Canlı test: kill switch geçici olarak `true` yapıldı (aynı transaction içinde), `enqueue_job` çağrısı `KILL1` ile reddedildi, ardından ROLLBACK — üretimdeki gerçek durum (`is_paused=false`) değişmeden kaldığı doğrulandı. `publish`/`metrics_collect` kapsam dışı — bilinçli (müşterinin AI faturasını büyütmüyorlar, kodun kendi yorumu).
- **Ön kontrol (adım 20.5) atlanabiliyor mu**: Hayır. `dispatchPersonaImage`/`dispatchPersonaVideo`/`dispatchVoice`/`dispatchLipsync` modül-`private` (export edilmiyor); `grep` ile doğrulandı — tek çağrı noktaları `pipeline.ts`'in `checkUgcPreflight()` + `assertNotPaused()` SONRASINDAKİ switch bloğu. Başka hiçbir kod yolu vendor'ı çağıramıyor.
- **Sonsuz döngü tavanları**: `JOB_RETRY_POLICY` (`lib/core/jobs/types.ts`) her iş tipi için sonlu `maxAttempts` (2-5) tanımlıyor; `ugc_pipeline` özel olarak `reaperOnStuck: "dead"` — çökme belirsizliğinde kör requeue YOK (vendor'ı ikinci kez tetikleyip krediyi ikiletme riski yapısal olarak kapatılmış).

---

## FAZ D — Kalibrasyon envanteri

Ayrı dosya: `docs/KALIBRASYON.md`. Hiçbir değer değiştirilmedi — yalnızca
envanterlendi (değer, tanım yeri, adım, gerekçe, gözden geçirme eşiği).
Kapsanan: §4c eşikleri, geri besleme sabitleri (`FEEDBACK_MIN_MEASURED`,
`FEEDBACK_WINDOW_DAYS`, tier ağırlıkları, tier pencere/aralıkları), worker
sabitleri (`TIME_BUDGET_MS`/`PER_JOB_TIMEOUT_MS`/`BATCH_SIZE`), reaper
eşikleri, iş tipi `maxAttempts`, hız sınırı değerleri (+ `rate_limit_policies`
tablosunun BOŞ olduğu, yani hepsinin şu an kod-içi varsayılan olduğu bulgusu),
ve bu oturumda eklenen cron sağlık eşiği.

---

## FAZ E — Kapanış

_(bu bölüm Faz E çalıştırıldıktan sonra doldurulacak)_
