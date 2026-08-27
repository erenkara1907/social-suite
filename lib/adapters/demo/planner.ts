/**
 * PlannerPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/plan.ts` — 7 ve 30 günlük iki hazır iskelet.
 * ⚠ Sıfır ağ isteği. Canlı karşılığı Anthropic `claude-opus-5` (§12 adım 14).
 */
import type { PlannerPort } from "@/lib/adapters/ports";
import { demoPlanSkeleton } from "@/lib/adapters/demo/fixtures/plan";

export const demoPlanner: PlannerPort = {
  async generate(input) {
    return { ok: true, data: demoPlanSkeleton(input.horizonDays, input.start) };
  },
};
