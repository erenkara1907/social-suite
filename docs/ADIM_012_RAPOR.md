# ADIM 0-1-2 RAPORU — iskelet ve şema

Tarih: 2026-08-27
Kapsam: FAZ 0 (plan revizyonu) · FAZ 1 (iskelet) · FAZ 2 (şema)
Kaynak: `BIRLESIM_PLANI.md` (tek yetkili kaynak)

---

## ÖZET

| Faz | Durum | Doğrulama |
|---|---|---|
| FAZ 0 — plan revizyonu | ✅ Tamam | D1-D5 uygulandı, REVİZYON KAYDI eklendi |
| FAZ 1 — iskelet | ✅ Tamam | 6 kapının 6'sı geçti |
| FAZ 2 — şema | ✅ Tamam | 3 kez hatasız çalıştı, eşzamanlılık testi 3 ölçekte geçti |

**Kritik uyarı (senin kararın gerekiyor):** `next@16.2.5` — planın §2.1'de
zorunlu tuttuğu sürüm — **10 adet high-severity güvenlik açığı** taşıyor.
Ayrıntı "AÇIK KONULAR" 1. maddede. Planı değiştirmedim, 16.2.5'te bıraktım.

---

## FAZ 0 — plan revizyonu

`BIRLESIM_PLANI.md` 1614 → 1940 satır. Değiştirilen bölümler:

| Düzeltme | Değişen bölümler |
|---|---|
| **D1** metrik geri beslemesi | §4f (tier semantiği), §8.3 (okuma kuralı + SQL), Akış D |
| **D2** Instagram marka bazlı | §1.12, §4e, §5 (2 yer), §7.1 |
| **D3** embedding sözleşmesi | §4c, §11 S3 |
| **D4** kritik yol daraltması | §12 tablosu, "Kritik yol" satırı, §9.2 |
| **D5** açık kararların kapanışı | §11'in tamamı (S1-S7) |
| — | Dosya sonuna **REVİZYON KAYDI** bölümü |

### §12 tablosunun değişen kısmı

| # | Adım | "Tamamlandı" kriteri |
|---|---|---|
| **8** | grup A: `/dashboard`, `/queue`, `/analytics` | 3 ekran, `APP_MODE=demo`, sıfır ağ isteği |
| **9** | grup B: `/plan` + `/settings` → **yalnızca marka formu** | Entegrasyon/anahtar bölümü bu adımda YOK |
| **10** | grup C: `/studio`, `/studio/personas` | S5 kararına göre demo video **veya placeholder** |
| **11** | **FAZ 1 KAPANIŞI — satılabilir demo** | `/plan → /studio → /queue → /analytics` kesintisiz |
| **11b** | **ERTELENEN**: `/library`, `/composer`, `/channels`, `/settings` anahtarları | Kritik yolda **değil** |

Kritik yol: `0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → (8,9,10 paralel) → 11 → 12 → 14`

**Varsayım:** ertelenen ekranları `11b` olarak ekledim, 12-22'yi yeniden
numaralandırmadım. Gerekçe: §8, §10 ve D3 metinleri adım numaralarına atıf
yapıyor; kaydırma o atıfları sessizce kırardı. Yeniden numaralandırmamı
istersen söyle.

---

## FAZ 1 — iskelet

`/Users/erenkara/Desktop/social/app/` — Next.js 16.2.5, boş kabuk.

### Doğrulama kapıları — 6/6

| Kapı | Sonuç |
|---|---|
| `npm install` | ✅ `added 498 packages`, exit 0 |
| `npm run build` | ✅ **exit 0**, `✓ Compiled successfully`, `/` prerendered |
| `npx tsc --noEmit` | ✅ **exit 0**, çıktı yok |
| `npm run lint` | ✅ **exit 0**, çıktı yok |
| `/` render | ✅ **HTTP 200**, `<title>Social Suite — Planla, üret, yayınla, ölç…</title>` |
| `grep -rn "process.env" lib/` | ✅ **kod eşleşmesi SIFIR** (yalnızca 4 README satırı) |

### Ne kuruldu

