# Demo senaryosu — müşteri görüşmesi sunum planı

BIRLESIM_PLANI §12 adım 11 FAZ D, **11b'de güncellendi (2026-09-05)**,
**17a'da yeniden güncellendi (2026-09-07)**. Bu bir pazarlama metni değil,
ekranda gezinirken TAKİP EDİLECEK bir yol haritası. Kanıtlar
`docs/demo/TUTARLILIK.md`, `docs/ADIM_11b_RAPOR.md`, `docs/ADIM_17a_RAPOR.md`
ve o dosyaların referans aldığı ekran görüntülerinden.

**Neden bu güncelleme gerekti:** adım 11'de yazıldığında hiçbir şey canlı
değildi — `/plan`, `/studio`, tekrar önleme, hepsi demo fixture'ıydı. Adım
13-15 ve 19-20 arasında AI planlama, UGC boru hattı, medya köprüsü ve API
anahtarı yönetimi GERÇEK oldu (müşterinin kendi anahtarıyla, canlı modda).
Adım 11b üç yeni ekran ekledi. **Adım 17a "otomatik paylaşım" vaadini de
gerçeğe çevirdi** — ama Instagram'ı DEĞİL: Instagram hâlâ Meta App Review
bekliyor (adım 16/17b, postponed). 17a onay gerektirmeyen bir platformla
(Bluesky, AT Protocol) hattın KENDİSİNİ kanıtladı — kanal bağlama, çifte
yayın kilidi, cron aktivasyonu, gerçek bir otomatik yayın. ⚠ **Müşteriye
net söylenmeli: Bluesky, Instagram'ın YERİNE GEÇMİYOR — hattın çalıştığının
kanıtı. Müşteri Instagram bekliyor**, o adım 16/17b'de (Meta onayına bağlı)
gelecek; o geldiğinde AYNI hat (`PublisherPort`, `publishing` kilidi, cron)
ikinci bir adaptörle Instagram'ı da taşıyacak — sıfırdan yazılmayacak.

---

## 1. Sıra — hangi ekran, hangi sırayla, neden

Ürünün kendi döngüsünü takip ediyoruz: **plan → yaz/üret → onayla → ölç →
tekrar planla**, sonra kanal/kütüphane/ayarların "arka plan" ekranları.
`/dashboard`'la başlamıyoruz çünkü takvim ürünün NE yaptığını değil, NEYİ
TUTTUĞUNU anlatır; müşteri önce "nasıl çalışıyor" sorusunun cevabını görmeli.

