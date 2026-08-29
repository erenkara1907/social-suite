# ADIM 13 RAPORU — rate limit + müşteri API anahtarları

Tarih: 2026-08-30 · Kaynak: `docs/BIRLESIM_PLANI.md` §8.6, §8.7, §1.12, §10 ·
önceki oturum: `docs/ADIM_12_RAPOR.md`, `docs/CRON_AKTIVASYON.md`

Kapsam: FAZ A (takılı iş süpürücüsü) · FAZ B (anahtar saklama) · FAZ C
(`/settings` entegrasyonlar) · FAZ D (rate limit) · FAZ E (kapanış).

Bu adımda **hiçbir dış servise** (Anthropic, Kie, fal, ElevenLabs,
Instagram) çağrı yapılmadı. Anahtarlar saklanıyor, kullanılmıyor — ilk
kullanım adım 14.

---

## ÖZET

| Faz | Durum | Doğrulama |
|---|---|---|
| A — takılı iş süpürücüsü | ✅ | 4 senaryo (requeue/dead/tükenmiş/dokunulmadı) canlıda doğrulandı |
| B — anahtar saklama | ✅ | 5/5 iddia (`provider_credentials.sh`) canlı HTTP + GoTrue ile PASS |
| C — `/settings` entegrasyonlar | ✅ | Playwright e2e (kaydet→maskeli→sil→gitti) + SQL bağımsız doğrulama |
| D — rate limit | ✅ | 3/3 iddia + yan kontrol (`rate_limit.sh`) canlı SQL ile PASS |
| E — kapanış | ✅ | 5 kapı + e2e (7/7) yeşil, sır sızıntısı taraması temiz |

Commit'ler: `f277eba` (13a) · `9a040e6` (13b) · `0d9491c` (13c) ·
`f8d21ef` (13d) · bu rapor (13e).

---

## FAZ A — takılı iş süpürücüsü

### Sm-reaper'ın gerçek durumu — görev metninin varsayımı düzeltildi

Görev metni "sm-reaper zaten `content_items`'ın `publishing` kilidini
süpürüyor" diyordu. **Bu doğru değildi** — kontrol edildi: `sm-reaper` cron
girdisi `00_schema.sql`'de kurulu (pasif) ve `/api/cron/reaper`'ı
hedefliyordu, ama o rota **hiç yoktu** (`CRON_AKTIVASYON.md`'nin kendi
tablosu da bunu doğruluyordu: "❌ yok (adım 17)"). Bu adım o rotanın **ilk
gövdesi** — yalnızca `jobs` tarafını dolduruyor; `content_items.publishing`
kilidi hâlâ adım 17'nin işi (`PublisherPort.live` ile birlikte geliyor).
`/api/cron/reaper` böylece **aynı rota adı altında** iki süpürme
sorumluluğu taşıyacak — adım 17 buraya ikinci bir çağrı ekleyecek, ayrı bir
rota AÇMAYACAK (dosyanın kendi yorumu bunu işaretliyor).

### Eşik: sabit, iş tipine göre DEĞİL

`STUCK_THRESHOLD_MS = 10 dakika` (`lib/server/jobs/reaper.ts`). Gerekçe:

- `expectedDurationMs` (`lib/core/jobs/types.ts`) kalibre edilmemiş bir
  tahmin — süpürücünün eşiğini ona bağlamak ikinci, daha kırılgan bir
  kullanım eklerdi.
