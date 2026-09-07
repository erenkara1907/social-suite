/**
 * Tier ataması + "sırası geldi mi" — §12 adım 18, `BIRLESIM_PLANI` §4f'in
 * periyot tablosu:
 *
 *   0–48 saat  : 6 saatte bir → h6
 *   2–30 gün   : günde bir    → d1
 *   30. gün    : son ölçüm, sonra durur → final
 *
 * Tek gerçek kaynak burada — hem `/api/cron/metrics`'in tarayıcısı
 * (`lib/core/metrics/schedule.ts`, "kuyruğa girsin mi") hem
 * `metrics_collect` işleyicisinin kendisi (`lib/server/metrics/collect.ts`,
 * "hangi tier'ı yazayım") AYNI fonksiyonu çağırır. İşleyici tier'ı
 * payload'tan DEĞİL, kendi çalıştığı ANDA bu fonksiyondan yeniden hesaplar —
 * iş kuyrukta beklerken (backoff, worker gecikmesi) yaş ilerlemiş olabilir,
 * tarama anındaki tier BAYATLAMIŞ olabilir.
 *
 * `lib/core/README.md`'nin saflık kapısına uyar: Next'e, Supabase'e, ortam
 * değişkeni okumaya bağımlı değil — yalnızca `Date` aritmetiği.
 */
import type { MetricTier } from "@/lib/core/types";

export const H6_WINDOW_HOURS = 48;
export const H6_INTERVAL_HOURS = 6;
export const D1_INTERVAL_HOURS = 24;
export const FINAL_WINDOW_DAYS = 30;

export interface LatestMetricPoint {
  tier: MetricTier;
  collectedAt: Date;
}

export interface MetricsDueCheck {
  due: boolean;
  /** `due` iken yazılacak tier; `due:false` iken anlamsız (`null`). */
  tier: MetricTier | null;
}

const HOUR_MS = 3_600_000;

/**
 * @param publishedAt İçeriğin GERÇEKTEN yayınlandığı an (`content_items.published_at`).
 * @param now Şu an.
 * @param latest Bu içerik için en son yazılmış ölçüm (tier ne olursa olsun,
 *   h6 DAHİL — burada "en son ne yazdık" sorusu, D1'in "en son okunabilir
 *   ölçüm" sorusundan FARKLI, o `h6` hariç tutuyordu).
 */
export function metricsCollectionStatus(
  publishedAt: Date,
  now: Date,
  latest: LatestMetricPoint | null,
): MetricsDueCheck {
  // `final` yazıldıktan sonra o içerik bir daha taranmaz (§4f).
  if (latest?.tier === "final") return { due: false, tier: null };

  const ageHours = (now.getTime() - publishedAt.getTime()) / HOUR_MS;
  if (ageHours < 0) return { due: false, tier: null }; // henüz yayınlanmadı — savunma, olmamalı

  const ageDays = ageHours / 24;

  // 30. gün (veya sonrası — geç yakalanan eski içerik) → tek seferlik SON ölçüm.
  if (ageDays >= FINAL_WINDOW_DAYS) return { due: true, tier: "final" };

  if (ageHours < H6_WINDOW_HOURS) {
    if (!latest) return { due: true, tier: "h6" };
    const sinceLastHours = (now.getTime() - latest.collectedAt.getTime()) / HOUR_MS;
    return { due: sinceLastHours >= H6_INTERVAL_HOURS, tier: "h6" };
  }

  // 2–30 gün penceresi: h6'dan d1'e geçiş anı (yaş 48 saati aştı ama son
  // yazılan hâlâ h6) — beklemeden hemen toplanır, sonra günde bir.
  if (!latest || latest.tier === "h6") return { due: true, tier: "d1" };
  const sinceLastHours = (now.getTime() - latest.collectedAt.getTime()) / HOUR_MS;
  return { due: sinceLastHours >= D1_INTERVAL_HOURS, tier: "d1" };
}
