/**
 * ← sahne/lib/server/fal.ts
 * ⚠ UYARLAMA (§8.6 + §14.3): iki değişiklik.
 *   1. FAL_KEY ortam değişkeni okuması KALDIRILDI → `apiKey` parametresi.
 *   2. İçe aktarma anında çalışan `fal.config()` SINGLETON'ı KALDIRILDI →
 *      istek başına client (`createFalClient`). Singleton, süreçteki TÜM
 *      isteklere tek bir müşterinin anahtarını dayatıyordu; çok kiracılı bir
 *      üründe bu bir kiracı sızıntısıdır, yapılandırma tercihi değil.
 *
 * fal.ai — the persona pipeline's lipsync step. Server-only: FAL_KEY must never
 * reach the browser.
 *
 * Deliberately a separate module from lib/server/kie.ts. fal is a different
 * vendor with a different protocol: a queue with submit/status/result instead of
 * one createTask/recordInfo pair, its own auth scheme, no { code, msg, data }
 * envelope, and a separate wallet with no credit API. Folding it into kie.ts
 * would mean two transports and two error shapes behind one request helper.
 *
 * This module talks to fal through the official @fal-ai/client rather than
 * fetch. The hand-rolled version had to derive the poll URL itself, and got it
 * wrong: fal namespaces queue reads by app *owner*, not by app, so a status call
 * built from the full model path answered 405 and every poll surfaced as a 502.
 * The SDK owns URL construction, so that class of bug cannot recur here. It is
 * the only dependency this pipeline adds.
 *
 * Sync Labs' lipsync is here because nothing closer was available: ElevenLabs
 * exposes lipsync only in its web UI (which itself calls Sync Labs), and Kie
 * does not carry the model at all.
 *
 * Billing: fal is a separate wallet from Kie's, metered at roughly $5 per minute
 * of output — about $0.42 for the ~5s clip this pipeline renders. There is no
 * balance endpoint to read, so unlike the Kie branch nothing here guards on
 * credits before queueing.
 */
import { ApiError, createFalClient } from "@fal-ai/client";

/**
 * v3, not v2/pro. Both accept sync_mode, but v3 is the current Sync.so model and
 * the one this pipeline was tuned against.
 */
export const FAL_LIPSYNC_MODEL = "fal-ai/sync-lipsync/v3";

/**
 * What fal does when the audio and the video are not the same length — and they
 * rarely are here, since the Kling clip (5s or 10s) and the ElevenLabs track are
 * produced independently.
 *
 * `remap` retimes the video onto the audio, so a 7.9s track stretches a 5s clip
 * to 7.9s: the render comes back slowed down and longer than the clip Kling
 * made. `cut_off` trims whatever runs long instead and leaves the video's speed
 * and duration exactly as rendered, which is the priority here — the clip must
 * stay the clip.
 *
 * The cost of cut_off is that audio longer than the video is cut mid-sentence,
 * so this only works alongside the step-3 length guard that keeps the track at
 * or under the clip length (studio side, plus a videoDuration check in
 * /api/persona/voice). `loop` repeats the video, `bounce` plays it forwards then
 * backwards, `silence` pads the audio — all three leave a visible seam.
 *
 * OmniHuman (lib/server/kie.ts) is a different vendor on a different model and
 * is unaffected by this constant.
 */
export const FAL_SYNC_MODE = "cut_off";

/**
 * Structurally identical to kie.ts's VideoTask on purpose, not by accident: the
 * studio polls Kie tasks and fal requests through the same component state, so
 * both pollers have to answer in the same shape. It is redeclared rather than
 * imported to keep this module free of any dependency on the Kie one.
 */
export type FalState = "generating" | "ready" | "failed";

export interface FalTask {
  state: FalState;
  videoUrl: string | null;
  error: string | null;
}

/**
 * The SDK ships a typed endpoint map, but it stops at v2/pro — v3 is newer than
 * the bundled types, so its result comes back as `any`. Narrow it here rather
 * than trusting the shape.
 */
