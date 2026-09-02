# ADIM 19 RAPORU — medya köprüsü, kalıcı depolama, SSRF savunması

Tarih: 2026-09-02
Kaynak: `docs/BIRLESIM_PLANI.md` §4d, §4g, §8.4, §10, §12 · önceki oturumlar:
`docs/ADIM_15_RAPOR.md` (devralınan bug sınıfı) · sahne referansı:
`../sahne/app/api/persona/lipsync/route.ts:43-49` (`TODO(ssrf)`).

**Sıra notu:** Bu oturum plan sırasını **16→17→18→19→20**'den
**19→20→16→17→18**'e çevirdi (Meta app review + Instagram tester kurulumu
hazır değildi). Gerekçe `docs/BIRLESIM_PLANI.md` REVİZYON D9'da, commit
`0104d65`.

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ 0 — devralınan sağlık taraması | ✅ Tamam — bug bulunmadı | `e701b54` |
| FAZ A — SSRF savunması | ✅ Tamam | `24705f5` |
| FAZ B — depolama (bucket + RLS canlı kanıt) | ✅ Tamam — kod değişmedi, karar teyit edildi | `dc89e36` |
| FAZ C — medya köprüsü | ✅ Tamam | `03b25b6` |
| FAZ D — kapanış (5 kapı + e2e) | ✅ Tamam | (doğrulama, ayrı commit yok) |
| Plan sırası güncellemesi (D9) | ✅ Tamam | `0104d65` |

**Beş kapı + e2e (bu oturumun sonunda, tüm fazlar birlikte):**
```
1. npx tsc --noEmit          exit 0
2. npx eslint .                0 hata (1 önceden var olan, ilgisiz uyarı — skeleton.test.ts:25, ADIM_15'te de aynı)
3. npx vitest run               514 PASS, 12 SKIP (32 dosya) — skip'ler tümü RUN_*_LIVE_TEST bayraklı
4. npm run build                 ✓ derlendi (17 route)
5. npx playwright test            7/7 PASS
```

---

## FAZ 0 — devralınan sağlık taraması

