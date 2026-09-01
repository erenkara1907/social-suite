import { describe, expect, it } from "vitest";
import { judgeContinuation } from "@/lib/core/dedupe/judge-continuation";

/**
 * Entegrasyon testi — GERÇEK Anthropic çağrısı. `lib/core/plan/skeleton.live.test.ts`
 * ile AYNI desen (bkz. o dosyanın başlığı — PARA HARCAR, CI'da çalışmaz).
 *
 *   ANTHROPIC_API_KEY_LIVE_TEST=sk-ant-... npx vitest run lib/core/dedupe/judge-continuation.live.test.ts
 *
 * ⚠ Bu, Katman 3'ün LLM adımının GERÇEK altyapıya karşı hiç kanıtlanmadığı
 * anlamına geliyor — `checkDuplicate()`'in kendisi bu çağrıya yalnızca
 * Katman 2 (embedding) açıkken ulaşır ve bugün hiçbir markada Voyage
 * yapılandırılmadığı için (§12 adım 15 revize A0) o yol production'da hiç
 * TETİKLENMİYOR. Bu dosya yalnızca `judgeContinuation()`'ın kendi başına,
 * doğru şemayla çalıştığını kanıtlar — elle tetiklenmesi gerekiyor.
 */
const LIVE_KEY = process.env.ANTHROPIC_API_KEY_LIVE_TEST;
const MODEL = "claude-sonnet-5";

describe.skipIf(!LIVE_KEY)("judgeContinuation — GERÇEK Anthropic çağrısı (para harcar)", () => {
  it("açıkça farklı bir yönü anlatan adayı 'devam' sayar", async () => {
    const result = await judgeContinuation(
      {
        candidateTitle: "Kahvemizin fiyatı neden bu kadar adil?",
        candidateHook: "Çekirdek maliyetini bugün açıklıyoruz.",
        neighborTitle: "Yeni kahve dükkanımız açıldı!",
        neighborHook: "Kadıköy'de üçüncü nesil bir deneyim sizi bekliyor.",
      },
      LIVE_KEY!,
      MODEL,
    );
    console.log("[judge-continuation.live.test] sonuç:", JSON.stringify(result, null, 2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.isContinuation).toBe("boolean");
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  }, 30_000);
});
