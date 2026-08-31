/**
 * ← threadly/lib/ai/types.ts
 * Uyarlama: `Channel` → `PlanChannel` (§1.2); §7.1 gereği `ApiErrorCode`'a
 * `rate_limited`, `duplicate`, `publish_failed` eklendi.
 *
 * Contract shared by the /api/caption and /api/image routes and their browser
 * callers. Errors travel as a stable `code`; the UI maps it to TR/EN copy so
 * both languages stay in the client (see ERROR_COPY in lib/ai/client.ts).
 */
import type { Lang, PlanChannel } from "@/lib/core/types";

export interface CaptionDraft {
  hook: string;
  body: string;
  hashtags: string;
}

export interface CaptionRequest {
  idea: string;
  channel: PlanChannel;
  tone: string;
  lang: Lang;
}

export interface ImageRequest {
  prompt: string;
}

export interface GeneratedImage {
  url: string;
  width?: number;
  height?: number;
}

export type ApiErrorCode =
  | "duplicate"
  // ⭐ §12 adım 12 (iş kuyruğu) — sahiplik reddi. `owns_brand()` false
  // dönünce (başka markanın işine erişmeye çalışmak) DB `42501`
  // (insufficient_privilege) fırlatır; PostgREST bunu HTTP 403'e çevirir —
  // bu kod o anlama gelir. "refused" AI reddi (içerik/politika) için ayrı.
  | "forbidden"
  | "invalid_input"
  // ⭐ §12 adım 14 FAZ B — `missing_key`'den AYRI: bu, marka bir anahtar
  // GİRDİ ama sağlayıcı onu reddetti (Anthropic 401). Kullanıcının yapması
  // gereken şey farklı — "anahtar ekle" değil "anahtarı değiştir/düzelt".
  | "invalid_key"
  | "missing_key"
  | "not_configured"
  | "not_found"
  | "publish_failed"
  | "rate_limited"
  | "refused"
  // ⭐ §12 adım 14 FAZ A3 — kill switch açıkken `enqueue_job()`'un fırlattığı
  // özel SQLSTATE ('KILL01') buraya çevrilir. `rate_limited`'dan AYRI:
  // rate limit bir eşik (aynı pencerede yeniden dene), bu bir acil fren
  // (biri kapatana kadar hiç geçmez) — aynı koda eşlemek kullanıcıya
  // yanlış "biraz bekle" mesajı verirdi.
  | "service_paused"
  | "storage_error"
  // ⭐ §12 adım 14 FAZ B — sağlayıcı isteğe zamanında yanıt vermedi
  // (`Anthropic.APIConnectionTimeoutError`). `upstream_error`'dan ayrı:
  // kullanıcıya "tekrar dene" demesi doğru ama sebep farklı, kopya da öyle.
  | "timeout"
  | "unauthenticated"
  | "upstream_error";

/** Sağlayıcının döndürdüğü ham token sayısı — §12 adım 14 FAZ A2, `ai_usage`'a
 *  yazılacak. Fiyat HESAPLANMAZ, yalnızca sayı taşınır. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * `planSkeleton()`/`writeCaption()`'ın paylaştığı ortak zarf — ikisi de
 * `{ok:true, usage, ...kendi alanları} | {ok:false, code, detail?}` şeklinde.
 * `lib/server/ai/run-provider-call.ts` bu ortaklığa dayanıyor.
 */
export type ProviderCallOutcome<TSuccess> =
  | ({ ok: true; usage: TokenUsage } & TSuccess)
  | { ok: false; code: ApiErrorCode; detail?: string };

export interface ApiError {
  code: ApiErrorCode;
  /** Short server-side detail; shown as secondary text under the message. */
  detail?: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  duplicate: 409,
  forbidden: 403,
  invalid_input: 400,
  invalid_key: 401,
  missing_key: 503,
  not_configured: 503,
  not_found: 404,
  publish_failed: 502,
  rate_limited: 429,
  refused: 422,
  service_paused: 503,
  storage_error: 500,
  timeout: 504,
  unauthenticated: 401,
  upstream_error: 502,
};
