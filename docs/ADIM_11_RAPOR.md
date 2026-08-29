# ADIM 11 RAPORU — satılabilir demo, uçtan uca yolculuk, deploy

Tarih: 2026-08-29 · Kaynak: `docs/BIRLESIM_PLANI.md` · önceki oturumlar:
`docs/ADIM_9_RAPOR.md`, `docs/ADIM_10_RAPOR.md`

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — kök adres + kullanıcı yolculuğu testi | ✅ Tamam | `49a3a02` |
| FAZ B — demo hikâye tutarlılığı | ✅ Tamam (fixture değişikliği gerekmedi) | `27a4081` |
| FAZ C — deploy | ⚠ Kısmi — canlı URL çalışıyor, erişim kontrolü (C2) AÇIK | `4846def`, `3eda6b5` |
| FAZ D — demo senaryosu | ✅ Tamam | `0526a26` |
| FAZ E — kapanış | Bu belge | — |

**Son kapı durumu (bu oturumun son çalıştırması):**

```
tsc      EXIT=0   (çıktı yok)
build    EXIT=0   / artık ƒ (dinamik) — adım 1 iskeletinin yerini aldı
lint     EXIT=0   (çıktı yok)
test     EXIT=0   16 dosya, 416 test
test:e2e EXIT=0   5 dosya, 5 test — journey/plan/settings×2/smoke
```

---

## FAZ A — kök adres + kullanıcı yolculuğu testi

