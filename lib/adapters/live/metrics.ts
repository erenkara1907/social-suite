/**
 * MetricsPort — CANLI implementasyon. §12 adım 18 FAZ B2.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ.
 *
 * `list()` ham satırları döner (h6 dahil) — `/analytics`in zaman serisi
 * çizen fonksiyonları (`buildReach14d`, `buildEngagementTrend`, h6 sayacı)
 * bunu ister; oturum istemcisiyle doğrudan `content_metrics` okur (RLS
 * "brand metrics read" politikası, `owns_brand(brand_id)`).
 *
 * `latest()` ⭐ D1'in TEK gerçek kaynağı: `brand_latest_metrics(brand_id,
 * days)` SQL fonksiyonu (`00_schema.sql` §6) — içerik başına EN SON ölçüm,
 * `h6` hariç. Burada İKİNCİ bir "distinct on" kopyası YAZILMAZ; SQL zaten
 * tek kaynak, `/analytics` ve geri besleme (§8.3) aynı satırları görür.
 */
import type { MetricsPort } from "@/lib/adapters/ports";
import type { MetricRow, MetricTier } from "@/lib/core/types";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

interface ContentMetricsRow {
  content_item_id: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  tier: MetricTier;
  collected_at: string;
}

interface BrandLatestMetricsRow {
  content_item_id: string;
  tier: MetricTier;
  collected_at: string;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  engagement_rate: number;
  tier_weight: number;
}

export const liveMetrics: MetricsPort = {
  async list(days) {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("content_metrics")
      .select("content_item_id,reach,likes,comments,shares,engagement_rate,tier,collected_at")
      .eq("brand_id", brand.id)
      .gte("collected_at", cutoff)
      .order("collected_at", { ascending: true })
      .returns<ContentMetricsRow[]>();
    if (error) throw new Error(`content_metrics listelenemedi: ${error.message}`);
    return data ?? [];
  },

  async latest(days) {
    const { brand } = await requireBrand();
    const supabase = await createClient();

    const { data, error } = await supabase
      .rpc("brand_latest_metrics", { p_brand_id: brand.id, p_days: days });
    if (error) throw new Error(`brand_latest_metrics çağrısı başarısız: ${error.message}`);

    const rows: MetricRow[] = ((data ?? []) as BrandLatestMetricsRow[]).map((r) => ({
      content_item_id: r.content_item_id,
      reach: r.reach,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      engagement_rate: Number(r.engagement_rate),
      tier: r.tier,
      collected_at: r.collected_at,
    }));
    return rows;
  },
};
