/**
 * ← sahne/lib/server/kie.ts
 * ⚠ UYARLAMA (§8.6): KIE_API_KEY ortam değişkeni okuması KALDIRILDI. Her ağ fonksiyonu
 * artık `apiKey` parametresi alıyor — anahtar müşterinin, `provider_credentials`
 * + Vault'tan çözülüp buraya geçiliyor. `isKieConfigured()` de env okumak
 * yerine anahtarı parametre alıyor. `uploadPath` çağırana açıldı (§7.1).
 *
 * Kie.ai — renders the UGC clip. Server-only: KIE_API_KEY must never reach the
 * browser.
 *
 * The studio drives OmniHuman 1.5: an actor portrait plus an ElevenLabs
 * voiceover become a talking performance. Measured against four alternatives,
 * it was the only one that read as real; the cheaper models all traded away
 * resolution and bitrate in step with their price.
 */

const KIE_BASE = "https://api.kie.ai/api/v1";
/** The file store lives on a different host than the rest of the API. */
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
/** Kie'nin dosya deposundaki klasör. sahne'de sabit "sahne" idi; §7.1 gereği
 *  ürün adına taşındı ve çağıran tarafından geçilebilir. */
export const KIE_UPLOAD_PATH = "social";

export const LIPSYNC_MODEL = "omnihuman-1-5";
/** Measured: 324 credits for 12.04s, 135 for 5.8s at 720p. 1080p is 26.9/s. */
export const LIPSYNC_CREDITS_PER_SECOND = 27;
/**
 * 720p saves only 13% but costs a third of the bitrate and a third of the
 * pixels — a bad trade for the one thing this studio is optimising for.
 */
export const LIPSYNC_RESOLUTION = "1080";
/** Measured across two Turkish voiceovers: 146 chars/11.9s, 77 chars/5.7s. */
export const CHARS_PER_SECOND = 13;

export type VideoState = "generating" | "ready" | "failed";

export interface VideoTask {
  state: VideoState;
  videoUrl: string | null;
  error: string | null;
}

interface KieEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

/** What a script of this length will cost, before a credit is spent. */
export function estimateCredits(charCount: number) {
  const seconds = Math.max(charCount / CHARS_PER_SECOND, 1);
  return { seconds, credits: Math.ceil(seconds * LIPSYNC_CREDITS_PER_SECOND) };
}

/**
 * ⚠ §8.6 — anahtar artık ortamdan DEĞİL, çağırandan geliyor. Bu modül hangi
 * markanın anahtarıyla çağrıldığını bilmez ve bilmemeli; çözümleme
 * `lib/server/`'ın işi. Bu yüzden burada ortam değişkeni okuması YOK.
 */
export function isKieConfigured(apiKey: string | null | undefined): boolean {
  return !!apiKey;
}

function requireKey(apiKey: string): string {
  if (!apiKey) throw new Error("Kie.ai API anahtarı eksik — marka için provider_credentials'a eklenmeli");
  return apiKey;
}

async function kieRequest<T>(url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireKey(apiKey)}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as KieEnvelope<T> | null;
  if (!res.ok || !body || body.code !== 200) {
    throw new Error(body?.msg || `Kie.ai request failed (HTTP ${res.status})`);
  }
  return body.data;
}

/** Remaining Kie.ai credits on the account. */
export async function getCredits(apiKey: string): Promise<number> {
  return kieRequest<number>(`${KIE_BASE}/chat/credit`, apiKey);
}

/**
 * BIRLESIM_PLANI §12 adım 20.5 FAZ B — "test et" düğmesinin en ucuz kie
 * çağrısı: kredi bakiyesi zaten en ucuz uç nokta (tek okuma, hiçbir render
 * BAŞLATMAZ) — `getCredits()`'in kendisini TEKRAR yazmak yerine sarıyoruz.
 */
export async function verifyKieKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await getCredits(apiKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "bilinmeyen hata" };
  }
}

