/**
 * İçerik satırları — demonun omurgası.
 *
 * ← siraya `lib/demo/data.ts` (monthCells / weekPosts / queue) + threadly
 *   `lib/demo/data.ts:79` `posts` + `:266` `sampleDrafts`.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK. Hepsi `lib/core/types.ts`'te.
 *
 * ⭐ EN ÖNEMLİ UYARLAMA: kaynak dosyalar hazır GÖRÜNÜM nesneleri taşıyordu
 * (42 takvim hücresi elle yazılmış, kuyruk ayrı bir dizi, hafta ızgarası
 * üçüncü bir dizi — aynı gönderi üç yerde ayrı ayrı). Burada tek bir
 * `content_items` satır kümesi var; takvim, hafta ızgarası ve kuyruk
 * `lib/core/derive/calendar.ts`'in saf fonksiyonlarıyla TÜRETİLİYOR.
 * Böylece demo ile canlı aynı kodu çalıştırıyor — demoda doğru görünüp
 * canlıda bozulan bir takvim mümkün değil.
 *
 * Demo ürünü ne anlatıyor:
 *   · geçmiş yayınlar → `/analytics` dolu
 *   · bugün + gelecek hafta → `/dashboard` takvimi ve `/queue` dolu
 *   · `needs_review` → insanın onayladığı yer
 *   · `publishing` → çifte yayın kalkanının kilidi (§4a)
 *   · `failed` → hata durumu görünür
 *   · `archived` → "üretme" dedik ama tekrar hafızasında duruyor
 *   · 3 halkalı zincir → devam içeriği (§4b)
 */
import type { ContentItemRow } from "@/lib/core/types";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { DEMO_CHANNEL_IDS } from "@/lib/adapters/demo/fixtures/channels";
import { at } from "@/lib/adapters/demo/fixtures/clock";

export const DEMO_PLAN_ID = "p0000000-0000-4000-8000-000000000001";

/** Zincirin kökü — `/plan` ve `/queue` bu id'yi "devam" rozetiyle gösterir. */
export const DEMO_CHAIN_ROOT_ID = "10000000-0000-4000-8000-000000000031";

/** Her satırın paylaştığı sabitler. Tekrarı burada kesiyoruz, satırlarda değil. */
const BASE = {
  brand_id: DEMO_BRAND_ID,
  plan_id: DEMO_PLAN_ID,
  channel_id: null,
  media_type: "IMAGE",
  day_offset: null,
  time_of_day: null,
  scheduled_at: null,
  published_at: null,
  is_best_time: false,
  hook: "",
  body: "",
  hashtags: "",
  media_url: null,
  external_post_id: null,
  parent_id: null,
  root_id: null,
  chain_position: 1,
  continuation_note: "",
  content_fingerprint: null,
  topic_key: null,
} satisfies Omit<ContentItemRow, "id" | "platform" | "kind" | "title" | "status">;

const CHANNEL_OF = {
  instagram: DEMO_CHANNEL_IDS.instagram,
  x: DEMO_CHANNEL_IDS.x,
  linkedin: DEMO_CHANNEL_IDS.linkedin,
  tiktok: DEMO_CHANNEL_IDS.tiktok,
  youtube: DEMO_CHANNEL_IDS.youtube,
  bluesky: DEMO_CHANNEL_IDS.bluesky,
} as const;

function row(over: Partial<ContentItemRow> & Pick<ContentItemRow, "id" | "platform" | "kind" | "title" | "status">): ContentItemRow {
  return { ...BASE, channel_id: CHANNEL_OF[over.platform], ...over };
}

/**
 * `now`'a göre kaydırılmış satırlar. Aynı `now` → aynı satırlar; saat
 * modül düzeyinde okunmuyor (bkz. `clock.ts`).
 */
