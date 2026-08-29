# ADIM 10 RAPORU — /studio + /studio/personas

Tarih: 2026-08-29
Kapsam: FAZ A (içerik dili + e2e) · FAZ B (`/studio/personas`) · FAZ C (`/studio`) · FAZ D (kapanış)
Kaynak: `docs/BIRLESIM_PLANI.md` §12 adım 10 · önceki oturum: `ADIM_9_RAPOR.md`

---

## ÖZET

| Faz | Durum | Commit |
|---|---|---|
| FAZ A — içerik dili + e2e | ✅ Tamam | `adfe1ca` |
| FAZ B — `/studio/personas` | ✅ Tamam | `a1191bf` |
| FAZ C — `/studio` | ✅ Tamam | `a1191bf` |

**Son kapı durumu (FAZ D):**

```
tsc     EXIT=0   (çıktı yok)
lint    EXIT=0   (çıktı yok)
test    EXIT=0   16 dosya, 416 test
build   EXIT=0   APP_MODE=live · 14 rota; 7'si (app) altında ƒ (dinamik)
audit   EXIT=0   found 0 vulnerabilities
e2e     EXIT=0   4 dosya, 4 test — ayrıntı FAZ A/D bölümlerinde
git     temiz (rapor commit'i hariç)
```

---

# FAZ A — içerik dili + e2e

## A1 — `brands.content_language`: yanlış kurulmuş soru

ADIM_9 varsayım 2, `/plan`'ın `lang: "tr"`'yi sabitlemesini "SSR istemcinin
dil tercihini bilemiyor" diye gerekçelendirmişti. Bu, **arayüz dili** ile
**içerik dili**'ni karıştırıyordu — bir müşteri panoyu İngilizce kullanıp
Türkçe içerik ürettirmek isteyebilir. Doğru çözüm SSR'ın istemci tercihini
öğrenmesi değil, sorunun kendisini bir marka özelliğine taşımaktı.

**Migration:**

```sql
-- create table içine, timezone'un hemen altına:
content_language text not null default 'tr',

-- yakınsama bloğu (provider_credentials'taki D2 deseninin aynısı):
alter table public.brands
  add column if not exists content_language text not null default 'tr';
alter table public.brands
  drop constraint if exists brands_content_language_check;
alter table public.brands
  add constraint brands_content_language_check check (content_language in ('tr', 'en'));
```

**İdempotency kanıtı — temiz local Postgres'te üst üste 3 kez** (`docker run
supabase/postgres:15.8.1.060`, ADIM_012'nin yöntemi):

```
PASS 1  EXIT=0  ERROR sayısı: 0
PASS 2  EXIT=0  ERROR sayısı: 0
PASS 3  EXIT=0  ERROR sayısı: 0
```

Kolon/kısıt/varsayılan doğrulandı (`\d public.brands`), `cron.job` hâlâ 5
satır (çoğalma yok). Ayrıca gerçekten test edildi: varsayılan INSERT →
`content_language = 'tr'`; `content_language = 'de'` denemesi →
`ERROR: new row for relation "brands" violates check constraint
"brands_content_language_check"`.

**Gerçek Supabase projesine uygulama** — kullanıcıdan açık onay alındıktan
sonra (`AskUserQuestion`, global kural: "non-local database'e migration
yalnızca açık onayla") `supabase/apply.sh` çalıştırıldı. `verify.sql` çıktısı:
14 tablo, 12 politika, 3 sıfır-politikalı tablo (bilinçli), 5 cron job'ı
hepsi `active=false`, vault/storage tekil — hiçbir çoğalma yok, önceki
duruma birebir yakınsadı, üstüne `content_language` eklendi.

## Kod tarafı

- `OwnedBrand.contentLanguage: Lang` — `timezone`'un tam yanında
  (`lib/server/auth.ts`), `Brand`'in sekiz metin alanına KARIŞTIRILMADI
  (onlar gibi `brandCompletionPercent()`'e girmiyor — bu bir "doldurulması
  gereken alan" değil, sabit varsayılanlı bir seçim).
- `/plan`'da `lang: "tr"` → `lang: brand.contentLanguage`.
- `toPromptBlock(brand, contentLanguage?)` — ikinci, OPSİYONEL parametre.
  Verilirse blok "Content language: Turkish/English" satırıyla kapanır;
  verilmezse eski davranış birebir korunur (geriye dönük uyumluluk testle
  kanıtlı). Adım 14'ün `PlannerPort.live`/`CopyPort.live`'ı bunu okuyacak.
- `/plan` ekranında görünür ipucu: "İçerik dili · {ad}" — `CONTENT_LANGUAGE_LABEL`
  (yeni, `lib/core/types.ts`) arayüz dilinden bağımsız çeviri sağlıyor.
- `docs/BIRLESIM_PLANI.md` §9.1'e not eklendi: adım 14 arayüz dilini değil
  bu alanı kullanacak.

## `smoke.spec.ts` ağ allowlist'i — GENİŞLETİLMEDİ

Görev metninin talimatı buydu: demo modda `/studio` dahil hiçbir ekran dış
servise çağrı yapmıyor, allowlist hâlâ yalnızca `localhost` + Supabase.
Adım 10'un e2e ağ raporu (aşağıda, FAZ D) bunu kanıtlıyor — allowlist
genişlemesi (kie/elevenlabs/fal host'ları) adım 20'nin işi.

## e2e — tek testte iki şey birden kanıtlandı

`settings.spec.ts`'in mevcut testine üç satır eklendi: `#content_language`
select'i "en"e çevrilip kaydediliyor (sayfa yenilenince kalıcı olduğu
`toHaveValue` ile doğrulanıyor — B4'ün diğer alanlarıyla aynı desen), sonra
**aynı test içinde** `/plan`'a gidilip `İçerik dili · İngilizce` metninin
göründüğü doğrulanıyor.

