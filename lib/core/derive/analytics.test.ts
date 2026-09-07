import { describe, expect, it } from "vitest";
import {
  buildEngagementTrend,
  buildHeatmap,
  buildMix,
  buildMonthlyReach,
  buildReach14d,
  buildReachByPlatform,
  buildTopPosts,
  latestMetrics,
} from "@/lib/core/derive/analytics";
import type { ContentItemRow, MetricRow } from "@/lib/core/types";

/**
 * A2 — davranış ÖNCE ölçüldü (vitest + console.log ile gerçek çıktı
 * gözlendi), testler ölçülen gerçek değerlere göre yazıldı.
 */
const TZ = "Europe/Istanbul";

const BASE: Omit<ContentItemRow, "id" | "platform" | "kind" | "title" | "status"> = {
  brand_id: "b1", plan_id: null, channel_id: null, media_type: "IMAGE",
  day_offset: null, time_of_day: null, scheduled_at: null, published_at: null,
  is_best_time: false, hook: "", body: "", hashtags: "", media_url: null,
  external_post_id: null, parent_id: null, root_id: null, chain_position: 1,
  continuation_note: "", content_fingerprint: null, topic_key: null,
};

function item(
  over: Partial<ContentItemRow> & Pick<ContentItemRow, "id" | "platform" | "kind" | "title" | "status">,
): ContentItemRow {
  return { ...BASE, ...over };
}

function metric(over: Partial<MetricRow> & Pick<MetricRow, "content_item_id" | "collected_at">): MetricRow {
  return { reach: 0, likes: 0, comments: 0, shares: 0, engagement_rate: 0, tier: "final", ...over };
}

describe("latestMetrics", () => {
  it("boş girdi boş harita verir", () => {
    expect(latestMetrics([]).size).toBe(0);
  });

  it("içerik başına en son (collected_at en büyük) satırı seçer", () => {
    const rows = [
      metric({ content_item_id: "1", reach: 100, tier: "h6", collected_at: "2026-08-01T06:00:00Z" }),
      metric({ content_item_id: "1", reach: 300, tier: "final", collected_at: "2026-08-30T06:00:00Z" }),
      metric({ content_item_id: "1", reach: 200, tier: "d1", collected_at: "2026-08-02T06:00:00Z" }),
    ];
    expect(latestMetrics(rows).get("1")?.reach).toBe(300);
  });

  it("⭐ ölçüldü — tam AYNI collected_at'te İLK karşılaşılan satır kazanır (kod `>` kullanıyor, `>=` değil)", () => {
    const rows = [
      metric({ content_item_id: "1", reach: 111, tier: "d1", collected_at: "2026-08-10T00:00:00Z" }),
      metric({ content_item_id: "1", reach: 222, tier: "final", collected_at: "2026-08-10T00:00:00Z" }),
    ];
    expect(latestMetrics(rows).get("1")?.reach).toBe(111);
  });

  it("tek içerikte çoklu tier — her biri ayrı bir Map anahtarına değil, TEK anahtara yazar", () => {
    const rows = [
      metric({ content_item_id: "1", tier: "h6", collected_at: "2026-08-01T00:00:00Z" }),
      metric({ content_item_id: "1", tier: "d1", collected_at: "2026-08-02T00:00:00Z" }),
      metric({ content_item_id: "1", tier: "final", collected_at: "2026-08-30T00:00:00Z" }),
    ];
    expect(latestMetrics(rows).size).toBe(1);
  });

  it("birden çok içeriği bağımsız takip eder", () => {
    const rows = [
      metric({ content_item_id: "1", reach: 10, collected_at: "2026-08-01T00:00:00Z" }),
      metric({ content_item_id: "2", reach: 20, collected_at: "2026-08-01T00:00:00Z" }),
    ];
    const latest = latestMetrics(rows);
    expect(latest.get("1")?.reach).toBe(10);
    expect(latest.get("2")?.reach).toBe(20);
  });
});