export function demoContentItems(now: Date): ContentItemRow[] {
  return [
    /* ── Geçmiş yayınlar — /analytics ve ısı haritasının girdisi ─────────── */
    row({
      id: "10000000-0000-4000-8000-000000000001",
      platform: "instagram", kind: "reels", media_type: "REELS", status: "published",
      title: "Yirgacheffe'yi 15 saniyede tarif etmek",
      hook: "Çilek diyorlar. Biz de öyle diyoruz ama neden olduğunu anlatalım.",
      body: "Etiyopya Yirgacheffe doğal işlemde kuruyor; çekirdek meyvenin içinde fermente oluyor. Sonuç bardakta çilek ve bergamot. 92°C, 1:16, 2:45.",
      hashtags: "#tekköken #yirgacheffe #filtrekahve",
      published_at: at(now, -38, "18:00"), scheduled_at: at(now, -38, "18:00"),
      is_best_time: true, external_post_id: "ig_17901",
      topic_key: "yirgacheffe",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000002",
      platform: "linkedin", kind: "carousel", media_type: "CAROUSEL", status: "published",
      title: "Kurumsal hediye kutusunda ne var",
      hook: "İK ekiplerinin en çok sorduğu üç soruyu tek karusele sığdırdık.",
      body: "1) Kavurma tarihi kutunun üstünde. 2) 50 adetten sonra logo baskı ücretsiz. 3) Teslimat İstanbul içi 2 gün.",
      hashtags: "#kurumsalhediye #kahve",
      published_at: at(now, -33, "09:30"), scheduled_at: at(now, -33, "09:30"),
      external_post_id: "li_88120",
      topic_key: "kurumsal-hediye",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000003",
      platform: "instagram", kind: "image", status: "published",
      title: "Kavurma tarihi neden pakette yazıyor",
      hook: "Son kullanma tarihi kahve için neredeyse anlamsız bir bilgi.",
      body: "Kahve bozulmuyor, yaşlanıyor. Kavurmadan 7-21 gün sonrası en iyi aralık. Bu yüzden biz kavurma tarihini yazıyoruz.",
      hashtags: "#tazekavurma #kahve",
      published_at: at(now, -21, "18:00"), scheduled_at: at(now, -21, "18:00"),
      is_best_time: true, external_post_id: "ig_17944",
      topic_key: "tazelik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000004",
      platform: "x", kind: "text", status: "published",
      title: "Değirmen bütçesi tartışması",
      hook: "3.000 TL'lik makine + 800 TL'lik değirmen, 800 TL'lik makine + 3.000 TL'lik değirmenden daha kötü bardak verir.",
      body: "Öğütme tutarlılığı ekstraksiyonun tamamını belirliyor. Bütçeni bölmen gerekiyorsa değirmene ağırlık ver.",
      hashtags: "",
      published_at: at(now, -16, "12:30"), scheduled_at: at(now, -16, "12:30"),
      external_post_id: "x_55021",
      topic_key: "ekipman",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000005",
      platform: "tiktok", kind: "video", media_type: "VIDEO", status: "published",
      title: "V60 ile 4 dakikada demleme",
      hook: "Tek çekim, kesme yok, gerçek süre.",
      body: "18 g kahve, 300 g su, 92°C. Bloom 40 g / 30 sn, sonra üç aşamada dök.",
      hashtags: "#v60 #demleme #kahve",
      published_at: at(now, -12, "19:30"), scheduled_at: at(now, -12, "19:30"),
      external_post_id: "tt_31002",
      topic_key: "demleme-yontemi",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000006",
      platform: "instagram", kind: "story", media_type: "STORIES", status: "published",
      title: "Bugünün kavurması: Huila",
      hook: "Sabah 06:40, kavurma makinesi ısındı.",
      body: "Bugün Kolombiya Huila kavuruyoruz. Cuma günü rafta.",
      hashtags: "",
      published_at: at(now, -8, "11:00"), scheduled_at: at(now, -8, "11:00"),
      external_post_id: "ig_18011",
      topic_key: "kavurma-gunlugu",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000007",
      platform: "linkedin", kind: "text", status: "published",
      title: "Aboneliği neden aylık tuttuk",
      hook: "Haftalık abonelik denedik, iki ayda kapattık. Sebebi tazelik değil, lojistikti.",
      body: "Haftalık gönderimde kargo maliyeti kahve maliyetini geçiyordu. Aylık 500 g, 7-21 gün penceresinin tam ortasına oturuyor.",
      hashtags: "#abonelik #eticaret",
      published_at: at(now, -5, "08:30"), scheduled_at: at(now, -5, "08:30"),
      external_post_id: "li_88377",
      topic_key: "abonelik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000008",
      platform: "instagram", kind: "image", status: "published",
      title: "Soğuk demleme şişeleri raflarda",
      hook: "12 saat, oda sıcaklığı, filtre yok.",
      body: "Bu partide Huila kullandık; kakao ve fındık baskın, asit düşük.",
      hashtags: "#soğukdemleme #coldbrew",
      published_at: at(now, -3, "17:00"), scheduled_at: at(now, -3, "17:00"),
      is_best_time: true, external_post_id: "ig_18052",
      topic_key: "soguk-demleme",
    }),

    /* ── §4b DEVAM ZİNCİRİ — 1 → 2 → 3 ───────────────────────────────────
       Kök yayında, ikinci halka yayında, üçüncüsü sırada. `root_id` üçünde de
       aynı; `chain_position` trigger'ın türeteceği değerlerle yazıldı
       (fixture DB'yi taklit ediyor, DB'yi çağırmıyor).
       `continuation_note` caption istemine giren alan — §4b'nin gereği. */
    row({
      id: DEMO_CHAIN_ROOT_ID,
      platform: "instagram", kind: "carousel", media_type: "CAROUSEL", status: "published",
      title: "Ekipman rehberi 1: değirmen",
      hook: "Tek bir alet alacaksan, o değirmendir.",
      body: "Bıçaklı değirmen kahveyi kırar, konik dişli öğütür. Fark bardakta ilk yudumda duyuluyor.",
      hashtags: "#ekipman #değirmen",
      published_at: at(now, -14, "18:00"), scheduled_at: at(now, -14, "18:00"),
      is_best_time: true, external_post_id: "ig_17960",
      root_id: DEMO_CHAIN_ROOT_ID, chain_position: 1,
      topic_key: "ekipman-rehberi",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000032",
      platform: "instagram", kind: "carousel", media_type: "CAROUSEL", status: "published",
      title: "Ekipman rehberi 2: su ve sıcaklık",
      hook: "Değirmeni hallettik. Sırada bardağın %98'ini oluşturan şey var.",
      body: "Şebeke suyu bölgeye göre 40-300 ppm arasında değişiyor. 75-150 ppm aralığı en dengeli ekstraksiyonu veriyor.",
      hashtags: "#ekipman #su #kahve",
      published_at: at(now, -7, "18:00"), scheduled_at: at(now, -7, "18:00"),
      is_best_time: true, external_post_id: "ig_18001",
      parent_id: DEMO_CHAIN_ROOT_ID, root_id: DEMO_CHAIN_ROOT_ID, chain_position: 2,
      continuation_note: "1. bölümdeki değirmen tavsiyesine atıf yapar, oradan devam eder.",
      topic_key: "ekipman-rehberi",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000033",
      platform: "instagram", kind: "reels", media_type: "REELS", status: "scheduled",
      title: "Ekipman rehberi 3: terazi ve zaman",
      hook: "Son parça: ölçmediğin şeyi tekrarlayamazsın.",
      body: "0,1 g hassasiyet ve dahili kronometre. Kahve-su oranını sabitleyince değişkeniniz tek kalıyor: öğütme.",
      hashtags: "#ekipman #terazi #demleme",
      scheduled_at: at(now, 2, "18:00"), is_best_time: true,
      parent_id: "10000000-0000-4000-8000-000000000032",
      root_id: DEMO_CHAIN_ROOT_ID, chain_position: 3,
      continuation_note: "1. ve 2. bölümü kapatır; üçlü seriyi tamamlar.",
      topic_key: "ekipman-rehberi",
    }),

    /* ── Bugün ve gelecek — /dashboard takvimi + /queue ──────────────────── */
    row({
      id: "10000000-0000-4000-8000-000000000009",
      platform: "instagram", kind: "image", status: "publishing",
      title: "Cuma kavurması raflarda",
      hook: "Huila bu sabah paketlendi.",
      body: "500 g ve 250 g olarak rafta; online stok da güncellendi.",
      hashtags: "#tazekavurma",
      scheduled_at: at(now, 0, "11:00"),
      topic_key: "kavurma-gunlugu",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000010",
      platform: "instagram", kind: "reels", media_type: "REELS", status: "scheduled",
      title: "Aeropress'te ters yöntem",
      hook: "Standart yöntem damlatıyor. Ters çevirince damlatmıyor.",
      body: "15 g kahve, 220 g su, 2 dakika bekleme, 30 saniye pres.",
      hashtags: "#aeropress #demleme",
      scheduled_at: at(now, 0, "18:00"), is_best_time: true,
      topic_key: "demleme-yontemi",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000011",
      platform: "x", kind: "text", status: "scheduled",
      title: "Kavurma tarihi anketi",
      hook: "Paketteki kavurma tarihine bakıyor musunuz?",
      body: "",
      scheduled_at: at(now, 1, "12:30"),
      topic_key: "tazelik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000012",
      platform: "linkedin", kind: "text", status: "scheduled",
      title: "Ekim kurumsal hediye takvimi",
      hook: "Yılbaşı siparişleri için son tarih 15 Kasım.",
      body: "50+ adet siparişlerde logo baskı ve özel not kartı dahil.",
      hashtags: "#kurumsalhediye",
      scheduled_at: at(now, 1, "09:00"),
      topic_key: "kurumsal-hediye",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000013",
      platform: "tiktok", kind: "video", media_type: "VIDEO", status: "needs_review",
      title: "Bir günde kaç kilo kavuruyoruz",
      hook: "06:30'dan 14:00'e kadar tek çekim, hızlandırılmış.",
      body: "Haftada 400 kg. Bu videoda bir günün 90 kilosu var.",
      hashtags: "#kavurma #behindthescenes",
      scheduled_at: at(now, 3, "19:30"),
      topic_key: "kavurma-gunlugu",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000014",
      platform: "instagram", kind: "story", media_type: "STORIES", status: "needs_review",
      title: "Cumartesi tadım masası",
      hook: "11:00'de dükkânda üç köken yan yana.",
      body: "Ücretsiz, kayıt yok, kontenjan 12 kişi.",
      hashtags: "",
      scheduled_at: at(now, 4, "11:00"),
      topic_key: "etkinlik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000015",
      platform: "linkedin", kind: "carousel", media_type: "CAROUSEL", status: "scheduled",
      title: "Üreticiden doğrudan alım nasıl işliyor",
      hook: "Aracı sayısı üçten bire indi; fark çiftçide kaldı.",
      body: "Kolombiya'daki kooperatifle üçüncü yılımız. Kilogram başına ödediğimiz fiyat borsa fiyatının %62 üzerinde.",
      hashtags: "#directtrade #kahve",
      scheduled_at: at(now, 5, "09:30"),
      topic_key: "tedarik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000016",
      platform: "instagram", kind: "image", status: "scheduled",
      title: "Yeni parti: Guatemala Antigua",
      hook: "Kakao, badem, koyu şeker. Espresso için de iyi.",
      body: "Salı sabahı rafta ve online.",
      hashtags: "#tekköken #guatemala",
      scheduled_at: at(now, 6, "18:00"), is_best_time: true,
      topic_key: "yeni-parti",
    }),

    /* ── Kenar durumlar — ürünün tamamını anlatan satırlar ───────────────── */
    row({
      id: "10000000-0000-4000-8000-000000000017",
      platform: "x", kind: "text", status: "failed",
      title: "Hafta sonu dükkân saatleri",
      hook: "Cumartesi 09:00-19:00, Pazar 10:00-18:00.",
      body: "",
      scheduled_at: at(now, -1, "13:00"),
      topic_key: "duyuru",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000018",
      platform: "instagram", kind: "image", status: "draft",
      title: "Abonelik kutusunun içi",
      hook: "",
      body: "",
      topic_key: "abonelik",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000019",
      platform: "linkedin", kind: "text", status: "draft",
      title: "Kavurma ustamızla söyleşi",
      hook: "",
      body: "",
      topic_key: "ekip",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000020",
      platform: "instagram", kind: "image", status: "idea",
      title: "Espresso için öğütme ayarı",
      hook: "",
      body: "",
      day_offset: 8, time_of_day: "18:00",
      topic_key: "ekipman",
    }),
    row({
      id: "10000000-0000-4000-8000-000000000021",
      platform: "x", kind: "thread", status: "idea",
      title: "Ekstraksiyon nedir, üç tweet",
      hook: "",
      body: "",
      day_offset: 9, time_of_day: "12:30",
      topic_key: "demleme-yontemi",
    }),
    /* ⭐ `archived` — "üretme" dedik ama satır DURUYOR. §4a: silinen içerik
       tekrar motorunun hafızasından da çıkar ve AI aynı fikri iki hafta sonra
       yeniden önerir. Bu satır §4c'nin `duplicate_blocked` aktivitesiyle
       eşleşiyor (bkz. activity.ts). */
    row({
      id: "10000000-0000-4000-8000-000000000022",
      platform: "instagram", kind: "image", status: "archived",
      title: "Kavurma tarihi neden önemli",
      hook: "Kahve bozulmaz, yaşlanır.",
      body: "",
      topic_key: "tazelik",
      content_fingerprint: "a1f4c0b7e2d9",
    }),
  ];
}