**Bulgu:** Yok. `find_similar_content` ve `brand_latest_metrics` ikisi de
`language sql`, `returns table` gövdesi tek bir `SELECT` — ADIM_15'in
bulduğu hata sınıfı (bir OUT parametresi + `plpgsql`'in `select ... into
<OUT parametreyle aynı adlı değişken>` kalıbının çakışması,
`get_provider_secret()`'te) buradaki iki fonksiyonda **yapısal olarak
kurulamıyor** — çakışacak bir OUT parametre/`into` çifti yok.

Kod incelemesi yetmez dendiği için ikisi de **gerçek Supabase'e karşı**
çağrıldı (`lib/server/schema-health.live.test.ts`,
`RUN_SCHEMA_HEALTH_LIVE_TEST=1`):

```
[schema-health live] find_similar_content eşleşme:
  [{"id":"0a912b51-…","title":"find_similar_content canlı test — komşu",
    "similarity":1}]
[schema-health live] find_similar_content ret (ortogonal): []
[schema-health live] brand_latest_metrics satırı:
  [{"content_item_id":"4c94c6b7-…","tier":"d1","reach":1000,"likes":42,
    "engagement_rate":5.1,"tier_weight":0.7}]
```

- Sahte ama **doğru boyutlu** (`vector(1024)`) bir vektörle: neredeyse aynı
  yönde bir komşu `similarity≈1` ile bulundu, ortogonal bir vektör hiç
  eşleşmedi (fonksiyonun hem bulma hem eleme yolu çalıştı).
- Gerçek bir `content_metrics` satırı yazıldı, `brand_latest_metrics()`
  onu doğru `tier_weight` (D1 kararı: `d1`→0.7, `final`→1.0) ile geri
  okudu.
- Test verisi `afterAll`'da silindi, doğrulandı (kalan satır: 0).

Düzeltme gerekmedi, `00_schema.sql`'e dokunulmadı.

---

## FAZ A — SSRF savunması

### Neden önce bu

§4g köprüsü sunucu tarafında kullanıcı/vendor kaynaklı bir URL'i indiriyor.
Sunucu Supabase service-role anahtarını ve müşterilerin sağlayıcı
anahtarlarını taşıdığı için bu üründe SSRF, genel "sunucu içine bir bakış"
riskinin ötesinde — sızıntı, marka başına ayrılmış tüm gizli anahtarları
kapsayabilir.

### `lib/server/fetch-guard.ts` — tek giriş noktası

Dış URL indirmenin **tek yolu**. Kapsadıkları:

| Kontrol | Uygulama |
|---|---|
| Yalnızca https | `assertHttps()` — şema kontrolü, ağa hiç gitmeden |
| Alan adı allowlist'i | `MEDIA_VENDOR_ALLOWLIST` env (virgülle ayrık), yoksa §10 varsayılanı (`kieai.redpandaai.co`, `*.fal.media`, `api.elevenlabs.io`) + **Supabase Storage host'u `NEXT_PUBLIC_SUPABASE_URL`'den otomatik türetilir** (koda gömülü değil) |
| DNS-rebinding güvenli IP kontrolü | Alan adı çözülür (`dns.lookup`), **aynı IP** `undici` `Agent`'ının `connect.lookup`'ıyla bağlantıya PIN'lenir — "çöz sonra bağlan" arasında ikinci bir DNS sorgusu için pencere yok |
| Özel/yerel/ayrılmış IP reddi | Node çekirdeğinin `net.BlockList`'i — 14 IPv4 + 7 IPv6 aralığı (link-local/169.254.0.0/16 dahil — bulut metadata), IPv4-mapped IPv6 (`::ffff:x.x.x.x`) doğru sınıflandırılıyor |
| Yönlendirme takibi | `redirect:"manual"`, her sıçrama YENİDEN şema+allowlist+DNS+IP'den geçiyor, azami sıçrama sayısı (varsayılan 5) |
| İçerik tipi doğrulaması | Beklenen `Content-Type` ön eki eşleşmezse reddedilir |
| Boyut sınırı | `Content-Length` fast-path RET (varsa) + **akış SAYACI** (gerçek üst sınır burada — header'a güvenilmez) |
| Zaman aşımı | `AbortController`, varsayılan 30sn |

**Teknik not — neden `undici`'nin kendi `fetch`'i, Node'un global
`fetch`'i değil:** Node 23'ün dahili `fetch`'i kendi (farklı sürüm) bir
`undici` kopyası; npm `undici@8.10.0`'dan üretilen bir `Agent`'ı ona
vermek `"invalid onRequestStart method"` ile çöküyor (denendi). Modül
`undici`'nin kendi `fetch`+`Agent`'ını **tutarlı** kullanıyor.
`package.json`'a `undici@8.10.0` eklendi (sabit sürüm).

### Sahne'nin çözümüyle karşılaştırma

`../sahne/lib/server/personas.ts:downloadImage()` yalnızca https şeması
kontrol ediyordu — allowlist yok, DNS-rebinding koruması yok, yönlendirme
kontrolü yok, tüm gövdeyi `arrayBuffer()` ile belleğe alıyordu (25MB sabit
sınır, ama akış değil). Bu modül hepsini kapatıyor + akış hâlinde
çalışıyor (100MB video için bellek riski yok).

Plan §10'un orijinal notu *"yönlendirme takibi kapalı"* diyordu (daha
basit: hiç redirect kabul etme). Bu oturum onun yerine **takip + her
sıçramada yeniden doğrulama** uyguladı — vendor'ların gerçek CDN'leri
zaman zaman yönlendirme kullanabiliyor (ör. imzalı URL'ler), tamamen kapalı
olmak bunu kırardı; güvenlik özelliği aynı (izinsiz bir hedefe asla
ulaşılamaz), yalnızca meşru yönlendirmelere izin verir. Daha kısıtlayıcı
değil, eşdeğer güvenli + daha esnek bir üst küme.

### FAZ A DOĞRULAMA — sekiz senaryonun hepsi gerçekten denendi

`lib/server/fetch-guard.test.ts`, 36 test (`npx vitest run
lib/server/fetch-guard.test.ts`). Hangisinin gerçek ağ/DNS, hangisinin
(yalnızca gerçek bir vendor'ın altyapısına ihtiyaç duyduğu için) enjekte
edilmiş bir taşıma katmanıyla test edildiği dosyada açık:

| # | Senaryo | Yöntem | Sonuç |
|---|---|---|---|
| 1 | `http://169.254.169.254/latest/meta-data/` | gerçek (şema) + gerçek DNS/IP (allowlist'e host olarak eklense bile) | ❌ reddedildi (`scheme`, sonra `private_ip`) |
| 2 | `http://localhost:3000/`, `http://127.0.0.1/` | gerçek (şema) + gerçek DNS/IP | ❌ reddedildi |
| 3 | `http://[::1]/` | gerçek (şema) + gerçek DNS/IP | ❌ reddedildi |
| 4 | `file:///etc/passwd` | gerçek (şema) | ❌ reddedildi |
| 5 | Allowlist dışı geçerli https | gerçek (saf mantık, ağ yok) | ❌ reddedildi (`host_not_allowed`) |
| 6 | Allowlist içi URL | **gerçek ağ** — Supabase Storage (`RUN_FETCH_GUARD_LIVE_TEST=1`) | ✅ başarılı, bayt-bayt doğru |
| 7 | Allowlist içinden dışına yönlendirme | enjekte taşıma (gerçek vendor'ı yönlendirmeye zorlayamayız) — allowlist/DNS/IP kontrolü GERÇEK kod yolunda | ❌ reddedildi (2. hop) |
| 8 | Boyut sınırını aşan yanıt | **gerçek ağ** (Content-Length fast-path) + enjekte taşıma (Content-Length'siz akış sayacı) | ✅ kesildi |

**Canlı kanıt (gerçek Supabase Storage'a karşı):**
```
[fetch-guard live] test nesnesi:
  https://osxpcyzohmlgxkzbirci.supabase.co/storage/v1/object/public/media/
  ssrf-guard-tests/1520f678-…-test.txt
✓ 6) allowlist içi URL → başarılı, bayt-bayt doğru        1433ms
✓ 8) gerçek yanıt maxBytes'ı aşarsa kesilir                384ms
```

Ayrıca `isPublicIp()` 17 IP/aralık üzerinde birim test edildi (169.254.x,
127.x, 10.x, 172.16.x, 192.168.x, 100.64.x/CGNAT, 0.0.0.0, multicast,
broadcast, `::1`, `fe80::`, `fc00::`, IPv4-mapped IPv6, iki gerçek public
IP).

---

## FAZ B — depolama

**Karar (zaten §1.10/§4g'de verilmiş, bu oturumda YENİDEN doğrulandı):**
tek `media` bucket'ı, **public**, yol şeması `<user_id>/<brand_id>/<kind>/
<uuid>.<ext>`. Gerekçe değişmedi: Instagram medyayı yayın anında **kendisi
çekiyor**, zorunlu olarak public bir URL istiyor; ayrı bir "ara çıktı"
bucket'ı boru hattının ortasında bucket'lar arası kopyalama gerektirirdi.

**Adım 17 için sonucu:** yayın kodu ek bir "public'e taşı" adımına
ihtiyaç duymayacak — `media_assets.public_url` zaten yayınlanabilir.

**Bu oturumda kod değişmedi** (bucket + politikalar `00_schema.sql` §8'de
zaten kurulu) — `00_schema.sql`'e bu kararı canlıda yeniden doğrulayan bir
yorum eklendi (`dc89e36`). Kanıt ephemeral bir script ile üretildi
(ADIM_27'nin curl deseninin aynısı, commit edilmedi):

```
── 1) A kendi medyasını görüyor mu ──
A: [ { id: '7032778b-…' } ]
── 2) B, A'nın medyasını görüyor mu ──
B: []
── 3) service-role aynı sorguyu yapıyor (kontrol) ──
service-role: [{ id: '7032778b-…', brand_id: '78d2556c-…', user_id: '92bcb20e-…' }]

── 4) Storage bucket public mi (anon, oturumsuz HTTP) ──
anon fetch status: 200 body: "adım 19 FAZ B — RLS + bucket kanıtı"

── 5) B, A'nın klasörüne dosya yazmaya çalışıyor (Storage RLS) ──
B'nin A'nın klasörüne yazma denemesi: REDDEDİLDİ — new row violates row-level security policy
```

DB satırının marka izolasyonu ile Storage nesnesinin public okunabilirliği
**iki ayrı katman** — biri diğerini gevşetmiyor: URL'i bilmeyen biri
dosyayı bulamaz (bucket public ama enumerable değil, yollar UUID), ama
`media_assets` satırını (hangi markaya ait, ne zaman üretildi, kaynak
vendor) yalnızca sahibi görür.

**`media_assets.source_url` (orijinal vendor URL'i) saklanıyor mu?**
Zaten §4g'de karara bağlanmıştı — **evet** (`source_url text — indirildiği
geçici vendor URL'i`, `00_schema.sql:509`). Gerekçe: geçici ve süresi
dolacak ama hata ayıklama için değerli, VE bu oturumda idempotency
(FAZ C) tam olarak bu kolona dayanıyor.