describe("buildHeatmap", () => {
  it("boş metrikte tüm hücreler 0, bestWindows boş (peak===0 dalı)", () => {
    const { heatmap, bestWindows } = buildHeatmap([], [], TZ);
    expect(heatmap.flat().every((v) => v === 0)).toBe(true);
    expect(bestWindows).toEqual([]);
  });

  it("tek gönderiyi doğru gün × pencereye 100 olarak normalize eder", () => {
    // 2026-08-24 15:00Z = Istanbul 18:00, Pazartesi (gün 0), pencere "18:00–21:00" (indeks 4).
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-24T15:00:00Z" })];
    const metrics = [metric({ content_item_id: "1", engagement_rate: 5, collected_at: "2026-08-25T00:00:00Z" })];
    const { heatmap, bestWindows } = buildHeatmap(posts, metrics, TZ);
    expect(heatmap[0][4]).toBe(100);
    expect(heatmap.flat().filter((v) => v > 0)).toEqual([100]);
    expect(bestWindows).toEqual([{ day: { tr: "Pzt", en: "Mon" }, time: "18:00–21:00", score: 100 }]);
  });

  it("⭐ 06:00'dan önceki gönderi İLK pencereye katlanır, atılmaz", () => {
    // 2026-08-24 01:00Z = Istanbul 04:00.
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-24T01:00:00Z" })];
    const metrics = [metric({ content_item_id: "1", engagement_rate: 5, collected_at: "2026-08-25T00:00:00Z" })];
    const { heatmap } = buildHeatmap(posts, metrics, TZ);
    expect(heatmap[0][0]).toBe(100);
  });

  it("metriksiz gönderiyi atlar, patlamaz", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-24T15:00:00Z" })];
    const { heatmap, bestWindows } = buildHeatmap(posts, [], TZ);
    expect(heatmap.flat().every((v) => v === 0)).toBe(true);
    expect(bestWindows).toEqual([]);
  });

  it("ne scheduled_at ne published_at olan gönderiyi atlar", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "idea", title: "a" })];
    const metrics = [metric({ content_item_id: "1", collected_at: "2026-08-25T00:00:00Z" })];
    const { heatmap } = buildHeatmap(posts, metrics, TZ);
    expect(heatmap.flat().every((v) => v === 0)).toBe(true);
  });

  it("bestWindows en çok üç sonuç döner", () => {
    const posts = Array.from({ length: 5 }, (_, i) =>
      item({
        id: String(i), platform: "instagram", kind: "image", status: "published", title: `p${i}`,
        published_at: `2026-08-2${i}T15:00:00Z`,
      }),
    );
    const metrics = posts.map((p, i) =>
      metric({ content_item_id: p.id, engagement_rate: (i + 1) * 2, collected_at: "2026-08-30T00:00:00Z" }),
    );
    expect(buildHeatmap(posts, metrics, TZ).bestWindows.length).toBeLessThanOrEqual(3);
  });
});

describe("buildReach14d", () => {
  const NOW = new Date("2026-08-24T12:00:00Z");

  it("her zaman 14 sayı döner, veri yoksa hepsi 0", () => {
    expect(buildReach14d([], NOW, TZ)).toEqual(Array(14).fill(0));
  });

  it("⭐ en eski gün indeks 0'da, bugün indeks 13'te (oldest first)", () => {
    const metrics = [
      metric({ content_item_id: "1", reach: 50, collected_at: "2026-08-11T06:00:00Z" }), // 13 gün önce
      metric({ content_item_id: "2", reach: 100, collected_at: "2026-08-24T06:00:00Z" }), // bugün
    ];
    const series = buildReach14d(metrics, NOW, TZ);
    expect(series[0]).toBe(50);
    expect(series[13]).toBe(100);
    expect(series.slice(1, 13).every((v) => v === 0)).toBe(true);
  });

  it("aynı güne düşen birden çok satırı toplar", () => {
    const metrics = [
      metric({ content_item_id: "1", reach: 30, collected_at: "2026-08-24T02:00:00Z" }),
      metric({ content_item_id: "2", reach: 70, collected_at: "2026-08-24T20:00:00Z" }),
    ];
    expect(buildReach14d(metrics, NOW, TZ)[13]).toBe(100);
  });

  it("pencerenin dışındaki (15+ gün önceki) satırı hiçbir indekse eklemez", () => {
    const metrics = [metric({ content_item_id: "1", reach: 999, collected_at: "2026-08-01T06:00:00Z" })];
    expect(buildReach14d(metrics, NOW, TZ).every((v) => v === 0)).toBe(true);
  });
});

