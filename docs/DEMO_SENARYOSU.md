# Demo senaryosu — müşteri görüşmesi sunum planı

BIRLESIM_PLANI §12 adım 11 FAZ D. Bu bir pazarlama metni değil, ekranda
gezinirken TAKİP EDİLECEK bir yol haritası. Kanıtlar `docs/demo/TUTARLILIK.md`
ve o dosyanın referans aldığı ekran görüntülerinden.

---

## 1. Sıra — hangi ekran, hangi sırayla, neden

Ürünün kendi döngüsünü takip ediyoruz: **plan → üret → onayla → ölç → tekrar
planla.** Sıra bilinçli — `/dashboard`'la başlamıyoruz çünkü takvim ürünün
NE yaptığını değil, NEYİ TUTTUĞUNU anlatır; müşteri önce "nasıl çalışıyor"
sorusunun cevabını görmeli.

| # | Ekran | Ne söylenecek | Dikkat çekilecek somut detay |
|---|---|---|---|
| 1 | `/login` → `/dashboard` | "Giriş her modda gerçek — demo yalnızca içeriği örnekliyor, hesabı değil." | `DemoBanner` her ekranda sabit duruyor, kapatılamıyor — "gösterdiğimiz sayılar örnek" dürüstlüğü |
| 2 | `/dashboard` | "Kabuk burada — bu ay planlanan, onay bekleyen, yayınlanan, erişim. Sağda son hareketler akışı." | "Kuyruğa alındı", "Onaylandı" gibi satırlar insan + otomasyonun birlikte çalıştığını gösteriyor |
| 3 | `/plan` | "Marka profilinden AI bir haftalık/aylık ritim üretiyor. Ufku değiştirdiğimde slot sayısı değişiyor." | 1 haftalık ufuk her zaman 8 slot; UGC seçim sayacı tersinir (seç/geri al/temizle) |
| 4 | `/plan` → **Devam eden zincirler** kartı | "Yeni bir fikir planlamadan önce motor, bunun önceki bir serinin devamı olup olmadığına bakıyor." | "Ekipman rehberi 1 → 2 → 3" — üçüncü halka henüz sırada, ilk ikisi yayında |
| 5 | `/studio` | "Seçilen içerik için persona görseli → seslendirme → persona videosu → dudak senkronu dört adımlı boru hattı." | Kredi tablosu gerçek vendor rakamları (Kie, ElevenLabs, fal) — icat edilmiş fiyat yok |
| 6 | `/studio` → çalışan iş | "Bu iş şu an gerçekten `running` — sahte ilerleme çubuğu yok, `media_jobs` tablosunun ham durumu." | Aynı içerik `/queue`'da da "Video üretiliyor (1/2)" olarak görünüyor — tek gerçek kaynak |
| 7 | `/queue` | "İnsan onayı burada. Otomasyon hiçbir şeyi habersiz yayınlamıyor." | Üstteki "Tekrar önleme" kartı — motor bir fikri 0.94 benzerlikle engellemiş, gerekçesini gösteriyor |
| 8 | `/queue` → yayınlanıyor satırı | "Çifte yayın kilidi — aynı gönderi iki kez atılamaz." | "Yayınlanıyor — kilitli" rozeti |
| 9 | `/analytics` | "Yayınlanan içerik geri dönüyor: erişim, etkileşim, en iyi saatler ısı haritası." | "final" / "d1" rozetleri — 30 günlük toplama bitmiş mi, hâlâ sürüyor mu, ikisi de plana geri besleniyor |
| 10 | `/settings` | "Bu formu doldurmak `/plan`'ın çıktısını doğrudan iyileştiriyor — demoda bile gerçek hesaba yazıyor." | Profil tamamlanma yüzdesi canlı güncelleniyor |

**Kapanış cümlesi önerisi:** "Az önce gezdiğiniz altı ekran tek bir demo
senaryosu değil — aynı marka, aynı içerik kimlikleri, aynı zaman çizelgesi.
Bir müşteriye gösterdiğimizde gördükleri kurgu değil, ürünün gerçekten
yapacağı şey."

---

## 2. MVP maddelerinin karşılığı

