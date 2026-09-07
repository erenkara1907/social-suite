import { describe, expect, it } from "vitest";
import { pickDueMetricsTargets, type MetricsScanItem } from "@/lib/core/metrics/schedule";

const NOW = new Date("2026-08-01T12:00:00Z");

function item(over: Partial<MetricsScanItem> & Pick<MetricsScanItem, "id">): MetricsScanItem {
  return {
    platform: "bluesky",
    status: "published",
    externalPostId: "at://did:plc:x/app.bsky.feed.post/abc",
    publishedAt: "2026-08-01T10:00:00Z", // 2 saat yaş — h6 penceresinde, hiç toplanmamış
    ...over,
  };
}

describe("pickDueMetricsTargets", () => {
  it("published + bluesky + external_post_id olan, hiç toplanmamış içeriği seçer", () => {
    const targets = pickDueMetricsTargets([item({ id: "1" })], new Map(), NOW);
    expect(targets).toEqual(["1"]);
  });

  it("published DEĞİLSE dışarıda bırakır (draft, scheduled, vb.)", () => {
    const targets = pickDueMetricsTargets([item({ id: "1", status: "scheduled" })], new Map(), NOW);
    expect(targets).toEqual([]);
  });

  it("bluesky DIŞINDA bir platformu dışarıda bırakır (henüz toplayıcı yok)", () => {
    const targets = pickDueMetricsTargets([item({ id: "1", platform: "instagram" })], new Map(), NOW);
    expect(targets).toEqual([]);
  });

  it("external_post_id yoksa dışarıda bırakır — hiç yayınlanmamış demektir", () => {
    const targets = pickDueMetricsTargets([item({ id: "1", externalPostId: null })], new Map(), NOW);
    expect(targets).toEqual([]);
  });

  it("published_at yoksa dışarıda bırakır — yaş hesaplanamaz", () => {
    const targets = pickDueMetricsTargets([item({ id: "1", publishedAt: null })], new Map(), NOW);
    expect(targets).toEqual([]);
  });

  it("final'i olan bir içeriği bir daha ASLA seçmez", () => {
    const latest = new Map([["1", { tier: "final" as const, collectedAt: new Date("2026-07-01T00:00:00Z") }]]);
    const targets = pickDueMetricsTargets([item({ id: "1" })], latest, NOW);
    expect(targets).toEqual([]);
  });

  it("sırası gelmemiş (son h6'dan 6 saat geçmemiş) içeriği seçmez", () => {
    const latest = new Map([["1", { tier: "h6" as const, collectedAt: new Date("2026-08-01T11:00:00Z") }]]); // 1 saat önce
    const targets = pickDueMetricsTargets([item({ id: "1" })], latest, NOW);
    expect(targets).toEqual([]);
  });

  it("karışık liste — yalnızca uygun ve sırası gelenleri seçer", () => {
    const items = [
      item({ id: "due" }),
      item({ id: "wrong-platform", platform: "x" }),
      item({ id: "not-published", status: "draft" }),
      item({ id: "no-uri", externalPostId: null }),
    ];
    const targets = pickDueMetricsTargets(items, new Map(), NOW);
    expect(targets).toEqual(["due"]);
  });
});