- **`package.json`** — §2.1 union'ı birebir (next 16.2.5, react 19.2.4,
  tailwind v4, @anthropic-ai/sdk, @supabase/*, @fal-ai/client, recharts…)
  + §2.2'nin "Zorunlu: Evet" satırı olan test koşucusu (vitest, jsdom,
  @testing-library/react, @vitejs/plugin-react).
- **`app.config.ts`** — `BRAND_NAME` / `BRAND_MARK` / `BRAND_HUE` tek blokta,
  `⭐ TEK DEĞİŞTİRME NOKTASI` yorumuyla işaretli (S1). `nav` statik dizi
  olmaktan çıktı → `buildNav(enabledModules)` (§1.6). `integrations` üçünün
  union'ı + voyage + instagram.
- **`app/globals.css`** — threadly'nin token **yapısı**, hue **değiştirildi**:
  290 (threadly moru) → **262**, serif 345 → 317, ilgili aile hue'ları
  tutarlı kaydırıldı. Semantik renkler (destructive 25, warning 80,
  success 152, info 240) ve uzak karolar (200/210, 110/130) **dokunulmadı**.
  `.glow` (sahne) ve `.slide-x` (siraya) eklendi, ikisi de
  `prefers-reduced-motion` bloğuna dahil.
- **`components/ui/*`** — §7.4 kararına göre: button, card, input, badge,
  icon, theme-toggle **threadly'den**; language-toggle **siraya'dan**.
  `diff` ile birebir kopyalandığı doğrulandı (2 dosya hariç — aşağıda).
  `logo.tsx` **alınmadı** (§7.4: "HİÇBİRİ", yeniden çizilecek).
- **`lib/utils.ts`** — siraya temel; ölü formatlayıcılar (`CURRENCY`,
  `formatMoney`, `formatPercent`, `initials`) **alınmadı**.
- **`lib/i18n/`** — siraya'nın sözlüğü; ölü anahtarlar (`export`, `editPost`,
  `reconnect`, `igNotConfigured`) temizlendi (213 → 209 satır).
- **`app/layout.tsx`** — ThemeProvider + LanguageProvider + 3 font.
- **7 klasör README'si** — `lib/core`, `lib/adapters`, `lib/providers`,
  `lib/server`, `app/(app)`, `app/(marketing)`, `supabase`. Her biri
  "ne girer / ne GİRMEZ" ve hangi adımda dolacağı.
- **`.env.example`** — 89 satır. Instagram anahtarları `⚠ YALNIZCA FALLBACK`
  olarak işaretli (D2); AI anahtarları için "buraya yazma,
  `provider_credentials`'a gider" bölümü var.

### ⚠ İki dosyada plandan SAPTIM — onayına sunuyorum

Görev "`components/ui/*` dosyalarını KOPYALA, gövdesini değiştirme" diyordu,
ama aynı görev "`npm run lint` temiz" de istiyordu. Bu ikisi çakıştı:

```
components/ui/theme-toggle.tsx:11          error  react-hooks/set-state-in-effect
components/i18n/language-provider.tsx:35   error  react-hooks/set-state-in-effect
```

**Bu hata benim eklediğim bir şey değil — devralınan borç.** Kaynakta da var:

```
threadly/components/ui/theme-toggle.tsx:11         aynı hata
threadly/components/i18n/language-provider.tsx:31  aynı hata
```

(threadly'nin kendi `npm run lint`'i de bu iki dosyada kırılıyor.)

React 19'un `react-hooks/set-state-in-effect` kuralı
`useEffect(() => setMounted(true), [])` desenini reddediyor. İkisini de
**davranışı koruyarak** `useSyncExternalStore`'a çevirdim:

- `theme-toggle.tsx` — `mounted` bayrağı → `useHydrated()`. Davranış birebir.
- `language-provider.tsx` — localStorage tek gerçek kaynak oldu. Davranış
  korundu; **ek kazanç**: sekmeler arası dil eşitlemesi ve storage erişimi
  kapalıyken `try/catch` ile güvenli düşme.

Her iki dosyanın başına `⚠ SAPMA` yorumu ve gerekçesi yazıldı. **Bu sapmayı
geri almamı istersen lint kapısı kırılır** — hangisini tercih ettiğini söyle.

Diğer 5 UI dosyası ve language-toggle **birebir kopya** (diff ile doğrulandı).

### S5 — video kontrolü sonucu: **STOK VİDEO, ALINMAYACAK**

Karar: **placeholder konacak, video kopyalanmayacak.**

Kanıt:

1. **İsimlendirme bir pazarlama kiti şeması:** `ad-16x9`, `ad-1x1`, `ad-9x16`,
   `beforeafter`, `dashloop`, `design`, `explainer`, `screendemo`, `social`,
   `ugc`, `walkthrough` — üç projede de **aynı 11 isim**.
2. **33 dosyanın md5'i farklı, isimleri aynı** — yani kit her marka için
   yeniden üretmiş. Ortak kaynak, marka başına render.
3. **Kare çıkarıp baktım** (`ffmpeg` ile). `ugc.mp4`'ün içeriği:
   - **sahne**: `app.sahne.studio` tarayıcı çerçevesi içinde sahne
     dashboard'ının ekran kaydı, altta `▶ sahne.studio` filigranı
   - **threadly**: **birebir aynı kompozisyon**, `app.threadly.app` yazıyor,
     altta `▶ threadly.app`, üstüne "Feed it one rough idea; get" altyazısı
   - `social.mp4`: sahte referanslar — "4.9 · 900+ ekip", "Alex R. Founder",
     "Sam T. Operator", "Mia K. Lead"
4. Yani `ugc.mp4` **UGC örneği değil**; ürünün kendi tanıtım videosu.
5. Üç raporun "kodda referansı yok" tespiti doğru — ~180MB ölü ağırlık.

**Sonuç:** D5/S5'in şartı gerçekleşti ("GoatStarter stok videosuysa
alınmayacak"). `/studio` demo modda statik 9:16 poster + "demo çıktı" rozeti
gösterecek. Stok pazarlama videosu UGC stüdyosunun ne ürettiğini **yanlış**
anlatırdı — demoyu güçlendirmez, yanıltır.

**Hiçbir video kopyalanmadı.**

---

## FAZ 2 — şema

**`app/supabase/00_schema.sql`** — 878 → **1005 satır**.

### D1 / D2 / D3 uygulamaları

**D1 — `content_metrics`:**
- `tier` semantiği yorumla netleştirildi: `final` = "artık toplama yapılmaz",
  "okunabilir tek satır" **değil**.
- Yeni kısmi indeks `content_metrics_feedback_idx (brand_id, content_item_id,
  collected_at desc) where tier <> 'h6'`.
- Yeni fonksiyon **`brand_latest_metrics(brand_id, days)`** — `distinct on
  (content_item_id) ... order by content_item_id, collected_at desc`,
  `h6` hariç, `tier_weight` (final 1.0 / d1 0.7) döndürür.
- `content_metrics_final_idx` UNIQUE **korundu** (test edildi).

**D2 — `provider_credentials`:**
- `provider` CHECK'ine `'instagram'` eklendi (drop+add ile tazelenebilir).
- Yeni `config jsonb` — gizli **olmayan** yapılandırma (app_id, redirect_uri).
- `vault_secret_id` **nullable** oldu — yalnızca yapılandırma taşıyan satır için.
- `unique (brand_id, provider)` korundu → marka başına çok sağlayıcı.

**D3 — `content_items.embedding`:** `vector(1024)` sabit; yorum sözleşmeyi
anlatıyor (implementasyon tam 1024 döndürmek zorunda, adapter runtime'da
doğrular).

### Doğrulama — lokal Postgres

Ortam: `docker run supabase/postgres:15.8.1.060` (pgcrypto, vector 0.8.0,
pg_cron 1.6, pg_net 0.14.0, `auth`/`storage`/`vault` şemaları ve
`anon`/`authenticated`/`service_role` rolleri mevcut).

**İdempotens — temiz DB'de üst üste 3 kez:**

```
PASS 1  EXIT=0  · ERROR sayısı: 0
PASS 2  EXIT=0  · ERROR sayısı: 0
PASS 3  EXIT=0  · ERROR sayısı: 0
```

Durum çoğalmadı: `cron.job` 5 satır
(`sm-worker/publish/metrics/token-refresh/reaper`), `storage.buckets` 1 satır
(`media`, public=t), `vault.secrets` 1 satır, storage politikaları 4.

**⚠ Bir test-ortamı yaması gerekti (şema hatası DEĞİL):** kullandığım
container imajının `storage.buckets` tablosunda `public` kolonu yok (eski
storage şeması). Gerçek Supabase'de bu kolon var ve siraya'nın
`003-instagram.sql:48`'i üretimde bu kolonu kullanıyor. Şema dosyasına
dokunmadım; **container'a** `alter table storage.buckets add column if not
exists public boolean` ekleyip devam ettim.

### `claim_jobs()` eşzamanlılık testi

Test kodu repoda: **`app/supabase/tests/claim_jobs_concurrency.sh`**

Her worker ayrı bağlantıda, `begin; pg_sleep(0.3); claim_jobs(...); commit;` —
`pg_sleep` claim pencerelerinin **gerçekten** çakışmasını sağlıyor. İki
bağımsız iddia kontrol ediliyor: (a) dönen id kümelerinde kesişim, (b) DB'de
`attempts > 1` olan satır (çifte alım `attempts`'i 2 yapardı).

```
2 worker  · batch 25 → alinan 50   benzersiz 50   CIFTE 0   attempts>1: 0   PASS
8 worker  · batch 50 → alinan 150  benzersiz 150  CIFTE 0   attempts>1: 0   PASS
16 worker · batch 30 → alinan 300  benzersiz 300  CIFTE 0   attempts>1: 0   PASS
```

**Üç ölçekte de sıfır çakışma.** `for update skip locked` çalışıyor.

### Tablo ve politika envanteri — 14 tablo

| Tablo | RLS | Politika |
|---|---|---|
| activity | ✅ | 2 (read + insert) |
| brands | ✅ | 1 |
| **channel_credentials** | ✅ | **0 — bilinçli** |
| channels | ✅ | 1 |
| content_items | ✅ | 1 |
| content_metrics | ✅ | 1 (yalnızca SELECT) |
| jobs | ✅ | 1 (yalnızca SELECT) |
| media_assets | ✅ | 1 |
| media_jobs | ✅ | 1 |
| personas | ✅ | 1 |
| plans | ✅ | 1 |
| profiles | ✅ | 1 |
| **provider_credentials** | ✅ | **0 — bilinçli** |
| **rate_limit_counters** | ✅ | **0 — bilinçli** |

+ `storage.objects` üzerinde 4 politika (upload/update/delete/public read).

**`owns_brand()` kullanan politika sayısı: 9** — çocuk tabloların hepsi.
`profiles`/`brands`/`jobs` doğrudan `auth.uid()` kullanıyor (doğru:
`brands` sahiplik kökü, `profiles` kullanıcının kendisi, `jobs` kullanıcı
kapsamlı).

### Fonksiyonlar (pgvector'ünkiler hariç)

`owns_brand` · `claim_jobs` · `brand_latest_metrics` **(D1, yeni)** ·
`find_similar_content` · `rate_limit_hit` · `cron_fire` ·
`content_chain_guard` · `handle_new_user` · `touch_updated_at`

### İşlevsel testler — hepsi geçti

| Test | Sonuç |
|---|---|
| Zincir: `root_id`/`chain_position` türetimi | ✅ kök=1, devam=2, root doğru |
| Zincir: `parent_id` UPDATE'te kilitli | ✅ `parent_id degistirilemez` |
| Zincir: marka sınırı aşılamıyor | ✅ `marka sinirini asamaz` |
| `rate_limit_hit(limit=2)` | ✅ t, t, **f** |
| `content_metrics_final_idx` UNIQUE | ✅ ikinci `final` reddedildi |
| **D1: en son ölçüm okuması** | ✅ aşağıda |
| D2: `instagram` satırı (config var, secret yok) | ✅ yazıldı |
| D2: marka başına çok sağlayıcı | ✅ anthropic + instagram + kie |
| D2: `unique (brand_id, provider)` | ✅ ikinci anthropic reddedildi |
| D2: bilinmeyen sağlayıcı CHECK | ✅ `tiktok_ads` reddedildi |

**D1'in kanıtı.** İki içerik: A 40 günlük (`final` var), B 10 günlük
(`final` YOK, sadece h6 + d1). B daha iyi performans gösteriyor.

```
--- ESKI DAVRANIS (yalnizca tier=final) --- B GORUNMUYOR
     title     | tier  | reach | engagement_rate
 A (40 gunluk) | final |  1000 |            5.00      <- B yok!

--- D1 DAVRANISI (brand_latest_metrics) --- B GORUNUYOR
     title     | tier  | reach | engagement_rate | tier_weight
 A (40 gunluk) | final |  1000 |            5.00 |         1
 B (10 gunluk) | d1    |  4000 |            9.00 |         0.7   <- geldi

--- h6 sizintisi --- 0
```

Eski kuralla geri besleme **en iyi performans gösteren içeriği kaçırıyordu.**
D1 tam olarak bunu düzeltiyor.

Test container'ı silindi.

---

## AÇIK KONULAR — adım 3'e geçmeden bilmen gerekenler

### 1. ⚠ `next@16.2.5` — 10 high-severity açık (KARAR SENİN)

Plan §2.1 "Sürümler üç projeyle birebir aynı olmalı" diyor ve üçü de 16.2.5.
Ama `npm audit`:

```
next  9.3.4-canary.0 - 16.3.0-preview.10   Severity: high
  · Middleware / Proxy bypass in App Router (2 ayrı advisory)
  · SSRF in Server Actions on custom servers
  · SSRF in rewrites via attacker-controlled destination hostname
  · Cache confusion of response bodies (2 advisory)
  · DoS in App Router Server Actions · DoS in Image Optimization (SVG)
  · Unauthenticated disclosure of internal Server Function endpoints
  · Unbounded Server Action payload in Edge runtime
fix available: next@16.3.3
```

Bu ürün **auth, müşteri API anahtarı, ödeme yapan üçüncü taraf servisleri ve
PII** taşıyacak; "Middleware bypass" ve "SSRF" maddeleri §10'un kapatmaya
çalıştığı tehdit modelinin tam ortasına düşüyor.

**Planı değiştirmedim** — senin kararın. Seçenekler:
- (a) 16.3.3'e çık, §2.1'i güncelle. Üç kaynak proje 16.2.5'te kalır; taşınan
  kod Next API'si kullanmadığı için (`lib/core` saf) risk düşük.
- (b) 16.2.5'te kal, riski kabul et, §10'a madde olarak ekle.

Öneririm: **(a)**. Ama bu §2.1'i değiştirmek demek, o yüzden sormadan yapmadım.

### 2. `supabase/00_schema.sql` iki yerde — root kopyası artık eski

- **Yetkili dosya: `app/supabase/00_schema.sql`** (1005 satır, D1/D2/D3'lü,
  test edilmiş). §3'ün dizin yapısına uyuyor: `supabase/` projenin içinde.
- **`social/supabase/00_schema.sql`** (878 satır) — önceki oturumdan kalan,
  artık **eski**. Silmedim (geri alınamaz), ama **silinmeli** yoksa yanlış
  dosya uygulanır.

Onaylarsan silerim.

### 3. `npm install` ve vitest — lockfile commit edilmeli

`vitest`'in opsiyonel peer bağımlılıkları (`@vitest/ui`, `webdriverio`,
`canvas`…) npm 10.9.2'nin arborist'inde bir hatayı tetikliyor:

```
npm error Cannot read properties of null (reading 'edgesOut')
  at #loadPeerSet (build-ideal-tree.js:1289)
```

`--legacy-peer-deps` ile kurdum. **Lockfile oluştuktan sonra düz
`npm install` ve `npm ci` sorunsuz çalışıyor** (ikisini de doğruladım).
Yani: **`package-lock.json` repoya girmeli.** Lockfile'ı sıfırdan yeniden
üretmek gerekirse `--legacy-peer-deps` şart. Adım 3'te vitest'i
yapılandırırken bunu bil.

### 4. §1.7'nin "prefix şeması" — yok

Görev "çakışan global sınıf adlarını §1.7'deki prefix şemasıyla yeniden
adlandır" diyordu. **§1.7'de CSS sınıfı için bir prefix şeması yok** —
§1.7 tam tersini söylüyor: sınıflar hem isim hem tanım olarak aynı, *"tek
dosyaya indirildiğinde risk sıfır"*. Prefix şeması §1.9'da ve o
**localStorage** için (`sm:<modül>:<anahtar>`).

Ne yaptım: threadly'nin tanımlarını temel aldım, `.glow` + `.slide-x` ekledim,
CSS sınıflarını **yeniden adlandırmadım**. Gerçek fark yalnızca `.hl`/
`.hl-primary` yüzdelerindeydi (58% vs 60%) ve threadly'ninki alındı.
`sm:lang` localStorage ön eki uygulandı.

### 5. `voyageai` paketi alınmadı

§2.2 onu "Zorunlu mu: §11 S3'e bağlı" diye işaretlemiş. S3 artık kapandı
(Voyage), ama D3 sözleşmesi *"veya doğrudan HTTP"* diyor ve adapter adım
15'te yazılacak. Şu an kullanılmayan bir bağımlılık eklemek YAGNI olurdu.
Adım 15'te eklenecek. §2.2'nin "Zorunlu: **Evet**" olan tek satırı (test
koşucusu) eklendi.

### 6. Kalibre edilmemiş, ölçülmemiş değerler

Şemaya ve plana girdiler ama **hiçbiri ölçülmedi**:

- Tekrar eşikleri `0.92` / `0.82`, `3 gün`, `12 derinlik`, `3 deneme` (§4c)
- **D1'in tier ağırlıkları `final 1.0 / d1 0.7`** — bunu ben önerdim,
  ölçülmedi
- Rate limit başlangıç değerleri (§8.7)
- Metrik retention `180 gün`

İlk ~200 içerikten sonra kalibre edilmeli.

### 7. Hâlâ ⚠ DOĞRULANMALI olanlar

- **D3:** Voyage `output_dimension` ve OpenAI `dimensions` parametrelerinin
  güncel dokümantasyondan teyidi. **Adım 15'ten önce.** Teyit edilemeyen
  sağlayıcı elenir, kolon `vector(1024)` olarak kalır.
- **§4f:** Instagram Graph metrik adları sürüme göre değişiyor.
- **S7:** GoatStarter lisansı — DOA'dan yazılı teyit. Kod yazımını
  bloklamıyor, satıştan önce gerekir.

### 8. Adım 3 (test altyapısı) için hazır olanlar

- vitest + jsdom + @testing-library/react + @vitejs/plugin-react **kurulu**,
  ama **yapılandırılmadı** (`vitest.config.ts` yok — adım 3'ün işi).
- `package.json`'a `"typecheck": "tsc --noEmit"` ekledim; `"test"` script'i
  **yok**, adım 3'te eklenecek.
- `.gitignore`'a `/coverage` eklendi.
- Adım 3'ün hedefi `lib/core/plan/template.ts` — o dosya **henüz taşınmadı**
  (adım 4'ün işi). Yani adım 3, adım 4'ün ilk dosyasını da beraberinde
  getirmek zorunda. Plan bunu "adım 3 neden 4'ten önce" diye
  gerekçelendirmiş, ama sıralama pratikte **template.ts'i adım 3'e çekiyor**.

---

## DEĞİŞTİRİLMEYENLER

- `sahne/`, `siraya/`, `threadly/` — **hiçbirine yazılmadı**, yalnızca okundu
  ve dosya kopyalandı.
- Şema **Supabase'e uygulanmadı** — yalnızca yazıldı ve lokalde test edildi.
- Hiçbir sayfa, API rotası, iş mantığı veya demo veri eklenmedi (FAZ 1
  "ALMA" listesine uyuldu).
- Hiçbir video kopyalanmadı.
