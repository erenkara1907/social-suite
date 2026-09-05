/**
 * ← sahne/lib/server/elevenlabs.ts
 * ⚠ UYARLAMA (§8.6): ELEVENLABS_API_KEY ortam değişkeni okuması KALDIRILDI.
 * Her ağ fonksiyonu artık `apiKey` parametresi alıyor — anahtar müşterinin,
 * `provider_credentials` + Vault'tan çözülüp buraya geçiliyor.
 *
 * ElevenLabs — turns the script into the actor's voiceover. Server-only:
 * ELEVENLABS_API_KEY must never reach the browser.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */

const ELEVENLABS_HOST = "https://api.elevenlabs.io";
const ELEVENLABS_BASE = `${ELEVENLABS_HOST}/v1`;
/** Only /v2/voices takes a language filter; /v1/voices has no such param. */
const ELEVENLABS_BASE_V2 = `${ELEVENLABS_HOST}/v2`;

/** Multilingual — the scripts in this kit are Turkish as often as English. */
export const VOICE_MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

/** ISO 639-1, the code ElevenLabs labels Turkish voices with. */
const TURKISH = "tr";
/** This account has 26 voices; one page covers it without pagination code. */
const VOICE_PAGE_SIZE = 100;

/** A UGC script is ~300 characters; this caps a runaway request, not a script. */
export const MAX_SCRIPT_CHARS = 800;

export interface VoiceQuota {
  used: number;
  limit: number;
}

export interface Voice {
  id: string;
  name: string;
  accent: string | null;
  gender: string | null;
}

/** What the persona panel needs to cast a voice by ear and by fit. */
export interface TurkishVoice {
  voiceId: string;
  name: string;
  labels: VoiceLabels;
  previewUrl: string | null;
  /**
   * True when ElevenLabs itself files the voice under Turkish; false when it is
   * an other-language voice merely verified to speak it.
   */
  isNative: boolean;
}

export interface VoiceLabels {
  gender: string | null;
  age: string | null;
  accent: string | null;
  descriptive: string | null;
}

interface RawVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

interface RawListedVoice extends RawVoice {
  preview_url?: string | null;
  verified_languages?: { language?: string }[];
}

/**
 * The account's usable voices. Names carry the vendor's marketing suffix
 * ("Sarah - Mature, Reassuring…"), so only the part before the dash is kept.
 */
export async function listVoices(apiKey: string): Promise<Voice[]> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": requireKey(apiKey) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = (await res.json()) as { voices?: RawVoice[] };
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: shortName(v.name),
    accent: v.labels?.accent ?? null,
    gender: v.labels?.gender ?? null,
  }));
}

/**
 * The Turkish voices this account can cast, native ones first.
 *
 * Two tiers on purpose. ElevenLabs' own `?language=tr` filter is strict — it
 * returns only voices whose own label says Turkish — and on this account that
 * is three voices, all of them female, which is no menu at all for a male
 * persona. So the unfiltered list is fetched alongside it and anything with
 * `tr` in verified_languages is appended behind the native ones, flagged so the
 * UI can say which is which rather than pass an accent off as a native voice.
 */
export async function listTurkishVoices(apiKey: string): Promise<TurkishVoice[]> {
  const [native, all] = await Promise.all([fetchVoicePage(TURKISH, apiKey), fetchVoicePage(null, apiKey)]);

  const nativeIds = new Set(native.map((v) => v.voice_id));
  const alsoSpeaksTurkish = all.filter((v) => !nativeIds.has(v.voice_id) && speaksTurkish(v));

  return [
    ...native.map((v) => toTurkishVoice(v, true)),
    ...alsoSpeaksTurkish.map((v) => toTurkishVoice(v, false)),
  ];
}

/**
 * ⚠ §8.6 — anahtar artık ortamdan DEĞİL, çağırandan geliyor. Bu modül hangi
 * markanın anahtarıyla çağrıldığını bilmez ve bilmemeli.
 */
export function isElevenLabsConfigured(apiKey: string | null | undefined): boolean {
  return !!apiKey;
}

function requireKey(apiKey: string): string {
  if (!apiKey) throw new Error("ElevenLabs API anahtarı eksik — marka için provider_credentials'a eklenmeli");
  return apiKey;
}

/** Renders `text` in `voiceId` and returns the raw mp3 bytes. */
export async function synthesizeSpeech(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": requireKey(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: VOICE_MODEL,
      output_format: OUTPUT_FORMAT,
      // Loose stability keeps the delivery breathy rather than flat. Style is
      // kept low because past ~0.3 the model performs the line instead of
      // reading it, which lands as louder rather than more natural.
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.25,
        use_speaker_boost: true,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await readError(res));
  return res.arrayBuffer();
}

/** Characters used against the monthly quota (free tier is 10,000). */
export async function getVoiceQuota(apiKey: string): Promise<VoiceQuota> {
  const res = await fetch(`${ELEVENLABS_BASE}/user/subscription`, {
    headers: { "xi-api-key": requireKey(apiKey) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = (await res.json()) as { character_count?: number; character_limit?: number };
  return { used: data.character_count ?? 0, limit: data.character_limit ?? 0 };
}

/**
 * BIRLESIM_PLANI §12 adım 20.5 FAZ B — "test et" düğmesinin en ucuz
 * ElevenLabs çağrısı: `/v1/user/subscription` (abonelik/kota bilgisi) zaten
 * salt okunur ve `getVoiceQuota()`'nun kendisi bunu çağırıyor — TEKRAR
 * YAZILMADI, sarıldı. `listTurkishVoices()` de bir alternatif olurdu ama
 * o tek sayfa ses listesi döndürüyor (daha ağır gövde); hesap bilgisi daha
 * ucuz ve amaca (yalnızca "anahtar çalışıyor mu") daha uygun.
 */
export async function verifyElevenLabsKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await getVoiceQuota(apiKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "bilinmeyen hata" };
  }
}

/** One page of /v2/voices, optionally narrowed to a language by the vendor. */
async function fetchVoicePage(language: string | null, apiKey: string): Promise<RawListedVoice[]> {
  const url = new URL(`${ELEVENLABS_BASE_V2}/voices`);
  url.searchParams.set("page_size", String(VOICE_PAGE_SIZE));
  if (language) url.searchParams.set("language", language);

  const res = await fetch(url, { headers: { "xi-api-key": requireKey(apiKey) }, cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));

  const data = (await res.json()) as { voices?: RawListedVoice[] };
  return data.voices ?? [];
}

function speaksTurkish(voice: RawListedVoice) {
  return (voice.verified_languages ?? []).some((entry) => entry.language === TURKISH);
}

function toTurkishVoice(voice: RawListedVoice, isNative: boolean): TurkishVoice {
  return {
    voiceId: voice.voice_id,
    name: shortName(voice.name),
    labels: {
      gender: voice.labels?.gender ?? null,
      age: voice.labels?.age ?? null,
      accent: voice.labels?.accent ?? null,
      descriptive: voice.labels?.descriptive ?? null,
    },
    previewUrl: voice.preview_url ?? null,
    isNative,
  };
}

/** "Zeynep Ece - Young and Soft" → "Zeynep Ece". Both dash characters occur. */
function shortName(name: string) {
  return name.split(" - ")[0].split(" – ")[0].trim();
}

/** ElevenLabs nests its reason at detail.message; fall back to the status. */
async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as
    | { detail?: { message?: string } | string }
    | null;
  const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
  return detail || `ElevenLabs request failed (HTTP ${res.status})`;
}