`app/(marketing)/page.tsx` artık adım 1'in iskelet placeholder'ı değil:
oturum varsa `/dashboard`'a, yoksa `/login`'e yönlendiriyor
(`getUser()` — `getSession()` değil, proxy.ts'in kararıyla aynı desen).
`components/app/screen-stub.tsx` silindi — adım 10 sonunda hiçbir ekranın
kullanmadığı, sıfır referanslı bir adım 1 artığıydı (doğrulandı:
`grep -rln "ScreenStub|screen-stub"` yalnızca kendi tanım dosyasını ve
`smoke.spec.ts`'in açıklayıcı yorumunu buluyordu).

**Rota envanteri** — `app/` altındaki her dosya ya gerçek bir ekran ya
bilinçli bir yönlendirme/route handler:

| Rota | Tür |
|---|---|
| `/` | Yönlendirme → `/dashboard` veya `/login` |
| `/login`, `/signup` | Gerçek ekran |
| `/logout` | Route handler (oturum sonlandırma) |
| `/onboarding` | Gerçek ekran (ilk marka oluşturma) |
| `/auth/callback` | Route handler (OAuth/email onay callback) |
| `/dashboard`, `/plan`, `/queue`, `/studio`, `/studio/personas`, `/analytics`, `/settings` | Gerçek ekran, guard'lı |

Adım 1'den kalan başka artık yok.

### `journey.spec.ts` — tam çıktı (bu oturumun son koşusu)

```
Running 5 tests using 1 worker

[kayıt] Supabase e-posta kotası dolu — hesap service-role ile kuruldu (form denemesi gerçekti).
[ağ raporu] yolculuk boyunca yabancı köke giden 0 bekleniyor, izinli kökler: localhost, osxpcyzohmlgxkzbirci.supabase.co
  ✓  1 [chromium] › e2e/journey.spec.ts:43:7 › journey — kök adresten kayıt olup ürünün tamamını gezme › / → /login → kayıt → onboarding → dashboard/plan/studio/queue/analytics/settings (15.9s)
  ✓  2 [chromium] › e2e/plan.spec.ts:10:7 › plan › ufuk geçişi slot sayısını değiştirir, UGC seçim sayacı doğru sayar (5.0s)
  ✓  3 [chromium] › e2e/settings.spec.ts:21:7 › settings — marka profili › form kaydediyor, sayfa yenilendiğinde değerler geliyor (7.2s)
[RLS kanıtı] update sonucu — error: null etkilenen satır: 0
  ✓  4 [chromium] › e2e/settings.spec.ts:95:7 › settings — marka profili › ⭐ RLS kanıtı — başka bir kullanıcının markasına yazma denemesi tutmaz (2.3s)
[ağ raporu] toplam istek: yabancı köke giden 0 bekleniyor, izinli kökler: localhost, osxpcyzohmlgxkzbirci.supabase.co
  ✓  5 [chromium] › e2e/smoke.spec.ts:30:7 › smoke — giriş ve altı modül › giriş yapar, her modüle gider, ScreenStub durumu doğru, ağ dışarı çıkmaz (13.6s)

  5 passed (48.6s)
```

**Gerçek bir bulgu, düzeltildi:** Supabase'in dahili e-posta gönderim
kotası doğrulandı — `/auth/v1/signup`'a doğrudan istekte
`over_email_send_rate_limit` (HTTP 429) döndü. `journey.spec.ts` kayıt
formunu GERÇEKTEN gönderiyor; kota açıksa "e-postana bak" ekranı görünür,
doluysa form kendi `errGeneric` mesajını gösterir (çökme değil) ve test
hesabı `global-setup.ts` ile aynı service-role kısayoluna düşer. Test
hesabı her koşuda silindi (bu oturumda doğrulandı: koşu sonrası
`e2e-journey`/`e2e-diag` desenli sıfır hesap kaldı).

---

## FAZ B — demo hikâye tutarlılığı

Tam rapor: `docs/demo/TUTARLILIK.md`. Altı ekranın gerçek ekran görüntüsü
(`docs/demo/*.png`, `next dev` + Playwright ile çekildi) altı kontrol
maddesine karşı doğrulandı. **Hiçbir tutarsızlık bulunmadı, fixture
değişikliği gerekmedi** — adım 6'nın kurduğu çapraz referanslama
(zincir/dedupe/media_jobs) bu denetimden değişmeden çıktı. Tek not:
`/analytics`'in en iyi performansı `/queue`'da görünmüyor ama bu bir hata
değil — `/queue` bilinçli olarak yalnızca bekleyen işlem hattını gösteriyor,
geçmiş yayınları değil (mimari doğru, `TUTARLILIK.md` §3'te detaylı).

---

## FAZ C — deploy

**Canlı URL:** https://app-gold-one-92.vercel.app (Vercel projesi:
`erenkaraaa47-6504s-projects/app`)

**Yapılanlar:**
- Vercel CLI kuruldu (`npm i -g vercel`), hesap zaten bağlıydı
  (`erenkaraaa47-6504`).
- Proje linklendi, Node.js sürümü **22.x**'e sabitlendi (ADIM_27 B2'nin
  uyardığı yerel v23/paket >=22.22.2 <23 uyuşmazlığı Vercel tarafında
  kapatıldı — `vercel project update app --node-version 22.x`).
- `content_language` migrasyonu zaten `00_schema.sql`'de (satır 120 temel
  kolon, satır 127-135 idempotent `ALTER ... ADD COLUMN IF NOT EXISTS`) —
  ek değişiklik gerekmedi.
- Gerekli env değişkenleri prod+preview'a yazıldı: `APP_MODE`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PERSONA_PIPELINE_ENABLED`,
  `PERSONA_PHONE_EFFECT`, `NEXT_PUBLIC_APP_URL`. AI sağlayıcı anahtarları
  BİLEREK yazılmadı — §1.12 kararı gereği `provider_credentials` +
  Vault'ta yaşıyorlar, env'de değil.
- İlk deploy 500 verdi (`NEXT_PUBLIC_SUPABASE_ANON_KEY` eklenirken CLI'nin
  "bu bir kimlik bilgisi gibi görünüyor, `--type` belirt" güvenlik
  duraklaması sessizce başarısız olmuştu) — teşhis edildi (`vercel logs`),
  `--type config` ile düzeltildi, yeniden deploy edildi.

**Canlı doğrulama (bu oturumda, gerçek istekle):**
- `/` → `/login` (HTTP 307) ✓
- Altı ekran de giriş sonrası HTTP 200, ekran görüntüleri
  `docs/demo/live-*.png` ✓
