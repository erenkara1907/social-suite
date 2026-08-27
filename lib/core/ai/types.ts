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
  | "invalid_input"
  | "missing_key"
  | "not_configured"
  | "not_found"
  | "publish_failed"
  | "rate_limited"
  | "refused"
  | "storage_error"
  | "unauthenticated"
  | "upstream_error";

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
  invalid_input: 400,
  missing_key: 503,
  not_configured: 503,
  not_found: 404,
  publish_failed: 502,
  rate_limited: 429,
  refused: 422,
  storage_error: 500,
  unauthenticated: 401,
  upstream_error: 502,
};