| Vaat | Nerede kanıtlanıyor | Nasıl |
|---|---|---|
| İçerik planlama | `/plan` | AI, marka profilinden haftalık/aylık slot planı üretiyor (`buildSlots()` + model fikirleri) |
| UGC video | `/studio` | Persona → ses → video → dudak senkronu dört adımlı gerçek boru hattı (demo modda çıktı placeholder) |
| Otomatik paylaşım | `/queue` | Onaylanan içerik zamanlanmış saatte yayınlanıyor; "Yayınlanıyor — kilitli" çifte yayın kilidini gösteriyor |
| Tekrar önleme + devam zinciri | `/queue` | "Tekrar önleme" kartı (benzerlik skoruyla engelleme) + "Devam zinciri" kartı (1→2→3 seri) |
| Geçmişe göre üretim | `/analytics` | "final"/"d1" rozetli metrikler, en iyi saatler ısı haritası — bir sonraki `/plan` çağrısı bu veriyi okuyor (D1 kararı) |

---

## 3. Dürüstlük bölümü — demo modda ÇALIŞMAYAN her şey

Müşteriye açıkça söylenecekler; sorulmadan da erkenden söylemek güven inşa
eder.

- **UGC videoları gerçek değil.** `/studio`'daki çıktılar demo modda statik
  poster + "demo çıktı" rozeti. Gerçek video üretimi (Kie/ElevenLabs/fal)
  adım 20'de canlıya alınacak. Stok pazarlama videosu KULLANILMADI —
  gösterdiğimiz her şey ya kendi kurgumuz ya da placeholder.
- **AI planı demo modda sabit.** `/plan`'daki "Planı üret" butonu görsel
  olarak çalışıyor ama gerçek bir model çağrısı yapmıyor — sabit bir örnek
  plan dönüyor. Gerçek Anthropic entegrasyonu adım 14.
- **`/plan`'daki UGC seçimi `/studio`'ya taşınmıyor.** Seçim React state'te
  yaşıyor, sayfa değişince kayboluyor. `/studio`'daki üretim listesi zaten
  kuyruğa girmiş GERÇEK işlerden geliyor — ama seçim ekranından üretim
  ekranına otomatik köprü yok. Bu kopukluk `/studio`'nun kendi ekranında da
  yazılı duruyor; adım 14'ün işi.
- **Instagram'a (veya başka bir kanala) bağlanılamaz.** Kanal bağlama
  ekranı (`/channels`) henüz yazılmadı (11b). Gerçek OAuth + yayın adım
  16-17'de geliyor.
