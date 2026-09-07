import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `planSkeleton()` birim testleri — BIRLESIM_PLANI §12 adım 14 FAZ C4
 * (ADIM_10 madde 4'ün %0 kapsam borcu). Gerçek çağrı YOK — `@anthropic-ai/sdk`
 * tamamen mock'lanıyor; para harcamıyor, CI'da güvenle koşar.
 *
 * Mock deseni `lib/server/mode.test.ts` ile aynı: `vi.mock()` sonra dinamik
 * `await import()`. Sağlayıcının tipli hata sınıflarını da (`AuthenticationError`
 * vb.) taklit ediyoruz ki `classify-error.ts`'in `instanceof` zinciri gerçek
 * SDK ile AYNI şekilde çalışsın — mock ile üretim kodu arasında sınıf
 * kimliği ayrışmasın diye.
 */

const createMock = vi.fn();

class FakeAPIError extends Error {}
class FakeAuthenticationError extends FakeAPIError {}
class FakeAPIConnectionError extends FakeAPIError {}
class FakeAPIConnectionTimeoutError extends FakeAPIConnectionError {}
class FakeRateLimitError extends FakeAPIError {}

class FakeAnthropic {
  messages = { create: createMock };
  constructor(_opts: { apiKey: string }) {}
}
(FakeAnthropic as unknown as { AuthenticationError: typeof FakeAuthenticationError }).AuthenticationError = FakeAuthenticationError;
(FakeAnthropic as unknown as { APIConnectionError: typeof FakeAPIConnectionError }).APIConnectionError = FakeAPIConnectionError;
(FakeAnthropic as unknown as { APIConnectionTimeoutError: typeof FakeAPIConnectionTimeoutError }).APIConnectionTimeoutError =
  FakeAPIConnectionTimeoutError;
(FakeAnthropic as unknown as { RateLimitError: typeof FakeRateLimitError }).RateLimitError = FakeRateLimitError;

vi.mock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

const { planSkeleton } = await import("@/lib/core/plan/skeleton");

const START = new Date("2026-08-24"); // Pazartesi — template.test.ts MONDAY ile aynı
const MODEL = "claude-sonnet-5";
const FAKE_CREDENTIAL = "not-a-real-anthropic-key";

function textMessage(text: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }], usage };
}

describe("planSkeleton — weekly mod", () => {
  beforeEach(() => createMock.mockReset());

  it("istemi doğru kurar: model geçirilir, şema WEEKLY, tema ve marka istemde yer alır", async () => {
    createMock.mockResolvedValue(
      textMessage(JSON.stringify({ title: "Ağustos Planı", posts: [{ slot: 0, title: "T", hook: "H" }] })),
    );

    await planSkeleton(
      {
        theme: "kahve dükkanı yeni menü",
        horizonDays: 7,
        lang: "tr",
        mode: "weekly",
        start: START,
        brand: {
          name: "Kahve Durağı", industry: "", description: "Kadıköy'de kahveci",
          products: "", audience: "", voice: "", keywords: "", links: "",
        },
      },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe(MODEL);
    expect(call.output_config.format.schema.properties.posts.items.required).toEqual(["slot", "title", "hook"]);
    const userText = call.messages[0].content as string;
    expect(userText).toContain("kahve dükkanı yeni menü");
    expect(userText).toContain("Kahve Durağı");
  });

  it("⭐ adım 18 FAZ C — insightBlock verilince PROMPT'A GİRER (tam metin kanıtı)", async () => {
    createMock.mockResolvedValue(
      textMessage(JSON.stringify({ title: "T", posts: [{ slot: 0, title: "T", hook: "H" }] })),
    );

    await planSkeleton(
      {
        theme: "kahve dükkanı yeni menü",
        horizonDays: 7,
        lang: "tr",
        mode: "weekly",
        start: START,
        brand: { name: "Kahve Durağı", industry: "", description: "Kadıköy'de kahveci", products: "", audience: "", voice: "", keywords: "", links: "" },
        insightBlock: "What worked in recent published content — apply the APPROACH, not the topic:\n- Shorter opening lines (hooks) got more engagement.",
      },
      FAKE_CREDENTIAL,
      MODEL,
    );

    const userText = createMock.mock.calls[0][0].messages[0].content as string;
    console.log("[adım 18 FAZ C — TAM PROMPT METNİ]\n" + userText);
    expect(userText).toContain("apply the APPROACH, not the topic");
    expect(userText).toContain("Shorter opening lines (hooks) got more engagement.");
  });

  it("⭐ adım 18 FAZ C — insightBlock YOKSA/boşsa prompt eskisi gibi TEMİZ kalır", async () => {
    createMock.mockResolvedValue(
      textMessage(JSON.stringify({ title: "T", posts: [{ slot: 0, title: "T", hook: "H" }] })),
    );

    await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null, insightBlock: "" },
      FAKE_CREDENTIAL,
      MODEL,
    );

    const userText = createMock.mock.calls[0][0].messages[0].content as string;
    expect(userText).not.toContain("APPROACH");
  });

  it("iyi biçimli yanıtı ayrıştırır — her slot doldurulur", async () => {
    createMock.mockResolvedValue(
      textMessage(
        JSON.stringify({
          title: "Hafta Planı",
          posts: Array.from({ length: 8 }, (_, slot) => ({ slot, title: `Başlık ${slot}`, hook: `Kanca ${slot}` })),
        }),
      ),
    );

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("beklenmeyen hata");
    expect(result.title).toBe("Hafta Planı");
    expect(result.posts).toHaveLength(8);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("kısmi yanıt — model bazı slotları atlarsa, yalnızca doldurulanlar döner", async () => {
    createMock.mockResolvedValue(
      textMessage(JSON.stringify({ title: "Kısmi", posts: [{ slot: 0, title: "A", hook: "a" }, { slot: 3, title: "B", hook: "b" }] })),
    );

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("beklenmeyen hata");
    expect(result.posts).toHaveLength(2);
  });

  it("hiç geçerli slot doldurulmazsa şema uyuşmazlığı olarak reddeder", async () => {
    createMock.mockResolvedValue(textMessage(JSON.stringify({ title: "Boş", posts: [] })));

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result).toEqual({ ok: false, code: "upstream_error", detail: "plan did not match the schema" });
  });
});

