import { describe, expect, it } from "vitest";
import { daysLeft, tokenFreshness } from "./tokens";

describe("daysLeft", () => {
  it("returns 0 for null", () => {
    expect(daysLeft(null)).toBe(0);
  });

  it("returns 0 or less for a past date", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(daysLeft(past)).toBeLessThanOrEqual(0);
  });

  it("returns roughly the number of days ahead for a future date", () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    expect(daysLeft(future)).toBeGreaterThan(4.9);
    expect(daysLeft(future)).toBeLessThan(5.1);
  });
});

describe("tokenFreshness", () => {
  it("is expired at or below zero days", () => {
    expect(tokenFreshness(0, 10)).toBe("expired");
    expect(tokenFreshness(-2, 10)).toBe("expired");
  });

  it("is fresh above the refresh threshold", () => {
    expect(tokenFreshness(11, 10)).toBe("fresh");
  });

  it("needs refresh at or below the threshold but above zero", () => {
    expect(tokenFreshness(10, 10)).toBe("needs_refresh");
    expect(tokenFreshness(1, 10)).toBe("needs_refresh");
  });
});
