/**
 * MetricsPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/metrics.ts`.
 *
 * ⭐ D1 — `latest()` şemanın `brand_latest_metrics()` fonksiyonunun TS
 * karşılığı: `h6` hariç, içerik başına EN SON satır. `tier='final'` filtresi
 * DEĞİL. Fixture bunun ölçülebilir olması için kuruldu: iki içeriğin `final`'i
 * var, sekizinin yok — eski kural o sekizini geri beslemeden düşürürdü.
 */
import type { MetricsPort } from "@/lib/adapters/ports";
import type { MetricRow } from "@/lib/core/types";
import { demoMetricRows } from "@/lib/adapters/demo/fixtures/metrics";

/** §8.3 / D1 — gürültülü ilk 48 saat geri beslemeye girmez. */
const FEEDBACK_EXCLUDED_TIER = "h6";

function withinWindow(rows: MetricRow[], days: number, now: Date): MetricRow[] {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return rows.filter((r) => r.collected_at >= cutoff);
}

export const demoMetrics: MetricsPort = {
  async list(days) {
    const now = new Date();
    return withinWindow(demoMetricRows(now), days, now);
  },

  async latest(days) {
    const now = new Date();
    const rows = withinWindow(demoMetricRows(now), days, now)
      .filter((r) => r.tier !== FEEDBACK_EXCLUDED_TIER);

    // distinct on (content_item_id) order by collected_at desc
    const newest = new Map<string, MetricRow>();
    for (const row of rows) {
      const current = newest.get(row.content_item_id);
      if (!current || row.collected_at > current.collected_at) {
        newest.set(row.content_item_id, row);
      }
    }
    return [...newest.values()];
  },
};