| # | Ekran | Ne söylenecek | Dikkat çekilecek somut detay |
|---|---|---|---|
| 1 | `/login` → `/dashboard` | "Giriş her modda gerçek — demo yalnızca içeriği örnekliyor, hesabı değil." | `DemoBanner` her ekranda sabit duruyor, kapatılamıyor — "gösterdiğimiz sayılar örnek" dürüstlüğü |
| 2 | `/dashboard` | "Kabuk burada — bu ay planlanan, onay bekleyen, yayınlanan, erişim. Sağda son hareketler akışı." | "Kuyruğa alındı", "Onaylandı" gibi satırlar insan + otomasyonun birlikte çalıştığını gösteriyor |
| 3 | `/plan` | "Marka profilinden AI bir haftalık/aylık ritim üretiyor. Ufku değiştirdiğimde slot sayısı değişiyor." | 1 haftalık ufuk her zaman 8 slot; UGC seçim sayacı tersinir (seç/geri al/temizle) |
| 4 | `/plan` → **Devam eden zincirler** kartı | "Yeni bir fikir planlamadan önce motor, bunun önceki bir serinin devamı olup olmadığına bakıyor." | "Ekipman rehberi 1 → 2 → 3" — üçüncü halka henüz sırada, ilk ikisi yayında |
| 5 | `/composer` **(yeni, 11b)** | "Bazı içerikleri AI değil, siz yazmak isteyebilirsiniz — burada elle yazıyorsunuz, kaydettiğiniz an gerçek bir satır." | Aynı başlık+kancayı iki kez yazmayı deneyin — motor engellemez ama uyarır: "bilinçli tekrar" insan kararı, otomasyon kararı değil |
| 6 | `/studio` | "Seçilen içerik için persona görseli → seslendirme → persona videosu → dudak senkronu dört adımlı boru hattı — bu artık GERÇEK: kendi Kie/ElevenLabs/fal anahtarınızla çalışır." | Kredi tablosu gerçek vendor rakamları — icat edilmiş fiyat yok; demo modda çıktı placeholder poster (S5 kararı — stok video kullanmadık) |
| 7 | `/studio` → çalışan iş | "Bu iş şu an gerçekten `running` — sahte ilerleme çubuğu yok, `media_jobs` tablosunun ham durumu." | Aynı içerik `/queue`'da da "Video üretiliyor (1/2)" olarak görünüyor — tek gerçek kaynak |
| 8 | `/library` **(yeni, 11b)** | "Üretilen her görsel/video/ses burada — kalıcı depoda, yalnızca bu markaya ait." | Bir dosyayı silin — hem önizleme hem depolama nesnesi birlikte gider, yetim kalmaz |
| 9 | `/queue` | "İnsan onayı burada. Otomasyon hiçbir şeyi habersiz yayınlamıyor." | Üstteki "Tekrar önleme" kartı — motor bir fikri parmak izi eşleşmesiyle engellemiş, gerekçesini gösteriyor |
| 10 | `/queue` → yayınlanıyor satırı | "Çifte yayın kilidi — aynı gönderi iki kez atılamaz. Bluesky'de bu artık gerçek: iki eşzamanlı worker denesin, gönderi bir kez çıkıyor." | "Yayınlanıyor — kilitli" rozeti; yayınlanan bir Bluesky gönderisi kartta gerçek platform bağlantısı gösteriyor (**yeni, 17a**) |
| 11 | `/channels` **(11b'de kabuk, 17a'da Bluesky gerçek)** | "Bluesky'ye şimdi gerçekten bağlanabiliyoruz — uygulama şifresi, onay/inceleme yok. Instagram hâlâ Meta'nın App Review'unu bekliyor, o kart dürüstçe devre dışı." | Bluesky kartında gerçek bir form (kullanıcı adı + uygulama şifresi) — sahte OAuth YOK, gerçek `createSession`; Instagram kartı hâlâ "Meta İş Hesabı gerekir" diyor, disabled |
| 12 | `/analytics` | "Yayınlanan içerik geri dönüyor: erişim, etkileşim, en iyi saatler ısı haritası." | "final" / "d1" rozetleri — 30 günlük toplama bitmiş mi, hâlâ sürüyor mu, ikisi de plana geri besleniyor |
| 13 | `/settings` | "Marka profili `/plan`'ın çıktısını doğrudan iyileştiriyor. Alttaki entegrasyon bölümünde kendi AI anahtarınızı giriyorsunuz — 'Test et' gerçek bir doğrulama çağrısı yapıyor." | Profil tamamlanma yüzdesi canlı güncelleniyor; anahtar girilince maskeli önizleme, ham anahtar EKRANA hiç yazılmıyor |

**Kapanış cümlesi önerisi:** "Az önce gezdiğiniz on üç ekran tek bir demo
senaryosu değil — aynı marka, aynı içerik kimlikleri, aynı zaman çizelgesi.
Kendi API anahtarınızı girdiğiniz an, planlama ve UGC üretimi gördüğünüz
gibi GERÇEKTEN çalışır — bir müşteriye gösterdiğimizde gördükleri kurgu
değil, ürünün gerçekten yapacağı şey."

---

## 2. MVP maddelerinin karşılığı

