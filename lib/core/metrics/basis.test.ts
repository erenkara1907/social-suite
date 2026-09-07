import { describe, expect, it } from "vitest";
import { dominantEngagementGroup, groupByEngagementBasis, withMeasurableEngagement, type BasisTagged } from "@/lib/core/metrics/basis";
import type { EngagementRateBasis } from "@/lib/core/types";

interface Row extends BasisTagged {
  id: string;
  engagement_rate: number;
}

function row(id: string, basis: EngagementRateBasis, engagement_rate = 0): Row {
  return { id, engagement_rate_basis: basis, engagement_rate };
}

describe("withMeasurableEngagement", () => {
  it("'unavailable' tabanlı satırları düşürür — 0 GERÇEK bir değer değil", () => {
    const rows = [row("a", "followers", 5), row("b", "unavailable", 0), row("c", "reach", 3)];
    expect(withMeasurableEngagement(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("hepsi unavailable ise boş döner", () => {
    const rows = [row("a", "unavailable"), row("b", "unavailable")];
    expect(withMeasurableEngagement(rows)).toEqual([]);
  });
});

describe("groupByEngagementBasis", () => {
  it("⭐ farklı tabanları AYRI gruplara koyar — asla birleştirmez", () => {
    const rows = [
      row("a", "followers", 10), row("b", "followers", 20),
      row("c", "reach", 5),
      row("d", "unavailable", 0),
    ];
    const groups = groupByEngagementBasis(rows);
    expect(groups.size).toBe(2); // unavailable hiç grup OLUŞTURMAZ
    expect(groups.get("followers")!.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups.get("reach")!.map((r) => r.id)).toEqual(["c"]);
    expect(groups.has("unavailable")).toBe(false);
  });

  it("tek tabanlı girdide TEK grup verir — bugünkü tek-platform durum", () => {
    const rows = [row("a", "followers", 1), row("b", "followers", 2)];
    const groups = groupByEngagementBasis(rows);
    expect(groups.size).toBe(1);
    expect(groups.get("followers")!.length).toBe(2);
  });

  it("boş girdi boş harita verir", () => {
    expect(groupByEngagementBasis([]).size).toBe(0);
  });
});

describe("dominantEngagementGroup", () => {
  it("en kalabalık grubu seçer, diğerini KARIŞTIRMAZ", () => {
    const rows = [
      row("a", "followers", 10), row("b", "followers", 20), row("c", "followers", 30),
      row("d", "reach", 90), // tek başına en yüksek DEĞER ama tabanı farklı — seçilmemeli
    ];
    const dominant = dominantEngagementGroup(rows);
    expect(dominant?.basis).toBe("followers");
    expect(dominant?.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("hiç ölçülebilir satır yoksa null döner", () => {
    expect(dominantEngagementGroup([row("a", "unavailable")])).toBeNull();
  });

  it("eşit sayıda satırlı iki taban varsa BİRİNİ seçer, ikisini birden değil", () => {
    const rows = [row("a", "followers", 1), row("b", "reach", 2)];
    const dominant = dominantEngagementGroup(rows);
    expect(dominant?.rows.length).toBe(1);
  });
});