---

## FAZ C — medya köprüsü

### `lib/server/storage.ts` — `persistVendorAsset()`

`StoragePort`'un canlı gövdesi artık burada. Akış:

```
1. İdempotency kontrolü (aşağıya bkz.)
2. guardedFetch(sourceUrl, {maxBytes, expectedContentTypePrefixes})  ← FAZ A
3. Content-Type → uzantı, storage yolu: <user_id>/<brand_id>/<kind>/<uuid>.<ext>
4. supabase.storage.from('media').upload(path, akış, {contentType})  ← AKIŞ HÂLİNDE
5. media_assets satırı yaz (public_url, gerçek bayt sayısı, source_vendor, source_url)
6. mediaJobId verilmişse: koşullu UPDATE media_jobs SET result_asset_id=… WHERE result_asset_id IS NULL
```

**Bellek/boyut sınırları:** görsel 25MB, video 100MB (§4g'nin verdiği
değerler). Ses için görevde açık bir sınır yoktu — görselle aynı üst
sınır (25MB) varsayıldı; ElevenLabs TTS çıktıları birkaç MB'lık kısa
klipler olduğu için bugün pratik bir etkisi yok, ama **⚠ DOĞRULANMALI** —
adım 20 gerçek ses adımını bağladığında kalibre edilebilir.