| Vaat | Nerede kanıtlanıyor | Nasıl | Durum |
|---|---|---|---|
| İçerik planlama | `/plan` | AI, marka profilinden haftalık/aylık slot planı üretiyor | ✅ **GERÇEK** canlı modda (Anthropic, kendi anahtarınız) — demo modda sabit örnek |
| Elle içerik yazma | `/composer` **(yeni, 11b)** | Form → gerçek `content_items` satırı → `/queue`'da görünür | ✅ **GERÇEK, her modda** — AI üretmiyor, taklit edecek bir şey yok |
| UGC video | `/studio` | Persona → ses → video → dudak senkronu dört adımlı boru hattı | ✅ **GERÇEK** canlı modda (Kie/ElevenLabs/fal) — demo modda çıktı placeholder poster |
| Medya kütüphanesi | `/library` **(yeni, 11b)** | Üretilen/yüklenen her dosya, marka izole, silinebilir | ✅ **GERÇEK, her modda** |
| Otomatik paylaşım | `/queue` | Onaylanan içerik zamanlanmış saatte yayınlanıyor | ✅ **GERÇEK (Bluesky, adım 17a)** — cron (`sm-publish`+`sm-worker`) zamanı gelen içeriği ELLE tetiklenmeden yayınlıyor, kanıt `docs/ADIM_17a_RAPOR.md` FAZ C; ⚠ Instagram hâlâ postponed (adım 16/17b, Meta App Review) |
| Kanal bağlama | `/channels` | Bağlı kanalların listesi, durum, son yenileme | ✅ **GERÇEK (Bluesky, adım 17a)** — uygulama şifresiyle, onay gerekmez; ⚠ Instagram hâlâ kabuk (OAuth adım 16, Meta onayı bekliyor) |
| Tekrar önleme + devam zinciri | `/queue`, `/composer` | Fingerprint eşleşmesi engelliyor (composer'da uyarıyor); devam zinciri elle işaretlenebiliyor | ✅ **GERÇEK katman 1** (birebir); ⚠ katman 2 (anlamsal benzerlik) Voyage entegre edilmediği için kapalı |
| API anahtarı yönetimi | `/settings` | Kaydet/sil/test et — Vault'ta saklanıyor | ✅ **GERÇEK, her modda** |
| Geçmişe göre üretim | `/analytics` | "final"/"d1" rozetli metrikler, en iyi saatler ısı haritası | ⚠ **Demo veri** — okuma mantığı gerçek (D1 kararı), gerçek metrik toplama adım 18 (postponed) |

---

## 3. Dürüstlük bölümü — bugün GERÇEKTEN çalışan ve hâlâ demo/eksik olan

Müşteriye açıkça söylenecekler; sorulmadan da erkenden söylemek güven inşa
eder. **Adım 11'den beri değişenler kalın işaretli.**

- **UGC boru hattının KENDİSİ artık gerçek (11b'den önce, adım 20).**
  Kendi Kie/ElevenLabs/fal anahtarınızı `/settings`'e girip canlı moda
  geçtiğinizde persona görseli, seslendirme, persona videosu ve dudak
  senkronu GERÇEKTEN üretilir, gerçek kredi harcanır. **Demo modda** hâlâ
  statik poster + "demo çıktı" rozeti gösteriyoruz (S5 kararı — stok
  pazarlama videosu kullanmadık, gösterdiğimiz her şey ya kendi kurgumuz
  ya da placeholder). Ayrım artık "boru hattı yok" değil, "demo modda
  vendor çağrılmıyor".
- **AI planı demo modda hâlâ sabit; canlı modda GERÇEK (adım 14).**
  `/plan`'daki "Planı üret" butonu demo modda görsel olarak çalışıyor ama
  gerçek bir model çağrısı yapmıyor. Canlı modda gerçek bir Anthropic
  çağrısıdır, kendi anahtarınızla.
- **`/plan`'daki UGC seçimi artık KALICI (adım 20 FAZ C1'de kapatıldı).**
  Eskiden React state'te yaşayıp sayfa değişince kaybolan bir kopukluktu;
  artık `activity` tablosuna yazılıyor ve `/studio`'nun "üretim sırası"
  bölümünde gerçekten görünüyor.
- **Instagram'a hâlâ bağlanılamaz — Bluesky'ye ARTIK bağlanılabiliyor
  (adım 17a).** Neden Instagram farklı: Meta, bir uygulamanın müşteri
  hesaplarına Instagram Graph API ile bağlanabilmesi için **App Review**
  onayı istiyor; bu onay bu depodaki bir kod değişikliğiyle değil, Meta'nın
  kendi süreciyle geliyor. MVP planı bu aralıkta tek bir Meta uygulaması
  üzerinden **tester** eklemeyi öngörüyor (~25 tester sınırı) — App Review
  paralelde ilerliyor. **Ne zaman:** belirsiz, Meta'nın onay süresine bağlı.
  Bluesky'nin OAuth'u YOK (uygulama şifresi yeterli) — bu yüzden yayın
  hattının KENDİSİ (kanal bağlama, `publishing` kilidi, cron) Instagram'ı
  beklemeden, adım 17a'da kanıtlandı. Instagram App Review çıktığında adım
  16/17b aynı hatta İKİNCİ bir `PublisherPort` adaptörü olarak eklenecek.
- **`/settings`'in entegrasyon ve API anahtarı bölümü artık VAR (adım 13,
  20.5'te tamamlandı).** Müşteri kendi anahtarını girer, "Test et" gerçek
  bir doğrulama çağrısı yapar (en ucuz uç nokta — üretim başlatmaz).
- **Tekrar önleme bugün yalnızca birebir kopyaları engelliyor, anlamsal
  benzerleri DEĞİL (adım 15).** Üç katman: (1) birebir parmak izi — her
  zaman açık, ücretsiz, hem `/plan`'ın otomatik üretiminde hem
  `/composer`'ın elle yazımında çalışıyor; (2) anlamsal benzerlik
  (embedding) — Voyage anahtarı hiçbir markada GİRİLMEDİ, bugün KAPALI;
  (3) otomatik "devam mı?" kararı katman 2'ye bağlı, o kapalı olduğu için
  hiç TETİKLENMİYOR. Devam zinciri (`parent_id`) hem `/plan`'da hem
  `/composer`'da (11b) ELLE kurulabiliyor — otomatik öneri değil, bilinçli
  bir kullanıcı kararı.
- **`/composer`'da bilinçli bir tekrar UYARIR, ENGELLEMEZ (11b'nin kendi
  kararı).** Otomasyon (plan üretici) 7-30 satırı toplu ürettiği için
  "reddet" doğru; tek satır elle yazan bir insan bilinçli tekrar isteyebilir
  (mevsimlik hatırlatma, varyasyon) — kaydı geçirir, yalnızca uyarır.
