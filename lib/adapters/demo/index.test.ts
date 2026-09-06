import { beforeEach, describe, expect, it } from "vitest";
import { port } from "@/lib/adapters";
import { PORT_NAMES } from "@/lib/adapters/ports";
import { DEMO_CHAIN_ROOT_ID, demoContentItems } from "@/lib/adapters/demo/fixtures/content";
import { DEMO_PERSONA_IDS } from "@/lib/adapters/demo/fixtures/personas";

/** Bayrak yoksa varsayılan zaten demo; yine de açıkça yazıyoruz. */
beforeEach(() => {
  process.env.APP_MODE = "demo";
  for (const name of PORT_NAMES) delete process.env[`MODE_${name.toUpperCase()}`];
});

const NOW = new Date("2026-08-27T12:00:00Z");

describe("⭐ 12 portun demo implementasyonu ÇAĞRILABİLİYOR", () => {
  it("content.list()", async () => {
    expect((await port("content").list()).length).toBeGreaterThan(0);
  });
  it("planner.generate()", async () => {
    const r = await port("planner").generate({
      theme: "kahve", horizonDays: 7, lang: "tr", mode: "weekly", start: NOW, brand: null,
    });
    expect(r.ok && r.data.posts.length).toBeGreaterThan(0);
  });
  it("copy.write()", async () => {
    const r = await port("copy").write({ idea: "x", channel: "instagram", tone: "sıcak", lang: "tr", brand: null });
    expect(r.ok && r.data.hook.length).toBeGreaterThan(0);
  });
  it("image.generate()", async () => {
    const r = await port("image").generate("kahve");
    expect(r.ok && r.data.url).toBeTruthy();
  });
  it("video.listPersonas()", async () => {
    expect((await port("video").listPersonas()).length).toBeGreaterThan(0);
  });
  it("video.listAllJobs()", async () => {
    expect((await port("video").listAllJobs()).length).toBeGreaterThan(0);
  });
  it("voice.list()", async () => {
    expect((await port("voice").list()).length).toBeGreaterThan(0);
  });
  it("publisher.supported()", () => {
    // 17a FAZ 0/B — Instagram Meta App Review beklerken bluesky ile kanıtlandı.
    expect(port("publisher").supported()).toContain("bluesky");
  });
  it("metrics.list()", async () => {
    expect((await port("metrics").list(60)).length).toBeGreaterThan(0);
  });
  it("channel.list()", async () => {
    expect((await port("channel").list()).length).toBe(6);
  });
  it("brand.get()", async () => {
    expect((await port("brand").get())?.name).toBeTruthy();
  });
  it("storage.list()", async () => {
    expect((await port("storage").list()).length).toBeGreaterThan(0);
  });
  it("dedupe.isAvailable() / embed() — §12 adım 15 revize A3.2", async () => {
    expect(await port("dedupe").isAvailable("b1")).toBe(true);
    const r = await port("dedupe").embed("a b", "b1");
    expect(r.ok && r.data.length).toBe(1024);
  });

  it("⭐ hiçbir demo portu 'not implemented' FIRLATMIYOR", async () => {
    // Kalan yazma/okuma yolları da dahil, tek tek.
    await expect(port("content").get("yok")).resolves.toBeNull();
    await expect(port("content").listActivity()).resolves.toBeInstanceOf(Array);
    await expect(port("content").create({ platform: "x", kind: "text", title: "t" })).resolves.toMatchObject({ ok: true });
    await expect(port("content").update("yok", { title: "t" })).resolves.toMatchObject({ ok: false });
    await expect(port("content").archive("yok")).resolves.toMatchObject({ ok: false });
    await expect(port("video").getJob("yok")).resolves.toBeNull();
    await expect(port("video").listJobs("yok")).resolves.toEqual([]);
    await expect(port("video").createPersona({ name: "n", prompt: "p" })).resolves.toMatchObject({ ok: true });
    await expect(port("voice").listTurkish()).resolves.toBeInstanceOf(Array);
    await expect(port("voice").synthesize("x", "v")).resolves.toMatchObject({ ok: true });
    await expect(port("publisher").publish("10000000-0000-4000-8000-000000000010")).resolves.toMatchObject({ ok: true });
    await expect(port("metrics").latest(60)).resolves.toBeInstanceOf(Array);
    await expect(port("channel").startConnect("instagram")).resolves.toMatchObject({ ok: true });
    await expect(port("channel").connectWithCredentials("bluesky", { identifier: "x", appPassword: "y" }))
      .resolves.toMatchObject({ ok: true });
    await expect(port("channel").disconnect("c1")).resolves.toMatchObject({ ok: true });
    await expect(port("brand").save({
      name: "n", industry: "", description: "", products: "",
      audience: "", voice: "", keywords: "", links: "",
    })).resolves.toMatchObject({ ok: true });
    await expect(port("storage").persistFromUrl({ sourceUrl: "https://x", kind: "image", vendor: "fal" }))
      .resolves.toMatchObject({ ok: true });
    await expect(port("storage").persistBytes({ bytes: new ArrayBuffer(4), kind: "audio", mimeType: "audio/mpeg", vendor: "elevenlabs" }))
      .resolves.toMatchObject({ ok: true });
    // ⚠ dedupe.embed demo modda BİLEREK başarılı — §12 adım 15 revize A3.2
    // (eskiden hep `not_configured` dönerdi; testlerin mock'suz sınayabilmesi
    // için değişti, bkz. lib/adapters/demo/dedupe.ts başlığı).
    await expect(port("dedupe").embed("x", "b1")).resolves.toMatchObject({ ok: true });
  });
});