- Normal akışta bir iş `running`'de en fazla `TIME_BUDGET_MS +
  PER_JOB_TIMEOUT_MS` (~65sn) kalabilir (`worker.ts`); süpürücü yalnızca
  **sürecin tamamen çöktüğü** (Vercel fonksiyon sonlandırması, OOM) —
  yani `processJob`'un try/catch'inin hiç çalışamadığı — durum için var.
- 10 dakika, `worker.ts`'in zaten kalibre kabul ettiği `MAX_BACKOFF_MS` ile
  aynı sayı — yeni bir sabit icat etmek yerine var olan bir kararı tekrar
  kullanıyor. `sm-reaper`'ın kendi periyodu da 10 dakika, yani bir tur
  önceki taramadan beri gerçekten terk edilmiş satırları doğal olarak
  yakalıyor.

### Hedef durum: iş tipine göre DEĞİŞİYOR

`JOB_RETRY_POLICY[kind].reaperOnStuck: "requeue" | "dead"` — yeni alan,
her 9 iş tipi için dolduruldu (`lib/core/jobs/types.test.ts`'te kilitlendi):

| Kind | `reaperOnStuck` | Gerekçe |
|---|---|---|
| `ugc_pipeline` | **`dead`** | Dispatch deseni (§4d): çökme anı vendor çağrısından ÖNCE de SONRA da olabilir. Kör bir requeue, vendor'ı ikinci kez tetikleyip krediyi ikiletebilir — kuyruk katmanı bu belirsizliği kendi başına ayıramaz, insan/adım-20 kararına bırakılır. |
| diğer 8 tip | `requeue` | Çökme anı bilinmiyor demek işin hiç BAŞLAMADIĞI da olabilir demek — yeniden denemek güvenli sayılır. `publish` özelinde bu, `dedupe_key` + `content_items.status` koşullu geçişinin (§4a) ARKASINDA kalan üçüncü bir katman. |

Tükenmiş deneme (`attempts >= max_attempts`) bu alandan **bağımsız** her
zaman `dead`'e gider — normal worker akışıyla aynı kural.

### `jobs.state='failed'` (ADIM_12 varsayım 1)

CHECK'ten **çıkarılmadı**, SQL yorumuyla işaretlendi (`00_schema.sql` +
`lib/core/jobs/types.ts`): şemada duruyor ama worker onu hiç üretmiyor —
geçici hata `queued`'e, kalıcı/tükenmiş hata `dead`'e gider. Bilinçli
bırakıldı: ileride bir handler "bu deneme başarısız ama henüz karar
verilmedi" gibi ayrı bir ara anlam için kullanmak isterse geri dönüşü olan
bir kapı kapanmasın diye.

### Doğrulama — canlı Supabase

4 senaryo yapay olarak `running`'de bırakıldı (`locked_at = now() - 20dk`),
`/api/cron/reaper` elle tetiklendi:

```
faz-a-not-stuck-yet   (2dk önce kilitli)      → running   (dokunulmadı)
faz-a-stuck-requeue   (noop_test, tükenmemiş) → queued
faz-a-stuck-dead-ugc  (ugc_pipeline)          → dead
faz-a-stuck-exhausted (attempts=max_attempts) → dead
```

`{"thresholdMs":600000,"scanned":3,"requeued":1,"dead":2}` — 401 (sırsız) /
200 (doğru sır) worker rotasıyla aynı davranışta (`lib/server/cron-auth.ts`
iki rotaya da çıkarıldı, DRY).

---

## FAZ B — anahtar saklama

### Vault kurulumunun mevcut hâli ve eklenenler

`supabase_vault` (0.3.1) ve `provider_credentials` tablosu adım 012/2'den
beri kurulu; `vault_secret_id` sütunu vardı ama **yazma/okuma yolu yoktu**.
Bu adımda eklenenler:

- **`masked_hint text`** — yazma anında hesaplanan, gizli OLMAYAN önizleme
  (`"faz…6608"` biçiminde: ilk 3 + `…` + son 4 karakter). Okumak asla
  decrypt gerektirmez.
- **Dört `SECURITY DEFINER` fonksiyonu** (Vault'un kendi fonksiyonları
  PostgREST'in dışa açtığı şemada değil — bu sarmalayıcılar hem köprüyü
  kurar hem RAW değerin çıkabileceği yüzeyi tek noktaya indirir):

| Fonksiyon | Kim çağırır | Ne döner |
|---|---|---|
| `set_provider_credential` | `authenticated` (owns_brand ile), `enqueue_job`'un deseni | maskeli satır |
| `delete_provider_credential` | `authenticated` (owns_brand ile) | boolean |
| `list_provider_credentials` | `authenticated` (owns_brand ile) | maskeli alanlar — `vault_secret_id` YOK |
| `get_provider_secret` | **yalnızca service-role** (`authenticated`'dan REVOKE) | RAW anahtar — tek çıkış noktası |

### Anahtarın düz metin durmadığının SQL kanıtı

`supabase/tests/provider_credentials.sh` — canlı Supabase'e karşı, gerçek
GoTrue oturumlarıyla (yalnızca simüle edilen `request.jwt.claim.sub` değil,
gerçek HTTP + PostgREST). Beş iddia, 5/5 PASS:

```
1. Anahtar kaydedildi → provider_credentials satırı TAM METNE çevrilip
   grep edildi: raw değer YOK. vault.decrypted_secrets'tan decrypt
   edilince raw değerle eşleşti (round-trip kanıtlandı).