/** Uploads bytes to Kie's temp store and returns a URL its models can read. */
export async function uploadToKie(
  data: Buffer,
  mimeType: string,
  fileName: string,
  apiKey: string,
  uploadPath = KIE_UPLOAD_PATH,
): Promise<string> {
  const result = await kieRequest<{ downloadUrl: string }>(KIE_UPLOAD_URL, apiKey, {
    method: "POST",
    body: JSON.stringify({
      base64Data: `data:${mimeType};base64,${data.toString("base64")}`,
      uploadPath,
      fileName,
    }),
  });
  return result.downloadUrl;
}

/** Queues the render: the portrait performs the audio. Takes 5-8 minutes. */
export async function createLipsyncTask(
  imageUrl: string,
  audioUrl: string,
  apiKey: string,
): Promise<string> {
  const data = await kieRequest<{ taskId: string }>(`${KIE_BASE}/jobs/createTask`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: LIPSYNC_MODEL,
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
        output_resolution: LIPSYNC_RESOLUTION,
      },
    }),
  });
  return data.taskId;
}

/* ── Persona pipeline (flag-gated, PERSONA_PIPELINE_ENABLED) ──────────────────
 *
 * A second branch that never touches the OmniHuman one. Two steps live here:
 * Nano Banana Pro renders a 9:16 persona frame, and Kling 3.0 animates that
 * frame *speaking English*. The Turkish mouth sync that follows is not a Kie
 * model at all — it runs on fal.ai, in lib/server/fal.ts.
 *
 * Both models here are ordinary market jobs, so they queue through the same
 * createTask call and are polled with the same getMarketTask below.
 */

export const PERSONA_IMAGE_MODEL = "nano-banana-pro";
export const PERSONA_VIDEO_MODEL = "kling-3.0/video";
/** Vertical is the only aspect a feed rewards; both steps are locked to it. */
export const PERSONA_ASPECT_RATIO = "9:16";
/** The frame is a start frame, not a deliverable — oversample it once, here. */
export const PERSONA_IMAGE_RESOLUTION = "4K";
/** A scene or dialogue prompt is a paragraph; this caps a runaway request. */
export const PERSONA_PROMPT_MAX_CHARS = 1200;

/**
 * Measured in the playground: Nano Banana Pro billed 18-24 credits per frame
 * across runs. The guard takes the high end so a render is never queued against
 * a balance that cannot cover it.
 */
export const PERSONA_IMAGE_CREDITS = 24;

/** Kie takes both of these as strings, not numbers. */
export const PERSONA_VIDEO_DURATIONS = ["5", "10"] as const;
export type PersonaVideoDuration = (typeof PERSONA_VIDEO_DURATIONS)[number];

export const PERSONA_VIDEO_MODES = ["std", "pro"] as const;
export type PersonaVideoMode = (typeof PERSONA_VIDEO_MODES)[number];

export const PERSONA_VIDEO_DURATION_DEFAULT: PersonaVideoDuration = "5";
export const PERSONA_VIDEO_MODE_DEFAULT: PersonaVideoMode = "pro";

/**
 * Measured in the playground, both at 5s: std billed 100 credits, pro 135. The
 * two modes are far closer than the listed pricing suggested — pro costs about a
 * third more, not double.
 */
export const PERSONA_VIDEO_CREDITS_PER_SECOND: Record<PersonaVideoMode, number> = {
  std: 20,
  pro: 27,
};

/** What one Kling render will cost, before a credit is spent. */
export function estimatePersonaVideoCredits(
  duration: PersonaVideoDuration,
  mode: PersonaVideoMode,
) {
  const seconds = Number(duration);
  return {
    seconds,
    credits: Math.ceil(seconds * PERSONA_VIDEO_CREDITS_PER_SECOND[mode]),
  };
}