describe("⭐ Demo veri ürünü doğru anlatıyor", () => {
  it("§4b — 3 halkalı devam zinciri var, chain_position 1→2→3", async () => {
    const chain = await port("content").listChain(DEMO_CHAIN_ROOT_ID);
    expect(chain.map((c) => c.chain_position)).toEqual([1, 2, 3]);
    expect(chain[0].parent_id).toBeNull();
    expect(chain[1].parent_id).toBe(chain[0].id);
    expect(chain[2].parent_id).toBe(chain[1].id);
    expect(chain.every((c) => c.root_id === DEMO_CHAIN_ROOT_ID)).toBe(true);
    // continuation_note caption istemine giriyor — boş olamaz.
    expect(chain[1].continuation_note.length).toBeGreaterThan(0);
    expect(chain[2].continuation_note.length).toBeGreaterThan(0);
  });

  it("§4c — duplicate_blocked aktivitesi var", async () => {
    const actions = (await port("content").listActivity(50)).map((a) => a.action);
    expect(actions).toContain("duplicate_blocked");
    expect(actions).toContain("continuation_created");
  });

  it("§4a — arşivlenen satır SİLİNMEDİ, tekrar hafızasında duruyor", async () => {
    const archived = await port("content").list({ status: ["archived"] });
    expect(archived.length).toBeGreaterThan(0);
    // ...ve varsayılan listede görünmüyor.
    const visible = await port("content").list();
    expect(visible.some((r) => r.status === "archived")).toBe(false);
  });

  it("§4a — media_jobs.state ile content_items.status ORTOGONAL", async () => {
    const running = (await port("video").listJobs("10000000-0000-4000-8000-000000000013"))
      .find((j) => j.state === "running");
    expect(running).toBeDefined();
    const item = await port("content").get("10000000-0000-4000-8000-000000000013");
    expect(item?.status).toBe("needs_review");
  });

  it("⭐ D1 — bazı içeriklerin final'i var, bazılarının sadece d1", async () => {
    const all = await port("metrics").list(90);
    const tiersOf = (id: string) => all.filter((m) => m.content_item_id === id).map((m) => m.tier);

    // 38 gün önce yayınlanan: toplama bitti.
    expect(tiersOf("10000000-0000-4000-8000-000000000001")).toEqual(["h6", "d1", "final"]);
    // 14 gün önce yayınlanan: final YOK ve olmayacak.
    expect(tiersOf("10000000-0000-4000-8000-000000000031")).toEqual(["h6", "d1"]);

    const withFinal = new Set(all.filter((m) => m.tier === "final").map((m) => m.content_item_id));
    const allIds = new Set(all.map((m) => m.content_item_id));
    expect(withFinal.size).toBeGreaterThan(0);
    expect(withFinal.size).toBeLessThan(allIds.size);
  });

  it("⭐ D1 — latest() final'i OLMAYAN içeriği de döndürüyor (eski kural düşürürdü)", async () => {
    const latest = await port("metrics").latest(90);
    const ids = latest.map((m) => m.content_item_id);

    expect(ids).toContain("10000000-0000-4000-8000-000000000031"); // final'i yok
    expect(ids).toContain("10000000-0000-4000-8000-000000000001"); // final'i var
    // h6 sızmıyor.
    expect(latest.every((m) => m.tier !== "h6")).toBe(true);
    // İçerik başına TEK satır.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("§4d — media_jobs'ta 'running' durumda bir kayıt var", async () => {
    const jobs = await port("video").listJobs("10000000-0000-4000-8000-000000000013");
    expect(jobs.some((j) => j.state === "running")).toBe(true);
  });
});

describe("fixture belirlenimciliği", () => {
  it("aynı `now` her zaman aynı satırları verir", () => {
    expect(demoContentItems(NOW)).toEqual(demoContentItems(NOW));
  });

  it("farklı `now` satırları kaydırır — takvim bayatlamaz", () => {
    const later = new Date("2026-09-27T12:00:00Z");
    const a = demoContentItems(NOW)[0].published_at;
    const b = demoContentItems(later)[0].published_at;
    expect(a).not.toBe(b);
  });

  it("arşivli persona listede görünmüyor", async () => {
    const listed = await port("video").listPersonas();
    expect(listed.map((p) => p.id)).not.toContain(DEMO_PERSONA_IDS.selin);
  });
});
