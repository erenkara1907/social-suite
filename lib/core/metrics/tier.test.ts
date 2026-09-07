import { describe, expect, it } from "vitest";
import { metricsCollectionStatus } from "@/lib/core/metrics/tier";

const PUBLISHED = new Date("2026-08-01T00:00:00Z");

describe("metricsCollectionStatus", () => {
  it("hiç ölçüm yoksa ve içerik yeni yayınlandıysa hemen h6 için due", () => {
    const now = new Date("2026-08-01T00:05:00Z");
    expect(metricsCollectionStatus(PUBLISHED, now, null)).toEqual({ due: true, tier: "h6" });
  });

  it("h6 penceresinde (48 saatten önce) son ölçümden 6 saat geçmediyse due değil", () => {
    const now = new Date("2026-08-01T10:00:00Z"); // 10 saat yaş
    const latest = { tier: "h6" as const, collectedAt: new Date("2026-08-01T06:00:00Z") }; // 4 saat önce
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: false, tier: "h6" });
  });

  it("h6 penceresinde son ölçümden tam 6 saat geçtiyse tekrar due", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const latest = { tier: "h6" as const, collectedAt: new Date("2026-08-01T06:00:00Z") };
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: true, tier: "h6" });
  });

  it("yaş 48 saati geçti ama son yazılan hâlâ h6 ise beklemeden d1'e geçer", () => {
    const now = new Date("2026-08-03T00:30:00Z"); // ~48.5 saat
    const latest = { tier: "h6" as const, collectedAt: new Date("2026-08-02T18:00:00Z") }; // 42 saat, <6 saat önce
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: true, tier: "d1" });
  });

  it("d1 penceresinde son ölçümden 24 saat geçmediyse due değil", () => {
    const now = new Date("2026-08-05T00:00:00Z");
    const latest = { tier: "d1" as const, collectedAt: new Date("2026-08-04T12:00:00Z") }; // 12 saat önce
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: false, tier: "d1" });
  });

  it("d1 penceresinde son ölçümden tam 24 saat geçtiyse tekrar due", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    const latest = { tier: "d1" as const, collectedAt: new Date("2026-08-04T12:00:00Z") };
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: true, tier: "d1" });
  });

  it("yaş tam 30 gün olunca final için due, d1 aralığı beklenmez", () => {
    const now = new Date("2026-08-31T00:00:00Z"); // tam 30 gün
    const latest = { tier: "d1" as const, collectedAt: new Date("2026-08-30T23:50:00Z") }; // 10 dk önce
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: true, tier: "final" });
  });

  it("⭐ final yazıldıktan sonra bir daha ASLA due değil — yaş ne olursa olsun", () => {
    const now = new Date("2026-12-01T00:00:00Z"); // aylar sonra
    const latest = { tier: "final" as const, collectedAt: new Date("2026-08-31T00:00:00Z") };
    expect(metricsCollectionStatus(PUBLISHED, now, latest)).toEqual({ due: false, tier: null });
  });

  it("30 günü çoktan geçmiş ama hiç toplanmamış eski içerik → tek seferlik final (geç yakalama)", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(metricsCollectionStatus(PUBLISHED, now, null)).toEqual({ due: true, tier: "final" });
  });

  it("henüz yayınlanmamış (yaş negatif) → due değil, savunma", () => {
    const now = new Date("2026-07-31T00:00:00Z");
    expect(metricsCollectionStatus(PUBLISHED, now, null)).toEqual({ due: false, tier: null });
  });
});