/**
 * BIRLESIM_PLANI §12 adım 20.5 FAZ A — fal'in `cut_off` modu videoyu sabit
 * tutar, uzayan sesin SONUNU keser (`fal.ts:29-58`); ses klibin süresini
 * AŞMAMALI. Tek kaynak: `pipeline.ts`'in `loadVoiceInputs`i (dispatch anında,
 * kesin doğrulama) ve `preflight.ts`'in aynı hesabı (zincir başında,
 * erken/ücretsiz doğrulama) İKİSİ DE bunu çağırır — sınır tek yerde yaşar.
 */
export function maxScriptCharsForClip(duration: PersonaVideoDuration = PERSONA_VIDEO_DURATION_DEFAULT): number {
  return Math.floor(Number(duration) * CHARS_PER_SECOND);
}

/** Queues the persona frame. Returns in well under a minute. */
export async function createPersonaImage(prompt: string, apiKey: string): Promise<string> {
  const data = await kieRequest<{ taskId: string }>(`${KIE_BASE}/jobs/createTask`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: PERSONA_IMAGE_MODEL,
      input: {
        prompt,
        aspect_ratio: PERSONA_ASPECT_RATIO,
        resolution: PERSONA_IMAGE_RESOLUTION,
      },
    }),
  });
  return data.taskId;
}

/**
 * Queues the motion clip: the persona frame is the first frame and the model
 * animates the prompt while speaking it in English.
 *
 * `sound: true`, and the prompt is expected to be English. This inverts what
 * this branch did first, because testing by hand proved the old reasoning
 * backwards: Kling only engages its own lip-sync when it is generating audio, so
 * a silent clip comes out with a mouth that never really moves — and a post-hoc
 * sync applied to that has almost nothing to work with, which is why the results
 * were poor. Let Kling speak English so its native lip-sync drives the face, then
 * replace that track with Turkish in the fal.ai step.
 *
 * The prompt's language is the caller's business, not this function's — nothing
 * here rewrites or validates it.
 *
 * aspect_ratio stays even though Kie infers it from image_urls (per the docs).
 * It agrees with the frame, so it is redundant rather than conflicting, and
 * removing it would be a behaviour change bought for nothing.
 */
export async function createPersonaVideo(
  imageUrl: string,
  prompt: string,
  apiKey: string,
  options?: { duration?: PersonaVideoDuration; mode?: PersonaVideoMode },
): Promise<string> {
  const data = await kieRequest<{ taskId: string }>(`${KIE_BASE}/jobs/createTask`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: PERSONA_VIDEO_MODEL,
      input: {
        prompt,
        image_urls: [imageUrl],
        sound: true,
        multi_shots: false,
        duration: options?.duration ?? PERSONA_VIDEO_DURATION_DEFAULT,
        aspect_ratio: PERSONA_ASPECT_RATIO,
        mode: options?.mode ?? PERSONA_VIDEO_MODE_DEFAULT,
      },
    }),
  });
  return data.taskId;
}

const MARKET_STATE: Record<string, VideoState> = {
  waiting: "generating",
  queuing: "generating",
  generating: "generating",
  success: "ready",
  fail: "failed",
};

interface MarketRecord {
  state?: string;
  resultJson?: string | null;
  failMsg?: string | null;
  creditsConsumed?: number | null;
}

/**
 * Polls a render — any market job: OmniHuman, Nano Banana, Kling. recordInfo is
 * model-agnostic, so there is one poller, not three. The result URL is buried in
 * a JSON string.
 *
 * fal requests do NOT come through here: different vendor, different queue. They
 * are polled by getFalLipsyncTask in lib/server/fal.ts.
 */
export async function getMarketTask(taskId: string, apiKey: string): Promise<VideoTask> {
  const data = await kieRequest<MarketRecord>(
    `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    apiKey,
  );
  const state = MARKET_STATE[data.state ?? ""] ?? "generating";

  return {
    state,
    videoUrl: state === "ready" ? (resultUrls(data.resultJson)[0] ?? null) : null,
    error: state === "failed" ? data.failMsg || "Generation failed" : null,
  };
}

function resultUrls(resultJson: string | null | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
    return parsed.resultUrls ?? [];
  } catch {
    return [];
  }
}
