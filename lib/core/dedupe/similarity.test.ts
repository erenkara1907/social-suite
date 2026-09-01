import { describe, expect, it } from "vitest";
import { classifySimilarity } from "@/lib/core/dedupe/similarity";
import { DEFAULT_DEDUPE_CONFIG } from "@/lib/core/dedupe/config";

describe("classifySimilarity — Akış E Kontrol 2 eşikleri (0.92 / 0.82)", () => {
  it(">= 0.92 → duplicate", () => {
    expect(classifySimilarity(0.92, DEFAULT_DEDUPE_CONFIG)).toBe("duplicate");
    expect(classifySimilarity(0.99, DEFAULT_DEDUPE_CONFIG)).toBe("duplicate");
  });

  it("0.82 <= x < 0.92 → continuation_band", () => {
    expect(classifySimilarity(0.82, DEFAULT_DEDUPE_CONFIG)).toBe("continuation_band");
    expect(classifySimilarity(0.87, DEFAULT_DEDUPE_CONFIG)).toBe("continuation_band");
    expect(classifySimilarity(0.9199, DEFAULT_DEDUPE_CONFIG)).toBe("continuation_band");
  });

  it("< 0.82 → new", () => {
    expect(classifySimilarity(0.81, DEFAULT_DEDUPE_CONFIG)).toBe("new");
    expect(classifySimilarity(0, DEFAULT_DEDUPE_CONFIG)).toBe("new");
  });

  it("yapılandırılabilir — özel config'te eşikler değişir", () => {
    const custom = { ...DEFAULT_DEDUPE_CONFIG, duplicateThreshold: 0.5, continuationThreshold: 0.3 };
    expect(classifySimilarity(0.4, custom)).toBe("continuation_band");
    expect(classifySimilarity(0.6, custom)).toBe("duplicate");
  });
});