/**
 * ← threadly `lib/demo/data.ts:266` `sampleDrafts`. Uyarlama: anahtarlar
 * PascalCase'ten küçük harfe (§1.2), metinler demo markanın sesine yazıldı.
 * `CopyPort.demo` bunu döndürüyor.
 */
export const DEMO_CAPTION_DRAFTS = {
  instagram: {
    hook: "Çekirdeği değil, tarihi oku.",
    body: "Paketin üstündeki kavurma tarihi son kullanma tarihinden daha çok şey söyler. 7-21 gün aralığı, aromanın en açık olduğu pencere. Daha eskisi kötü değil — sadece daha sessiz.",
    hashtags: "#tazekavurma #filtrekahve #tekköken",
  },
  linkedin: {
    hook: "Perakendede tazelik bir pazarlama sözü değil, bir stok kararıdır.",
    body: "Kavurma tarihini pakete yazmaya başladığımızda iade oranımız düştü ama stok devir hızımız da düştü. İkisini birlikte yönetmek için haftalık kavurma planını satış verisine bağladık.",
    hashtags: "#perakende #operasyon",
  },
  x: {
    hook: "Kahve bozulmuyor. Yaşlanıyor.",
    body: "Bu yüzden pakette son kullanma değil kavurma tarihi yazıyor.",
    hashtags: "",
  },
} as const;
