/**
 * ← siraya/lib/data/types.ts + threadly/lib/demo/data.ts (tip kısımları)
 *   + siraya/lib/demo/data.ts (tip kısımları)
 * Uyarlama: üç projenin tip birleşimi; `lib/demo/data` ve `components/app/
 * trend-chart` bağımlılıkları koparıldı, enum değerleri §1.2 gereği küçük harf.
 *
 * Bu dosya `lib/core/`'un kökü — saflık kuralları için lib/core/README.md.
 * Değerler `supabase/00_schema.sql`'deki CHECK listeleriyle BİREBİR aynı olmak
 * zorunda; şema değişirse burası da değişir.
 */

/* ── Çeviri ilkeli ───────────────────────────────────────────────────────── */

/** Çevrilebilir metin. ← lib/i18n/config.ts'teki `L` ile aynı şekil.
 *  Burada yeniden bildiriliyor ki `lib/core/` i18n'e bağlanmasın. */
export interface L {
  tr: string;
  en: string;
}

export const LANGS = ["tr", "en"] as const;
export type Lang = (typeof LANGS)[number];

/* ── Platform ────────────────────────────────────────────────────────────── */

/**
 * ⭐ §1.2 — değerler KÜÇÜK HARF ve `00_schema.sql:219,369`'un CHECK listesiyle
 * birebir. threadly `'X' | 'LinkedIn' | 'Instagram'` (PascalCase) kullanıyordu;
 * o değerler görünen etiketti, kanonik anahtar değil. Etiket artık
 * `PLATFORM_META`'da yaşıyor.
 */
