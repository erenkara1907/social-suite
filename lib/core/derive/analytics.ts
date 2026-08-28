/**
 * ← siraya/lib/data/derive-analytics.ts
 * Uyarlama: `lib/demo/data`, `lib/i18n/config` ve `components/app/trend-chart`
 * bağları KOPARILDI → `lib/core/types` (bir çekirdek modül bir BİLEŞENE
 * bağlanamaz); `PostRow` → `ContentItemRow`, `post_id` → `content_item_id`
 * (§4a birleşik tablo). Gövde mantığı aynen.
 */
import {
  PLATFORMS, PLATFORM_META,
  type BestWindow, type L, type MetricRow, type MixSlice, type Platform,
  type ContentItemRow, type TopPost, type TrendPoint,
} from "@/lib/core/types";
import { DEFAULT_TZ, dayKey, zonedParts } from "@/lib/core/tz";
import { WEEKDAYS } from "@/lib/core/derive/calendar";

export const HEATMAP_WINDOWS = ["06–09", "09–12", "12–15", "15–18", "18–21", "21–24"];
const WINDOW_RANGES = ["06:00–09:00", "09:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00", "21:00–24:00"];

/** Latest metric row per post — collection runs repeatedly, we want the newest. */
export function latestMetrics(metrics: MetricRow[]): Map<string, MetricRow> {
  const byPost = new Map<string, MetricRow>();
  for (const m of metrics) {
    const seen = byPost.get(m.content_item_id);
    if (!seen || m.collected_at > seen.collected_at) byPost.set(m.content_item_id, m);
  }
  return byPost;
}

/**
 * Engagement by weekday × three-hour window, normalised to 0–100 against the
 * best slot. Posts before 06:00 are folded into the first window rather than
 * dropped — the grid starts at 06 but the data should not vanish.
 */
export function buildHeatmap(posts: ContentItemRow[], metrics: MetricRow[], tz = DEFAULT_TZ) {
  const latest = latestMetrics(metrics);
  const totals = Array.from({ length: 7 }, () => Array(6).fill(0) as number[]);
  const counts = Array.from({ length: 7 }, () => Array(6).fill(0) as number[]);

  for (const post of posts) {
    const instant = post.published_at ?? post.scheduled_at;
    if (!instant) continue;
    const metric = latest.get(post.id);
    if (!metric) continue;

    const { weekday, hour } = zonedParts(instant, tz);
    const windowIdx = Math.min(5, Math.max(0, Math.floor((hour - 6) / 3)));
    totals[weekday][windowIdx] += Number(metric.engagement_rate);
    counts[weekday][windowIdx] += 1;
  }

  const averages = totals.map((row, d) => row.map((sum, w) => (counts[d][w] ? sum / counts[d][w] : 0)));
  const peak = Math.max(...averages.flat());
  if (peak === 0) return { heatmap: averages.map((row) => row.map(() => 0)), bestWindows: [] as BestWindow[] };

  const heatmap = averages.map((row) => row.map((v) => Math.round((v / peak) * 100)));

  const bestWindows: BestWindow[] = heatmap
    .flatMap((row, d) => row.map((score, w) => ({ d, w, score })))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({
      day: { tr: WEEKDAYS.tr[x.d], en: WEEKDAYS.en[x.d] },
      time: WINDOW_RANGES[x.w],
      score: x.score,
    }));

  return { heatmap, bestWindows };
}

/**
 * ⭐ adım 9 A1 — `/dashboard`'ın "bu ay erişim" KPI'sı. Ham `content_metrics`
 * satırları bağımsız olaylar DEĞİL, aynı içeriğin `h6`/`d1`/`final`
 * fotoğrafları — toplamak aynı gönderiyi üç kez sayıp erişimi şişirir.
 * `/analytics`'in kullandığı mantığın aynısı: içerik başına en son ölçüm,
 * `h6` hariç (D1, `brand_latest_metrics`). Yalnızca bu ay YAYINLANMIŞ
 * içerikler sayılır — "bu ay ne kadar ölçüm toplandığı" değil, "bu ay
 * yayınlananların erişimi" sorusu.
 */
