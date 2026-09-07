import { verifyCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueInternal } from "@/lib/server/jobs/enqueue-internal";
import { pickDueMetricsTargets, type MetricsScanItem } from "@/lib/core/metrics/schedule";
import { refreshBlueskyChannelStats } from "@/lib/server/metrics/collect";
import type { MetricTier } from "@/lib/core/types";

/**
 * `/api/cron/metrics` — BIRLESIM_PLANI §12 adım 18 FAZ A2/B1.
 *
 * `sm-metrics` cron girdisi `00_schema.sql`'de zaten kurulu (saatte bir,
 * `17 * * * *` — dakikanın 17'sinde, adım 17a'nın `sm-publish`/`sm-worker`
 * tetiklemeleriyle aynı anda çakışmasın diye) ve bu tam yolu hedefliyordu;
 * `docs/CRON_AKTIVASYON.md`'nin "rotası yazılmamış job pasif kalır"
 * kuralı yüzünden bugüne kadar pasifti.
 *
 * ⭐ İKİ ayrı iş yapar, `sm-reaper`'ın tek rotada iki sweep çalıştırdığı
 * desenin aynısı:
 *   1. İçerik-düzeyi tarama — hangi `content_items` satırlarının metrik
 *      toplama sırası geldi (`lib/core/metrics/schedule.ts`), her biri için
 *      AYRI bir `metrics_collect` işi açar (`publish`le AYNI granülerlik —
 *      bkz. `lib/server/metrics/collect.ts` başlığı: tek içeriğin hatası
 *      diğerlerini düşürmesin).
 *   2. Kanal-düzeyi tazeleme — bağlı her Bluesky kanalı için DOĞRUDAN
 *      (kuyruğa girmeden) `getProfile` çağırır. Kuyruğa girmemesi bilinçli:
 *      tek, ucuz bir çağrı, kendi retry politikasına ihtiyacı yok.
 *
 * ⚠ Rate limit (adım 17a'da belgelenen 5000 puan/saat) YAZMA çağrılarına
 * (`createRecord`/`putRecord`) uygulanıyor; `getPosts`/`getProfile` AppView
 * SORGU uç noktaları — resmi kaynak bunların AYRI ve "cömert" (numarası
 * yayımlanmamış) bir sınıra tabi olduğunu doğruluyor (bkz.
 * `docs/ADIM_18_RAPOR.md` §A1/A3, docs.bsky.app rate-limits sayfası +
 * topluluk kaynağı taraması). Yine de bu sweep BİLEREK muhafazakâr: her
 * içerik ayrı bir iş (worker'ın `BATCH_SIZE=5`'i zaten hız kesici), her
 * kanal için saatte tek `getProfile` çağrısı.
 *
 * Retention (§4f): `tier<>'final'` satırlar 180 günden eskiyse silinir —
 * `tier='final'` SÜRESİZ kalır (içerik başına tek satır, ucuz).
 */

const RETENTION_DAYS = 180;

interface DueContentRow {
  id: string;
  brand_id: string;
  user_id: string;
  platform: string;
  status: string;
  external_post_id: string | null;
  published_at: string | null;
}

interface LatestMetricRow {
  content_item_id: string;
  tier: MetricTier;
  collected_at: string;
}

interface ConnectedChannelRow {
  id: string;
}

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const admin = createAdminClient();
  const now = new Date();

  // ── 1. İçerik-düzeyi tarama ──────────────────────────────────────────
  const { data: candidates, error: candidatesError } = await admin
    .from("content_items")
    .select("id,brand_id,user_id,platform,status,external_post_id,published_at")
    .eq("status", "published")
    .eq("platform", "bluesky")
    .not("external_post_id", "is", null)
    .returns<DueContentRow[]>();
  if (candidatesError) {
    return Response.json({ error: `content_items taraması başarısız: ${candidatesError.message}` }, { status: 500 });
  }
  const rows = candidates ?? [];

  let latestByItem = new Map<string, { tier: MetricTier; collectedAt: Date }>();
  if (rows.length > 0) {
    const { data: latestRows, error: latestError } = await admin
      .from("content_metrics")
      .select("content_item_id,tier,collected_at")
      .in("content_item_id", rows.map((r) => r.id))
      .order("collected_at", { ascending: false })
      .returns<LatestMetricRow[]>();
    if (latestError) {
      return Response.json({ error: `content_metrics taraması başarısız: ${latestError.message}` }, { status: 500 });
    }
    // İlk görülen (en yeni, çünkü zaten collected_at desc) her içerik için kalır.
    const seen = new Map<string, { tier: MetricTier; collectedAt: Date }>();
    for (const r of latestRows ?? []) {
      if (!seen.has(r.content_item_id)) seen.set(r.content_item_id, { tier: r.tier, collectedAt: new Date(r.collected_at) });
    }
    latestByItem = seen;
  }

  const scanItems: MetricsScanItem[] = rows.map((r) => ({
    id: r.id, platform: r.platform, status: r.status,
    externalPostId: r.external_post_id, publishedAt: r.published_at,
  }));
  const dueIds = pickDueMetricsTargets(scanItems, latestByItem, now);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of dueIds) {
    const row = byId.get(id);
    if (!row) continue;
    await enqueueInternal(admin, row.brand_id, row.user_id, "metrics_collect", { contentItemId: id }, {
      dedupeKey: `metrics:${id}`,
    });
  }

  // ── 2. Kanal-düzeyi tazeleme — bağlı her Bluesky kanalı, doğrudan ──────
  const { data: channels } = await admin
    .from("channels").select("id").eq("platform", "bluesky").eq("is_connected", true)
    .returns<ConnectedChannelRow[]>();
  for (const channel of channels ?? []) {
    await refreshBlueskyChannelStats(admin, channel.id);
  }

  // ── 3. Retention temizliği — final HARİÇ, 180 günden eski ham satırlar ──
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error: cleanupError, count } = await admin
    .from("content_metrics")
    .delete({ count: "exact" })
    .neq("tier", "final")
    .lt("collected_at", cutoff);

  return Response.json({
    scanned: rows.length,
    enqueued: dueIds.length,
    channelsRefreshed: (channels ?? []).length,
    retentionDeleted: cleanupError ? null : (count ?? 0),
  });
}
