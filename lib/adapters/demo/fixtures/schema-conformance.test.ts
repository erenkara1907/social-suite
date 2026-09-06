/**
 * ⭐ FIXTURE ↔ ŞEMA CHECK UYUM KAPISI
 *
 * Bu test iddiaya değil, DOSYAYA bakıyor: `supabase/00_schema.sql`'i okuyor,
 * CHECK listelerini ayrıştırıyor ve her fixture değerini o listeye karşı
 * doğruluyor.
 *
 * Neden bu kadar dolambaçlı: elle yazılmış bir "beklenen değerler" dizisi,
 * şema değiştiğinde sessizce eskir ve kapı bir daha hiçbir şey yakalamaz.
 * Kaynak dosyayı okuyunca kapı, şemayla BİRLİKTE hareket ediyor —
 * `00_schema.sql`'e yeni bir değer eklenirse test yine geçer, çıkarılırsa
 * fixture kırılır. Aradığımız davranış tam olarak bu.
 *
 * Aynı zamanda `lib/core/types.ts`'in union'larını da doğruluyor: TS union'ı
 * ile CHECK listesi ayrışırsa sonuç sessiz bir `constraint violation` olur —
 * kod tarafı geçerli sayar, DB reddeder (ADIM_34_RAPOR, enum dönüşümü, 4. madde).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ACTIONS, MEDIA_JOB_STATES, MEDIA_JOB_STEPS, MEDIA_JOB_VENDORS,
  MEDIA_KINDS, MEDIA_SOURCE_VENDORS, MEDIA_TYPES, METRIC_TIERS,
  PLATFORMS, POST_KINDS, POST_STATUSES,
} from "@/lib/core/types";
import { demoActivity } from "@/lib/adapters/demo/fixtures/activity";
import { DEMO_CHANNELS } from "@/lib/adapters/demo/fixtures/channels";
import { demoContentItems } from "@/lib/adapters/demo/fixtures/content";
import { demoMediaAssets, demoMediaJobs } from "@/lib/adapters/demo/fixtures/media";
import { demoMetricRows } from "@/lib/adapters/demo/fixtures/metrics";

const SQL = readFileSync(join(process.cwd(), "supabase/00_schema.sql"), "utf8");
const NOW = new Date("2026-08-27T12:00:00Z");

/** Bir tablonun `create table ... ( … );` gövdesi. */
function tableBody(table: string): string {
  const start = SQL.indexOf(`create table if not exists public.${table} (`);
  expect(start, `tablo bulunamadı: ${table}`).toBeGreaterThan(-1);
  const end = SQL.indexOf("\n);", start);
  return SQL.slice(start, end);
}