- `DemoBanner` görünüyor: *"DEMO — ekrandaki veriler örnektir, gerçek
  hesabına ait değildir."* ✓
- Tüm yolculuk boyunca yabancı köke giden istek: 0 ✓
- Üretim JS bundle'ında `sm:mode:` dizesi: **yok** (canlı `_next/static`
  chunk'ları indirilip grep'lendi — ADIM_8 A3 kontrolü tekrarlandı) ✓
- `select jobname, active from cron.job` → 5 satır, hepsi `active = false`
  (doğrudan `psql` ile, Supabase'e) ✓

### ⚠ AÇIK — C2, erişim kontrolü YAPILMADI

Görev (a) seçeneğini işaret ediyordu (Supabase'de public sign-up'ı
kapatmak — en basit, müşteri başına hesap açma senaryosuna zaten uygun).
**Bunu ben yapamadım:** `.env.local`'daki `SUPABASE_SERVICE_ROLE_KEY`
yalnızca proje veri/Auth API'sini kapsıyor; sign-up'ı açık/kapalı yapan
ayar Supabase'in proje düzeyi Management API'sinde/Dashboard'unda —
buraya bir kişisel erişim jetonu (personal access token) olmadan
ulaşılamıyor, `.env.local` bunu içermiyor.

**Kanıt — şu anda GERÇEKTEN açık:** `journey.spec.ts`'in ilk koşusu
(bu raporun FAZ A bölümü) gerçek `/signup` formunun gerçek bir hesap
oluşturmaya çalıştığını ve kota izin verdiğinde "e-postana bak" ekranına
düştüğünü kanıtladı — yani sign-up bugün itibarıyla engellenmemiş durumda.

**Kapatmak için (Supabase Dashboard, elle):**
1. https://supabase.com/dashboard/project/osxpcyzohmlgxkzbirci/auth/providers
2. **Email** sağlayıcısını aç, *"Allow new users to sign up"* (veya güncel
   Supabase sürümünde *Authentication → Sign In / Providers → Email →
   Enable sign ups*) anahtarını **kapat**.
3. Doğrulama: `/signup`'a git, formu doldur, gönder — `errGeneric`
   (*"Bir şeyler ters gitti"*) veya benzeri bir ret mesajı görünmeli,
   hesap oluşmamalı.

Bu kapatılana kadar **canlı URL'i müşteriyle paylaşma** — şu an herkes
kayıt olabilir.

---

## FAZ D — demo senaryosu

Tam belge: `docs/DEMO_SENARYOSU.md`. Özet:
- **Sıra:** login → dashboard → plan (+ devam zinciri) → studio (+ çalışan
  iş) → queue (+ tekrar önleme + çifte yayın kilidi) → analytics (+ final
  rozeti) → settings. Her adımda söylenecek cümle + dikkat çekilecek somut
  detay tablo hâlinde.
- **MVP eşlemesi:** içerik planlama→`/plan`, UGC video→`/studio`, otomatik
  paylaşım→`/queue`, tekrar önleme+devam zinciri→`/queue`, geçmişe göre
  üretim→`/analytics`.
- **Dürüstlük bölümü:** UGC videoları gerçek değil, AI planı demo modda
  sabit, `/plan`↔`/studio` UGC seçimi köprüsü yok (adım 14), Instagram
  bağlanamıyor (adım 16-17), `/settings` entegrasyon+anahtar bölümü yok
  (adım 13), fiyatlandırma henüz belirlenmedi.
- **SSS:** video/Instagram/maliyet/verim/sayfa-yenileme soruları — cevaplar
  kod ve fixture'dan, uydurulmadı.
- **Kontrol listesi:** en kritik bulgu — **Supabase'de şu an sıfır kullanıcı
  var**, sunumdan önce kalıcı bir demo hesabı elle kurulmalı (şifre depoya
  YAZILMADI, parola yöneticisinde tutulmalı).

---

## FAZ E — kapanış

### `grep -rn "ScreenStub" app/ components/` → sıfır ✅

### `grep -rn "NOT_IMPLEMENTED" lib/adapters/live/` — beklenen liste

12 portun tamamı `lib/adapters/live/*.ts`'te `NOT_IMPLEMENTED` atıyor.
Hangi adımda gerçek implementasyon alacakları §12'nin kendi tablosundan:

| Port | Adım | Not |
|---|---|---|
| `PlannerPort`, `CopyPort` | 14 | LIVE #1 — Anthropic |
| `DedupePort` | 15 | Tekrar önleme motoru |
| `ChannelPort` | 16 | LIVE #2 — Instagram bağlama |
| `PublisherPort` | 17 | LIVE #3 — yayın |
| `MetricsPort` | 18 | Metrik toplama + geri besleme |
| `StoragePort` | 19 | Medya köprüsü + storage (SSRF allowlist) |
| `ImagePort`, `VideoPort`, `VoicePort` | 20 | LIVE #4 — UGC boru hattı |
| `ContentPort`, `BrandPort` | — | §12'de tek bir "LIVE #" adımına bağlanmıyor; her live özellik (14/15/17/18) kendi ihtiyacı olan okuma/yazmayı gerçek implementasyona taşıdıkça artımlı olarak dolacak — bunu şimdiden tek bir adıma iddia etmek uydurma olurdu |

### Kapsam raporu

FAZ A, B, D tamamlandı ve commit edildi. FAZ C'nin altyapı kısmı
(deploy, Node sürümü, env, cron/bundle doğrulaması) tamamlandı ve commit
edildi; **erişim kontrolü (C2) açık** — yukarıdaki üç adım elle
tamamlanmalı.

### FAZ 1 kapanış beyanı — hangi MVP vaadi demoda görünüyor

| Vaat | Demoda görünüyor mu | Nerede |
|---|---|---|
| İçerik planlama | ✅ | `/plan` (demo modda sabit örnek plan, gerçek model çağrısı adım 14) |
| UGC video | ⚠ Kısmen | `/studio` boru hattı gerçek, çıktı placeholder poster (S5 kararı) |
| Otomatik paylaşım | ✅ | `/queue` (onay + çifte yayın kilidi gösteriliyor, gerçek yayın adım 17) |
| Tekrar önleme + devam zinciri | ✅ | `/queue` (`duplicate_blocked` kartı + 3 halkalı zincir, ikisi de canlı mantıkla — demo modda sabit veri üzerinden) |
| Geçmiş performansa göre üretim | ✅ | `/analytics` (final/d1 rozetleri, D1 kararının okuma mantığı gerçek, veri demo) |

Görünmeyenler: kanal bağlama (`/channels`, 11b), elle içerik yazma
(`/composer`, 11b), medya kütüphanesi (`/library`, 11b), API anahtarı
girişi (`/settings` entegrasyon bölümü, adım 13), gerçek AI/video/yayın
çağrıları (adım 14/17/20).

### FAZ 2'ye (adım 12, iş kuyruğu) geçmeden bilmem gerekenler

1. **C2 kapatılmadan canlı URL paylaşılmamalı** — yukarıdaki üç adım.
2. **Kalıcı demo hesabı yok** — sunumdan önce elle kurulmalı
   (`DEMO_SENARYOSU.md` kontrol listesi).
3. `/plan`↔`/studio` kopukluğu bilinçli ve adım 14'ün kapsamında; adım
   12'nin (iş kuyruğu) bunu kapatması BEKLENMİYOR — karıştırılmamalı.
4. Cron job'lar hâlâ pasif (`active=false`, 5/5) — adım 17'nin işi,
   deploy bunu değiştirmedi, tekrar doğrulandı.
5. Vercel projesi `erenkaraaa47-6504s-projects/app` adıyla oluştu (dizin
   adından otomatik) — marka adı netleşince (§11 S1 hâlâ AÇIK) yeniden
   adlandırma `vercel project rename` ile tek komut.
