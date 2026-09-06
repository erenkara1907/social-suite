# ADIM 17a RAPORU — yayın hattı (onay gerektirmeyen platformla)

Yetkili kaynak: `docs/BIRLESIM_PLANI.md` §12, REVİZYON KAYDI D10.

---

## FAZ 0 — Platform seçimi ve şema

### 0.1 Platform kararı: Bluesky (AT Protocol)

**Karşılaştırma (Mastodon'a karşı):**

| Kriter | Bluesky (AT Protocol) | Mastodon |
|---|---|---|
| Host | Tek global servis (`bsky.social`) | Federe — kurallar sunucudan sunucuya değişir |
| Rate limit | Sabit ve resmi belgeli: 5000 puan/saat, 35000 puan/gün (`createRecord` = 3 puan) | Sunucu yöneticisine bağlı, standart yok |
| Medya limiti | Resmi lexicon'da sabit: görsel başına 2 MB, gönderi başına en fazla 4 görsel | Sunucudan sunucuya değişir |
| Metin limiti | 300 grapheme / 3000 bayt (sabit, protokol seviyesinde) | Sunucudan sunucuya değişir (varsayılan 500 karakter) |
| Kimlik doğrulama | Uygulama şifresi → `accessJwt` (kısa ömürlü) + `refreshJwt` (daha uzun) | Sunucu bazlı OAuth veya erişim token'ı |
| Onay/inceleme | Yok | Yok |
| Resmi SDK | `@atproto/api` (npm, en güncel `0.20.42`) | Sunucuya göre değişen üçüncü parti kütüphaneler |

**Karar gerekçesi:** Bluesky seçildi çünkü (a) tek host olması test/entegrasyonu
basitleştiriyor, (b) rate limit ve medya limitleri resmi lexicon'larda sabit
ve belgeli — Mastodon'da bunlar sunucuya göre değişeceğinden "gerçek" bir
sınır sayılamaz, (c) `accessJwt`/`refreshJwt` ikilisi, adım 16/17b'de
Instagram'ın 60 günlük token yenileme ihtiyacına mimari olarak benzer bir
"kuru deneme" sağlıyor — port/adaptör ayrımının token-yenileme kolunu
Meta'yı beklemeden şimdi sınamamıza izin veriyor.

**Doğrulanan API ayrıntıları (kaynak: resmi AT Protocol lexicon'ları ve
docs.bsky.app):**

- Oturum açma: `com.atproto.server.createSession` — `identifier` (handle
  veya DID) + `password` (uygulama şifresi) → `{ accessJwt, refreshJwt, did, handle }`.
- Oturum yenileme: `com.atproto.server.refreshSession` — `refreshJwt`'i
  `Authorization: Bearer` olarak gönderir, yeni bir `accessJwt`/`refreshJwt`
  çifti döner.
- Medya yükleme: `com.atproto.repo.uploadBlob` — ham bayt + `Content-Type`,
  `image/*` için 2 MB sınırı (`app.bsky.embed.images` lexicon'u).
- Gönderi oluşturma: `com.atproto.repo.createRecord` — `collection:
  "app.bsky.feed.post"`, `repo: <did>`, `record: { text, createdAt, embed? }`.
- Rate limit: 5000 puan/saat, 35000 puan/gün; `createRecord` 3 puan
  (docs.bsky.app/docs/advanced-guides/rate-limits).
- Resmi SDK: `@atproto/api` — `CredentialSession` (token/oturum yönetimi) +
  `Agent` (API çağrıları) sınıfları; en güncel sürüm `0.20.42`.

**⚠ DOĞRULANMALI (17a FAZ A'da netleştirilecek):**

- `refreshJwt`'in tam ömrü resmi dokümanlarda AÇIKÇA yazılı değil
  (`accessJwt`'in dakikalar mertebesinde olduğu belgeli, `refreshJwt`
  "daha uzun" deniyor ama sayısal bir değer verilmiyor). FAZ A'da gerçek
  bir oturumla ölçülüp bu rapora eklenecek.
- Senkron mu asenkron mu: `createRecord` tek çağrıda tamamlanıyor (Instagram'ın
  container→polling→publish akışının aksine senkron). `PublisherPort`
  bu farkı FAZ B'de her iki modeli de destekleyecek şekilde tasarlanacak.

### 0.2 Şema

`channels.platform` ve `content_items.platform` CHECK listelerine `bluesky`
altıncı değer olarak eklendi. İdempotent migration deseni (`00_schema.sql`'in
kendi §1.2 emsali — `jobs_kind_check`/`provider_credentials_provider_check`)
izlendi: inline CHECK (sıfırdan kurulum için) + ayrı
`drop constraint if exists` / `add constraint` bloğu (var olan kurulumlar
için).

**Doğrulama:** `bash supabase/apply.sh` art arda iki kez çalıştırıldı,
ikisi de `EXIT=0`. `pg_constraint` sorgusuyla her iki tabloda da tek bir
`*_platform_check` kısıtı olduğu ve `bluesky` içerdiği doğrulandı (yinelenen
kısıt yok — idempotency kanıtlı).

`lib/core/types.ts`'teki `PLATFORMS` union'ı ve `PLATFORM_META` kaydı
güncellendi; `lib/core/publishing.ts`'teki `PUBLISHABLE_PLATFORMS`
`["instagram"]` → `["bluesky"]` oldu. Tüm ilgili testler (`lib/core/
types.test.ts`, `lib/core/publishing.test.ts`, `lib/adapters/demo/
fixtures/schema-conformance.test.ts`, `lib/adapters/demo/index.test.ts`)
ve demo fixture'ları (`channels.ts`, `content.ts`) senkronize edildi.

`components/app/channels-view.tsx`'te Instagram'ın "OAuth yakında" ipucu,
`PUBLISHABLE_PLATFORMS` listesinden KOPARILDI (platform kimliğine göre
sabitlendi) — aksi halde Bluesky listeye girince Instagram'ın ipucu
kaybolur, Bluesky de yanlışlıkla Instagram'a özgü metni gösterirdi.

### 0.3 Kimlik bilgileri

`channel_credentials` tablosu değişmedi — zaten yeterli: RLS açık, sıfır
politika (yalnızca service-role erişimi, ADIM_012 deseni), `provider`
kolonunda CHECK kısıtı yok (bu yüzden `'bluesky'` şema değişikliği
gerektirmeden geçerli). Token'ın hiçbir yanıt/log/hata mesajında
görünmemesi FAZ A'da uygulanacak.

**Doğrulama kanıtı:**

```
$ npx tsc --noEmit
(çıktı yok — temiz)

$ npx eslint .
(1 önceden var olan ilgisiz uyarı dışında temiz)

$ npx vitest run
Test Files  28 passed | 9 skipped (37)
     Tests  538 passed | 31 skipped (569)

$ npm run build
✓ derleme başarılı, beklenen tüm rotalar üretildi

$ bash supabase/apply.sh   (1. çalıştırma)
EXIT=0
$ bash supabase/apply.sh   (2. çalıştırma — idempotency kanıtı)
EXIT=0
```

`psql` ile doğrudan sorgu: `channels_platform_check` ve
`content_items_platform_check` kısıtlarının ikisi de `bluesky` içeriyor,
her tabloda tek kısıt var (yineleme yok).

**Commit:** `platform seçimi + şema (17a-0)`.

---

## FAZ A — Kanal bağlama

`ChannelPort`'a OAuth'suz platformlar için ikinci bir bağlanma modu
eklendi: `connectWithCredentials(platform, {identifier, appPassword})` —
`startConnect`/`ConnectHandoff` (yönlendirmeli) yanında, doğrudan kimlik
bilgisiyle. `CREDENTIAL_CONNECT_PLATFORMS` (`lib/core/publishing.ts`)
bugün yalnızca `bluesky` içeriyor.

**Yapılanlar:**

- `lib/core/providers/bluesky.ts` — `connectBluesky` (createSession),
  `verifyBlueskySession` (getSession, en ucuz uç nokta — adım 20.5 deseni),
  `revokeBlueskySession` (deleteSession, disconnect'te sunucu tarafı iptal).
  `@atproto/api@0.20.42` (resmi SDK, npm'den doğrulandı) kullanıyor.
- `lib/adapters/live/channel.ts` — `connectWithCredentials`: giriş →
  doğrulama → `channels` upsert → `channel_credentials` yazımı (yalnızca
  service-role, `lib/supabase/admin.ts`'in "üç yer" kuralına ikinci bir
  meşru çağıran olarak eklendi). `disconnect`: sahiplik kontrolü → sunucu
  tarafı iptal (en iyi çaba) → `channel_credentials` SİLİNİR → `channels.
  is_connected=false`.
- `lib/adapters/demo/channel.ts` — `connectWithCredentials` sıfır ağ
  isteğiyle "bağlandı" döner (demo'nun "sıfır dış istek" kuralı).
- `components/app/channels-view.tsx` — Bluesky kartı artık gerçek bir form
  (identifier + uygulama şifresi), `AI_ERROR_COPY` ile TR/EN hata metni;
  bağlıyken gerçek bir "Bağlantıyı kes" düğmesi.
- `app/(app)/channels/actions.ts` — `connectChannelAction`/
  `disconnectChannelAction` server action'ları; token bu katmandan
  ASLA istemciye dönmez.

**Doğrulama:**

- `npx tsc --noEmit`, `npx eslint .` (1 önceden var olan ilgisiz uyarı),
  `npx vitest run` (538 geçti/0 kırık, +4 gated bluesky testi skip), `npm
  run build` — hepsi temiz.
- `npx playwright test --project=chromium` — mevcut 13 e2e testinin HEPSİ
  hâlâ geçiyor (özellikle `smoke.spec.ts`: `/channels` yeni formla birlikte
  hâlâ hiçbir yabancı köke ağ isteği atmıyor, ScreenStub göstermiyor).

## FAZ A2 — Canlı kanıt (tamamlandı)

Gerçek bir Bluesky test hesabıyla iki gated test çalıştırıldı. Kimlik
bilgileri yalnızca `.env.local`'da (kullanıcı tarafından girildi, bu
oturumda hiçbir zaman okunup ekrana/log'a yazılmadı, commit edilmedi).

**1. `lib/core/providers/bluesky.live.test.ts` — 5/5 geçti:**

```
✓ GERÇEK kimlik bilgisiyle oturum açar (ok:true, did/handle/accessJwt dolu)
✓ GEÇERSİZ uygulama şifresiyle net bir hatayla ok:false döner
    → gerçek sunucu yanıtı: "Invalid identifier or password"
✓ verifyBlueskySession — saklanmış (taze) bir oturumu en ucuz uç noktayla doğrular
✓ revokeBlueskySession — oturumu sunucu tarafında iptal eder
    → revoke sonrası refreshSession gerçek sunucu yanıtı: "Token has been revoked"
✓ A2.1 — accessJwt/refreshJwt ömrü (exp - iat, saniye)
```

**⚠ CANLI BULGU — `deleteSession` accessJwt'i ANINDA öldürmüyor.** AT
Protocol JWT'leri durum sorgusu olmadan kriptografik doğrulanıyor (kara
liste yok) — `deleteSession` yalnızca `refreshJwt`'i öldürüyor, o anda
geçerli olan `accessJwt` kendi doğal ömrü dolana kadar çalışmaya devam
ediyor. Bu yüzden disconnect'in gerçek garantisi iki katmanlı: (a)
`channel_credentials` satırının silinmesi — uygulamamız token'ı bir daha
asla kullanmaz, (b) sunucu tarafı `refreshJwt` iptali — token bir şekilde
sızsa bile 2 saat sonra yenilenemez. `revokeBlueskySession` bu ikinciyi
sağlıyor, `disconnect()`'in DB silmesi birinciyi.

**2. `e2e/channels-connect.spec.ts` — 1/1 geçti** (ve tam Playwright takımı
14/14, regresyon yok):

```
✓ gerçek hesap bağlanır → token RLS arkasında → disconnect token'ı siler (17.5s)
```

Kanıtlanan dört madde, testin kendi SQL sorgularıyla:
- Gerçek hesap gerçekten bağlandı — `/channels` formu, gerçek tıklama,
  "Bağlı" rozeti gerçekten değişti.
- `channel_credentials`'ta `access_token`/`refresh_token` dolu (uzunluk
  > 0) — düz metin ama BEKLENEN düz metin: şifreleme değil, RLS + zero
  politika + yalnızca service-role erişimi bu tabloyu koruyor (§12 adım 5
  kararı, ADIM_012).
- **Kullanıcı oturumuyla (anon key + gerçek JWT) sorgu → 0 satır**;
  service-role → 1 satır. RLS'in gerçekten devrede olduğunun kanıtı.
- Disconnect → `channel_credentials` satırı SİLİNDİ (`maybeSingle()` →
  `null`), `channels.is_connected` → `false`.

DB test sonrası temiz (kalıntı yok — `channels`/`channel_credentials`
count'ları sıfıra döndü, doğrulandı).

⚠ Bu FAZ'ı tamamlarken bir gerçek build hatası bulundu ve düzeltildi:
`app/(app)/channels/actions.ts`, "use server" dosyası olduğu hâlde ilk
yazımda iki sabit (`CONNECT_CHANNEL_INITIAL_STATE`/
`DISCONNECT_CHANNEL_INITIAL_STATE`) export ediyordu — Next.js bunu "A
'use server' file can only export async functions, found object" ile
reddetti. Sabitler `components/app/channels-view.tsx`'e taşındı
(`library-view.tsx`'in `DELETE_INITIAL_STATE` deseni) — bu dosyanın
kendi baştaki yorumu bu kuralı zaten anlatıyordu, ilk yazım onu ihlal
etmişti.

### A2.1 — `refreshJwt`/`accessJwt` ömrü (FAZ 0'ın açık maddesi ÇÖZÜLDÜ)

JWT'lerin `exp`/`iat` alanları (imza doğrulanmadan, yalnızca süre
hesaplamak için) çözülerek ölçüldü:

| Token | Ömür |
|---|---|
| `accessJwt` | **7200 saniye = 2 saat** |
| `refreshJwt` | **7.776.000 saniye = 90 gün** |

**FAZ B'ye etkisi:** `@atproto/api`'nin `fetchHandler`'ı `accessJwt`'i
401/`ExpiredToken` aldığında OTOMATİK yeniliyor (`refreshJwt`'i kullanarak,
doğrulandı: `node_modules/@atproto/api/dist/atp-agent.js`) — yani FAZ B'nin
`publish` handler'ının 2 saatlik pencereyi elle takip etmesine GEREK YOK,
`Agent`/`CredentialSession` bunu kendisi hallediyor. Manuel
`refreshBlueskySession()` yalnızca `refreshJwt`'in KENDİSİ (90 gün) süresi
dolduğunda ya da oturum `deleteSession` ile iptal edildiğinde devreye
girer — bu durumda kanal "bağlantı koptu" sayılıp kullanıcının yeniden
bağlanması istenmeli (B3'ün kararı).

**16/17b'ye (Instagram) dry-run değeri:** Instagram'ın 60 günlük
`access_token` yenilemesi kavramsal olarak AYNI problem — "uzun ömürlü bir
token, süresi dolmadan yenilenmeli, yenileme başarısız olursa kanal
bağlantısı koptu sayılmalı". Bluesky'nin 90 günlük `refreshJwt`'i +
otomatik `accessJwt` yenilemesi, bu mantığın YARISINI (kısa-ömürlü
otomatik yenileme) zaten kanıtladı; kalan yarısı (uzun-ömürlü token'ın
KENDİSİNİN süresi dolmadan proaktif yenilenmesi — Instagram'da 60 gün,
Bluesky'de bu oturumda gözlemlenmedi çünkü hiç 90 gün beklenmedi) 17b'de
ayrıca ele alınacak.

**Commit:** `kanal bağlama canlı kanıtı (17a-a2)`.

## FAZ B — Yayın hattı

### B1 — Port/adaptör ayrımı

`PublisherPort.publish(contentItemId): Promise<ApiResult<PublishReceipt>>`
DEĞİŞMEDİ — imza Bluesky'nin senkron `putRecord`'unu da, Instagram'ın
(adım 16/17b) asenkron container→polling→publish akışını da taşıyabilir,
çünkü fark saf bir UYGULAMA detayı: bir adaptör kendi bekleme döngüsünü
gövdesi İÇİNDE çalıştırıp yalnızca sonuçlandığında döner. Bedel iş kuyruğu
tarafında ödenir — Instagram devreye girdiğinde `JOB_RETRY_POLICY.publish.
expectedDurationMs` (bugün 10sn) ve worker'ın `PER_JOB_TIMEOUT_MS`'i (bugün
20sn) yeniden kalibre edilmeli. Ayrıntı: `lib/adapters/ports.ts`
`PublisherPort` yorumu.

Gerçek yayın mantığı `lib/server/publish/publish-item.ts`'te — hem
`lib/server/jobs/handlers.ts`'in `handlePublish`'i (cron yolu) hem
`lib/adapters/live/publisher.ts`'in `publish()`'i (port yolu, bugün hiçbir
UI çağırmıyor ama arayüz gerçek olmalı) AYNI fonksiyonu çağırır.

**Metin sınırı:** `lib/core/publishing.ts` → `countGraphemes` (Unicode
grapheme cluster, `Intl.Segmenter`), `utf8ByteLength`, `checkTextLimit`.
Testler (`publishing.test.ts`) gerçek Türkçe karakterlerle ("çğıöşü") VE
Unicode aile emojisiyle (`👨‍👩‍👧‍👦`, tek grapheme ama 25 UTF-8 bayt) grapheme ile
bayt sayımının GERÇEKTEN farklı ölçüldüğünü kanıtlıyor — 22/22 geçti.

**Medya:** `guardedFetch` (adım 19'un SSRF korumalı indiricisi) ile
Supabase Storage'ın kalıcı URL'inden çekilir, `agent.uploadBlob()` ile
Bluesky'ye yüklenir. 2.000.000 baytı aşan görsel `PermanentJobError` ile
YAYINDAN ÖNCE durdurulur (yeniden deneme faydasız — kaynak dosya
küçültülmeli).

### B2 — ⚠ `publishing` kilidi (en kritik parça)

**Kilit:** Koşullu `UPDATE content_items SET status='publishing' ...
WHERE status='scheduled'` — `publish-item.ts` `publishContentItem()`.

**⭐ ÇİFTE YAYIN TESTİNİN GERÇEK ÇIKTISI** (`publish-item.live.test.ts`,
iki `publishContentItem()` çağrısı `Promise.all` ile GERÇEKTEN eşzamanlı):

```
[çifte yayın canlı] worker-a — {"externalPostId":"at://did:plc:h4uy2bqzvjobgsyhzslvloys/app.bsky.feed.post/4dkwvfhee2jyr", ...}
[çifte yayın canlı] worker-b — null
```

`worker-a` kilidi kazandı ve GERÇEKTEN yayınladı; `worker-b`'nin koşullu
UPDATE'i 0 satır etkiledi, `null` döndü, hiçbir ağ çağrısı yapmadan çıktı.
İçerik satırı sonunda `published` — tam olarak BİR gönderi.

**Reaper (`sm-reaper`) `content_items` desteği:** YOKTU (kontrol edildi —
`lib/server/jobs/reaper.ts` yalnızca `jobs.state='running'` süpürüyordu),
bu fazda eklendi: `sweepStuckPublishing()`, eşik 15 dakika (`00_schema.sql`
`sm-reaper` cron yorumunun zaten vaat ettiği sayı). `/api/cron/reaper`
şimdi ikisini de (`jobs` + `content_items`) tek yanıtta döndürüyor.

**⚠ KARAR — asılı kalan içerik `scheduled`'a döner, `failed`'e DEĞİL.**
Gerekçe, görev metninin uyardığı riski YAPISAL OLARAK ortadan kaldıran bir
araştırma bulgusuna dayanıyor:

1. Bluesky'nin `createRecord`'unun aynı `rkey`'le ikinci çağrısı HATA verir
   (resmi lexicon bunu açıkça yazmıyor, topluluk kaynağından doğrulandı:
   "Bitesize Proto: Upserting ATProto Records", marvins-guide.leaflet.pub).
2. `com.atproto.repo.putRecord` ise resmi olarak UPSERT'tir: rkey yoksa
   YARATIR, VARSA aynı içerikle DEĞİŞTİRİR.
3. Yayın çağrısı bu yüzden `createRecord` DEĞİL `putRecord` kullanıyor
   (`publishBlueskyPost`, `lib/core/providers/bluesky.ts`) — DETERMİNİSTİK
   bir `rkey` (`content_items.id`'den türetilen TID, aşağıda) ve
   deterministik bir `createdAt` (`content_items.scheduled_at`, `new
   Date()` DEĞİL) ile.
4. Sonuç: bir retry — ister reaper'ın açtığı, ister geçici bir hata sonrası
   worker'ın kendi denemesi — AYNI rkey'e AYNI içerikle yazar. İlk deneme
   vendor'a hiç ulaşmamışsa YENİ bir gönderi açar; ulaşmış ama DB
   yazımından ÖNCE çökmüşse GÖRÜNMEDEN üzerine yazar. İkisi de kullanıcı
   için "gönderi bir kez yayında" sonucunu verir — çifte gönderi YAPISAL
   OLARAK imkânsız.

Bu, `sweepStuckPublishing()`'in ASILI KALMA TESTİYLE canlı kanıtlandı
(20 dakika önce kilitlenmiş gibi elle işaretlenen bir satır → reaper →
`scheduled`, `locked_at` temizlendi):

```
[reaper canlı] özet — {"thresholdMs":900000,"scanned":1,"reverted":1}
```

**⚠ CANLI BULGU — TID zorunluluğu (araştırmanın kendisi eksikti, canlı test
yakaladı).** İlk denemede `rkey` olarak doğrudan `content_items.id` (bir
UUID) kullanıldı; AT Protocol'ün genel rkey sözdizimi (alfasayısal + `.-_:~`)
buna izin verir GİBİ göründü, ama gerçek API çağrısı şu hatayla reddetti:
`"Invalid record key for app.bsky.feed.post: Invalid TID string"`.
Araştırma (atproto.com/specs/tid) `app.bsky.feed.post` koleksiyonunun
rkey'i özel olarak TID biçimine (`/^[234567abcdefghij][234567a-z]{12}$/`,
13 ASCII karakter) zorunlu kıldığını doğruladı. Çözüm: `contentItemIdToRkey()`
(`lib/core/providers/bluesky.ts`) — `content_items.id`'yi SHA-256'layıp TID
alfabesine deterministik eşliyor (gerçek bir saat/clock-id TAŞIMIYOR,
yalnızca AYNI içerik HER ZAMAN AYNI rkey'i üretiyor — idempotency'nin rkey
tarafı budur). Bu, "API ayrıntılarını doğrula, uydurma" uyarısının tam
olarak neden var olduğunun kanıtı: ilk varsayım (genel sözdizimi yeter)
YANLIŞTI, yalnızca gerçek bir çağrı bunu ortaya çıkardı.

### B3 — `publish` handler'ı

`lib/server/publish/publish-item.ts` `publishContentItem()` — kilit
alındıktan SONRA, yayından ÖNCE ön kontroller (adım 20.5 deseni): platform
desteği, kanal bağlı mı, token geçerli mi (`verifyBlueskySession`, geçersizse
`refreshBlueskySession` — 90 günlük `refreshJwt` süresi dolmuşsa ya da
oturum iptal edilmişse kanal `is_connected=false`'a düşer, kullanıcı yeniden
bağlanmalı), metin sınırı, medya boyutu.

Başarı → `content_items.status='published'`, `published_at`,
`external_post_id` (Bluesky'nin `at://` URI'si — adım 18'in metrik
toplayıcısı buna ihtiyaç duyacak), `activity` kaydı (`action:"published"`,
`meta.permalink`). Başarısızlık → `sanitizeErrorMessage` ile temizlenmiş
hata `content_items.failure_error`'a (asla token/anahtar sızdırmadan);
kalıcı hata → `failed`, geçici hata → `scheduled` (B2'nin idempotency
gerekçesiyle güvenli).

### FAZ B DOĞRULAMA — hepsi `lib/server/publish/publish-item.live.test.ts`
ile GERÇEK Bluesky hesabına karşı kanıtlandı (4/4 geçti):

- **Gerçek bir gönderi gerçekten yayınlandı:**
  `https://bsky.app/profile/did:plc:h4uy2bqzvjobgsyhzslvloys/post/5kpyiwbujve2l`
  (ilk koşu) — bsky.app'te canlı, gerçek bir hesapta.
- **Çifte yayın testi:** yukarıda — iki eşzamanlı `publishContentItem()`
  çağrısından biri gerçek sonuç, diğeri `null` döndü; içerik tam bir kez
  yayınlandı.
- **Asılı kalma testi:** yukarıda — reaper stuck satırı `scheduled`'a
  döndürdü, kilit temizlendi.
- **Metin sınırı aşan içerik:** 400 grapheme'lik bir gövde `putRecord`'a
  HİÇ ULAŞMADAN `PermanentJobError` ile durduruldu, `content_items.status`
  `failed`'e döndü, `failure_error` metin sınırını adlandırıyor.

⚠ Bu testler gerçek gönderiler oluşturduğu için test hesabında birkaç canlı
gönderi kaldı (DB satırları `afterAll`'da temizlendi, Bluesky'deki
gönderilerin KENDİSİ silinmedi — bu kasıtlı, "gerçek yayın" kanıtının
kendisi bu). İstenirse test hesabından elle silinebilir.

**Commit:** `yayın hattı (17a-b)`.

## FAZ C — Cron aktivasyonu (İLK KEZ)

⚠ Cron adım 2'den beri 5/5 pasifti — bu, üretimde otomatik kodun İLK
gerçek çalışması.

### C1 — Aktivasyon öncesi kontroller

- **`APP_URL` üretim mi:** HAYIR — `NEXT_PUBLIC_APP_URL` hâlâ
  `http://localhost:3000`'du (`docs/CRON_AKTIVASYON.md`'nin bildiği durum).
  Düzeltildi: `https://app-gold-one-92.vercel.app` (mevcut Vercel production
  alias'ı — proje zaten bağlıydı, `prj_mUcuOOvfBhhXcIDwLGWv7VWixzne`).
- **Deploy:** bugünkü dört commit'i (17a-0/a/a2/b) içeren güncel kod
  `vercel --prod` ile deploy edildi (`dpl_5KmWtUdYetZVzBVbK4rS9Yd4ydB7`).
  `/api/cron/{worker,reaper,publish}` üçü de deploy sonrası gerçek istekle
  doğrulandı: sırsız → 401, doğru sırla → 200 + gerçek JSON.
- **`CRON_SECRET` üretimde doğru mu:** Vercel'in mevcut değeri `vercel env
  pull` ile OKUNAMADI (Secret tipi, CLI değeri maskeliyor) — varsayımla
  ilerlemek yerine Vercel'in `CRON_SECRET`'ı SİLİNİP `.env.local`'daki
  DEĞERLE yeniden eklendi, üçünün (yerel/Vercel/Vault) aynı olduğu garanti
  edildi.
- **`net._http_response` temiz mi:** eski 5 kayıt (2026-08-28, hepsi
  `status_code=null` — ADIM_27'nin bildiği "Couldn't connect" deseni,
  o zamanki localhost URL'inden) DIŞINDA temizdi; bunlar geçmişte kalan,
  zararsız kalıntılar (yeni URL'le tekrar oluşmayacaklar — doğrulandı).
- **Kill switch:** `cron.alter_job(jobid, active := false)` — tek SQL
  komutu, üçünü de ANINDA durdurdu (aşağıda kanıtlı). `supabase/apply.sh`'ın
  kendi `set_cron_active()` fonksiyonuyla AYNI mekanizma — yeni bir şey
  icat edilmedi.
- `bash supabase/apply.sh` (CRON_ACTIVE=false, varsayılan) yeniden
  çalıştırıldı — yalnızca bunun için: `cron_fire()` fonksiyonunun İÇİNE
  gömülü `__APP_URL__` artık production'ı gösteriyor
  (`select prosrc from pg_proc where proname='cron_fire'` ile doğrulandı).
  5 job da apply sonrası hâlâ `active=false` (idempotent — beklenen).

### C2 — Kademeli aktivasyon (gerçek zaman damgalarıyla)

1. **`sm-worker`** aktive edildi (21:33). 4 gerçek tur izlendi
   (21:33–21:36), hepsi `succeeded`, `net._http_response` hepsi `200`.
   ⭐ Bu ilk turda worker GERÇEKTEN 16 eski, yetim iş buldu (3 Eylül'den
   kalma e2e test artığı — silinmiş persona/media_jobs'a referans veren
   `ugc_pipeline`/`media_poll` işleri) ve doğru şekilde `dead`'e attı —
   worker'ın ölü mektup mantığının üretimdeki İLK gerçek kanıtı, ayrıca
   sağlıklı bir davranış (yeni bir sorun DEĞİL).
2. **`sm-reaper`** aktive edildi (21:37). İlk turu 21:40'ta geldi,
   `succeeded`, hata yok (`scanned` alanları sıfır — tutarlı, o an askıda
   kalan hiçbir şey yoktu).
3. **`sm-publish`** aktive edilmeden ÖNCE gerçek bir kanal + zamanlanmış
   Bluesky içeriği açıldı (test hesabıyla, `content_items.status=
   'scheduled'`). Sonra `sm-publish` aktive edildi (21:42).

**⭐ OTOMATİK YAYININ GERÇEK KANITI** — hiçbir elle tetikleme OLMADAN:

```
21:45:00  sm-publish turu  → jobs'a publish işi açtı (created_at 21:45:02)
21:46:00  sm-worker turu   → işi aldı, handlePublish çalıştı, Bluesky'ye yazdı
```

```sql
select id, status, external_post_id, published_at from content_items
 where id='e1fa26a3-6485-414d-aa46-f3d003aee79d';

 status    | external_post_id                                                        | published_at
 published | at://did:plc:h4uy2bqzvjobgsyhzslvloys/app.bsky.feed.post/7dq3qqlzljuz2 | 2026-09-06 21:46:02.954+00
```

**Gönderi:** https://bsky.app/profile/did:plc:h4uy2bqzvjobgsyhzslvloys/post/7dq3qqlzljuz2

`jobs` tablosunda karşılık gelen satır: `kind='publish', state='succeeded',
attempts=1, last_error=null`. Bu, ürünün "otomatik paylaşım" vaadinin İLK
gerçek kanıtı — kimse "yayınla"ya basmadı, zamanlayıcı vadesi geleni buldu,
kuyruğa koydu, worker işledi, gerçek bir platformda gerçek bir gönderi
oluştu.

### C3 — İzleme + kill switch kanıtı

20-30 dakikalık pencerede: `net._http_response`'ta **0 hata / 17 gerçek
istek** (hepsi 200); `jobs` tablosunda yeni bir ölü mektup birikmedi (yalnızca
aktivasyon öncesinden kalan 16 eski yetim iş + bu FAZ'ın kendi `publish`
işi `succeeded`); hiçbir cron turu boşa dönmedi (`sm-publish`'in
`scanned:0` turları BEKLENEN — o anda vadesi gelen başka içerik yoktu).

**Kill switch kanıtı** — üçü de tek komutla ANINDA durduruldu:

```sql
do $$ ... perform cron.alter_job(r.jobid, active := false); ... $$;
-- sonuç: sm-worker=f, sm-reaper=f, sm-publish=f (üçü de)
```

Doğrulandıktan sonra üçü (`sm-worker`, `sm-reaper`, `sm-publish`) FAZ C'nin
kalıcı sonucu olarak yeniden aktive edildi; `sm-metrics`/`sm-token-refresh`
kendi rotaları yazılmadığı için (adım 18/16-17b) hâlâ pasif —
`docs/CRON_AKTIVASYON.md`'nin "rotası yazılmamış job pasif kalsın"
kuralına uyularak.

**Commit:** `cron aktivasyonu (17a-c)`.

## FAZ D — /queue gerçek yayın

**Onay** (`app/(app)/queue/actions.ts` `approveAction`) `needs_review`/
`draft`/`failed` → `scheduled` geçişini yapar, İKİ koşulu birlikte
doğrular: platform bugün yayınlanabilir mi (`canPublish`) VE markanın o
platform için bağlı bir kanalı var mı. ⭐ Gerçek bir üretim boşluğunu
kapatıyor: `content_items.channel_id` oluşturulduğunda HER ZAMAN `null`
(`lib/core/plan/calendar.ts`) — hiçbir yol onu daha önce doldurmuyordu;
onay artık bu atamayı yapıyor.

**Yeniden zamanlama** (`rescheduleAction`) yeni bir `scheduled_at` yazar;
`failed` bir satırı `scheduled`'a döndürerek kurtarma yolu da olur
(`putRecord`'un idempotency'si sayesinde güvenli, FAZ B2).

**⚠ CANLI BULGU (e2e testiyle yakalandı) — saat dilimi hatası.** İlk
yazımda `new Date(datetimeLocalString)` kullanılıyordu; `<input
type="datetime-local">` saat dilimi TAŞIMAZ, bu yüzden `new Date()` bunu
SUNUCU SÜRECİNİN ÖRTÜK saat dilimiyle yorumluyordu — yerel makinede
(Europe/Istanbul) doğru çalıştı ama üretimde (Vercel, örtük UTC) SESSİZCE
3 saat kayacaktı. Düzeltme: markanın kendi saat dilimiyle `zonedTimeToUtc()`
(`lib/core/tz.ts` — `lib/core/plan/calendar.ts`'in AYNI sorunu çözdüğü
fonksiyon, tekrar kullanıldı, icat edilmedi).

**İptal** (`cancelAction`) → `archived` (§4a: silme yok, tekrar önleme
motoru okumaya devam eder).

**Canlı durum + platform bağlantısı:** `publishing` kilidi zaten canlı
görünüyordu (adım 8). ⭐ Yeni: `buildQueue` artık son 24 saatte
yayınlanmış satırları da TUTUYOR (öncesi hariç) — kullanıcı "gerçekten
gitti mi" anını ve gerçek platform bağlantısını (`atUriToBlueskyPermalink`,
`content_items.external_post_id`'nin AT URI'sini `bsky.app` linkine
çevirir) görebilsin diye.

**Demo izolasyonu:** `QueueActions` artık `isDemo` alıyor — demo modda
üçü de hâlâ `disabled` + "Demo modda devre dışı" ipucu (sıfır dış istek);
canlı modda gerçek `useActionState` formları.

**Gerçek çağıran eksikliği kapatıldı:** `ContentPort.live.update()`/
`archive()` `NOT_IMPLEMENTED` idi (hiçbir çağıran yoktu) — FAZ D'nin üç
düğmesi ilk gerçek çağıran, ikisi de gerçek RLS'ten geçen oturum
istemcisiyle dolduruldu.

### FAZ D DOĞRULAMA — `e2e/queue-actions.spec.ts`, ÜÇ düğmeye GERÇEK
tıklama (adım 20.5 kuralı):

```
✓ /queue — gerçek onay/yeniden zamanlama/iptal (17a FAZ D) ›
  üç düğme de GERÇEKTEN tıklanır ve content_items durumunu değiştirir
```

Sırasıyla kanıtlanan: Onayla tıklanır → `status='scheduled'` +
`channel_id` gerçek kanala atanır (psql `.poll` ile doğrulandı); Yeniden
zamanla tıklanır → yeni tarih girilir → `scheduled_at` markanın saat
diliminde doğru UTC'ye çevrilmiş olarak yazılır; İptal tıklanır →
`status='archived'`, satır sayfa yenilendiğinde kuyruktan kaybolur.

**⚠ İkinci canlı bulgu (tam takım regresyonunda yakalandı) — e2e test
izolasyon hatası, uygulama hatası DEĞİL.** `e2e/channels-connect.spec.ts`
(FAZ A) doğrulama sorgusu yalnızca `platform`+`handle`'a göre filtreliyordu,
`brand_id` YOKTU. FAZ B/C'nin canlı testleri AYNI gerçek Bluesky hesabını
"Carino Pizza" markasında da bağladığı için bu sorgu artık İKİ satırla
eşleşiyordu (`PGRST116`), test patlıyordu ve yarım kalan bağlantı
sonraki `queue-actions.spec.ts` koşusuna yanlış kanalın seçilmesi olarak
sızıyordu. Düzeltme: sorguya `brand_id` filtresi eklendi — tam takım
(15/15) tekrar yeşil.

**Doğrulama:** tsc/eslint temiz, vitest 553 geçti (+2 `calendar.test.ts`),
`npm run build` başarılı, Playwright tam takım (15/15, demo izolasyonu
dahil — `smoke.spec.ts` hâlâ sıfır yabancı ağ isteği kanıtlıyor).

**Commit:** `/queue gerçek yayın (17a-d)`.

## FAZ E ve SON RAPOR

Henüz başlanmadı.