**⭐ "İngilizce" kelimesinin kendisi kanıtın parçası.** Bu oturumun arayüz
dili (localStorage) hiç değiştirilmedi, Türkçe kalıyor — `t()` işlevi
`CONTENT_LANGUAGE_LABEL.en`'i Türkçe arayüzde render ettiği için etiket
"İngilizce" çıkıyor, "English" değil. Yani ekranda görünen şey tam olarak
A1'in iddiası: arayüz dili Türkçe kalırken, marka için kaydedilen İÇERİK
dilinin adı doğru okunuyor.

---

# FAZ B — `/studio/personas`

## B1 — sahne'nin iki tuzağından kaçınma

1. **Dosyaya yazma yok.** sahne'nin `personas.ts`'i JSON dosyasına ve
   `public/`'e yazıyordu — Vercel'de salt-okunur dosya sisteminde patlardı.
   `/studio/personas` hiçbir dosya sistemi işlemi yapmıyor; persona verisi
   `port("video").listPersonas()`'tan geliyor (demo modda
   `fixtures/personas.ts`, canlıda adım 19'da `personas` tablosu).
2. **Auth'suz rota yazılmadı.** Bu ekran hiçbir API rotası açmıyor — "Yeni
   persona" düğmesi `disabled`, tıklanınca network isteği ÇIKMIYOR (e2e ağ
   raporu bunu da kapsıyor, aşağıda).

## İçerik

Persona kartı: 9:16 görsel (`storage.list("image")`'tan `image_asset_id`
eşleşmesiyle — mira/kerem için gerçek demo PNG'leri, ADIM_8'de üretilen
soyut placeholder'lar), isim + rol (`"Mira — barista"` → `Mira` / `barista`,
" — " ayracıyla bölünüyor), **kullanıldığı içerik sayısı** rozeti, ve
**üretim prompt'u DAİMA görünür** — bir "detay" tıklamasının arkasına
saklanmadı (KESIF_SAHNE §9: bu, ürünün en değerli varlığı, 10 kez elle
ayarlanmış).