describe("buildEngagementTrend", () => {
  const NOW = new Date("2026-08-24T12:00:00Z");

  it("boş metrikte altı hafta, hepsi 0, delta 0", () => {
    const { trend, delta } = buildEngagementTrend([], NOW);
    expect(trend).toHaveLength(6);
    expect(trend.every((p) => p.value === 0)).toBe(true);
    expect(delta).toBe(0);
  });

  it("etiketler 'Wk 1'..'Wk 6'", () => {
    const { trend } = buildEngagementTrend([], NOW);
    expect(trend.map((p) => p.label)).toEqual(["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "Wk 6"]);
  });

  it("bir haftadaki satırların ortalamasını alır, bir ondalığa yuvarlar", () => {
    const metrics = [
      metric({ content_item_id: "1", engagement_rate: 4, collected_at: "2026-08-20T06:00:00Z" }),
      metric({ content_item_id: "2", engagement_rate: 8, collected_at: "2026-08-21T06:00:00Z" }),
    ];
    const { trend } = buildEngagementTrend(metrics, NOW);
    expect(trend[5].value).toBe(6); // son hafta (Wk 6), (4+8)/2
  });

  it("pencerenin (6 hafta) dışındaki satırı hiçbir kovaya eklemez", () => {
    const metrics = [metric({ content_item_id: "1", engagement_rate: 99, collected_at: "2026-01-01T06:00:00Z" })];
    const { trend } = buildEngagementTrend(metrics, NOW);
    expect(trend.every((p) => p.value === 0)).toBe(true);
  });

  it("⭐ delta yalnızca VERİLİ ilk ve son kovayı karşılaştırır, boş kovaları değil", () => {
    const metrics = [
      metric({ content_item_id: "1", engagement_rate: 2, collected_at: "2026-07-20T06:00:00Z" }), // erken hafta
      metric({ content_item_id: "2", engagement_rate: 6, collected_at: "2026-08-23T06:00:00Z" }), // son hafta
    ];
    const { delta } = buildEngagementTrend(metrics, NOW);
    expect(delta).toBe(4); // 6 - 2, aradaki boş haftalar yok sayılır
  });

  it("tek dolu kovada delta 0 döner (iki nokta olmadan trend hesaplanmaz)", () => {
    const metrics = [metric({ content_item_id: "1", engagement_rate: 5, collected_at: "2026-08-23T06:00:00Z" })];
    expect(buildEngagementTrend(metrics, NOW).delta).toBe(0);
  });
});

describe("buildTopPosts", () => {
  it("boş girdide boş dizi verir", () => {
    expect(buildTopPosts([], [], TZ)).toEqual([]);
  });

  it("yalnızca YAYINLANMIŞ ve metriği OLAN satırları sayar", () => {
    const posts = [
      item({ id: "taslak", platform: "instagram", kind: "image", status: "draft", title: "taslak" }),
      item({ id: "olcumsuz", platform: "instagram", kind: "image", status: "published", title: "ölçümsüz", published_at: "2026-08-01T00:00:00Z" }),
      item({ id: "gecerli", platform: "instagram", kind: "image", status: "published", title: "geçerli", published_at: "2026-08-01T00:00:00Z" }),
    ];
    const metrics = [metric({ content_item_id: "gecerli", reach: 500, collected_at: "2026-08-02T00:00:00Z" })];
    expect(buildTopPosts(posts, metrics, TZ).map((p) => p.id)).toEqual(["gecerli"]);
  });

  it("erişime göre büyükten küçüğe sıralar", () => {
    const posts = [
      item({ id: "az", platform: "instagram", kind: "image", status: "published", title: "az", published_at: "2026-08-01T00:00:00Z" }),
      item({ id: "cok", platform: "instagram", kind: "image", status: "published", title: "çok", published_at: "2026-08-02T00:00:00Z" }),
    ];
    const metrics = [
      metric({ content_item_id: "az", reach: 100, collected_at: "2026-08-03T00:00:00Z" }),
      metric({ content_item_id: "cok", reach: 900, collected_at: "2026-08-03T00:00:00Z" }),
    ];
    expect(buildTopPosts(posts, metrics, TZ).map((p) => p.id)).toEqual(["cok", "az"]);
  });

  it("en fazla 5 sonuç döner", () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      item({ id: String(i), platform: "instagram", kind: "image", status: "published", title: `p${i}`, published_at: "2026-08-01T00:00:00Z" }),
    );
    const metrics = posts.map((p, i) => metric({ content_item_id: p.id, reach: i, collected_at: "2026-08-02T00:00:00Z" }));
    expect(buildTopPosts(posts, metrics, TZ)).toHaveLength(5);
  });

  it("⭐ ölçüldü — 1000 üstü erişimi 'X.XK' biçimine çevirir", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-01T15:00:00Z" })];
    const metrics = [metric({ content_item_id: "1", reach: 5000, engagement_rate: 5, collected_at: "2026-08-02T00:00:00Z" })];
    const [top] = buildTopPosts(posts, metrics, TZ);
    expect(top.reach).toBe("5.0K");
    expect(top.when).toEqual({ tr: "1 Ağu", en: "Aug 1" });
  });

  it("1000 altı erişimi olduğu gibi dize yapar", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-01T00:00:00Z" })];
    const metrics = [metric({ content_item_id: "1", reach: 240, collected_at: "2026-08-02T00:00:00Z" })];
    expect(buildTopPosts(posts, metrics, TZ)[0].reach).toBe("240");
  });
});

