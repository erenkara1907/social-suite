import { port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import {
  anyPlatformProvidesReach, buildEngagementTrend, buildHeatmap, buildReach14d, buildTopPosts, latestMetrics,
} from "@/lib/core/derive/analytics";
import type { MetricTier } from "@/lib/core/types";
import { AnalyticsView } from "@/components/app/analytics-view";

export const metadata = { title: "Analitik" };

/**
 * `/analytics` — BIRLESIM_PLANI §12 adım 8c (FAZ C).
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⭐ D1 — geri besleme `tier='final'` DEĞİL, içerik başına EN SON MEVCUT
 * ölçümü okur (`MetricsPort.latest()`, `h6` hariç). 45 günlük pencere
 * fixture'daki en eski `final` ölçümünü (yayından 30 gün sonra toplanan)
 * rahatça kapsıyor; canlıda da 30 günlük toplama + birkaç günlük tampon.
 */
const METRIC_WINDOW_DAYS = 45;

export default async function Page() {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  const contentPort = port("content", overrides);
  const metricsPort = port("metrics", overrides);

  const [items, rawMetrics, latestRows] = await Promise.all([
    contentPort.list({ status: ["published"] }),
    metricsPort.list(METRIC_WINDOW_DAYS),
    metricsPort.latest(METRIC_WINDOW_DAYS),
  ]);

  const now = new Date();
  const heatmap = buildHeatmap(items, latestRows, brand.timezone);
  const reach14d = buildReach14d(rawMetrics, now, brand.timezone);
  const { trend, delta } = buildEngagementTrend(rawMetrics, now);
  const topPosts = buildTopPosts(items, latestRows, brand.timezone);

  // ⭐ D1'in ekrandaki kanıtı: hangi top-post'un ölçümü `final`, hangisi
  // hâlâ `d1` — latestMetrics() zaten `latestRows`'tan (h6 hariç) türetildi.
  const latestByContent = latestMetrics(latestRows);
  const topPostTiers: Record<string, MetricTier | null> = Object.fromEntries(
    topPosts.map((p) => [p.id, latestByContent.get(p.id)?.tier ?? null]),
  );

  let finalCount = 0;
  let d1Count = 0;
  for (const row of latestByContent.values()) {
    if (row.tier === "final") finalCount += 1;
    else if (row.tier === "d1") d1Count += 1;
  }

  // ⭐ h6'nın hesaba GİRMEDİĞİNİN kanıtı: latestRows zaten h6'sız
  // (demoMetrics.latest() filtreliyor); ham sayım burada, ekranda görünür.
  const h6ExcludedCount = rawMetrics.filter((m) => m.tier === "h6").length;

  // ⭐ D11 — "0" ile "bu platform ölçmüyor" karışmasın; erişim kartı buna
  // göre dürüst bir durum render eder.
  const reachProvided = anyPlatformProvidesReach(items);

  return (
    <AnalyticsView
      reachProvided={reachProvided}
      reach14d={reach14d}
      trend={trend}
      trendDelta={delta}
      heatmap={heatmap.heatmap}
      bestWindows={heatmap.bestWindows}
      topPosts={topPosts}
      topPostTiers={topPostTiers}
      publishedCount={items.length}
      finalCount={finalCount}
      d1Count={d1Count}
      h6ExcludedCount={h6ExcludedCount}
    />
  );
}