interface FalLipsyncOutput {
  video?: { url?: string };
}

/**
 * ⚠ §8.6 — anahtar artık ortamdan DEĞİL, çağırandan geliyor.
 */
export function isFalConfigured(apiKey: string | null | undefined): boolean {
  return !!apiKey;
}

/**
 * ⚠ §14.3 — istek başına client.
 *
 * Kaynakta bunun yerine içe aktarma anında `fal.config({ credentials: () =>
 * ... })` çağrılıyordu. O çağrının kaynaktaki gerekçesi ("tembel okuma, build
 * FAL_KEY'e bağlanmasın") burada artık geçersiz: anahtar zaten parametre, yani
 * içe aktarma anında hiçbir şey okunmuyor. Geriye singleton'ın asıl sorunu
 * kalıyordu — modül düzeyinde TEK kimlik bilgisi, süreçteki tüm markalar için.
 * Client istek başına yaratılınca her çağrı kendi anahtarını taşıyor.
 */
function client(apiKey: string) {
  if (!apiKey) throw new Error("fal.ai API anahtarı eksik — marka için provider_credentials'a eklenmeli");
  return createFalClient({ credentials: apiKey });
}

/**
 * Queues the sync and returns fal's request id. Both URLs are fetched by fal,
 * not by us.
 *
 * A rejected submit is rethrown as a plain Error carrying fal's own reason, so
 * the route's 502 body says what was wrong with the request instead of just
 * "Bad Request".
 */
export async function createFalLipsync(
  videoUrl: string,
  audioUrl: string,
  apiKey: string,
): Promise<string> {
  try {
    const { request_id } = await client(apiKey).queue.submit(FAL_LIPSYNC_MODEL, {
      input: {
        video_url: videoUrl,
        audio_url: audioUrl,
        sync_mode: FAL_SYNC_MODE,
      },
    });
    return request_id;
  } catch (error) {
    if (error instanceof ApiError) throw new Error(falErrorMessage(error));
    throw error;
  }
}

/**
 * Polls one fal request. The result call only answers once the status is
 * COMPLETED, so it is never made before then.
 *
 * A rejected render comes back as an ApiError and becomes a "failed" task, which
 * stops the studio's poller. Anything else — a socket reset, a DNS failure —
 * throws instead, and the route reports it as a 502 the poller can retry. The
 * split is safe because the SDK already retries 429/502/503/504 internally, so
 * an ApiError that reaches this far is fal's verdict, not a blip.
 */
export async function getFalLipsyncTask(requestId: string, apiKey: string): Promise<FalTask> {
  const fal = client(apiKey);
  try {
    const status = await fal.queue.status(FAL_LIPSYNC_MODEL, { requestId });
    if (status.status !== "COMPLETED") {
      return { state: "generating", videoUrl: null, error: null };
    }

    const { data } = await fal.queue.result(FAL_LIPSYNC_MODEL, { requestId });
    const videoUrl = (data as FalLipsyncOutput)?.video?.url;
    if (!videoUrl) {
      return { state: "failed", videoUrl: null, error: "fal.ai returned no video" };
    }
    return { state: "ready", videoUrl, error: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { state: "failed", videoUrl: null, error: falErrorMessage(error) };
    }
    throw error;
  }
}

/**
 * fal reports why a request was rejected under `detail` — a string, or FastAPI's
 * validation array. ApiError.message reads `message` first and falls back to the
 * bare status text, so on its own it is usually just "Bad Request".
 */
function falErrorMessage(error: ApiError<unknown>): string {
  const detail = (error.body as { detail?: string | Array<{ msg?: string }> } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const joined = detail.map((item) => item?.msg).filter(Boolean).join("; ");
    if (joined) return joined;
  }
  return error.message || `fal.ai request failed (HTTP ${error.status})`;
}
