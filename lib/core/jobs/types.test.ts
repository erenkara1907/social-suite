import { describe, expect, it } from "vitest";
import { JOB_KINDS, JOB_RETRY_POLICY, JOB_STATES } from "@/lib/core/jobs/types";

describe("JOB_KINDS", () => {
  it("şemanın CHECK listesi + noop_test — dokuz tip", () => {
    // supabase/00_schema.sql "jobs" tablosu §12 adım 12 A1.
    expect([...JOB_KINDS]).toEqual([
      "plan_generate", "caption_write", "ugc_pipeline", "media_poll",
      "publish", "metrics_collect", "token_refresh", "embed_backfill",
      "noop_test",
    ]);
  });
});

describe("JOB_STATES", () => {
  it("şemanın CHECK listesiyle birebir — beş durum, 'dead' ölü mektup", () => {
    expect([...JOB_STATES]).toEqual(["queued", "running", "succeeded", "failed", "dead"]);
  });
});

describe("JOB_RETRY_POLICY", () => {
  it("her iş tipi için tam olarak bir politika var", () => {
    for (const kind of JOB_KINDS) {
      expect(JOB_RETRY_POLICY[kind]).toBeDefined();
    }
    expect(Object.keys(JOB_RETRY_POLICY).sort()).toEqual([...JOB_KINDS].sort());
  });

  it("her politika en az bir denemeye izin verir", () => {
    for (const kind of JOB_KINDS) {
      expect(JOB_RETRY_POLICY[kind].maxAttempts).toBeGreaterThanOrEqual(1);
    }
  });

  it("her politikanın süre ve gecikme değerleri pozitif", () => {
    for (const kind of JOB_KINDS) {
      const policy = JOB_RETRY_POLICY[kind];
      expect(policy.expectedDurationMs).toBeGreaterThan(0);
      expect(policy.backoffBaseMs).toBeGreaterThan(0);
    }
  });

  it("ugc_pipeline en pahalı iş — en az deneme + en uzun taban gecikme", () => {
    // §8.5: her deneme gerçek vendor kredisi harcayabilir.
    const ugc = JOB_RETRY_POLICY.ugc_pipeline;
    for (const kind of JOB_KINDS) {
      if (kind === "ugc_pipeline") continue;
      expect(ugc.maxAttempts).toBeLessThanOrEqual(JOB_RETRY_POLICY[kind].maxAttempts);
    }
  });

  it("§12 adım 13 FAZ A — yalnızca ugc_pipeline takılı kalınca dead'e gider", () => {
    // Vendor çağrısının çökme ANINDAN önce mi sonra mı yapıldığı bilinmiyor;
    // kör bir requeue krediyi ikiletebilir (bkz. reaperOnStuck docstring'i).
    for (const kind of JOB_KINDS) {
      const expected = kind === "ugc_pipeline" ? "dead" : "requeue";
      expect(JOB_RETRY_POLICY[kind].reaperOnStuck).toBe(expected);
    }
  });
});
