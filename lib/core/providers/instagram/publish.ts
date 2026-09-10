/**
 * ← siraya/lib/instagram/publish.ts
 *
 * UYARLAMA (§12 adım 16 FAZ A, §8.6):
 *  - `GRAPH_HOST` top-level import'u KALDIRILDI; her fonksiyon artık ilk
 *    parametre olarak bir `InstagramConfig` (`./config`) alıyor, host
 *    `graphHost(config)` ile kurulur.
 *  - Hata modeli `throw` → `{ ok:true, ... } | { ok:false, error }` (bkz.
 *    `./oauth.ts`'in aynı başlığı — `lib/core/providers/bluesky.ts` deseni).
 *  - Kaynak yorumları (İngilizce, satır satır) KORUNDU.
 *
 * ⭐ FAZ C'nin (yayın adaptörü) girdisi burası: `publishToInstagram()`
 * container→poll→publish akışının TAMAMINI TEK ÇAĞRIDA yürütür —
 * `lib/adapters/ports.ts`'in `PublisherPort` yorumundaki "asenkron akış
 * `publish()`'in gövdesi İÇİNDE kendi bekleme döngüsünü çalıştırır" kararının
 * tam karşılığı bu fonksiyon.
 */
import { graphHost, type InstagramConfig } from "./config";

export type MediaType = "IMAGE" | "REELS" | "STORIES";

/** Instagram's own container states. FINISHED is the only one we may publish. */
type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

const POLL_INTERVAL_MS = 3000;
// ~5 minutes. Reels transcoding routinely outruns a minute, and the route is
// allowed 300s, so waiting is cheaper than failing a post Instagram would have
// accepted moments later.
const POLL_MAX_ATTEMPTS = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

type CallResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

async function call(url: string, init: RequestInit, context: string): Promise<CallResult> {
  let response: Response;
  try {
    // ⚠ §12 adım 16 FAZ B1 canlı bulgusu (`./oauth.ts`) — Next.js'in sunucu
    // `fetch()` Veri Önbelleği URL bazlı anahtarlanıyor; `containerId`/token
    // gibi gövde/parametre farkları önbellek anahtarına GİRMEYEBİLİR.
    // `cache: "no-store"` her çağrıyı gerçekten ağa gönderir.
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch (error) {
    return { ok: false, error: `${context}: ${errorMessage(error)}` };
  }
  const text = await response.text();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `${context}: non-JSON response (${response.status}): ${text.slice(0, 200)}` };
  }

  const error = body.error as { message?: string; error_user_msg?: string } | undefined;
  if (error) return { ok: false, error: `${context}: ${error.error_user_msg || error.message || JSON.stringify(error)}` };
  if (!response.ok) return { ok: false, error: `${context}: HTTP ${response.status} — ${text.slice(0, 200)}` };

  return { ok: true, body };
}

export interface ContainerInput {
  igUserId: string;
  accessToken: string;
  mediaUrl: string;
  caption: string;
  mediaType: MediaType;
}

/**
 * A story can be a photo or a video, and each takes a different parameter, so
 * the media type alone is not enough to build the call. Uploads are named .jpg
 * or .mp4 by the dialog, which is what this reads.
 */
