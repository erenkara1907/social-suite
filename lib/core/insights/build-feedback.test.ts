import { describe, expect, it } from "vitest";
import { buildFeedbackSignal, FEEDBACK_MIN_MEASURED, toFeedbackPromptBlock } from "@/lib/core/insights/build-feedback";
import type { ContentItemRow, MetricRow } from "@/lib/core/types";

const TZ = "Europe/Istanbul";

const BASE: Omit<ContentItemRow, "id" | "platform" | "kind" | "title" | "status" | "hook" | "published_at"> = {
  brand_id: "b1", plan_id: null, channel_id: null, media_type: "IMAGE",
  day_offset: null, time_of_day: null, scheduled_at: null,
  is_best_time: false, body: "", hashtags: "", media_url: null,
  external_post_id: null, parent_id: null, root_id: null, chain_position: 1,
  continuation_note: "", content_fingerprint: null, topic_key: null,
};

function item(over: Partial<ContentItemRow> & Pick<ContentItemRow, "id" | "hook" | "published_at">): ContentItemRow {
  return {
    ...BASE, platform: "bluesky", kind: "text", title: "başlık", status: "published",
    ...over,
  };
}

function metric(id: string, engagement_rate: number, basis: MetricRow["engagement_rate_basis"] = "followers"): MetricRow {
  return {
    content_item_id: id, reach: 0, likes: 0, comments: 0, shares: 0,
    engagement_rate, engagement_rate_basis: basis, tier: "d1", collected_at: "2026-08-01T00:00:00Z",
  };
}

describe("buildFeedbackSignal", () => {
  it("⭐ eşiğin ALTINDA veri varken null döner — sinyal İCAT EDİLMEZ", () => {
    const items = Array.from({ length: FEEDBACK_MIN_MEASURED - 1 }, (_, i) =>
      item({ id: String(i), hook: "kısa", published_at: "2026-08-01T18:00:00Z" }),
    );
    const metrics = items.map((it, i) => metric(it.id, i));
    expect(buildFeedbackSignal(items, metrics, TZ)).toBeNull();
  });

  it("eşiğe TAM ulaşınca sinyal üretir", () => {
    const items = Array.from({ length: FEEDBACK_MIN_MEASURED }, (_, i) =>
      item({ id: String(i), hook: "kısa", published_at: "2026-08-01T18:00:00Z" }),
    );
    const metrics = items.map((it, i) => metric(it.id, i + 1));
    const signal = buildFeedbackSignal(items, metrics, TZ);
    expect(signal).not.toBeNull();
    expect(signal!.measuredCount).toBe(FEEDBACK_MIN_MEASURED);
  });

  it("yalnızca YAYINLANMIŞ ve metriği OLAN içerikleri sayar", () => {
    const items = [
      item({ id: "taslak", hook: "x", published_at: null, status: "draft" }),
      ...Array.from({ length: FEEDBACK_MIN_MEASURED }, (_, i) =>
        item({ id: `p${i}`, hook: "x", published_at: "2026-08-01T18:00:00Z" }),
      ),
    ];
    const metrics = items.filter((i) => i.status === "published").map((it, i) => metric(it.id, i + 1));
    const signal = buildFeedbackSignal(items, metrics, TZ);
    expect(signal!.measuredCount).toBe(FEEDBACK_MIN_MEASURED);
  });

  it("engagement_rate_basis 'unavailable' olan satırları saymaz", () => {
    const items = Array.from({ length: FEEDBACK_MIN_MEASURED }, (_, i) =>
      item({ id: String(i), hook: "x", published_at: "2026-08-01T18:00:00Z" }),
    );
    const metrics = items.map((it, i) => metric(it.id, i, "unavailable"));
    expect(buildFeedbackSignal(items, metrics, TZ)).toBeNull();
  });

  it("⭐ kısa hook'lar daha çok etkileşim aldıysa bunu bir NOT olarak çıkarır", () => {
    const shortHook = "Kısa açılış";
    const longHook = "Bu çok daha uzun ve detaylı bir açılış cümlesi örneğidir gerçekten uzun";
    const items = [
      ...Array.from({ length: 2 }, (_, i) => item({ id: `top${i}`, hook: shortHook, published_at: "2026-08-01T18:00:00Z" })),
      ...Array.from({ length: 8 }, (_, i) => item({ id: `rest${i}`, hook: longHook, published_at: "2026-08-01T18:00:00Z" })),
    ];
    const metrics = [
      ...items.slice(0, 2).map((it) => metric(it.id, 90)),
      ...items.slice(2).map((it) => metric(it.id, 5)),
    ];
    const signal = buildFeedbackSignal(items, metrics, TZ)!;
    expect(signal.notes.some((n) => n.text.en.toLowerCase().includes("shorter"))).toBe(true);
  });

  it("⭐ soru soran açılışlar daha çok etkileşim aldıysa bunu bir NOT olarak çıkarır", () => {
    const items = [
      ...Array.from({ length: 2 }, (_, i) => item({ id: `top${i}`, hook: "Bunu biliyor muydun?", published_at: "2026-08-01T18:00:00Z" })),
      ...Array.from({ length: 8 }, (_, i) => item({ id: `rest${i}`, hook: "Bugün şunu paylaşıyoruz.", published_at: "2026-08-01T18:00:00Z" })),
    ];
    const metrics = [
      ...items.slice(0, 2).map((it) => metric(it.id, 90)),
      ...items.slice(2).map((it) => metric(it.id, 5)),
    ];
    const signal = buildFeedbackSignal(items, metrics, TZ)!;
    expect(signal.notes.some((n) => n.text.en.toLowerCase().includes("question"))).toBe(true);
  });

  it("⭐⭐ DEDUPE İLE ÇAKIŞMAZ — hiçbir not/sinyal alanı title/hook/topic_key METNİNİ taşımaz", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      item({ id: String(i), hook: `EŞSİZ-HOOK-METNİ-${i}`, title: `EŞSİZ-BAŞLIK-${i}`, published_at: "2026-08-01T18:00:00Z" }),
    );
    const metrics = items.map((it, i) => metric(it.id, i + 1));
    const signal = buildFeedbackSignal(items, metrics, TZ);
    const serialized = JSON.stringify(signal);
    for (const it of items) {
      expect(serialized).not.toContain(it.hook);
      expect(serialized).not.toContain(it.title);
    }
  });
});

describe("toFeedbackPromptBlock", () => {
  it("sinyal null ise BOŞ dize döner — prompt eskisi gibi çalışır", () => {
    expect(toFeedbackPromptBlock(null)).toBe("");
  });

  it("notes boşsa da boş dize döner", () => {
    expect(toFeedbackPromptBlock({ measuredCount: 10, topCount: 2, basis: "followers", notes: [] })).toBe("");
  });

  it("notes doluysa YAKLAŞIM diliyle bir blok üretir, konudan bahsetmez", () => {
    const block = toFeedbackPromptBlock({
      measuredCount: 10, topCount: 2, basis: "followers",
      notes: [{ text: { tr: "Kısa açılışlar daha çok etkileşim aldı.", en: "Shorter opening lines got more engagement." } }],
    });
    expect(block).toContain("APPROACH");
    expect(block).toContain("Shorter opening lines");
  });
});