export const PLATFORMS = ["instagram", "x", "linkedin", "tiktok", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Görünen etiket + ikon + hue. `name` alanı threadly'nin eski PascalCase
 * değerlerinin gittiği yer — dönüşüm burada kapanıyor.
 *
 * NOT (siraya'dan korundu): lucide-react v1 marka glifi taşımıyor (instagram/
 * twitter/linkedin ikonu yok). Her platform var olan nötr bir lucide ikonuna
 * eşleniyor.
 */
export const PLATFORM_META: Record<Platform, { name: string; icon: string; hue: string; short: string }> = {
  instagram: { name: "Instagram", icon: "camera", hue: "350", short: "ig" },
  x: { name: "X", icon: "at-sign", hue: "230", short: "X" },
  linkedin: { name: "LinkedIn", icon: "briefcase", hue: "245", short: "in" },
  tiktok: { name: "TikTok", icon: "music-2", hue: "190", short: "tt" },
  youtube: { name: "YouTube", icon: "play", hue: "0", short: "yt" },
};

/**
 * Planlayıcının (threadly kökenli) yazdığı platformlar. threadly'nin
 * `Channel = "X" | "LinkedIn" | "Instagram"` union'ının küçük harf karşılığı.
 * `Platform`'un ALT KÜMESİ — tiktok/youtube yayıncısı §8.8'de gelecek.
 */
export const PLAN_CHANNELS = ["x", "linkedin", "instagram"] as const;
export type PlanChannel = (typeof PLAN_CHANNELS)[number];

/** PascalCase → küçük harf. Yalnızca threadly kökenli veri/istem göçü için. */
export function normalizePlatform(value: string): Platform | null {
  const lower = value.trim().toLowerCase();
  return (PLATFORMS as readonly string[]).includes(lower) ? (lower as Platform) : null;
}

/* ── İçerik durumu ───────────────────────────────────────────────────────── */

/** ⭐ §1.2 + §4a — sekiz değer, `00_schema.sql:397` ile birebir. */
export const POST_STATUSES = [
  "idea", "draft", "needs_review", "scheduled",
  "publishing", "published", "failed", "archived",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const STATUS_LABEL: Record<PostStatus, L> = {
  idea: { tr: "Fikir", en: "Idea" },
  draft: { tr: "Taslak", en: "Draft" },
  needs_review: { tr: "Onay bekliyor", en: "Needs review" },
  scheduled: { tr: "Sırada", en: "Scheduled" },
  publishing: { tr: "Yayınlanıyor", en: "Publishing" },
  published: { tr: "Yayında", en: "Published" },
  failed: { tr: "Başarısız", en: "Failed" },
  archived: { tr: "Arşivde", en: "Archived" },
};

export const STATUS_TONE: Record<PostStatus, "info" | "neutral" | "success" | "warning" | "destructive" | "primary"> = {
  idea: "neutral",
  draft: "neutral",
  needs_review: "warning",
  scheduled: "info",
  publishing: "primary",
  published: "success",
  failed: "destructive",
  archived: "neutral",
};

/* ── İçerik biçimi ───────────────────────────────────────────────────────── */

/** ← threadly. Zaten küçük harfti. `00_schema.sql:373` ile birebir. */
export const POST_KINDS = [
  "text", "thread", "carousel", "image", "video", "story", "reels",
] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const KIND_ICON: Record<PostKind, string> = {
  text: "type",
  thread: "list",
  carousel: "layout-grid",
  image: "image",
  video: "clapperboard",
  story: "circle-dot",
  reels: "film",
};

export const KIND_LABEL: Record<PostKind, L> = {
  text: { tr: "Metin", en: "Text" },
  thread: { tr: "Thread", en: "Thread" },
  carousel: { tr: "Karusel", en: "Carousel" },
  image: { tr: "Görsel", en: "Image" },
  video: { tr: "Video", en: "Video" },
  story: { tr: "Hikaye", en: "Story" },
  reels: { tr: "Reels", en: "Reels" },
};

/* ── Aktivite ────────────────────────────────────────────────────────────── */

/** ⭐ §1.2 — on iki değer, `00_schema.sql:755` ile birebir. */
export const ACTIVITY_ACTIONS = [
  "queued", "approved", "published", "failed",
  "shifted_to_best_time", "plan_generated", "caption_written",
  "ugc_requested", "ugc_ready", "duplicate_blocked",
  "continuation_created", "metrics_collected",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/* ── Metrik katmanı ──────────────────────────────────────────────────────── */

/** ⭐ D1 — `final` "artık toplama yapılmaz" demek, "okunabilir tek satır" değil. */
export const METRIC_TIERS = ["h6", "d1", "final"] as const;
export type MetricTier = (typeof METRIC_TIERS)[number];

/* ── Satırlar — Supabase'den geldikleri hâl ──────────────────────────────── */

export interface ContentItemRow {
  id: string;
  brand_id: string;
  channel_id: string | null;
  platform: Platform;
  kind: PostKind;
  day_offset: number | null;
  time_of_day: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  is_best_time: boolean;
  title: string;
  hook: string;
  body: string;
  hashtags: string;
  media_url: string | null;
  status: PostStatus;
}

export interface ChannelRow {
  id: string;
  platform: Platform;
  handle: string;
  followers: number;
  growth: number;
  engagement: number;
  is_connected: boolean;
}

export interface MetricRow {
  content_item_id: string;
  reach: number;
  engagement_rate: number;
  tier: MetricTier;
  collected_at: string;
}

export interface ActivityRow {
  id: string;
  actor: string;
  action: ActivityAction;
  target: string;
  created_at: string;
}

/* ── Sayfaların render ettiği görünüm modelleri ──────────────────────────── */

/** ← components/app/trend-chart.tsx. Bağ KOPARILDI: `lib/core/` bir bileşene
 *  bağlanamaz. Şekil birebir aynı, bileşen bunu import edecek. */
export interface TrendPoint {
  label: string;
  value: number;
}

export interface MixSlice {
  key: string;
  label: L;
  value: number;
  hue: string;
}

export interface MonthPost {
  platform: Platform;
  time: string;
  status: PostStatus;
}

export interface MonthCell {
  key: string;
  d: number;
  mo: boolean;
  today?: boolean;
  posts: MonthPost[];
}

export interface WeekPost {
  id: string;
  day: number;
  hour: string;
  platform: Platform;
  title: L;
  status: PostStatus;
}

export interface BestWindow {
  day: L;
  time: string;
  score: number;
}

export interface TopPost {
  id: string;
  platform: Platform;
  title: L;
  reach: string;
  engagement: number;
  when: L;
}

/** Bağlı hesap. siraya'da `Channel` adındaydı; threadly'nin `Channel`
 *  (platform union'ı) ile çakışıyordu — o çakışma burada isimle çözüldü. */
export interface ChannelAccount {
  id: string;
  platform: Platform;
  handle: string;
  followers: string;
  followerNum: number;
  growth: number;
  scheduled: number;
  engagement: number;
  connected: boolean;
}

export interface QueueItem {
  id: string;
  platform: Platform;
  title: L;
  body: L;
  when: L;
  slot: string;
  status: PostStatus;
  best?: boolean;
}

export interface DKpi {
  label: L;
  value: string;
  delta?: number;
  icon?: string;
  hint?: L;
  tone?: 1 | 2 | 3 | 4;
}