describe("planSkeleton — auto mod", () => {
  beforeEach(() => createMock.mockReset());

  it("istemi doğru kurar: şema AUTO, ufuk ve kanal listesi istemde yer alır", async () => {
    createMock.mockResolvedValue(
      textMessage(JSON.stringify({ title: "Otomatik", posts: [{ dayOffset: 0, timeOfDay: "09:00", channel: "x", kind: "text", title: "T", hook: "H" }] })),
    );

    await planSkeleton(
      { theme: "tema", horizonDays: 30, lang: "en", mode: "auto", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    const call = createMock.mock.calls[0][0];
    expect(call.output_config.format.schema.properties.posts.items.required).toEqual([
      "dayOffset", "timeOfDay", "channel", "kind", "title", "hook",
    ]);
    expect(call.messages[0].content as string).toContain("Plan horizon: 30 days");
  });

  it("geçersiz dayOffset/channel/kind içeren girdileri eler, geçerlileri tutar", async () => {
    createMock.mockResolvedValue(
      textMessage(
        JSON.stringify({
          title: "Karışık",
          posts: [
            { dayOffset: 0, timeOfDay: "09:00", channel: "x", kind: "text", title: "Geçerli", hook: "H" },
            { dayOffset: 99, timeOfDay: "09:00", channel: "x", kind: "text", title: "Ufuk dışı", hook: "H" },
            { dayOffset: 1, timeOfDay: "09:00", channel: "unknown-platform", kind: "text", title: "Kötü kanal", hook: "H" },
            { dayOffset: 1, timeOfDay: "09:00", channel: "x", kind: "text", title: "", hook: "H" },
          ],
        }),
      ),
    );

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "auto", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("beklenmeyen hata");
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe("Geçerli");
  });
});

describe("planSkeleton — hatalı/kısmi/bozuk yanıtlar", () => {
  beforeEach(() => createMock.mockReset());

  it("model reddederse (refusal) refused kodu döner", async () => {
    createMock.mockResolvedValue({
      stop_reason: "refusal",
      stop_details: { explanation: "policy" },
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result).toEqual({ ok: false, code: "refused", detail: "policy" });
  });

  it("metin bloğu yoksa upstream_error döner", async () => {
    createMock.mockResolvedValue({ stop_reason: "max_tokens", content: [], usage: { input_tokens: 10, output_tokens: 0 } });

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("beklenmeyen başarı");
    expect(result.code).toBe("upstream_error");
    expect(result.detail).toContain("max_tokens");
  });

  it("JSON bozuksa (parse edilemezse) upstream_error döner, süreç çökmez", async () => {
    createMock.mockResolvedValue(textMessage("bu geçerli bir JSON değil {"));

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("beklenmeyen başarı");
    expect(result.code).toBe("upstream_error");
  });

  it("zarf şekli yanlışsa (title/posts eksik) upstream_error döner", async () => {
    createMock.mockResolvedValue(textMessage(JSON.stringify({ hello: "world" })));

    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    );

    expect(result).toEqual({ ok: false, code: "upstream_error", detail: "plan did not match the schema" });
  });
});

// Sağlayıcı istisnalarının ApiErrorCode'a doğru sınıflandırıldığı ayrı
// dosyada test edilir (`lib/core/ai/classify-error.test.ts`) — burada
// `planSkeleton()`'un o sınıflandırmayı GERÇEKTEN kullandığı tek bir
// örnekle doğrulanıyor, dört ayrı dal için mock'lu SDK çağrısını asenkron
// reddetmek (`messages.create` reject) bu vitest sürümünde (4.1.11) test
// çalıştırıcısının kendi "unhandled rejection" izleyicisiyle YANLIŞ
// POZİTİF üretiyordu — fonksiyon doğru davranıyordu (stderr log'u
// doğru kodu gösteriyordu), yalnızca test raporlaması yanılıyordu.
describe("planSkeleton — sağlayıcı hatası (entegrasyon noktası)", () => {
  it("catch bloğu classifyAnthropicError()'a düşer — upstream_error örneği", async () => {
    createMock.mockReset();
    createMock.mockResolvedValue(Promise.reject(new Error("boom")));
    const result = await planSkeleton(
      { theme: "tema", horizonDays: 7, lang: "tr", mode: "weekly", start: START, brand: null },
      FAKE_CREDENTIAL,
      MODEL,
    ).catch((e: unknown) => {
      throw new Error(`planSkeleton kendi hatasını yutmadı: ${String(e)}`);
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("beklenmeyen başarı");
    expect(result.code).toBe("upstream_error");
    expect(result.detail).toBe("boom");
  });
});