describe("buildReachByPlatform", () => {
  it("boş girdide boş dizi verir", () => {
    expect(buildReachByPlatform([], [])).toEqual([]);
  });

  it("metriği olmayan platformu listeye hiç eklemez", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a" })];
    expect(buildReachByPlatform(posts, [])).toEqual([]);
  });

  it("aynı platformdaki birden çok gönderinin erişimini toplar", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "published", title: "b" }),
    ];
    const metrics = [
      metric({ content_item_id: "1", reach: 300, collected_at: "2026-08-01T00:00:00Z" }),
      metric({ content_item_id: "2", reach: 200, collected_at: "2026-08-01T00:00:00Z" }),
    ];
    expect(buildReachByPlatform(posts, metrics)).toEqual([{ platform: "instagram", value: 500 }]);
  });

  it("platformları PLATFORMS sırasına göre listeler", () => {
    const posts = [
      item({ id: "1", platform: "x", kind: "text", status: "published", title: "a" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "published", title: "b" }),
    ];
    const metrics = [
      metric({ content_item_id: "1", reach: 10, collected_at: "2026-08-01T00:00:00Z" }),
      metric({ content_item_id: "2", reach: 20, collected_at: "2026-08-01T00:00:00Z" }),
    ];
    // PLATFORMS = ["instagram", "x", "linkedin", "tiktok", "youtube"] — instagram önce.
    expect(buildReachByPlatform(posts, metrics).map((r) => r.platform)).toEqual(["instagram", "x"]);
  });
});

describe("buildMix", () => {
  it("boş girdide boş dizi döner (sıfıra bölme yapmaz)", () => {
    expect(buildMix([])).toEqual([]);
  });

  it("⭐ ölçüldü — yüzdeleri en yakın tam sayıya yuvarlar, toplamı 100 civarı", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "draft", title: "b" }),
      item({ id: "3", platform: "x", kind: "text", status: "idea", title: "c" }),
    ];
    expect(buildMix(posts)).toEqual([
      { key: "instagram", label: { tr: "Instagram", en: "Instagram" }, value: 67, hue: "350" },
      { key: "x", label: { tr: "X", en: "X" }, value: 33, hue: "230" },
    ]);
  });

  it("her satır durumundan bağımsız sayılır — filtre uygulamaz", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "archived", title: "a" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "failed", title: "b" }),
    ];
    expect(buildMix(posts)).toEqual([{ key: "instagram", label: { tr: "Instagram", en: "Instagram" }, value: 100, hue: "350" }]);
  });
});