**Bellekte tutmama:** `guardedFetch`'in döndürdüğü `ReadableStream`
doğrudan `supabase.storage.upload()`'a veriliyor (`storage-js` bir
`ReadableStream` body'yi otomatik `duplex:'half'` ile fetch'e veriyor —
kontrol edildi, `node_modules/@supabase/storage-js`). 100MB'lık bir video
hiçbir noktada tek bir `ArrayBuffer` olarak belleğe alınmıyor — yalnızca
akıştaki o anki parça bellekte.

**İdempotency — iki kademeli, YENİ bir DB kısıtı GEREKMEDEN:**
1. `mediaJobId` verilmişse ve o işin `result_asset_id`'si zaten doluysa →
   **ağa hiç gidilmeden** o satır döner.
2. `mediaJobId` yoksa → aynı `(brand_id, source_url)` için mevcut satır
   aranır; varsa o döner.
3. Yarış (iki eşzamanlı çağrı aynı işi bridgeler): kazanan koşullu
   `UPDATE ... WHERE result_asset_id IS NULL` ile belirlenir; kaybeden
   kendi yüklediği depolama nesnesini VE `media_assets` satırını siler,
   kazananın satırını döner.

⚠ **Bilinçli bir kısıt bırakıldı:** `(brand_id, source_url)` üzerinde
UNIQUE bir DB kısıtı YOK — `mediaJobId`'siz iki eşzamanlı çağrı (yarış
penceresi çok dar) teorik olarak iki kopya dosya yaratabilir. Bu ne bir
güvenlik ne bir doğruluk sorunu (en kötü sonuç: gereksiz depolama), bu
yüzden bu adımda canlı bir şema değişikliği (yeni index) İSTENMEDİ —
`mediaJobId` üzerinden gelen asıl üretim yolu (adım 20) zaten tam
korumalı.

**Başarısızlık temizliği — gerçekten tetiklendi, gerçekten doğrulandı:**
DB yazımı bir FK ihlaliyle (var olmayan `brand_id`) bilinçli olarak
başarısız kılındı; storage nesnesinin GERÇEKTEN silindiği klasör
taramasıyla kanıtlandı (aşağıya bkz.).

