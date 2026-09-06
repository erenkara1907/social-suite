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

## FAZ B–E ve SON RAPOR

Henüz başlanmadı.
