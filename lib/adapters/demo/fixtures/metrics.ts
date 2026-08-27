/**
 * Metrik satırları — `/analytics` ve `/dashboard` ısı haritasının girdisi.
 *
 * ← siraya `lib/demo/data.ts:238` `reach14d`, `:240` `reachByPlatform`,
 *   `:248` `engagementTrend`, `:259` `topPosts`.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK.
 *
 * ⭐ UYARLAMA: kaynak hazır SERİLER taşıyordu (`reach14d` 14 sayı, `topPosts`
 * sıralanmış liste). Burada içerik başına ölçüm SATIRLARI var; seriler
 * `lib/core/derive/analytics.ts` ile türetiliyor. Kaynağın hâlinde bir
 * gönderiyi silmek serileri sessizce tutarsız bırakırdı.
 *
 * ⭐ D1 — TIER DAĞILIMI BİLİNÇLİ. Bazı içeriklerin `final`'i var, bazılarının
 * yalnızca `h6` + `d1`. Bu, geri beslemenin ikisini de okuduğunu KANITLAYAN
 * kurgu:
 *
 *   · 38 ve 33 gün önceki içerikler  → h6 · d1 · final   (toplama bitti)
 *   · 21 ve 14 gün öncekiler         → h6 · d1           (final YOK, olmayacak)
 *   ·  8, 7, 5, 3 gün öncekiler      → h6 · d1           (henüz erken)
 *
 * Eski kural (`tier='final'`) 21 günden yeni HER ŞEYİ geri beslemeden
 * düşürürdü — üstelik en iyi performans göstereni de. `brand_latest_metrics`
 * içerik başına EN SON satırı okuyor.
 */
import type { MetricRow } from "@/lib/core/types";
import { at } from "@/lib/adapters/demo/fixtures/clock";

/** `[contentSuffix, yayınOffset, erişim, etkileşim%, finalVar]` */
const SERIES: readonly [string, number, number, number, boolean][] = [
  ["01", -38, 9_400, 6.8, true],
  ["02", -33, 2_100, 3.1, true],
  ["31", -14, 11_200, 8.4, false],
  ["03", -21, 7_600, 5.2, false],
  ["04", -16, 3_050, 2.4, false],
  ["05", -12, 18_900, 9.7, false],
  ["32", -7, 13_400, 8.9, false],
  ["06", -8, 5_200, 4.1, false],
  ["07", -5, 2_480, 3.6, false],
  ["08", -3, 8_100, 7.2, false],
];

const CONTENT_ID_PREFIX = "10000000-0000-4000-8000-0000000000";

/** h6 ölçümü erken ve gürültülü: nihai erişimin ~%35'i. */
const H6_SHARE = 0.35;
/** d1 ölçümü oturmuş sayının ~%88'i; `final` kalanı kapatıyor. */
const D1_SHARE = 0.88;

export function demoMetricRows(now: Date): MetricRow[] {
  const rows: MetricRow[] = [];

  for (const [suffix, publishedOffset, reach, engagement, hasFinal] of SERIES) {
    const contentItemId = `${CONTENT_ID_PREFIX}${suffix}`;

    rows.push({
      content_item_id: contentItemId,
      reach: Math.round(reach * H6_SHARE),
      engagement_rate: Number((engagement * 0.7).toFixed(2)),
      tier: "h6",
      collected_at: at(now, publishedOffset, "23:00"),
    });

    rows.push({
      content_item_id: contentItemId,
      reach: hasFinal ? Math.round(reach * D1_SHARE) : reach,
      engagement_rate: Number((hasFinal ? engagement * 0.95 : engagement).toFixed(2)),
      tier: "d1",
      collected_at: at(now, publishedOffset + 1, "06:00"),
    });

    if (hasFinal) {
      rows.push({
        content_item_id: contentItemId,
        reach,
        engagement_rate: engagement,
        tier: "final",
        collected_at: at(now, publishedOffset + 30, "06:00"),
      });
    }
  }

  return rows;
}