- **`/settings`'in entegrasyon ve API anahtarı bölümü yok.** Müşterinin
  kendi AI anahtarını girdiği akış (Vault'a yazma) adım 13'ün işi.
- **Düğmeler kasıtlı olarak devre dışı.** `/studio`'da "Yeni üretim başlat"
  ve `/queue`'daki onay/iptal aksiyonları demo modda tıklanabilir görünür
  ama gerçek bir yan etki üretmez (`generateDisabled`/`queueActionDisabledHint`)
  — görsel olarak "burada ne olacağını" göstermek için var, gerçek işlem
  yapmıyor.
- **Tekrar önleme bugün yalnızca birebir kopyaları engelliyor, benzerleri
  DEĞİL (adım 15).** Motorun üç katmanı var: (1) birebir parmak izi — her
  zaman açık, ücretsiz; (2) anlamsal benzerlik (embedding) — Voyage anahtarı
  hiçbir markada GİRİLMEDİ, bu yüzden bugün KAPALI; (3) otomatik "devam mı?"
  kararı katman 2'ye bağlı, o da kapalı olduğu için bugün hiç TETİKLENMİYOR.
  Sonuç: bugün "A ürününü tanıtan içerik" ile "A ürününü FARKLI kelimelerle
  yeniden anlatan içerik" arasındaki fark otomatik yakalanmıyor — yalnızca
  BİREBİR aynı başlık+kanca engelleniyor. Devam zinciri (`parent_id`) elle
  kurulabiliyor (bir içeriği açıkça "bunun devamı" olarak işaretlemek), otomatik
  öneri değil. `/settings`'te Voyage satırının `whenMissing` metni bunu zaten
  söylüyor — burada da açıkça yazılı dursun.
- **Fiyatlandırma henüz yok.** `/studio`'daki kredi tablosu bizim vendor
  maliyetimiz (Kie/ElevenLabs/fal'ın gerçek birim fiyatları) — müşteriye
  yansıyacak paket fiyatı henüz belirlenmedi (`app.config.ts`'teki
  `PricingTier` tipi tanımlı ama hiçbir paket doldurulmadı).

---

## 4. Sık gelecek sorular

**"Videolar gerçek mi?"**
Hayır, demo modda değil. Gösterdiğimiz boru hattı (persona → ses → video →
dudak senkronu) gerçek — her adımın gerçek bir vendor'ı ve gerçek bir kredi
maliyeti var (ekranda görünen tablo). Ama çıktı bir placeholder poster;
gerçek render adım 20'de açılacak.

**"Instagram'a şimdi bağlanabilir miyim?"**
Henüz değil. Kimlik doğrulama her modda gerçek ama kanal bağlama ve gerçek
yayın adım 16-17'nin işi. Bugün gösterdiğimiz, o geldiğinde üstüne
oturacağı onay/kuyruk mekanizması.

**"Maliyeti ne?"**
Paket fiyatı henüz netleşmedi. Bugün elimizde olan, üretim başına gerçek
vendor maliyeti (Studio ekranındaki kredi tablosu) — bu, fiyatlandırmanın
üzerine oturacağı zemin, kendisi değil.

**"Verim (AI planlama) nerede duruyor?"**
`/analytics`'teki "final" ve "d1" rozetleri — 30 gün toplaması bitmiş
içerik "final" ağırlığıyla, hâlâ toplanan içerik "d1" ağırlığıyla bir
sonraki `/plan` çağrısına geri besleniyor (D1 kararı, `content_metrics`).
Bugün bu döngü demo veriyle görünüyor; gerçek AI planlaması adım 14'te.

**"Sayfayı yenilersem ne olur?"**
`/plan`'daki UGC video seçimi (checkbox'lar) React state'te — sayfa
yenilenirse veya değişirse KAYBOLUR. Diğer her şey (marka profili, onaylar,
plan/queue/studio/analytics verisi) demo fixture'ından ya da gerçek
veritabanından geliyor, kaybolmaz.

---

## 5. Sunum öncesi kontrol listesi

- [ ] **Standing bir demo hesabı var mı?** Şu an veritabanında SIFIR
  kullanıcı var (doğrulandı, bu oturumda) — e2e testleri ve bu raporun
  ekran görüntüleri KENDİ hesaplarını kurup görüşme sonunda siliyor.
  Görüşmeden önce Supabase Dashboard'dan (veya `admin.auth.admin.
  createUser` ile) kalıcı bir e-posta/şifre + `brands` satırı oluşturulmalı.
  Şifreyi bu depoya YAZMA — parola yöneticisinde tut.
- [ ] Hangi hesapla giriliyor — o hesabın markası (`brands.name`) demo
  fixture'ıyla aynı anlatıyı sürdürsün diye "Kahve Durağı" gibi bir isim
  kullanılması önerilir (fixture'ın kendisi hangi marka olursa olsun aynı
  gösterilir, ama isim tutarlılığı sunumu güçlendirir).
- [ ] `/plan`'daki UGC seçimi sayfa yenilenince kaybolur — canlı demoda
  checkbox'ları görüşme SIRASINDA işaretle, önceden değil.
  Sayfa yenilenirse (kaza, F5, tarayıcı kapanması) seçim baştan yapılmalı.
- [ ] `APP_MODE=demo` olduğundan emin ol — üretim ortamında yanlışlıkla
  `live` moda geçilmişse gerçek para harcanabilir/gerçek servisler çağrılabilir.
- [ ] Ağ sekmesi (DevTools) açık tutulabilir — dış servise sıfır istek
  gittiğini canlı gösterme fırsatı, teknik bir izleyici için güven artırır.
- [ ] Tarayıcı diline göre değil, `TR`/`EN` düğmesiyle dil kontrolü elde —
  hangi dilde sunulacağı önceden netleştirilsin.