### `lib/adapters/live/storage.ts`

`persistFromUrl`/`list` artık gerçek — `requireBrand()` (oturum çerezi) +
oturum istemcisi kullanıyor, **service-role değil** (`lib/server/
README.md`'nin "üç yer" kuralına uyar — bu port etkileşimli bir istekten
çağrılır, cron/OAuth/credential okuma değil). `persistBytes` kasıtlı
`NOT_IMPLEMENTED` kaldı — `/library`'nin elle yükleme akışı 11b'ye
ertelenmiş bir ekran, bu adımın kapsamı değil.

### FAZ C DOĞRULAMA — gerçek dosyayla uçtan uca kanıt

`lib/server/storage.live.test.ts`, 5 senaryo
(`RUN_STORAGE_BRIDGE_LIVE_TEST=1`):

```
✓ gerçek dosyayı indirir, kalıcı depolamaya yazar, kalıcı URL üretir, o URL'e erişilebilir   7379ms
✓ idempotency (URL bazlı) — aynı sourceUrl iki kez köprülenirse TEK dosya kalır               5666ms
✓ idempotency (media_jobs bazlı) — ikinci çağrı ağa dokunmadan aynı satırı döner              6233ms
✓ içerik tipi uyuşmazlığı → indirme hiç başlamadan reddedilir, yetim kayıt yok                3141ms
✓ DB yazımı sonrası depolanan dosya SİLİNİR (yetim nesne kalmaz)                              5676ms

[storage bridge live] kalıcı URL:
  https://osxpcyzohmlgxkzbirci.supabase.co/storage/v1/object/public/media/
  3655997e-…/3a382132-…/image/cc2278fb-….png
```

**"Vendor URL'i" neden gerçek Kie/fal değil:** bu oturumda Kie/fal/
ElevenLabs kimlikleri henüz sağlanmadı — UGC video üretimi adım 20'nin
işi (plan sırası bu oturumda değişti, D9). Bunun yerine gerçek bir
Supabase Storage nesnesinin public URL'i kullanıldı — FAZ A'nın
allowlist'i bunu zaten dördüncü vendor sayıyor ("Kie, fal, ElevenLabs,
Supabase Storage"), yani bu **taklit değil, allowlist-içi gerçek bir
indirme**. Köprü vendor'ın çıktıyı NASIL ürettiğini bilmiyor/umursamıyor
— yalnızca https + allowlist + içerik tipi + boyut görüyor. Kie/fal ile
birebir aynı kod yolu adım 20'de gerçek üretim çıktısıyla koşacak.

`resolveProviderCredential()` bu köprüde hiç gerekmedi — bridge, bir
vendor'a KİMLİK DOĞRULAYARAK çağrı yapmıyor, yalnızca zaten üretilmiş bir
sonucu (herkese açık, geçici bir URL) indiriyor. Kısayol yok: gerçek ağ,
gerçek Storage, gerçek DB, gerçek temizlik.

---

## FAZ D — kapanış

### SSRF grep denetimi

```
$ grep -rn "fetch(" app/ lib/server/ lib/adapters/ lib/core/ lib/providers/
lib/server/fetch-guard.ts:17: (yorum — kural açıklaması)
lib/core/providers/kie.ts:70          ← KIE_BASE sabit, kullanıcı girdisi değil
lib/core/providers/elevenlabs.ts:78,130,156,172  ← ELEVENLABS_BASE sabit
app/**                                ← SIFIR fetch() çağrısı
```

`app/`'de hiç `fetch()` yok çünkü SSRF-riskli rota (lipsync, sahne'nin
`TODO(ssrf)`'ü) bu kod tabanına henüz taşınmadı — o adım 20'nin işi. Kie/
ElevenLabs modüllerindeki tüm çağrılar **sabit** vendor host'larına
(derleme zamanı sabiti, kullanıcı/vendor verisinden gelmiyor) — SSRF
yüzeyi değiller. `kie.ts`'in döndürdüğü `videoUrl`/`resultUrls` gibi
alanlar bu dosyada hiç `fetch()` edilmiyor, yalnızca çağırana veri olarak
dönüyor — indirilecekleri tek yer (adım 20'nin `media_poll`/`ugc_pipeline`
işleyicisi) `persistVendorAsset()`'i kullanmak ZORUNDA kalacak (arayüz bu
şekilde tasarlandı).

