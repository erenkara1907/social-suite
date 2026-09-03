import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import type { JobContext, UgcPipelinePayload } from "@/lib/core/jobs/types";
import type { MediaJobStep } from "@/lib/core/types";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { enqueueInternal } from "@/lib/server/jobs/enqueue-internal";
import {
  findStepJob, insertQueuedJob, markDispatched, markStepFailed, type MediaJobDbRow,
} from "@/lib/server/media/job-row";
import { persistBytesAsset } from "@/lib/server/storage";
import {
  CHARS_PER_SECOND, PERSONA_IMAGE_CREDITS, PERSONA_IMAGE_MODEL, PERSONA_VIDEO_MODEL,
  createPersonaImage, createPersonaVideo, estimatePersonaVideoCredits,
  PERSONA_VIDEO_DURATION_DEFAULT, PERSONA_VIDEO_MODE_DEFAULT,
} from "@/lib/core/providers/kie";
import { VOICE_MODEL, synthesizeSpeech } from "@/lib/core/providers/elevenlabs";
import { FAL_LIPSYNC_MODEL, createFalLipsync } from "@/lib/core/providers/fal";
import { PERSONA_VIDEO_MOTION_PROMPT_EN } from "@/lib/server/media/constants";

/**
 * `ugc_pipeline` işleyicisinin gövdesi — BIRLESIM_PLANI §12 adım 20 FAZ B2.
 *
 * ⭐ Her çağrı TEK bir adımı dispatch eder (vendor'ı çağırır, `media_jobs`
 * satırını yazar/günceller, `media_poll`'a devreder) ve HEMEN döner — worker'ın
 * 45sn bütçesi dakikalar süren bir render'ı asla senkron BEKLEMEZ (§4d).
 * Bir sonraki adıma geçiş ya `media_poll`'un (async adımlar) ya da bu
 * fonksiyonun kendisinin (senkron `voice` adımı) `chainToNextStep()` çağrısıyla
 * olur — `lib/server/media/poll.ts` da aynı fonksiyonu kullanır (DRY, "adım
 * ilerlemesi TEK bir yerde kararlaştırılır").
 */

interface PersonaRow {
  id: string;
  brand_id: string;
  prompt: string;
  image_asset_id: string | null;
}

async function loadPersona(admin: SupabaseClient, personaId: string): Promise<PersonaRow> {
  const { data, error } = await admin
    .from("personas")
    .select("id,brand_id,prompt,image_asset_id")
    .eq("id", personaId)
    .maybeSingle<PersonaRow>();
  if (error) throw new TransientJobError(`personas okunamadı: ${error.message}`);
  if (!data) throw new PermanentJobError(`persona bulunamadı: ${personaId}`);
  return data;
}

/** §12 adım 20 FAZ 0.1/B — her vendor çağrısından ÖNCE kontrol edilir; ops
 *  acil freni çektiyse bir sonraki pahalı çağrı YAPILMAZ. `enqueue_job()`
 *  RPC'sinin kendi kontrolüyle AYNI tablo, ayrı bir okuma — bu çağrı bir
 *  ZİNCİRLEME (service-role, RPC'den geçmiyor), o yüzden kendi kontrolünü
 *  taşımak ZORUNDA. */
async function assertNotPaused(admin: SupabaseClient): Promise<void> {
  const { data } = await admin
    .from("ai_kill_switch")
    .select("is_paused,reason")
    .eq("id", "global")
    .maybeSingle<{ is_paused: boolean; reason: string | null }>();
  if (data?.is_paused) {
    throw new PermanentJobError(`service_paused: ${data.reason || "ai duraklatıldı"}`);
  }
}

const STEP_ORDER: MediaJobStep[] = ["persona_image", "persona_video", "voice", "lipsync"];

function nextStepOf(step: MediaJobStep): MediaJobStep | null {
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
}

export interface ChainArgs {
  brandId: string;
  userId: string;
  contentItemId: string | null;
  personaId: string;
  completedStep: MediaJobStep;
}

/** Bir sonraki adımı kuyruğa açar. `lipsync` sonrası (zincirin sonu) ve
 *  bağımsız `persona_image` (içeriksiz — yeni persona akışı) sonrası hiçbir
 *  şey yapmaz. */