function isVideo(url: string): boolean {
  return /\.(mp4|mov)(\?|#|$)/i.test(url);
}

export type CreateContainerResult = { ok: true; containerId: string } | { ok: false; error: string };

/**
 * Step 1 of 2. Instagram fetches `mediaUrl` itself, so it must be reachable
 * from the public internet — a localhost or signed-private URL will fail here.
 */
export async function createContainer(config: InstagramConfig, input: ContainerInput): Promise<CreateContainerResult> {
  const params = new URLSearchParams({ access_token: input.accessToken, caption: input.caption });

  if (input.mediaType === "IMAGE") {
    params.set("image_url", input.mediaUrl);
  } else if (input.mediaType === "REELS") {
    params.set("video_url", input.mediaUrl);
    params.set("media_type", "REELS");
  } else {
    // STORIES — photo or video, and sending the wrong parameter is rejected.
    params.set(isVideo(input.mediaUrl) ? "video_url" : "image_url", input.mediaUrl);
    params.set("media_type", "STORIES");
  }

  const result = await call(
    `${graphHost(config)}/${input.igUserId}/media`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
    "Creating the media container failed",
  );
  if (!result.ok) return result;

  const id = result.body.id as string | undefined;
  if (!id) return { ok: false, error: "Creating the media container failed: no container id returned." };
  return { ok: true, containerId: id };
}

export type ContainerStatusResult =
  | { ok: true; code: ContainerStatus; detail: string | undefined }
  | { ok: false; error: string };

export async function containerStatus(config: InstagramConfig, containerId: string, accessToken: string): Promise<ContainerStatusResult> {
  const params = new URLSearchParams({ fields: "status_code,status", access_token: accessToken });
  const result = await call(`${graphHost(config)}/${containerId}?${params}`, { method: "GET" }, "Reading container status failed");
  if (!result.ok) return result;
  return {
    ok: true,
    code: result.body.status_code as ContainerStatus,
    detail: typeof result.body.status === "string" ? result.body.status : undefined,
  };
}

export type WaitForContainerResult = { ok: true } | { ok: false; error: string };

/** Images are usually ready at once; video and reels transcode first. */
export async function waitForContainer(config: InstagramConfig, containerId: string, accessToken: string): Promise<WaitForContainerResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const status = await containerStatus(config, containerId, accessToken);
    if (!status.ok) return status;

    if (status.code === "FINISHED") return { ok: true };
    if (status.code === "ERROR" || status.code === "EXPIRED") {
      return { ok: false, error: `Instagram rejected the media (${status.code})${status.detail ? `: ${status.detail}` : ""}` };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Not a rejection: Instagram is still working. Saying so keeps the operator
  // from hunting for a fault in media that was probably fine.
  return {
    ok: false,
    error:
      "Instagram was still processing the media after 5 minutes. The post was not published; " +
      "it may simply be a large file — try again, and check the account before re-posting.",
  };
}

export type PublishContainerResult = { ok: true; mediaId: string } | { ok: false; error: string };

/** Step 2 of 2. Returns the published media's Instagram id. */
export async function publishContainer(config: InstagramConfig, igUserId: string, accessToken: string, creationId: string): Promise<PublishContainerResult> {
  const params = new URLSearchParams({ creation_id: creationId, access_token: accessToken });

  const result = await call(
    `${graphHost(config)}/${igUserId}/media_publish`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
    "Publishing failed",
  );
  if (!result.ok) return result;

  const id = result.body.id as string | undefined;
  if (!id) return { ok: false, error: "Publishing failed: no media id returned." };
  return { ok: true, mediaId: id };
}

export type PublishingLimitResult = { ok: true; used: number; total: number } | { ok: false; error: string };

/** 100 API-published posts per rolling 24 hours, per account. */
export async function publishingLimit(config: InstagramConfig, igUserId: string, accessToken: string): Promise<PublishingLimitResult> {
  const params = new URLSearchParams({ fields: "config,quota_usage", access_token: accessToken });
  const result = await call(`${graphHost(config)}/${igUserId}/content_publishing_limit?${params}`, { method: "GET" }, "Reading the publishing limit failed");
  if (!result.ok) return result;

  const row = (result.body.data as { quota_usage?: number; config?: { quota_total?: number } }[] | undefined)?.[0];
  return { ok: true, used: row?.quota_usage ?? 0, total: row?.config?.quota_total ?? 100 };
}

export type PublishToInstagramResult = { ok: true; mediaId: string } | { ok: false; error: string };

/** The whole journey, as the scheduler runs it. */
export async function publishToInstagram(config: InstagramConfig, input: ContainerInput): Promise<PublishToInstagramResult> {
  const created = await createContainer(config, input);
  if (!created.ok) return created;

  const waited = await waitForContainer(config, created.containerId, input.accessToken);
  if (!waited.ok) return waited;

  const published = await publishContainer(config, input.igUserId, input.accessToken, created.containerId);
  if (!published.ok) return published;
  return { ok: true, mediaId: published.mediaId };
}