**Adım 20'ye devredilen zorunluluk:** sahne'nin lipsync/persona rotaları
bu projeye taşınırken, içlerindeki her indirme `guardedFetch`/
`persistVendorAsset` üzerinden gitmeli — bu grep, o taşıma bittiğinde
TEKRAR çalıştırılmalı (bu kez `app/`'de gerçek eşleşmeler bulacak, hepsi
guard'lı olmalı).

### Sır sızıntısı taraması

```
$ git diff 9716621..HEAD | grep -iE 'key|secret|token|password' | grep -v <bilinen zararsızlar>
(sıfır sonuç)
```

`.env.local` içeriği hiçbir dosyaya yazılmadı; testler `set -a; source
.env.local; set +a` ile yalnızca KOMUT SATIRINDA kullanıldı.

### Demo modda sıfır dış istek

`APP_MODE=demo`, hiçbir `MODE_STORAGE` override'ı yok → `resolveMode
("storage")` **her zaman** `demo`'ya düşer (`lib/adapters/mode.ts`'in
önceliği: dev çerezi → port-özel env → genel `APP_MODE` → varsayılan
`demo`). `/studio` ve `/studio/personas` `port("storage")` çağırıyor ama
bugünkü ortamda hâlâ `demoStorage`'a gidiyor — `liveStorage`'ın yeni
gövdesi bu oturumda **dormant** (yalnızca `MODE_STORAGE=live` ile
uyanır, adım 20'nin işi). Playwright `smoke.spec.ts` bunu bağımsız olarak
da doğruluyor: *"ağ raporu: yolculuk boyunca yabancı köke giden 0
bekleniyor"*.

### Beş kapı + e2e

Yukarıda ÖZET'te. `playwright test` bu oturumda 23 saattir açık, port
3000'de takılı kalmış bir `next dev` süreci yüzünden başlayamadı (Next 16
aynı proje dizini için ikinci bir dev sunucusuna izin vermiyor, port
farklı olsa bile) — kullanıcı onayıyla o süreç durduruldu (`kill 51960`),
`npm run dev` ile serbestçe yeniden başlatılabilir.

---

## Varsayımlar + adım 20'ye geçmeden bilmem gerekenler

1. **Ses boyut sınırı (25MB) varsayım** — görevde açık değildi, görselle
   eşitlendi. Adım 20 gerçek ElevenLabs çıktılarıyla kalibre etmeli.
2. **Allowlist host'ları plan'dan birebir alındı** (`kieai.redpandaai.co`,
   `*.fal.media`, `api.elevenlabs.io`) — Kie'nin **video sonucu** URL'i
   `kieai.redpandaai.co`'dan farklı bir CDN host'undan gelebilir (upload
   ve sonuç host'ları aynı olmayabilir; sahne'nin kodu bunu netleştirmiyor).
   Adım 20'de gerçek bir Kie video sonucu geldiğinde host doğrulanmalı;
   farklıysa `MEDIA_VENDOR_ALLOWLIST` env değişkeniyle (koda dokunmadan)
   genişletilebilir.
3. **`persistVendorAsset` `media_poll`/`ugc_pipeline`'a BAĞLANMADI** —
   bilinçli. `lib/server/jobs/handlers.ts`'teki bu iki işleyici hâlâ
   `NOT_IMPLEMENTED` — adım 20'nin işi, köprünün KENDİSİ hazır ve
   test edilmiş durumda.
4. **`persistBytes` yazılmadı** — `/library`'nin elle yükleme akışı 11b'ye
   ertelenmiş, bu adımın kapsamı §4g'nin vendor URL köprüsüydü.
5. **`(brand_id, source_url)` üzerinde DB kısıtı yok** — bilinçli, yukarı
   bkz. (FAZ C).
6. **Genişletme noktası:** yeni bir vendor eklenirse (§8.8'in diğer
   platformları medya üretmez ama gelecekte üretebilir), tek değişiklik
   `MEDIA_VENDOR_ALLOWLIST` env'i — kod değişmez.