export async function chainToNextStep(admin: SupabaseClient, args: ChainArgs): Promise<void> {
  const next = nextStepOf(args.completedStep);
  if (!next || !args.contentItemId) return;
  await enqueueInternal(
    admin, args.brandId, args.userId, "ugc_pipeline",
    { personaId: args.personaId, contentItemId: args.contentItemId, step: next },
    { dedupeKey: `ugc_pipeline:${args.contentItemId}:${next}` },
  );
}

async function succeededStepOutput(
  admin: SupabaseClient,
  contentItemId: string,
  personaId: string,
  step: MediaJobStep,
): Promise<{ url: string; row: MediaJobDbRow } | null> {
  const row = await findStepJob(admin, { contentItemId, personaId, step });
  if (!row || row.state !== "succeeded") return null;
  if (row.output_url) return { url: row.output_url, row };
  if (row.result_asset_id) {
    const { data } = await admin.from("media_assets").select("public_url").eq("id", row.result_asset_id).maybeSingle<{ public_url: string }>();
    if (data?.public_url) return { url: data.public_url, row };
  }
  return null;
}

async function dispatchPersonaImage(admin: SupabaseClient, ctx: JobContext, persona: PersonaRow, existing: MediaJobDbRow | null): Promise<void> {
  const { apiKey } = await resolveProviderCredential(ctx.brandId, "kie");
  if (!apiKey) throw new PermanentJobError("missing_key: kie anahtarı yapılandırılmamış");

  const rowId = existing?.id ?? (await insertQueuedJob(admin, {
    brandId: ctx.brandId, userId: ctx.userId, contentItemId: null, personaId: persona.id,
    step: "persona_image", vendor: "kie", vendorModel: PERSONA_IMAGE_MODEL,
    creditsEstimated: PERSONA_IMAGE_CREDITS, input: { prompt: persona.prompt },
  })).id;

  let taskId: string;
  try {
    taskId = await createPersonaImage(persona.prompt, apiKey);
  } catch (err) {
    await markStepFailed(admin, rowId, (err as Error).message);
    throw new TransientJobError(`kie persona_image dispatch: ${(err as Error).message}`);
  }

  await markDispatched(admin, rowId, taskId);
  await enqueueInternal(admin, ctx.brandId, ctx.userId, "media_poll", { mediaJobId: rowId }, { dedupeKey: `media_poll:${rowId}` });
}

async function dispatchPersonaVideo(
  admin: SupabaseClient, ctx: JobContext, persona: PersonaRow, contentItemId: string, existing: MediaJobDbRow | null,
): Promise<void> {
  if (!persona.image_asset_id) throw new PermanentJobError("persona henüz görsel üretmedi — persona_video atlanamaz");
  const { data: asset } = await admin.from("media_assets").select("public_url").eq("id", persona.image_asset_id).maybeSingle<{ public_url: string }>();
  if (!asset?.public_url) throw new PermanentJobError("persona görselinin depolama kaydı bulunamadı");

  const { apiKey } = await resolveProviderCredential(ctx.brandId, "kie");
  if (!apiKey) throw new PermanentJobError("missing_key: kie anahtarı yapılandırılmamış");

  const estimate = estimatePersonaVideoCredits(PERSONA_VIDEO_DURATION_DEFAULT, PERSONA_VIDEO_MODE_DEFAULT);
  const rowId = existing?.id ?? (await insertQueuedJob(admin, {
    brandId: ctx.brandId, userId: ctx.userId, contentItemId, personaId: persona.id,
    step: "persona_video", vendor: "kie", vendorModel: PERSONA_VIDEO_MODEL,
    creditsEstimated: estimate.credits, input: { imageUrl: asset.public_url, prompt: PERSONA_VIDEO_MOTION_PROMPT_EN },
  })).id;

  let taskId: string;
  try {
    taskId = await createPersonaVideo(asset.public_url, PERSONA_VIDEO_MOTION_PROMPT_EN, apiKey, {
      duration: PERSONA_VIDEO_DURATION_DEFAULT, mode: PERSONA_VIDEO_MODE_DEFAULT,
    });
  } catch (err) {
    await markStepFailed(admin, rowId, (err as Error).message);
    throw new TransientJobError(`kie persona_video dispatch: ${(err as Error).message}`);
  }

  await markDispatched(admin, rowId, taskId);
  await enqueueInternal(admin, ctx.brandId, ctx.userId, "media_poll", { mediaJobId: rowId }, { dedupeKey: `media_poll:${rowId}` });
}

