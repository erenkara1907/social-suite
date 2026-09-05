import { describe, expect, it } from "vitest";
import { buildProductions, countPersonaUsage, findAssetLink, totalCredits } from "@/lib/core/derive/media";
import type { MediaJobRow } from "@/lib/core/types";

const BASE: Omit<MediaJobRow, "id" | "content_item_id" | "persona_id" | "step" | "state" | "created_at"> = {
  brand_id: "b1",
  vendor: "kie",
  vendor_model: "m",
  vendor_task_id: null,
  output_url: null,
  result_asset_id: null,
  error: null,
  credits_estimated: 0,
  credits_charged: null,
  started_at: null,
  finished_at: null,
};

function job(over: Partial<MediaJobRow> & Pick<MediaJobRow, "id" | "step" | "state">): MediaJobRow {
  return {
    ...BASE,
    content_item_id: null,
    persona_id: null,
    created_at: "2026-08-28T00:00:00Z",
    ...over,
  };
}

describe("buildProductions", () => {
  it("boş girdi için boş dizi verir", () => {
    expect(buildProductions([])).toEqual([]);
  });

  it("content_item_id olmayan işleri (persona kurulumu) HARİÇ tutar", () => {
    const jobs = [job({ id: "j1", step: "persona_image", state: "succeeded", content_item_id: null })];
    expect(buildProductions(jobs)).toEqual([]);
  });

  it("aynı content_item_id'yi tek gruba toplar", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1" }),
      job({ id: "j2", step: "lipsync", state: "running", content_item_id: "c1" }),
    ];
    const groups = buildProductions(jobs);
    expect(groups).toHaveLength(1);
    expect(groups[0].contentItemId).toBe("c1");
    expect(groups[0].jobs).toHaveLength(2);
  });

  it("⭐ grup içindeki işleri MEDIA_JOB_STEPS sırasına göre dizer, oluşturulma sırasına göre değil", () => {
    const jobs = [
      job({ id: "j1", step: "lipsync", state: "succeeded", content_item_id: "c1", created_at: "2026-08-28T10:00:00Z" }),
      job({ id: "j2", step: "voice", state: "succeeded", content_item_id: "c1", created_at: "2026-08-28T11:00:00Z" }),
    ];
    const [group] = buildProductions(jobs);
    expect(group.jobs.map((j) => j.step)).toEqual(["voice", "lipsync"]);
  });

  it("grubun personaId'si işlerden birinin persona_id'si", () => {
    const jobs = [job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1", persona_id: "p1" })];
    expect(buildProductions(jobs)[0].personaId).toBe("p1");
  });

  it("hiçbir işte persona_id yoksa null döner", () => {
    const jobs = [job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1" })];
    expect(buildProductions(jobs)[0].personaId).toBeNull();
  });

  it("⭐ 'running' içeren grup her zaman önce gelir", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "done", created_at: "2026-08-28T12:00:00Z" }),
      job({ id: "j2", step: "voice", state: "running", content_item_id: "active", created_at: "2026-08-28T01:00:00Z" }),
    ];
    const groups = buildProductions(jobs);
    expect(groups[0].contentItemId).toBe("active");
    expect(groups[1].contentItemId).toBe("done");
  });

  it("aynı aciliyette EN YENİ iş üstte", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "queued", content_item_id: "older", created_at: "2026-08-27T00:00:00Z" }),
      job({ id: "j2", step: "voice", state: "queued", content_item_id: "newer", created_at: "2026-08-28T00:00:00Z" }),
    ];
    const groups = buildProductions(jobs);
    expect(groups[0].contentItemId).toBe("newer");
    expect(groups[1].contentItemId).toBe("older");
  });

  it("aciliyet sırası: running > queued > failed > bitmiş", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "a" }),
      job({ id: "j2", step: "voice", state: "failed", content_item_id: "b" }),
      job({ id: "j3", step: "voice", state: "queued", content_item_id: "c" }),
      job({ id: "j4", step: "voice", state: "running", content_item_id: "d" }),
    ];
    expect(buildProductions(jobs).map((g) => g.contentItemId)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("countPersonaUsage", () => {
  it("içerik yoksa 0 döner", () => {
    expect(countPersonaUsage([], "p1")).toBe(0);
  });

  it("aynı personayla aynı içeriğin BİRDEN FAZLA işi tek sayılır", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1", persona_id: "p1" }),
      job({ id: "j2", step: "lipsync", state: "succeeded", content_item_id: "c1", persona_id: "p1" }),
    ];
    expect(countPersonaUsage(jobs, "p1")).toBe(1);
  });

  it("farklı içeriklerdeki kullanımları ayrı ayrı sayar", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1", persona_id: "p1" }),
      job({ id: "j2", step: "voice", state: "succeeded", content_item_id: "c2", persona_id: "p1" }),
    ];
    expect(countPersonaUsage(jobs, "p1")).toBe(2);
  });

  it("⭐ persona kurulum işini (content_item_id null) SAYMAZ", () => {
    const jobs = [job({ id: "j1", step: "persona_image", state: "succeeded", content_item_id: null, persona_id: "p1" })];
    expect(countPersonaUsage(jobs, "p1")).toBe(0);
  });

  it("başka personanın kullanımını saymaz", () => {
    const jobs = [job({ id: "j1", step: "voice", state: "succeeded", content_item_id: "c1", persona_id: "other" })];
    expect(countPersonaUsage(jobs, "p1")).toBe(0);
  });
});