Sayaç `lib/core/derive/media.ts`'in yeni `countPersonaUsage()`'ı ile —
aynı personanın aynı içerikteki BİRDEN FAZLA işi (ör. Mira'nın hem `voice`
hem `lipsync` işi content `...005`'te) tek sayılıyor, persona kurulum işi
(`content_item_id: null`) hiç sayılmıyor. Ekran görüntüsünde doğrulandı:
Mira → 2 (`...005`, `...010`), Kerem → 2 (`...013`, `...017`) — fixture'ın
gerçek `media_jobs` satırlarıyla elle çapraz kontrol edildi.

`is_archived` personalar (Selin) listede görünmüyor — `listPersonas()`
zaten filtreliyor (adım 8'de yazılmış davranış, dokunulmadı).

---

# FAZ C — `/studio`

## C1 — boru hattı, iki katmanlı gösterim

1. **Statik açıklama** (`PipelineExplainer`) — dört adımın sürece ait
   genel anlatımı: persona görseli (Kie · Nano Banana Pro) → seslendirme
   (ElevenLabs) → persona videosu (Kie · Kling 3.0) → dudak senkronu
   (fal · sync-lipsync). `MEDIA_JOB_STEP_LABEL`'ı kullanıyor (adım 8'de
   hazırlanmıştı).
2. **Gerçek durum** (`JobStepRow`, her üretim kartının içinde) — fixture'daki
   GERÇEK `media_jobs` satırları, adım sırasına göre dizilmiş
   (`buildProductions()`'ın `MEDIA_JOB_STEPS` sıralaması). `running`
   durumundaki iş (content `...013`, adım `lipsync`) `.glow` sınıfı + dönen
   `loader-circle` ikonuyla vurgulanıyor — **sahte bir `setInterval`/`setTimeout`
   YOK**, ekran görüntüsü bunun tek seferlik bir server-render olduğunu
   kanıtlıyor.

## C2 — `/plan` ↔ `/studio` kopukluğunun anlatımı

ADIM_9 varsayım 5'in tespiti: UGC seçimi `/plan`'da React state'te yaşıyor,
sayfa değişince kayboluyor. Bu oturum bunu **birleştirmeye ÇALIŞMADI** —
görev metninin talimatı buydu, çözüm adım 14'ün işi. Bunun yerine
`/studio`'nun en üstünde, kalıcı bir bilgi kartında (`studioLinkNote`)
kullanıcıya doğrudan söyleniyor:

> "Bu liste /plan'daki UGC seçiminden BAĞIMSIZ — seçim şu an sayfa
> değişince kayboluyor (React state, DB'ye yazılmıyor). /plan'da seçtiğin
> içerikler burada otomatik sıraya girmiyor; bu köprü adım 14'ün işi.
> Aşağıdakiler zaten üretime alınmış örnekler."

`/studio`'nun üretim listesi bu yüzden `/plan`'ın seçimini OKUMUYOR;
doğrudan `media_jobs`'tan (`buildProductions()`) geliyor — fixture'da
zaten "üretim bekleyen/süren/bitmiş" beş örnek var (queued/running/
succeeded/failed/cancelled hepsi temsil ediliyor).

## C3 — maliyet, uydurulmadı

`lib/core/providers/kie.ts`'in ÖLÇÜLMÜŞ sabitleri doğrudan kullanıldı:
`PERSONA_IMAGE_CREDITS` (24), `PERSONA_VIDEO_CREDITS_PER_SECOND.pro × 5sn`
(~135), `LIPSYNC_CREDITS_PER_SECOND` (27/sn). ElevenLabs satırı `0` değil
"abonelik dahilinde, ek kredi yok" — fixture'daki her `voice` işinin
`credits_estimated: 0`'ı da bunu doğruluyor, bu bir API tahmini eksikliği
değil, ElevenLabs'ın gerçek faturalama modeli. Her üretim kartında da
`totalCredits()` ile gerçek iş toplamı (`credits_charged ?? credits_estimated`)
gösteriliyor — gerçek para birimi hiçbir yerde yok.

## C4 — 9:16 poster

`ProductionPreview` — tamamlanmış bir işin `result_asset_id`'si bir görsele
çözülüyorsa (content `...005`, ADIM_8'in ürettiği `v60-demleme.jpg`) poster
+ oynatma ikonu + "DEMO ÇIKTI" rozetiyle gösteriliyor; yoksa dürüst bir
"Henüz önizleme yok" kutusu (sahte bir placeholder VİDEO değil).

## C5 — üretim düğmesi

`disabled`, `title` ipucu "Demo modda devre dışı — adım 20'de açılır."
Sahte ilerleme çubuğu ÇALIŞTIRILMADI.

## Yeni: `VideoPort.listAllJobs()` + `lib/core/derive/media.ts`

Mevcut `VideoPort.listJobs(contentItemId)` yalnızca TEK içeriğe göre
filtreliyordu; `/studio`'nun üretim listesi ve `/studio/personas`'ın sayacı
marka kapsamlı tüm işlere ihtiyaç duyuyordu — `ContentPort.list()`'in
medya işleri karşılığı olarak `listAllJobs()` eklendi (demo: fixture'ı
döndürür; live: `NOT_IMPLEMENTED`, adım 20'nin işi).

`lib/core/derive/media.ts` saf katmanı üç fonksiyon taşıyor:
`buildProductions()` (gruplama + adım sıralaması + aciliyet sıralaması —
running > queued > failed > bitmiş, sonra en yeni iş üstte),
`countPersonaUsage()`, `totalCredits()`. **%100 statement/lines, %95 branch**
kapsam — 18 test, `derive/*`'in ADIM_9'da kurulan standardını sürdürüyor.

---

# FAZ D — kapanış

## grep kontrolleri

```
$ grep -rn "ScreenStub" app/ components/
components/app/screen-stub.tsx:14:export function ScreenStub({
```

Sıfır KULLANIM — yalnızca bileşenin kendi tanımı kaldı (beklenen: bileşen
adım 11'de tamamen silinebilir ama bu oturumun kapsamı değildi).

```
$ grep -rn "fixtures" app/ components/
(sıfır sonuç)
```

## Beş kapı

```
tsc     EXIT=0
lint    EXIT=0
test    EXIT=0   16 dosya, 416 test
build   EXIT=0   14 rota (13 → 14: /studio/personas yeni)
audit   EXIT=0   found 0 vulnerabilities
```

## e2e — tam çıktı (FAZ A + FAZ B/C birlikte, `smoke.spec.ts` genişletilmiş listeyle)

```
Running 4 tests using 1 worker

  ✓  plan.spec.ts › ufuk geçişi slot sayısını değiştirir, UGC seçim sayacı doğru sayar (5.4s)
  ✓  settings.spec.ts › form kaydediyor, sayfa yenilendiğinde değerler geliyor (8.1s)
[RLS kanıtı] update sonucu — error: null etkilenen satır: 0
  ✓  settings.spec.ts › ⭐ RLS kanıtı — başka bir kullanıcının markasına yazma denemesi tutmaz (2.4s)
[ağ raporu] toplam istek: yabancı köke giden 0 bekleniyor, izinli kökler: localhost, osxpcyzohmlgxkzbirci.supabase.co
  ✓  smoke.spec.ts › giriş yapar, her modüle gider, ScreenStub durumu doğru, ağ dışarı çıkmaz (17.1s)

  4 passed (37.4s)
```

**`smoke.spec.ts`'in ağ denetimi artık `/studio` ve `/studio/personas`'ı da
kapsıyor** — `MODULES` dizisine ikisi eklendi, ikisi de `expectStub: false`.
Test oturumu boyunca atılan **her** istek toplanıyor (`page.on("request")`);
sonuç sıfır — demo modda gösterilen persona görselleri, poster, boru hattı
açıklaması, maliyet tablosu hepsi **hiçbir dış API'ye dokunmadan** render
ediliyor. Bu, S6'nın "demo bypass üretimde bile para harcamamalı" garantisinin
`/studio`'ya doğrudan karşılığı.

## Kapsam özeti

```
Statements   : 62.62%  (630/1006)
Branches     : 51.71%  (287/555)
Functions    : 63.6%   (194/305)
Lines        : 63.05%  (541/858)
```

ADIM_9'daki %61'den %62.6'ya çıktı. `lib/core/derive/media.ts` (bu adımda
eklendi): **%100 stmt / %95 branch / %100 fn / %100 lines**. Düşük kalan
alanlar aynı — `lib/core/plan/skeleton.ts` (%0), `lib/core/providers/*`
(%0), `lib/adapters/live/*` (%0'a yakın, hepsi `NOT_IMPLEMENTED` fırlatan
iskeletler) — hepsi canlı ağ çağrısı gerektiren, adım 14/19/20'nin işi.

---

# VARSAYIMLAR

1. **`content_language` `Brand`'in sekiz alanına DAHİL EDİLMEDİ** —
   `OwnedBrand`de `timezone`'un yanında ayrı bir operasyonel alan olarak
   kaldı. Gerekçe: `BRAND_FIELDS` (ve `brandCompletionPercent()`'in
   paydası) homojen serbest-metin alanları için var; bir `<select>` ile
   sabit varsayılanı olan bir seçimi oraya katmak "profil ne kadar dolu"
   yüzdesinin anlamını bozardı. `toPromptBlock`'a taşınması AYRI bir karar
   (görev metninin kendisi istedi) — istem bloğuna dahil olması, `Brand`'in
   sekiz alanından biri olması demek değil.

2. **`toPromptBlock`'un ürettiği "Content language" satırı şu an
   `skeleton.ts`'in KENDİ "Write every title and hook in Turkish/English"
   direktifiyle ÇAKIŞIYOR (redundant, çelişkili değil).** İkisi de aynı
   `input.lang`'dan besleniyor, ikisi de aynı sonucu söylüyor. Bilinçli
   bırakıldı: adım 14 gerçek entegrasyonu yazarken hangi mekanizmanın
   (ayrı direktif cümlesi mi, prompt bloğunun son satırı mı) kalıcı
   olacağına o zaman karar verebilir; bu adımda ikisini birleştirmek erken
   bir optimizasyon olurdu.

3. **`/studio`'nun üretim listesi `ContentPort.get()`'i N kez çağırıyor**
   (`Promise.all(groups.map(...))`) — demo modda maliyeti sıfır (bellek içi
   dizi taraması), ama canlıda (adım 20+) bu bir N+1 sorgu deseni olur.
   `ContentPort`'a "id listesiyle toplu getir" eklemek bu adımın kapsamı
   dışında bırakıldı — bugün beş üretim var, N+1'in gerçek maliyeti
   ölçülmeden bir optimizasyon eklemek YAGNI'yi çiğnerdi. Adım 20 bunu
   fark etmeli.

4. **Persona kartındaki "rol" (`Mira` / `barista`) `name` alanının " — "
   ayracıyla bölünmesinden türetiliyor** — `PersonaRow`'da ayrı bir
   `role`/`description` kolonu YOK. Ayraç yoksa (ör. canlıda kullanıcı
   "Ahmet" gibi düz bir isim girerse) `role` boş kalır, kart yalnızca ismi
   gösterir — kırılmıyor ama "kısa tanım" o persona için görünmez olur.
   Adım 19 gerçek persona oluşturma formunu yazarken ayrı bir alan
   eklenip eklenmeyeceğine karar vermeli.

5. **`/studio`'nun boru hattı açıklaması sabit dört adım** (`persona_image`,
   `voice`, `persona_video`, `lipsync`) — şemanın beşinci `media_jobs.step`
   değeri olan `post_image` (düz gönderi görseli, UGC değil) bilinçli
   dışarıda bırakıldı; görev metninin kendi tanımı ("dört adım") buydu.
   Fixture'daki tek `post_image` işi (iptal edilmiş, content `...018`)
   `/studio`'nun üretim listesinde GÖRÜNÜYOR (çünkü `buildProductions()`
   tüm adımları gruplar) ama boru hattı açıklama kartında yok — iki
   gösterim kasıtlı olarak farklı kapsamlı.

6. **e2e'nin content_language testi TEK test fonksiyonu içinde tutuldu**
   (ayrı bir `plan.spec.ts` assertion'ı EKLENMEDİ). Gerekçe:
   `playwright.config.ts`'in `workers: 1` + paylaşılan tek hesap deseninde
   dosyalar arası sıralama garantisi yok (ADIM_9'un çalıştırma sırası
   `plan → settings → smoke` idi, ama bu YAZILI bir garanti değil). Marka
   dilini kaydeden adımla onu okuyan adımı AYRI dosyalara bölmek gizli bir
   sıralama bağımlılığı yaratırdı; tek test içinde tutmak bunu ortadan
   kaldırdı.

7. **`/studio` sayfası `ContentPort.get()` sonucu `null` dönen bir
   `content_item_id` için (teorik olarak — fixture'da olmuyor) başlık
   yerine ham `contentItemId`'yi gösteriyor**, sayfayı ÇÖKERTMÜYOR. Bu,
   §9.1'in "sessiz düşme yerine görünür bozukluk" ilkesinin küçük bir
   uygulaması — gerçek bir hata olduğunda ekran "bir şey var ama adı yok"
   der, sahte bir başlık uydurmaz.

---

# ADIM 11'E GEÇMEDEN BİLMEN GEREKENLER

Aşağıdakiler, FAZ 1'in ("satılabilir demo") bitmiş sayılması için benim
gözümle eksik gördüğüm her şey — adım 11'in kapanış kontrol listesi:

1. **Kritik yolun dördü de artık gerçek içerikle dolu**: `/plan`, `/studio`,
   `/queue`, `/analytics` — hepsi `ScreenStub` göstermiyor, hepsi
   `port("...")` üzerinden veri okuyor, hiçbiri dış servise çağrı yapmıyor.
   `/dashboard` ve `/settings`'in marka formu da tamam. **Adım 11'in kabul
   kriterindeki "uçtan uca gezilebilir" iddiasını gerçek bir tarayıcıda
   BAŞTAN SONA (giriş → /plan → /studio → /queue → /analytics → çıkış)
   TEK bir e2e senaryosunda kimse doğrulamadı** — her ekranın kendi testi
   var ama zincirleme bir "kullanıcı yolculuğu" testi yok. Adım 11 bunu
   yazmalı; `smoke.spec.ts` her modüle TEK TEK gidiyor, aralarında
   state/veri akışı iddiası yok.

2. **`/plan`'daki UGC seçimi ile `/studio`'nun üretim listesi arasındaki
   kopukluk KAPATILMADI, yalnızca ANLATILDI** (bkz. FAZ C, C2). Bu, demo
   modun doğal bir sonucu ve adım 14'ün gerçek plan üretimi + onay akışı
   gelene kadar kapanamaz — ama adım 11 "satılabilir demo" iddiasını
   yazarken bu notu MUTLAKA görsün: bir kullanıcı `/plan`'da içerik seçip
   "şimdi /studio'da görünecek" beklerse hayal kırıklığına uğrar. Demo
   sunumunda bu ikisi AYRI hikâyeler olarak anlatılmalı.

3. **`VideoPort.listAllJobs()` yeni eklendi ama `live/video.ts`'te hâlâ
   `NOT_IMPLEMENTED`.** Adım 20 (LIVE #4 — UGC boru hattı) bu portu
   yazarken `listAllJobs()`'un CANLI implementasyonunun nasıl sorgulanacağını
   düşünmeli — muhtemelen `media_jobs where brand_id = ?`, ama sayfalama
   gerekip gerekmediği (bir markanın yüzlerce işi birikebilir) o zaman
   netleşmeli. Bu adımda demo verinin boyutu (8 satır) sayfalama
   ihtiyacını hiç göstermedi.

4. **`ContentPort`'ta toplu id sorgusu yok** (VARSAYIM 3) — `/studio`
   bugün N tekil `get()` çağrısı yapıyor. Adım 12 (iş kuyruğu) veya adım 20
   gerçek Supabase'e geçtiğinde bu gerçek bir N+1 sorgu haline gelir.
   Ölçülmedi çünkü demo modda maliyeti yok; canlıda ilk ölçüm adım 20'de
   yapılmalı.

5. **`personas` tablosunun RLS/politika sayısı ADIM_012'de "1" olarak
   listelenmiş** (bkz. o raporun "Tablo ve politika envanteri" bölümü) —
   bu adım `personas`'a hiç YAZMADI (yalnızca `listPersonas()` okudu, demo
   modda fixture'dan), o yüzden gerçek `personas` tablosunun bugünkü
   satır sayısı/durumu bu oturumda doğrulanmadı. Adım 19 (persona
   kalıcılığı canlıya alınırken) bunu baştan kontrol etmeli.

6. **Persona "rol" alanı (VARSAYIM 4) kalıcı bir şema alanı DEĞİL**, yalnızca
   `name`'in görüntü katmanında bölünmesi. Adım 19 gerçek persona oluşturma
   formunu tasarlarken ayrı bir `role`/`tagline` kolonu gerekip gerekmediğine
   karar vermeli — bugünkü çözüm yalnızca DEMO'nun iki personası için
   (isim zaten " — rol" formatında yazılmıştı) çalışıyor.

7. **Önceki oturumlardan devam eden açıklar değişmedi** (D3 embedding
   teyidi, Instagram metrik adları, S7 lisans, kalibre edilmemiş eşikler,
   S1 ürün adı, Node sürümü v23 vs `>=22.22.2 <23`) — ADIM_8/ADIM_27'nin
   listesine bakınız.

8. **Bu oturumda gerçek Supabase projesine BİR migration uygulandı**
   (`brands.content_language`, kullanıcı onayıyla). `verify.sql`'in
   çıktısı önceki durumla birebir örtüşüyor (14 tablo, 12 politika, 5 cron
   job — hepsi `active=false`), yani D1/D2/D3'ün ADIM_012'de kurduğu
   durum korunmuş oldu; adım 11 şema durumunu tekrar sıfırdan
   doğrulamak zorunda değil.