/**
 * ⭐ Script ve voiceId payload'DAN GELMEZ — `content_items` (hook/body) ve
 * `personas.default_voice_id`'DEN, dispatch ANINDA türetilir. Bilinçli:
 * kullanıcı UGC iste dedikten sonra caption'ı DÜZENLERSE (adım 9'un
 * `caption_write`'ı hâlâ çalışabilir), boru hattı enqueue anındaki BAYAT
 * metni değil GÜNCEL metni seslendirmeli — bir "script snapshot" alanı bu
 * tazeliği kaybederdi.
 */
async function loadVoiceInputs(admin: SupabaseClient, contentItemId: string, personaId: string): Promise<{ script: string; voiceId: string }> {
  const { data: item, error: itemError } = await admin
    .from("content_items").select("hook,body").eq("id", contentItemId).maybeSingle<{ hook: string; body: string }>();
  if (itemError) throw new TransientJobError(`content_items okunamadı: ${itemError.message}`);
  if (!item) throw new PermanentJobError(`content_item bulunamadı: ${contentItemId}`);

  const script = [item.hook, item.body].map((s) => s.trim()).filter(Boolean).join(" ");
  if (!script) throw new PermanentJobError("voice: içerikte seslendirilecek metin yok (hook/body boş)");

  // ⭐ fal.ts'in deneyle bulunmuş yorumu (satır 44-58) — cut_off modu videoyu
  // SABİT tutar, uzayan sesin SONUNU keser. Bu yüzden ses, klibin süresini
  // AŞMAMALI. sahne'nin /api/persona/voice'unun aynı CHARS_PER_SECOND=13
  // koruması (deneyle ölçülmüş) — burada da uygulanmazsa cut_off cümlenin
  // ortasında kesilmiş bir video üretir.
  const clipSeconds = Number(PERSONA_VIDEO_DURATION_DEFAULT);
  const maxChars = Math.floor(clipSeconds * CHARS_PER_SECOND);
  if (script.length > maxChars) {
    throw new PermanentJobError(
      `voice: metin ~${Math.ceil(script.length / CHARS_PER_SECOND)}sn okunuyor ama klip ${clipSeconds}sn — ` +
      `${maxChars} karakteri aşmasın (fal cut_off modu sonu keser)`,
    );
  }

  const { data: persona, error: personaError } = await admin
    .from("personas").select("default_voice_id").eq("id", personaId).maybeSingle<{ default_voice_id: string | null }>();
  if (personaError) throw new TransientJobError(`personas okunamadı: ${personaError.message}`);
  if (!persona?.default_voice_id) throw new PermanentJobError("voice: personanın varsayılan sesi yok — /studio/personas'tan atanmalı");

  return { script, voiceId: persona.default_voice_id };
}

async function dispatchVoice(
  admin: SupabaseClient, ctx: JobContext, contentItemId: string, personaId: string, existing: MediaJobDbRow | null,
): Promise<void> {
  const { script, voiceId } = await loadVoiceInputs(admin, contentItemId, personaId);
  const { apiKey } = await resolveProviderCredential(ctx.brandId, "elevenlabs");
  if (!apiKey) throw new PermanentJobError("missing_key: elevenlabs anahtarı yapılandırılmamış");

  const rowId = existing?.id ?? (await insertQueuedJob(admin, {
    brandId: ctx.brandId, userId: ctx.userId, contentItemId, personaId,
    step: "voice", vendor: "elevenlabs", vendorModel: VOICE_MODEL,
    creditsEstimated: 0, input: { voiceId, chars: script.length },
  })).id;
  await admin.from("media_jobs").update({ state: "running", started_at: new Date().toISOString() }).eq("id", rowId);

  let bytes: ArrayBuffer;
  try {
    bytes = await synthesizeSpeech(script, voiceId, apiKey);
  } catch (err) {
    await markStepFailed(admin, rowId, (err as Error).message);
    throw new TransientJobError(`elevenlabs voice dispatch: ${(err as Error).message}`);
  }

  // ⭐ ElevenLabs bir URL değil, ham bayt döner — `persistBytesAsset` bu
  // adımın çıktısını AYNI ANDA hem kalıcılaştırır hem `media_jobs` satırını
  // `succeeded`e taşır — adım zaten senkron, ayrı bir poll aşaması yok.
  const result = await persistBytesAsset(admin, {
    brandId: ctx.brandId, userId: ctx.userId, bytes, kind: "audio", mimeType: "audio/mpeg",
    vendor: "elevenlabs", mediaJobId: rowId,
  });
  if (!result.ok) throw new TransientJobError(`ses kalıcılaştırılamadı: ${result.error.detail}`);

  await chainToNextStep(admin, { brandId: ctx.brandId, userId: ctx.userId, contentItemId, personaId, completedStep: "voice" });
}

