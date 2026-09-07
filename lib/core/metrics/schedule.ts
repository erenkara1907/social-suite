/**
 * `/api/cron/metrics`'in tarama mantığı, saf fonksiyon — §12 adım 18.
 *
 * Hangi içerikler taranır (görev metninin sorusu): `published` durumunda VE
 * platform gönderi id'si (`external_post_id`) olan satırlar. `platform`
 * ayrıca `bluesky` olmalı — toplayıcı bugün yalnızca Bluesky'yi biliyor
 * (`lib/server/metrics/collect.ts`), Instagram adım 16/17b'de ikinci bir
 * adaptör olarak gelecek (17a'nın `PublisherPort` deseninin aynısı).
 *
 * Tier kararı `lib/core/metrics/tier.ts`'e devredilir — burada İKİNCİ bir
 * kopya YOK.
 */
import { metricsCollectionStatus, type LatestMetricPoint } from "@/lib/core/metrics/tier";

export interface MetricsScanItem {
  id: string;
  platform: string;
  status: string;
  externalPostId: string | null;
  publishedAt: string | null;
}

/**
 * @param items Taranacak aday satırlar (marka/tüm markalar — çağıran karar verir).
 * @param latestByItem `content_item_id` → o içerik için en son yazılmış
 *   ölçüm (tier ne olursa olsun). Yoksa hiç toplanmamış demektir.
 * @returns Şu an toplama işi açılması gereken `content_items.id` listesi.
 */
export function pickDueMetricsTargets(
  items: MetricsScanItem[],
  latestByItem: Map<string, LatestMetricPoint>,
  now: Date,
): string[] {
  const due: string[] = [];
  for (const item of items) {
    if (item.status !== "published") continue;
    if (item.platform !== "bluesky") continue;
    if (!item.externalPostId || !item.publishedAt) continue;

    const latest = latestByItem.get(item.id) ?? null;
    const check = metricsCollectionStatus(new Date(item.publishedAt), now, latest);
    if (check.due) due.push(item.id);
  }
  return due;
}