2. A kendi oturumuyla (anon key) doğrudan `select provider_credentials`
   → 0 satır.
3. Service-role ile AYNI sorgu → satır GERÇEKTEN var (ADIM_27'nin deseni).
4. B, A'nın markasına yazmaya çalıştı → HTTP 403 (owns_brand reddi).
5. Silme → hem provider_credentials hem vault.secrets gitti, yetim kayıt yok.
```

`list_provider_credentials` yanıtında `vault_secret_id` alanı YOK —
ayrıca doğrulandı.

⚠ **Yan not — secret-scan pre-commit hook'u iki kez yanlış pozitif
verdi**: test scriptindeki sahte anahtar (`sk-test-...` deseni) hem
`sk-[A-Za-z0-9_-]{16,}` hem "secret...=...değer" heuristic'ine takıldı.
Gerçek bir sızıntı DEĞİLDİ (ADIM_9'un `randomUUID()` şifre dersiyle aynı
sınıf) — düzeltme: değişken adı `FAKE_SECRET`→`FAKE_VALUE`, `sk-` öneki
kaldırıldı, JSON gövdeleri `jq --arg` ile kuruldu (statik kaynak satırında
artık `"p_secret":"<literal>"` biçimi yok). Hook zayıflatılmadı.

### Okuma yolu ve env fallback

`lib/server/credentials.ts` → `resolveProviderCredential(brandId,
provider)`. **Env fallback yalnızca `instagram`** (D2 kararı):

- Diğer altı sağlayıcıda (`anthropic`, `kie`, `elevenlabs`, `fal`,
  `openai`, `voyage`) satır yoksa `apiKey: null` döner, env'e **düşülmez**
  — "müşteri kendi anahtarını girer" sözleşmesini korumak için; bir AI
  sağlayıcı için sessizce bizim env'imize düşmek o sözleşmeyi kırardı.
- `instagram`'da satır yoksa `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`/
  `INSTAGRAM_REDIRECT_URI`/`INSTAGRAM_API_VERSION` env'ine düşülür (MVP
  kararı: tek Meta uygulaması, müşteriler tester — §1.12/S4).
- Fallback'e düşüldüğünde `console.info("[credentials] instagram: marka
  satırı yok, env fallback kullanıldı (brand=<id>)")` — anahtarın kendisi
  asla loglanmaz, yalnızca HANGİ markanın/sağlayıcının fallback'e düştüğü.

Bu fonksiyonun bugün hiçbir çağıranı yok (bilinçli — adım 14'ün ilk
işlerinden biri `plan_generate`/`caption_write` handler'larını buna
bağlamak olacak).

---

## FAZ C — `/settings` entegrasyonlar

Sağlayıcı listesi `app.config.ts`'in yeni `managedViaVault` bayrağından
türetiliyor (TEK kaynak — FAZ B'nin yazma action'ı da aynı filtreyi
kullanıyor). D3 gereği beş sağlayıcı görünür: **Anthropic, Kie,
ElevenLabs, fal, Voyage**. `instagram` (OAuth akışı, adım 16) ve
`supabase` (altyapı, müşteri anahtarı değil) bu formda yok.

Her satır: durum rozeti (Girilmiş/Girilmemiş) · ne için gerekli olduğu
(`Integration.purpose`, artık bilingual) · girilmemişse hangi özelliğin
çalışmayacağı (`Integration.whenMissing`) · maskeli değer · gir/güncelle/
sil. **Doğrulama yapılmıyor** (dış çağrı gerektirir, bu adımda yasak).

Doğrulama: `e2e/settings-integrations.spec.ts` — kaydet → sayfa yenile →
"Girilmiş" rozeti + maskeli değer görünüyor (DOM'da raw anahtar YOK,
`page.content()` ile doğrulandı) → sil → "Girilmemiş"e döner. Bağımsız SQL
kontrolü: test sonunda `provider_credentials`'ta `provider='voyage'` satır
sayısı **0**. 7/7 e2e testi yeşil (yeni test + 6 mevcut, regresyon yok).

---

## FAZ D — rate limit

### Nerede uygulandı ve neden

`enqueue_job()` SQL fonksiyonunun İÇİNDE (kuyruğa eklemeden hemen önce,
dedupe kısa devresinden SONRA — aynı işin iki kez tıklanması sayacı ikinci
kez artırmaz). Bu adımda gerçek AI çağrısı yok; sınır burada olduğu için
adım 14+'in handler'ları `enqueue()`'e bağlandığı an otomatik korunmuş
olacak — görev talimatının aradığı tam olarak bu.

### Hangi işlemler sayılıyor

Yalnızca AI çağrısı **tetikleyen** üç iş tipi: `plan_generate`,
`caption_write`, `ugc_pipeline`. Diğer altısı (`publish`,
`metrics_collect`, `media_poll`, `token_refresh`, `embed_backfill`,
`noop_test`) müşterinin AI faturasını büyütmüyor, sayılmıyor — canlı
testte ayrıca doğrulandı (üç `noop_test` çağrısı sınırsız geçti).

### Limit aşılınca ne olur

Kuyruğa ekleme **reddedilir** — satır hiç yazılmaz (sessizce alıp sonra
patlatma YOK). Özel SQLSTATE `'RLIM1'` + iş tipi/limit/pencere içeren
mesaj (`"enqueue_job: hiz siniri asildi (caption_write icin 2/20sn)"`).
`lib/server/jobs/enqueue.ts`'in `mapPostgresError()`'ı bunu mevcut
`"rate_limited"` `ApiErrorCode`'una çeviriyor — `HTTP_STATUS_BY_CODE` zaten
429'a eşliyor, yeni bir mekanizma icat edilmedi.

### Yapılandırılabilirlik — müşteri bazında farklı olabilir

Yeni `rate_limit_policies` tablosu (`brand_id, kind, limit_count,
window_seconds`, RLS açık + sıfır politika — dördüncü aynı desen). Satır
yoksa aşağıdaki başlangıç değerlerine düşülür.

### ⚠ Başlangıç değerleri — KALİBRE EDİLMEDİ

BIRLESIM_PLANI §8.7'den birebir alındı, hiç ölçülmedi:

| Kind | Limit | Pencere |
|---|---|---|
| `plan_generate` | 10 | saat |
| `caption_write` | 100 | saat |
| `ugc_pipeline` | 20 | gün |

İlk ~200 içerikten sonra (diğer kalibre edilmemiş eşiklerle — §4c
tekrar eşikleri, D1 tier ağırlıkları, 180 günlük retention — birlikte)
gözden geçirilmeli.

### Doğrulama — canlı Supabase

`supabase/tests/rate_limit.sh` — 2/20sn özel limit override edildi, 3/3
iddia + yan kontrol PASS:

```
1. çağrı: OK  ·  2. çağrı: OK  ·  3. çağrı: RLIM1
   "enqueue_job: hiz siniri asildi (caption_write icin 2/20sn)"
DB'de yalnızca 2 satır kuyruğa girdi (reddedilen satır hiç yazılmadı)
20sn+2 bekleme → 4. çağrı tekrar geçti (pencere sıfırlandı)
3× noop_test → sınırsız geçti (yalnızca 3 AI-tetikleyen tip sayılıyor)
```

⚠ **İlk denemede test YANLIŞ SONUÇ verdi** (3. çağrı da geçti) —
kök sebep ölçüldü: Supabase pooler'ı Seul bölgesinde, her YENİ psql
bağlantısı ~2sn sürüyor; 3 ardışık çağrı AYRI bağlantılarda çalıştırılınca
toplam süre kısa pencereyi (ilk denemede 3sn) aşıp ikinci pencereye
taşabiliyordu. Bu, **testin kendi hatasıydı**, `enqueue_job()`'un değil —
üç çağrı TEK psql bağlantısında (üç ayrı transaction, tek bağlantı
gecikmesi) çalıştırılınca tutarlı, doğru sonuç alındı. Test scripti bu
dersi kod içi yorumla işaretliyor.

---

## Sır sızıntısı taraması — tam çıktı

Dört yüzey tarandı: repo kaynağı, geliştirme sunucusu log'u, API
yanıtları (FAZ B/C doğrulamalarının kendisi), üretim bundle'ı
(`npm run build` çıktısı, `.next/`).

```
$ git grep -nE "sk-[A-Za-z0-9_-]{16,}|AIza...|AKIA...|-----BEGIN...PRIVATE KEY-----"
(sıfır eşleşme)

$ git ls-files | grep -E "^\.env"
.env.example   ← yalnızca bu, tüm değerler BOŞ (kontrol edildi)

$ grep -rl "SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|...|CRON_SECRET" .next/static
26f_9jb_nb4wy.js, 44l89t2bane_t.js, 3hfmw0js_ziy1.js
  → İNCELENDİ: bunlar app.config.ts'in Integration.envVars listesindeki
    DEĞİŞKEN ADLARI ("ANTHROPIC_API_KEY" stringi), DEĞER değil —
    dokümantasyon amaçlı, bilinçli (docstring: "Documentation only").
    Gerçek anahtar hiçbir zaman env'den okunmuyor zaten (§8.6).

$ grep -rlE "sk-[A-Za-z0-9_-]{16,}" .next/static
1p-em3jtknkl7.js
  → İNCELENDİ: Tailwind'in "mask-linear/mask-t-from" gibi kendi utility
    sınıf adlarının içinde geçen "sk-" alt dizisi (mA-SK-...), API
    anahtarıyla ilgisi yok.

$ grep -rlE "eyJ...\.eyJ...\." .next/static
43zlo37115xr7.js
  → İNCELENDİ: decode edildi, payload {"role":"anon", "ref":"osxpc..."} —
    Supabase'in KENDİ tasarımı gereği tarayıcıya gönderilmesi GEREKEN
    anon key (RLS ile korunuyor, gizlilik anahtarın kendisinde değil).

$ grep -rl "InJvbGUiOiJzZXJ2aWNlX3JvbGUi" .next/   # base64("role":"service_role")
(sıfır eşleşme — service-role JWT'si build'in HİÇBİR YERİNDE yok)

$ [gerçek service-role anahtarının son 20 karakteri — imza kısmı, JWT
   header/iss'iyle PAYLAŞILMAYAN tek biçimde ayırt edici parça] .next/ + /tmp/nextdev.log
(sıfır eşleşme)

$ grep -rl "faz-b-test-cred|voyage-e2e-fake-key|FAKESECRET" .next/
(sıfır eşleşme — test sahte anahtarlarından da build'de iz yok)

$ git diff f277eba~1..HEAD | grep -iE "key|secret|token|password" \
    | [tanımlanan alan adları/i18n metni/docs URL'leri elendi]
(kalan: yalnızca değişken/alan adları, i18n string'leri, docsUrl'ler —
 hiçbir gerçek DEĞER yok)
```

**Sonuç: dört yüzeyde de sızıntı bulunmadı.** İki ölçüm kendi içinde
düzeltilerek tekrarlandı (ilk denemede kullanılan JWT fragment'ı ortak
header/iss önekine denk geldiği için yanlış pozitif verdi — imza kısmına
geçilince temiz sonuç alındı; bu, ölçümün kendisinin de doğrulandığı
anlamına geliyor, körü körüne "temiz" denmedi).

---

## Varsayımlar + adım 14'e (LIVE #1, Anthropic) geçmeden bilmen gerekenler

1. **`resolveProviderCredential()` bugün hiçbir yerden çağrılmıyor.** Adım
   14'ün ilk işi `plan_generate`/`caption_write` handler'larını
   (`lib/server/jobs/handlers.ts`, hâlâ `NOT_IMPLEMENTED`) buna bağlamak
   olacak — anahtar çözülüp `lib/core/providers/*`'a (zaten §8.6 uyumlu,
   parametre alıyor) parametre olarak geçirilecek.

2. **Rate limit UI'da hiç görünmüyor.** `"rate_limited"` `ApiErrorCode`'u
   ve `HTTP_STATUS_BY_CODE`'daki 429 eşlemesi var, ama `lib/ai/client.ts`
   (threadly'den taşınacak ERROR_COPY katmanı) henüz yok — bugün hiçbir
   ekran bu hatayı GÖSTEREMEZ, yalnızca `enqueue()`'ün döndürdüğü
   `ApiResult` içinde taşınır. Adım 14 gerçek bir kullanıcı akışı (`/plan`
   → "planı üret" düğmesi) yazarken bu kopya katmanını da kurmalı.

3. **Rate limit + Vault kalibrasyonu birlikte değerlendirilmeli.**
   Şimdiye kadar kalibre edilmemiş listeye üçü daha eklendi (limit/pencere
   değerleri) — ADIM_012'nin listesiyle (tekrar eşikleri, tier ağırlıkları,
   180 günlük retention) birleştirilip **ilk ~200 içerikten sonra** tek
   seferde gözden geçirilmeli.

4. **`get_provider_secret()`'in `is_active` filtresi var ama UI'da
   devre dışı bırakma yolu YOK.** Şema `provider_credentials.is_active`
   sütununu taşıyor (`default true`), `set_provider_credential` ona hiç
   dokunmuyor, `/settings`'te bir "devre dışı bırak" anahtarı yok — bugün
   yalnızca var/yok (gir/sil) ikili durumu var. Gerekirse (örn. geçici
   olarak bir sağlayıcıyı durdurmak) ileride eklenebilir, adım 13'ün
   kapsamı değildi.

5. **`last_verified_at`/`last_error` sütunları hâlâ hiç yazılmıyor.**
   Şemada var (adım 012'den), `/settings` UI'ı onları OKUYOR (varsa
   gösterecek altyapı hazır) ama hiçbir kod onlara YAZMIYOR — "adım 13'te
   doğrulama YOK" kuralının doğal sonucu. Adım 14+'in ilk gerçek
   sağlayıcı çağrısı başarılı/başarısız olduğunda bu iki sütunu
   güncellemesi mantıklı olur (o zaman rozet "Girilmiş" ötesine geçip
   "Doğrulanmış"/"Hata verdi" ayrımı yapabilir) — bu adımın kapsamında
   DEĞİL, bir sonraki adımın doğal uzantısı.

6. **`/api/cron/reaper` şu an yalnızca `jobs` süpürüyor.** Adım 17
   (`PublisherPort.live` + `sm-publish` + `publishing` kilidi) bu dosyaya
   `content_items.status='publishing'` süpürmesini İKİNCİ bir çağrı olarak
   ekleyecek — ayrı bir rota AÇMAYACAK (dosyanın kendi yorumu bunu
   işaretliyor, cron girdisi zaten tek `sm-reaper` adı altında).

7. **`STUCK_THRESHOLD_MS` ve rate limit pencereleri gibi süpürücünün
   eşiği de kalibre edilmedi** — muhafazakâr, var olan bir kararla
   (`MAX_BACKOFF_MS`) hizalanmış bir seçim. Gerçek trafik olmadan
   ölçülemez.

8. **`app.config.ts`'in `Integration.purpose` alanı `string`'ten
   `L` (bilingual)'e çevrildi.** Hiçbir çağıran bunu henüz okumuyordu
   (adım 13'ten önce), bu yüzden geriye dönük kırılma yok — ama ileride
   `purpose`/`whenMissing` metnine dokunacak biri artık `{tr, en}`
   biçimini beklemeli.

---

## Beş kapı + e2e

```
1. npx tsc --noEmit          exit 0
2. npx eslint .               exit 0
3. npx vitest run             424/424 PASS (18 dosya)
4. npm run build               ✓ derlendi, /api/cron/reaper + /api/cron/worker rotada
5. npx playwright test         7/7 PASS (jobs-queue-status, journey, plan,
                                          settings-integrations [yeni], settings×2, smoke)
```

## DEĞİŞTİRİLMEYENLER

- `sahne/`, `siraya/`, `threadly/` — dokunulmadı.
- Hiçbir dış servis (Anthropic/Kie/fal/ElevenLabs/Instagram) çağrılmadı.
- Cron job'lar aktive EDİLMEDİ (5/5 `active=false`, korundu — `sm-reaper`
  hedefi artık var ama pasif kalmaya devam ediyor, adım 17'ye kadar).
- Sekiz gerçek iş tipinin işleyicisi hâlâ yazılmadı (`NOT_IMPLEMENTED`).
- `resolveProviderCredential()`'ın hiçbir çağıranı yok.