/** `check (<col> in ('a', 'b', …))` içindeki literal kümesi. */
function checkValues(table: string, column: string): string[] {
  const body = tableBody(table);
  const match = new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, "s").exec(body);
  expect(match, `CHECK bulunamadı: ${table}.${column}`).not.toBeNull();
  return [...match![1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/** Şemadan okunan liste ile TS union'ı birebir aynı mı. */
function expectUnionMatchesSchema(
  table: string, column: string, union: readonly string[],
): string[] {
  const fromSchema = checkValues(table, column);
  expect([...fromSchema].sort()).toEqual([...union].sort());
  return fromSchema;
}

describe("1. TS union'ları ⇄ şema CHECK listeleri", () => {
  it("content_items.platform (6 değer — 17a FAZ 0.2: bluesky eklendi)", () => {
    expect(expectUnionMatchesSchema("content_items", "platform", PLATFORMS)).toHaveLength(6);
  });
  it("channels.platform — content_items ile AYNI liste", () => {
    expect(checkValues("channels", "platform")).toEqual(checkValues("content_items", "platform"));
  });
  it("content_items.status (8 değer, §4a)", () => {
    expect(expectUnionMatchesSchema("content_items", "status", POST_STATUSES)).toHaveLength(8);
  });
  it("content_items.kind (7 değer)", () => {
    expect(expectUnionMatchesSchema("content_items", "kind", POST_KINDS)).toHaveLength(7);
  });
  it("content_items.media_type (5 değer, BÜYÜK harf)", () => {
    expectUnionMatchesSchema("content_items", "media_type", MEDIA_TYPES);
  });
  it("content_metrics.tier (3 değer, D1)", () => {
    expectUnionMatchesSchema("content_metrics", "tier", METRIC_TIERS);
  });
  it("activity.action (12 değer)", () => {
    expect(expectUnionMatchesSchema("activity", "action", ACTIVITY_ACTIONS)).toHaveLength(12);
  });
  it("media_assets.kind (3 değer)", () => {
    expectUnionMatchesSchema("media_assets", "kind", MEDIA_KINDS);
  });
  it("media_assets.source_vendor (4 değer)", () => {
    expectUnionMatchesSchema("media_assets", "source_vendor", MEDIA_SOURCE_VENDORS);
  });
  it("media_jobs.vendor (3 değer — 'upload' YOK)", () => {
    expectUnionMatchesSchema("media_jobs", "vendor", MEDIA_JOB_VENDORS);
  });
  it("media_jobs.step (5 değer)", () => {
    expectUnionMatchesSchema("media_jobs", "step", MEDIA_JOB_STEPS);
  });
  it("media_jobs.state (5 değer)", () => {
    expectUnionMatchesSchema("media_jobs", "state", MEDIA_JOB_STATES);
  });
});

describe("2. ⭐ Fixture DEĞERLERİ ⇄ şema CHECK listeleri", () => {
  it("her content_items satırının platform/kind/media_type/status'ü CHECK'te", () => {
    const platform = checkValues("content_items", "platform");
    const kind = checkValues("content_items", "kind");
    const mediaType = checkValues("content_items", "media_type");
    const status = checkValues("content_items", "status");

    const rows = demoContentItems(NOW);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(platform, r.id).toContain(r.platform);
      expect(kind, r.id).toContain(r.kind);
      expect(mediaType, r.id).toContain(r.media_type);
      expect(status, r.id).toContain(r.status);
    }
  });

  it("her channels satırının platform'u CHECK'te", () => {
    const platform = checkValues("channels", "platform");
    for (const c of DEMO_CHANNELS) expect(platform, c.id).toContain(c.platform);
  });

  it("her content_metrics satırının tier'i CHECK'te", () => {
    const tier = checkValues("content_metrics", "tier");
    const rows = demoMetricRows(NOW);
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) expect(tier).toContain(m.tier);
  });

  it("her activity satırının action'ı CHECK'te", () => {
    const action = checkValues("activity", "action");
    for (const a of demoActivity(NOW)) expect(action, a.id).toContain(a.action);
  });

  it("her media_assets satırının kind/source_vendor'ı CHECK'te", () => {
    const kind = checkValues("media_assets", "kind");
    const vendor = checkValues("media_assets", "source_vendor");
    for (const a of demoMediaAssets(NOW)) {
      expect(kind, a.id).toContain(a.kind);
      expect(vendor, a.id).toContain(a.source_vendor);
    }
  });

  it("her media_jobs satırının vendor/step/state'i CHECK'te", () => {
    const vendor = checkValues("media_jobs", "vendor");
    const step = checkValues("media_jobs", "step");
    const state = checkValues("media_jobs", "state");
    for (const j of demoMediaJobs(NOW)) {
      expect(vendor, j.id).toContain(j.vendor);
      expect(step, j.id).toContain(j.step);
      expect(state, j.id).toContain(j.state);
    }
  });
});

describe("3. Şemanın CHECK dışı kısıtları", () => {
  it("chain_position 1-12 aralığında (§4b)", () => {
    expect(tableBody("content_items")).toMatch(/chain_position[\s\S]*between 1 and 12/);
    for (const r of demoContentItems(NOW)) {
      expect(r.chain_position).toBeGreaterThanOrEqual(1);
      expect(r.chain_position).toBeLessThanOrEqual(12);
    }
  });

  it("day_offset >= 0", () => {
    expect(tableBody("content_items")).toMatch(/day_offset\s+int check \(day_offset >= 0\)/);
    for (const r of demoContentItems(NOW)) {
      if (r.day_offset !== null) expect(r.day_offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("parent_id her zaman var olan bir satırı gösteriyor (FK)", () => {
    const rows = demoContentItems(NOW);
    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows) {
      if (r.parent_id) expect(ids, r.id).toContain(r.parent_id);
    }
  });

  it("root_id taşıyan her satırın kökü var ve kök kendini gösteriyor", () => {
    const rows = demoContentItems(NOW);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows) {
      if (!r.root_id) continue;
      const root = byId.get(r.root_id);
      expect(root, r.id).toBeDefined();
      expect(root!.chain_position).toBe(1);
      expect(root!.root_id).toBe(root!.id);
    }
  });

  it("metrik satırları var olan içeriklere bağlı (FK)", () => {
    const ids = new Set(demoContentItems(NOW).map((r) => r.id));
    for (const m of demoMetricRows(NOW)) expect(ids).toContain(m.content_item_id);
  });

  it("media_jobs.content_item_id var olan içeriği gösteriyor (FK)", () => {
    const ids = new Set(demoContentItems(NOW).map((r) => r.id));
    for (const j of demoMediaJobs(NOW)) {
      if (j.content_item_id) expect(ids, j.id).toContain(j.content_item_id);
    }
  });
});
