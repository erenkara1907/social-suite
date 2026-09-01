import { describe, expect, it } from "vitest";
import { canConsiderContinuation } from "@/lib/core/dedupe/continuation";
import { DEFAULT_DEDUPE_CONFIG } from "@/lib/core/dedupe/config";

const NOW = new Date("2026-09-01T00:00:00Z");

describe("canConsiderContinuation — Akış E Kontrol 3a/3b", () => {
  it("komşu 'published' değilse REDDEDER", () => {
    const r = canConsiderContinuation(
      { status: "draft", publishedAt: "2026-08-20T00:00:00Z", chainPosition: 1 },
      DEFAULT_DEDUPE_CONFIG,
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "not_published" });
  });

  it("zincir derinliği tavanına ULAŞMIŞSA reddeder (>= 12)", () => {
    const r = canConsiderContinuation(
      { status: "published", publishedAt: "2026-08-01T00:00:00Z", chainPosition: 12 },
      DEFAULT_DEDUPE_CONFIG,
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "chain_full" });
  });

  it("yayınından 3 günden AZ geçmişse reddeder", () => {
    const r = canConsiderContinuation(
      { status: "published", publishedAt: "2026-08-30T00:00:00Z", chainPosition: 1 }, // 2 gün önce
      DEFAULT_DEDUPE_CONFIG,
      NOW,
    );
    expect(r).toEqual({ ok: false, reason: "too_recent" });
  });

  it("tam 3 gün geçmişse KABUL eder (sınır dahil)", () => {
    const r = canConsiderContinuation(
      { status: "published", publishedAt: "2026-08-29T00:00:00Z", chainPosition: 1 }, // tam 3 gün önce
      DEFAULT_DEDUPE_CONFIG,
      NOW,
    );
    expect(r).toEqual({ ok: true });
  });

  it("üç koşul da sağlanınca KABUL eder", () => {
    const r = canConsiderContinuation(
      { status: "published", publishedAt: "2026-08-01T00:00:00Z", chainPosition: 5 },
      DEFAULT_DEDUPE_CONFIG,
      NOW,
    );
    expect(r).toEqual({ ok: true });
  });
});
