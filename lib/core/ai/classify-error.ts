/**
 * Anthropic SDK hatasını `ApiErrorCode`'a çevirir — BIRLESIM_PLANI §12
 * adım 14 FAZ B. `skeleton.ts` ve `caption.ts`'in ikisi de aynı try/catch
 * mantığını tekrarlamasın diye tek yerde (DRY).
 *
 * En özelden en genele sırayla kontrol edilir (claude-api skill,
 * "Catch most-specific first, in a chain") — `APIConnectionTimeoutError`
 * `APIConnectionError`'ın alt sınıfı olduğu için önce o kontrol edilir.
 *
 * ⚠ `detail` RAW sağlayıcı hata metnidir — kullanıcıya asla doğrudan
 * gösterilmez (bkz. `lib/core/ai/error-copy.ts` yorumu). Yalnızca log/ops
 * için taşınır.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ApiErrorCode } from "@/lib/core/ai/types";

export interface ClassifiedError {
  code: ApiErrorCode;
  detail: string;
}

export function classifyAnthropicError(error: unknown): ClassifiedError {
  const detail = error instanceof Error ? error.message : "unknown error";

  if (error instanceof Anthropic.AuthenticationError) {
    return { code: "invalid_key", detail };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { code: "timeout", detail };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "rate_limited", detail };
  }
  // APIConnectionError (timeout dışı ağ hatası), diğer APIStatusError'lar
  // (500/529 vb.) ve tanımadığımız her şey — tek bir "sağlayıcı hatası" kovası.
  return { code: "upstream_error", detail };
}