- **Otomatik paylaşım Bluesky'de artık GERÇEK (adım 17a) — Instagram'da
  hâlâ postponed (adım 16/17b, Meta App Review bekliyor).** Çifte yayın
  kilidi, kuyruk, cron (`sm-worker`/`sm-reaper`/`sm-publish`) üçü de
  üretimde aktif ve gerçek bir Bluesky hesabına GERÇEKTEN yayın yaptı —
  hiçbir manuel tetikleme olmadan (kanıt: `docs/ADIM_17a_RAPOR.md` FAZ C).
  Instagram'a GERÇEKTEN basma adım 16'nın (bağlama) ardından gelecek; hat
  zaten hazır, yalnızca ikinci bir adaptör eklenecek.
- **Gerçek metrik toplama hâlâ yok (adım 18, postponed).** `/analytics`'in
  okuma mantığı (final/d1 ayrımı, D1 kararı) gerçek ve test edilmiş;
  besleyeceği veri bugün demo fixture.
- **Fiyatlandırma henüz yok.** `/studio`'daki kredi tablosu bizim vendor
  maliyetimiz (aşağıdaki §4'e bakın) — müşteriye yansıyacak paket fiyatı
  henüz belirlenmedi.

---

## 4. Sık gelecek sorular

**"Videolar gerçek mi?"**
Boru hattının kendisi evet — kendi Kie/ElevenLabs/fal anahtarınızla canlı
modda gerçek bir persona videosu üretilir, gerçek kredi harcanır. Bu
DEMO'da (kendi anahtarınızı girmeden) gösterdiğimiz çıktı bir placeholder
poster; canlı moda geçtiğiniz an aynı ekran gerçek üretim yapar.

**"Instagram'a şimdi bağlanabilir miyim?"**
Henüz değil. Kimlik doğrulama her modda gerçek ama Instagram'a bağlanmak
Meta'nın App Review onayını gerektiriyor — bu bizim kod hızımıza değil
Meta'nın süreç takvimine bağlı. `/channels` ekranı bugün bu bekleyişin
kabuğunu gösteriyor: hangi platformların desteklendiği, her biri için ne
gerektiği açıkça yazılı, sahte bir "bağlandı" görüntüsü YOK.

**"Bluesky'ye bağlanabiliyorsak Instagram'a neden bağlanamıyoruz?"**
Bluesky'nin OAuth'u yok — bir kullanıcı adı + tek kullanımlık uygulama
şifresiyle bağlanılıyor, hiçbir üçüncü tarafın onayı gerekmiyor. Instagram
Graph API'ye bağlanmak Meta'nın kendi onay sürecini (App Review) istiyor;
bu bizim kontrolümüzde değil. Bluesky'yi bilerek seçtik çünkü Instagram'ı
TAKLİT ETMİYOR — yayın hattının kendisini (kanal bağlama, çifte yayın
kilidi, otomatik zamanlanmış yayın, cron) Instagram'dan bağımsız GERÇEK
bir platformla kanıtlıyor. Instagram bu ürünün müşteriye asıl vaadi ve
gelecek — Bluesky onun YERİNE geçmiyor, hattın önceden çalıştığının
kanıtı.

**"Maliyeti ne?"**
Paket fiyatı henüz netleşmedi (kendi ürünümüzün fiyatı). Ama üretim başına
GERÇEK vendor maliyetini biliyoruz (`docs/UGC_MALIYET_NOTU.md`, canlı
ölçülmüş):

| | Birim | Maliyet |
|---|---|---|
| Persona görseli (kurulum, bir kez) | kare başına | 24 Kie kredisi |
| Persona videosu (5sn, `pro` mod) | klip başına | 135 Kie kredisi |
| Seslendirme | — | 0 ek maliyet (ElevenLabs abonelik dahilinde) |
| Dudak senkronu | dakika başına | ~$5/dk → 5sn klip ≈ $0.42 |

30 video/ay senaryosu: ~4.074 Kie kredisi + ~$12.60 (fal) — persona görseli
ayda bir kez sayılıyor. **Kie kredisinin dolar karşılığı bu notta bilinçli
olarak BOŞ** — Kie'nin kredi/$ oranı doğrulanamadı, müşteriye "1 kredi = X
dolar" gibi bir rakam UYDURULMADI; bu bilgi Kie'nin kendi faturalama
panelinden alınmalı. Tam tablo ve varsayımlar `docs/UGC_MALIYET_NOTU.md`'de.

**"Verim (AI planlama) nerede duruyor?"**
`/analytics`'teki "final" ve "d1" rozetleri — 30 gün toplaması bitmiş
içerik "final" ağırlığıyla, hâlâ toplanan içerik "d1" ağırlığıyla bir
sonraki `/plan` çağrısına geri besleniyor (D1 kararı, `content_metrics`).
Okuma mantığı gerçek; besleyeceği gerçek metrik toplama (adım 18) henüz yok,
bugün demo veriyle gösteriyoruz.

**"Sayfayı yenilersem ne olur?"**
Marka profili, onaylar, plan/queue/studio/library/analytics verisi, elle
yazılan composer içeriği — hepsi demo fixture'ından ya da gerçek
veritabanından geliyor, kaybolmaz. (Adım 11'de burada "UGC seçimi kaybolur"
uyarısı vardı — o kopukluk adım 20 FAZ C1'de kapatıldı, artık kalıcı.)

---

## 5. Sunum öncesi kontrol listesi

- [ ] **Kayıt kapalı — bu güncellemede doğrulandı.** Supabase Auth'a
  doğrudan istekle (`/auth/v1/signup`) test edildi: `signup_disabled`
  (422) dönüyor. ADIM_11'in açık bıraktığı C2 maddesi kapanmış durumda —
  ne zaman/kim tarafından kapatıldığı bu oturumda dokümante edilmedi
  (elle, Supabase panelinden yapılmış olmalı), ama şu an KAPALI.
- [ ] **Bir hesap zaten var.** Veritabanında tek kullanıcı (`eren@gmail.com`,
  marka: "Carino Pizza") — bu, canlı vendor testleri için kurulmuş
  görünüyor (bkz. `verify.live.test.ts`'in referans aldığı marka adı),
  müşteri sunumu için ayrılmış bir hesap OLMAYABİLİR. Sunumdan önce hangi
  hesapla gireceğinizi netleştirin: bu hesabı mı kullanacaksınız (gerçek
  vendor anahtarları girilmiş olabilir — dikkatli olun, gerçek üretim
  tetiklemeyin), yoksa ayrı, temiz bir demo hesabı mı kuracaksınız.
  Şifreyi bu depoya YAZMA — parola yöneticisinde tut.
- [ ] `/plan`'daki UGC seçimi artık KALICI (yukarıya bakın) — sayfa
  yenilenmesinden korkmanıza gerek yok, ama `/composer`'da yazdığınız
  taslak metinler de aynı şekilde kalıcı; sunum öncesi test verisi
  bıraktıysanız temizleyin (`/library`'den silin, `/queue`'dan arşivleyin).
- [ ] `APP_MODE=demo` olduğundan emin ol — üretim ortamında yanlışlıkla
  `live` moda geçilmişse gerçek para harcanabilir/gerçek servisler
  çağrılabilir. Bu güncellemede `vercel env ls production`'da `APP_MODE`
  hâlâ `Secret` tipinde ve production'a atanmış durumda doğrulandı.
- [ ] Ağ sekmesi (DevTools) açık tutulabilir — dış servise sıfır istek
  gittiğini canlı gösterme fırsatı, teknik bir izleyici için güven artırır.
- [ ] Tarayıcı diline göre değil, `TR`/`EN` düğmesiyle dil kontrolü elde —
  hangi dilde sunulacağı önceden netleştirilsin.
- [ ] ⚠ **Cron artık KISMEN AKTİF (adım 17a'dan beri)** —
  `sm-worker`/`sm-reaper`/`sm-publish` ÜÇÜ de üretimde ÇALIŞIYOR
  (`sm-metrics`/`sm-token-refresh` hâlâ pasif, kendi rotaları yok). Bu,
  sunumda EL DEĞMEDEN çalışan gerçek bir otomasyon var demek: bağlı bir
  Bluesky hesabına zamanlanmış bir gönderi bırakırsanız `sm-publish` +
  `sm-worker` onu birkaç dakika içinde GERÇEKTEN yayınlar — kontrolsüz bir
  demo ortamında bunu BEKLENMEDİK bir yayın olarak GÖRMEYİN, tasarım gereği.
  Kill switch: `select cron.alter_job(jobid, active:=false) from cron.job
  where jobname like 'sm-%';` — tek komutla hepsini anında durdurur.
