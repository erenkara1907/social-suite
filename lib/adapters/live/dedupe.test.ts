import { describe, expect, it } from "vitest";
import { liveDedupe } from "@/lib/adapters/live/dedupe";

/**
 * FAZ A DOĞRULAMA — "isAvailable() bugün false dönüyor" ve "live
 * implementasyonu tip olarak var, çağrılmıyor" iddialarının kanıtı.
 * Sıfır dış istek: `liveDedupe` içi hiçbir fetch/DB çağrısı yapmadan
 * sabit değer döndürüyor (bkz. dosyanın kendi başlığı).
 */
describe("liveDedupe — §12 adım 15 revize A0/A3.3", () => {
  it("isAvailable() her zaman false — Voyage entegre edilmedi", async () => {
    expect(await liveDedupe.isAvailable("herhangi-bir-marka")).toBe(false);
  });

  it("embed() not_configured döner, FIRLATMAZ", async () => {
    const r = await liveDedupe.embed("x", "herhangi-bir-marka");
    expect(r).toMatchObject({ ok: false, error: { code: "not_configured" } });
  });
});