describe("buildMonthlyReach — A1 düzeltmesi", () => {
  const NOW = new Date("2026-08-24T12:00:00Z");

  it("boş girdide 0 döner", () => {
    expect(buildMonthlyReach([], [], NOW, TZ)).toBe(0);
  });

  it("⭐ A1 — aynı içeriğin h6/d1/final üç fotoğrafı varken KPI BİR KEZ sayar", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-05T15:00:00Z" }),
    ];
    const metrics = [
      metric({ content_item_id: "1", reach: 300, tier: "h6", collected_at: "2026-08-05T21:00:00Z" }),
      metric({ content_item_id: "1", reach: 800, tier: "d1", collected_at: "2026-08-06T15:00:00Z" }),
      metric({ content_item_id: "1", reach: 1000, tier: "final", collected_at: "2026-08-20T15:00:00Z" }),
    ];
    // Ham toplam olsaydı 300+800+1000=2100 olurdu; doğrusu tek satır (en son: final) = 1000.
    expect(buildMonthlyReach(posts, metrics, NOW, TZ)).toBe(1000);
  });

  it("⭐ h6 EN SON toplanmış olsa bile hariç tutulur — sadece recency değil, tier kuralı", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-05T15:00:00Z" }),
    ];
    const metrics = [
      metric({ content_item_id: "1", reach: 800, tier: "d1", collected_at: "2026-08-06T15:00:00Z" }),
      // h6 burada kronolojik olarak EN SON toplanan satır — yine de sayılmamalı.
      metric({ content_item_id: "1", reach: 9999, tier: "h6", collected_at: "2026-08-23T00:00:00Z" }),
    ];
    expect(buildMonthlyReach(posts, metrics, NOW, TZ)).toBe(800);
  });

  it("yalnızca YAYINLANMIŞ ve bu AY yayınlanmış içerikleri toplar", () => {
    const posts = [
      item({ id: "gecen-ay", platform: "instagram", kind: "image", status: "published", title: "geçen ay", published_at: "2026-07-20T15:00:00Z" }),
      item({ id: "taslak", platform: "instagram", kind: "image", status: "draft", title: "taslak" }),
      item({ id: "bu-ay", platform: "instagram", kind: "image", status: "published", title: "bu ay", published_at: "2026-08-05T15:00:00Z" }),
    ];
    const metrics = [
      metric({ content_item_id: "gecen-ay", reach: 5000, tier: "final", collected_at: "2026-08-01T00:00:00Z" }),
      metric({ content_item_id: "bu-ay", reach: 400, tier: "d1", collected_at: "2026-08-06T00:00:00Z" }),
    ];
    expect(buildMonthlyReach(posts, metrics, NOW, TZ)).toBe(400);
  });

  it("published_at'i olmayan (henüz yayınlanmamış) satırı saymaz", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "a", scheduled_at: "2026-08-24T15:00:00Z" })];
    const metrics = [metric({ content_item_id: "1", reach: 100, tier: "final", collected_at: "2026-08-24T00:00:00Z" })];
    expect(buildMonthlyReach(posts, metrics, NOW, TZ)).toBe(0);
  });

  it("bu ay yayınlanan birden çok içeriğin erişimini toplar", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-02T15:00:00Z" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "published", title: "b", published_at: "2026-08-10T15:00:00Z" }),
    ];
    const metrics = [
      metric({ content_item_id: "1", reach: 300, tier: "final", collected_at: "2026-08-03T00:00:00Z" }),
      metric({ content_item_id: "2", reach: 200, tier: "d1", collected_at: "2026-08-11T00:00:00Z" }),
    ];
    expect(buildMonthlyReach(posts, metrics, NOW, TZ)).toBe(500);
  });
});
