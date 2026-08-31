import { describe, expect, it } from "vitest";
import { classifyAnthropicError } from "@/lib/core/ai/classify-error";

/**
 * BIRLESIM_PLANI §12 adım 14 FAZ C4. Saf senkron fonksiyon — gerçek/mock'lu
 * SDK çağrısı YOK, doğrudan hazır hata nesneleriyle sınıflandırma test
 * edilir. `lib/core/plan/skeleton.test.ts`'in kendi yorumu: sağlayıcı
 * istisnasını `messages.create()` üzerinden ASENKRON reddetmek bu vitest
 * sürümünde (4.1.11) test çalıştırıcısının "unhandled rejection"
 * izleyicisiyle yanlış pozitif üretiyordu — bu dosya o sorunu tamamen
 * atlıyor (senkron çağrı, promise yok).
 *
 * `Anthropic.*` sınıflarının GERÇEĞİYLE test ediliyor (mock DEĞİL) — bu
 * sınıfların constructor imzası (`status`, `headers` gerektiriyor) tam
 * uyumlu olmayabilir, o yüzden yalnızca `Object.create(prototype)` ile
 * doğru prototip zincirini taşıyan minimal nesneler kuruluyor; test ettiği
 * şey `instanceof` davranışı, tam bir HTTP yanıtı DEĞİL.
 */
import Anthropic from "@anthropic-ai/sdk";

function fakeInstance<T extends object>(ctor: { prototype: T }): T {
  return Object.create(ctor.prototype) as T;
}

describe("classifyAnthropicError", () => {
  it("AuthenticationError → invalid_key", () => {
    const error = fakeInstance(Anthropic.AuthenticationError);
    (error as unknown as Error).message = "invalid x-api-key";
    expect(classifyAnthropicError(error)).toEqual({ code: "invalid_key", detail: "invalid x-api-key" });
  });

  it("APIConnectionTimeoutError → timeout (APIConnectionError'dan ÖNCE kontrol edilir)", () => {
    const error = fakeInstance(Anthropic.APIConnectionTimeoutError);
    (error as unknown as Error).message = "Request timed out";
    expect(classifyAnthropicError(error)).toEqual({ code: "timeout", detail: "Request timed out" });
  });

  it("düz APIConnectionError (timeout değil) → upstream_error", () => {
    const error = fakeInstance(Anthropic.APIConnectionError);
    (error as unknown as Error).message = "network unreachable";
    expect(classifyAnthropicError(error)).toEqual({ code: "upstream_error", detail: "network unreachable" });
  });

  it("RateLimitError → rate_limited", () => {
    const error = fakeInstance(Anthropic.RateLimitError);
    (error as unknown as Error).message = "rate limit exceeded";
    expect(classifyAnthropicError(error)).toEqual({ code: "rate_limited", detail: "rate limit exceeded" });
  });

  it("tanımlanamayan Error alt sınıfı → upstream_error", () => {
    const error = new Error("boom");
    expect(classifyAnthropicError(error)).toEqual({ code: "upstream_error", detail: "boom" });
  });

  it("Error olmayan bir değer fırlatılırsa da çökmez — detail String() ile üretilir", () => {
    expect(classifyAnthropicError("plain string throw")).toEqual({ code: "upstream_error", detail: "unknown error" });
  });
});