async function dispatchLipsync(
  admin: SupabaseClient, ctx: JobContext, contentItemId: string, personaId: string, existing: MediaJobDbRow | null,
): Promise<void> {
  const video = await succeededStepOutput(admin, contentItemId, personaId, "persona_video");
  const audio = await succeededStepOutput(admin, contentItemId, personaId, "voice");
  if (!video) throw new PermanentJobError("lipsync: persona_video çıktısı yok");
  if (!audio) throw new PermanentJobError("lipsync: voice çıktısı yok");

  const { apiKey } = await resolveProviderCredential(ctx.brandId, "fal");
  if (!apiKey) throw new PermanentJobError("missing_key: fal anahtarı yapılandırılmamış");

  const rowId = existing?.id ?? (await insertQueuedJob(admin, {
    brandId: ctx.brandId, userId: ctx.userId, contentItemId, personaId,
    step: "lipsync", vendor: "fal", vendorModel: FAL_LIPSYNC_MODEL,
    creditsEstimated: 0, input: { videoUrl: video.url, audioUrl: audio.url },
  })).id;

  let taskId: string;
  try {
    taskId = await createFalLipsync(video.url, audio.url, apiKey);
  } catch (err) {
    await markStepFailed(admin, rowId, (err as Error).message);
    throw new TransientJobError(`fal lipsync dispatch: ${(err as Error).message}`);
  }

  await markDispatched(admin, rowId, taskId);
  await enqueueInternal(admin, ctx.brandId, ctx.userId, "media_poll", { mediaJobId: rowId }, { dedupeKey: `media_poll:${rowId}` });
}

export async function runUgcPipelineStep(payload: UgcPipelinePayload, ctx: JobContext): Promise<void> {
  const admin = createAdminClient();
  const contentItemId = payload.contentItemId ?? null;

  if (payload.step !== "persona_image" && !contentItemId) {
    throw new PermanentJobError(`${payload.step} adımı contentItemId gerektirir`);
  }

  const persona = await loadPersona(admin, payload.personaId);
  if (persona.brand_id !== ctx.brandId) throw new PermanentJobError("persona başka markaya ait");

  const existing = await findStepJob(admin, { contentItemId, personaId: payload.personaId, step: payload.step });

  // ⭐ İptal — §12 adım 20 FAZ B. Kullanıcı bu adım kuyruğa alınmışken/
  // çalışırken iptal ettiyse (`media_jobs.state = 'cancelled'`), BİR SONRAKİ
  // pahalı çağrı YAPILMAZ — sessizce döner, zincir burada durur.
  if (existing?.state === "cancelled") return;

  // ⭐ ADIM İŞARETLEME KANITI — bu adım DAHA ÖNCE tamamlanmışsa (reaper
  // requeue, ya da bir üstteki `jobs` satırının kör bir yeniden denemesi),
  // vendor İKİNCİ KEZ ÇAĞRILMAZ; doğrudan bir sonraki adıma zincirlenir.
  if (existing?.state === "succeeded") {
    await chainToNextStep(admin, { brandId: ctx.brandId, userId: ctx.userId, contentItemId, personaId: payload.personaId, completedStep: payload.step });
    return;
  }
  // Dispatch zaten yapılmış (vendor_task_id var) ama iş hâlâ running —
  // muhtemelen `media_poll` enqueue'u başarısız oldu. Vendor'ı TEKRAR
  // ÇAĞIRMADAN pollu yeniden garanti eder.
  if (existing?.state === "running" && existing.vendor_task_id) {
    await enqueueInternal(admin, ctx.brandId, ctx.userId, "media_poll", { mediaJobId: existing.id }, { dedupeKey: `media_poll:${existing.id}` });
    return;
  }

  await assertNotPaused(admin);

  switch (payload.step) {
    case "persona_image":
      return dispatchPersonaImage(admin, ctx, persona, existing);
    case "persona_video":
      return dispatchPersonaVideo(admin, ctx, persona, contentItemId as string, existing);
    case "voice":
      return dispatchVoice(admin, ctx, contentItemId as string, payload.personaId, existing);
    case "lipsync":
      return dispatchLipsync(admin, ctx, contentItemId as string, payload.personaId, existing);
    default:
      throw new PermanentJobError(`ugc_pipeline bilinmeyen adım: ${payload.step}`);
  }
}