export function buildMonthlyReach(
  items: ContentItemRow[],
  metrics: MetricRow[],
  now: Date,
  tz = DEFAULT_TZ,
): number {
  const eligible = metrics.filter((m) => m.tier !== "h6");
  const latest = latestMetrics(eligible);
  const target = zonedParts(now, tz);

  return items
    .filter((item) => {
      if (item.status !== "published" || !item.published_at) return false;
      const published = zonedParts(item.published_at, tz);
      return published.year === target.year && published.month === target.month;
    })
    .reduce((sum, item) => sum + (latest.get(item.id)?.reach ?? 0), 0);
}

/** Reach per day for the last 14 days, oldest first. */
export function buildReach14d(metrics: MetricRow[], now: Date, tz = DEFAULT_TZ): number[] {
  const byDay = new Map<string, number>();
  for (const m of metrics) {
    const key = dayKey(m.collected_at, tz);
    byDay.set(key, (byDay.get(key) ?? 0) + m.reach);
  }

  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return byDay.get(dayKey(d, tz)) ?? 0;
  });
}

/** Average engagement rate per week for the last 6 weeks, oldest first. */
export function buildEngagementTrend(metrics: MetricRow[], now: Date) {
  const buckets = Array.from({ length: 6 }, () => ({ sum: 0, count: 0 }));
  const start = now.getTime() - 6 * 7 * 86400000;

  for (const m of metrics) {
    const t = new Date(m.collected_at).getTime();
    if (t < start || t > now.getTime()) continue;
    const week = Math.min(5, Math.floor((t - start) / (7 * 86400000)));
    buckets[week].sum += Number(m.engagement_rate);
    buckets[week].count += 1;
  }

  const trend: TrendPoint[] = buckets.map((b, i) => ({
    label: `Wk ${i + 1}`,
    value: b.count ? Number((b.sum / b.count).toFixed(1)) : 0,
  }));

  const withData = trend.filter((p) => p.value > 0);
  const delta = withData.length >= 2 ? Number((withData[withData.length - 1].value - withData[0].value).toFixed(1)) : 0;

  return { trend, delta };
}

/** Published posts ranked by reach. */
export function buildTopPosts(posts: ContentItemRow[], metrics: MetricRow[], tz = DEFAULT_TZ): TopPost[] {
  const latest = latestMetrics(metrics);

  const scored = posts
    .filter((p) => p.status === "published" && latest.has(p.id))
    .map((post) => ({ post, metric: latest.get(post.id)! }))
    .sort((a, b) => b.metric.reach - a.metric.reach)
    .slice(0, 5);

  return scored.map(({ post, metric }) => {
    const { day, month } = zonedParts(post.published_at ?? post.scheduled_at!, tz);
    const shortTr = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"][month - 1];
    const shortEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];

    return {
      id: post.id,
      platform: post.platform,
      title: { tr: post.title, en: post.title } as L,
      reach: metric.reach >= 1000 ? `${(metric.reach / 1000).toFixed(1)}K` : String(metric.reach),
      engagement: Number(Number(metric.engagement_rate).toFixed(1)),
      when: { tr: `${day} ${shortTr}`, en: `${shortEn} ${day}` } as L,
    };
  });
}

export function buildReachByPlatform(posts: ContentItemRow[], metrics: MetricRow[]) {
  const latest = latestMetrics(metrics);
  const totals = new Map<Platform, number>();

  for (const post of posts) {
    const m = latest.get(post.id);
    if (!m) continue;
    totals.set(post.platform, (totals.get(post.platform) ?? 0) + m.reach);
  }

  return PLATFORMS.filter((p) => totals.has(p)).map((platform) => ({ platform, value: totals.get(platform)! }));
}

/**
 * Share of the plan per platform. The kit's demo splits by post format, but
 * nothing records a format yet — platform is the mix we can honestly show.
 */
export function buildMix(posts: ContentItemRow[]): MixSlice[] {
  const counts = new Map<Platform, number>();
  for (const p of posts) counts.set(p.platform, (counts.get(p.platform) ?? 0) + 1);

  const total = posts.length;
  if (total === 0) return [];

  return PLATFORMS.filter((p) => counts.has(p)).map((platform) => ({
    key: platform,
    label: { tr: PLATFORM_META[platform].name, en: PLATFORM_META[platform].name },
    value: Math.round((counts.get(platform)! / total) * 100),
    hue: PLATFORM_META[platform].hue,
  }));
}
