# Demo hikâye tutarlılığı — adım 11 FAZ B

Tarih: 2026-08-29 · Kaynak: `docs/demo/*.png` (bu oturumda, gerçek `next dev`
+ Playwright ile çekildi) + `lib/adapters/demo/fixtures/*.ts` kaynak okuması.

Altı ekran (`/dashboard`, `/plan`, `/queue`, `/studio`, `/analytics`,
`/settings`) tek bir marka, tek bir zaman çapası ve tek bir içerik kümesi
üzerinden anlatılıyor. Aşağıdaki altı madde görevin kendi kontrol listesi;
her biri ekran görüntüsüyle doğrulandı, **hiçbiri fixture değişikliği
gerektirmedi**.

## 1. Marka, sektör, ürün, ses tonu — altı ekranda aynı mı?

Evet. Marka her ekranda "Kahve Durağı" (topbar altyazısı). İçerik tek bir
üçüncü nesil filtre kahve işletmesinin sesinde: kavurma tarihi şeffaflığı
(`content.ts` #003, #022), tek köken/harman anlatımı, demleme yöntemleri
(V60, Aeropress, cold brew), tedarik zinciri şeffaflığı (Kolombiya Huila
kooperatifi). `lib/adapters/demo/fixtures/brands.ts`'teki tek marka satırı
hepsinin kaynağı — ayrışma riski yok, çünkü hepsi aynı `DEMO_BRAND_ID`'ye
bağlı.

## 2. `/queue`'daki devam zinciri `/plan`'da da görünüyor mu?

Evet, birebir. İkisi de aynı `ChainCard` bileşenini kullanıyor
(`components/app/plan-view.tsx:11` → `queue-view.tsx`'ten import), aynı
`buildChains(items)` türetmesiyle besleniyor. Üç halka da ("Ekipman rehberi
1: değirmen" → "2: su ve sıcaklık" → "3: terazi ve zaman") her iki ekranda
da aynı sırada, aynı durum rozetleriyle (`Yayında`/`Yayında`/`Sırada`)
görünüyor. Bkz. `docs/demo/plan.png` ve `docs/demo/queue.png`.

## 3. Analytics'te "en iyi performans" gösteren içerik `/queue`'da yayınlanmış duruyor mu?

Kısmen farklı ama **tutarsızlık değil, doğru mimari**. `/analytics`'in "En
iyi performans gösteren içerikler" listesi `buildTopPosts()` ile **erişime**
göre sıralanıyor (`lib/core/derive/analytics.ts:139`), tier'a göre değil —
listenin başı "V60 ile 4 dakikada demleme" (18.9K erişim). Bu içerik
`content.ts`'te `status: "published"` — yani gerçekten yayınlanmış, sadece
`/queue`'da GÖRÜNMÜYOR çünkü `/queue` bilinçli olarak yalnızca bekleyen/aktif
işlem hattını gösteriyor (taslak → sırada → onay bekliyor → yayınlanıyor),
geçmiş yayınları değil. Geçmiş içeriğin doğal adresi `/analytics`; `/queue`'a
sızması ürünün "kuyruk boşalır" vaadini bozardı. İki `Ekipman rehberi` halkası
da top-5'te — zincirin performans anlatımı da tutarlı.

## 4. `/studio`'daki `running` iş `/queue`'daki bir içeriğe bağlı mı?

Evet, doğrudan görünür biçimde. `/queue`'da "Bir günde kaç kilo kavuruyoruz"
satırının **içinde** "Video üretiliyor · Dudak senkronu (1/2)" ilerleme
göstergesi var (bkz. `docs/demo/queue.png`) — `/studio`'daki AYNI iş
(`media_jobs` #j...003, `state: "running"`, `content_item_id: ...013`).
Kaynak: `lib/adapters/demo/fixtures/media.ts:170-186`'nın kendi yorumu bunu
açıkça amaçlamış ("§4a'nın ortogonallik kuralı"). İki ekran aynı işi anlatıyor,
tek bir tutarsızlık yok.

## 5. `duplicate_blocked` aktivitesi hangi içeriği engelledi — zincirde görünüyor mu?

`/queue`'nun en üstünde ayrı bir "Tekrar önleme" kartı var: "Kavurma tarihi
neden önemli · benzerlik 0.94" (bkz. `docs/demo/queue.png`). Bu, `content.ts`
#022'deki `archived` satırla eşleşiyor (`content_fingerprint: "a1f4c0b7e2d9"`,
başlık birebir aynı) — satır SİLİNMEDİ, motorun "bunu daha önce ürettim"
hafızası olarak duruyor (§4a). Zincirin kendisinde (Ekipman rehberi 1-2-3)
görünmüyor çünkü farklı bir konu (`topic_key: "tazelik"` vs
`"ekipman-rehberi"`) — engellenen fikir zincire ait değil, ayrı bir tekilleştirme
örneği. Doğru davranış.

## 6. Tarihler bugüne göre anlamlı mı?

Evet. Hiçbir fixture mutlak tarih taşımıyor — hepsi `lib/adapters/demo/
fixtures/clock.ts`'in `at(now, dayOffset, localTime)` fonksiyonuyla, sayfa
her render edildiğinde GERÇEK `now`'a göre hesaplanıyor
(`app/(app)/*/page.tsx` içindeki port çağrıları `new Date()` geçiyor).
2026-08-29'da çekilen ekran görüntülerinde "Bugün 11:00", "Bugün 18:00",
"Yarın 09:00" gibi göreli etiketler doğru gösteriyor; 30 günlük planın
başlığı "Eylül ritmi" — bugünden (29 Ağustos) başlayan 30 günlük bir ufkun
büyük kısmı gerçekten Eylül'e düşüyor, yani isim ay sonrasında da tutarlı
kalacak bir şablon adı, tarih içermeyen bir marka ismi gibi davranıyor.

## Sonuç

Altı ekran tek bir hikâye anlatıyor: bir kahve markası AI ile plan üretiyor
(`/plan`), UGC videosu ürettiriyor (`/studio`), insan onaylıyor (`/queue`),
otomatik yayınlıyor ve sonucu ölçüyor (`/analytics`), profilini besliyor
(`/settings`). **Fixture değişikliği gerekmedi** — adım 6'nın (`docs/
ADIM_56_RAPOR.md`) kurduğu çapraz referanslama (chain/dedupe/media_jobs
yorumları) bu denetimden değişmeden çıktı.

Bilinçli olarak KAPALI kalan tek kopukluk — `/plan`'ın UGC seçimi ile
`/studio`'nun üretim listesi arasındaki bağlantısızlık (adım 14'ün işi) —
`/studio`'nun kendi ekranında açıkça yazıyor (bkz. `docs/demo/studio.png`
üstteki uyarı kutusu). Bu FAZ B'nin kapatacağı bir madde değil; `docs/
DEMO_SENARYOSU.md`'nin dürüstlük bölümünde tekrar ele alınıyor.
