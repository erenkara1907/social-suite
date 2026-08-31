import { describe, expect, it } from "vitest";
import { planSkeleton } from "@/lib/core/plan/skeleton";

/**
 * Entegrasyon testi — GERÇEK Anthropic çağrısı. BIRLESIM_PLANI §12 adım 14
 * FAZ C4 (ikinci katman: `skeleton.test.ts`'in mock'lu birim testlerinin
 * yanı sıra).
 *
 * ⚠ PARA HARCAR. CI'da ÇALIŞMAZ (normal `npm test`/`vitest run` bunu
 * atlar — `ANTHROPIC_API_KEY_LIVE_TEST` boşken `describe.skipIf` devreye
 * girer). Elle tetiklemek için:
 *
 *   ANTHROPIC_API_KEY_LIVE_TEST=sk-ant-... npx vitest run lib/core/plan/skeleton.live.test.ts
 *
 * Ayrı bir env değişkeni kullanılıyor (`provider_credentials`/Vault'un
 * müşteri anahtarı DEĞİL) — bu yalnızca geliştiricinin kendi test anahtarı,
 * ürünün "müşteri kendi anahtarını girer" sözleşmesini (§8.6) kırmıyor;
 * `resolveProviderCredential()`'a hiç dokunmuyor, doğrudan `planSkeleton()`'u
 * çağırıyor.
 */
const LIVE_KEY = process.env.ANTHROPIC_API_KEY_LIVE_TEST;
const MODEL = "claude-sonnet-5";

describe.skipIf(!LIVE_KEY)("planSkeleton — GERÇEK Anthropic çağrısı (para harcar)", () => {
  it("küçük bir tema için geçerli bir plan iskeleti üretir", async () => {
    const result = await planSkeleton(
      {
        theme: "Kadıköy'de üçüncü nesil bir kahve dükkanı için tek gönderilik fikir",
        horizonDays: 7,
        lang: "tr",
        mode: "weekly",
        start: new Date("2026-09-01"),
        brand: null,
      },
      LIVE_KEY!,
      MODEL,
    );

    console.log("[skeleton.live.test] sonuç:", JSON.stringify(result, null, 2));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.posts.length).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  }, 30_000);
});