describe("totalCredits", () => {
  it("boş dizi için 0", () => {
    expect(totalCredits([])).toBe(0);
  });

  it("ücretlendirilmiş varsa credits_charged'ı kullanır, tahmini değil", () => {
    const jobs = [job({ id: "j1", step: "lipsync", state: "succeeded", credits_estimated: 810, credits_charged: 567 })];
    expect(totalCredits(jobs)).toBe(567);
  });

  it("ücretlendirilmemişse (henüz bitmemiş iş) tahmini kullanır", () => {
    const jobs = [job({ id: "j1", step: "lipsync", state: "running", credits_estimated: 810, credits_charged: null })];
    expect(totalCredits(jobs)).toBe(810);
  });

  it("birden çok işin toplamını alır", () => {
    const jobs = [
      job({ id: "j1", step: "voice", state: "succeeded", credits_estimated: 0, credits_charged: 0 }),
      job({ id: "j2", step: "lipsync", state: "succeeded", credits_estimated: 600, credits_charged: 567 }),
    ];
    expect(totalCredits(jobs)).toBe(567);
  });
});

describe("findAssetLink", () => {
  it("eşleşen iş yoksa null döner (elle yüklenen/bağlantısız dosya)", () => {
    expect(findAssetLink("a1", [])).toBeNull();
  });

  it("result_asset_id eşleşen işin content/persona kimliğini döner", () => {
    const jobs = [
      job({ id: "j1", step: "lipsync", state: "succeeded", content_item_id: "c1", persona_id: "p1", result_asset_id: "a1" }),
    ];
    expect(findAssetLink("a1", jobs)).toEqual({ contentItemId: "c1", personaId: "p1" });
  });

  it("persona kurulum işi (content_item_id null) için personaId dolu, contentItemId null döner", () => {
    const jobs = [
      job({ id: "j1", step: "persona_image", state: "succeeded", content_item_id: null, persona_id: "p1", result_asset_id: "a1" }),
    ];
    expect(findAssetLink("a1", jobs)).toEqual({ contentItemId: null, personaId: "p1" });
  });

  it("başka bir asset'in işini eşleştirmez", () => {
    const jobs = [job({ id: "j1", step: "voice", state: "succeeded", result_asset_id: "other" })];
    expect(findAssetLink("a1", jobs)).toBeNull();
  });
});
