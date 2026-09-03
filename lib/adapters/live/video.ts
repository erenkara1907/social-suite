/**
 * VideoPort — CANLI implementasyon. §12 adım 20 FAZ A/B/C.
 *
 * ⭐ `start()`/`createPersona()` KASITLI olarak İKİ şey yapar: (1) oturum
 * istemcisiyle `enqueue()` — bu, TOP-LEVEL isteğin kill switch/rate limit
 * kapısından GEÇTİĞİ tek an (§4d "acil fren"), (2) `media_jobs`'ta `queued`
 * bir YER TUTUCU satır — `lib/server/media/pipeline.ts`'in `findStepJob()`'ı
 * bu satırı bulur ve YENİDEN OLUŞTURMAZ, üzerine yazar (aynı "adım
 * işaretleme" mekanizması, tarayıcı tarafı ile kuyruk tarafı AYNI satırı
 * paylaşıyor). Sıra ÖNEMLİ: önce `enqueue()`, BAŞARISIZ olursa `media_jobs`
 * satırı hiç açılmaz — reddedilen bir istek yetim bir "queued" satır bırakmaz.
 *
 * Bu dosyada `process.env` OKUNMAZ — anahtarlar `resolveProviderCredential`
 * üzerinden, yalnızca kuyruk işleyicisinde (`lib/server/media/pipeline.ts`)
 * çözülür; bu dosya vendor'ı HİÇ ÇAĞIRMAZ, yalnızca kuyruğa yazar.
 */
import type { VideoPort } from "@/lib/adapters/ports";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { enqueue } from "@/lib/server/jobs/enqueue";
import type { MediaJobRow, MediaJobStep, MediaJobVendor, PersonaRow } from "@/lib/core/types";
import {
  PERSONA_IMAGE_CREDITS, PERSONA_IMAGE_MODEL, PERSONA_VIDEO_MODEL, estimatePersonaVideoCredits,
  PERSONA_VIDEO_DURATION_DEFAULT, PERSONA_VIDEO_MODE_DEFAULT,
} from "@/lib/core/providers/kie";
import { VOICE_MODEL } from "@/lib/core/providers/elevenlabs";
import { FAL_LIPSYNC_MODEL } from "@/lib/core/providers/fal";

const MEDIA_JOB_COLUMNS =
  "id,brand_id,content_item_id,persona_id,vendor,vendor_model,vendor_task_id,step,state," +
  "output_url,result_asset_id,error,credits_estimated,credits_charged,started_at,finished_at,created_at";

interface StepMeta {
  vendor: MediaJobVendor;
  model: string;
  credits: number;
}

/** Adım → (vendor, model, tahmini kredi). `post_image` bu boru hattının
 *  parçası DEĞİL (§4d'nin dört adımı persona_image/persona_video/voice/
 *  lipsync) — `start()`'a asla verilmemesi beklenir, savunma amacıyla var. */
function stepMeta(step: MediaJobStep): StepMeta {
  switch (step) {
    case "persona_image": return { vendor: "kie", model: PERSONA_IMAGE_MODEL, credits: PERSONA_IMAGE_CREDITS };
    case "persona_video": return { vendor: "kie", model: PERSONA_VIDEO_MODEL, credits: estimatePersonaVideoCredits(PERSONA_VIDEO_DURATION_DEFAULT, PERSONA_VIDEO_MODE_DEFAULT).credits };
    case "voice": return { vendor: "elevenlabs", model: VOICE_MODEL, credits: 0 };
    case "lipsync": return { vendor: "fal", model: FAL_LIPSYNC_MODEL, credits: 0 };
    default: throw new Error(`ugc boru hattı bu adımı desteklemiyor: ${step}`);
  }
}

export const liveVideo: VideoPort = {
  async start(input) {
    const { user, brand } = await requireBrand();

    const enqueued = await enqueue(
      brand.id, "ugc_pipeline", { personaId: input.personaId, contentItemId: input.contentItemId, step: input.step },
      { dedupeKey: `ugc_pipeline:${input.contentItemId}:${input.step}` },
    );
    if (!enqueued.ok) return enqueued;

    const meta = stepMeta(input.step);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("media_jobs")
      .insert({
        brand_id: brand.id, user_id: user.id, content_item_id: input.contentItemId, persona_id: input.personaId,
        vendor: meta.vendor, vendor_model: meta.model, step: input.step, state: "queued", credits_estimated: meta.credits,
      })
      .select(MEDIA_JOB_COLUMNS)
      .single<MediaJobRow>();
    if (error || !data) return { ok: false, error: { code: "storage_error", detail: error?.message ?? "media_jobs yazılamadı" } };
    return { ok: true, data };
  },

  async getJob(jobId) {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("media_jobs").select(MEDIA_JOB_COLUMNS).eq("id", jobId).eq("brand_id", brand.id).maybeSingle<MediaJobRow>();
    if (error) throw new Error(`media_jobs okunamadı: ${error.message}`);
    return data;
  },

  async listJobs(contentItemId) {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("media_jobs").select(MEDIA_JOB_COLUMNS).eq("brand_id", brand.id).eq("content_item_id", contentItemId)
      .order("created_at", { ascending: true })
      .returns<MediaJobRow[]>();
    if (error) throw new Error(`media_jobs listelenemedi: ${error.message}`);
    return data ?? [];
  },

  async listAllJobs() {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("media_jobs").select(MEDIA_JOB_COLUMNS).eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .returns<MediaJobRow[]>();
    if (error) throw new Error(`media_jobs listelenemedi: ${error.message}`);
    return data ?? [];
  },

  async listPersonas() {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("personas").select("id,brand_id,name,prompt,image_asset_id,default_voice_id,is_archived,created_at")
      .eq("brand_id", brand.id).eq("is_archived", false)
      .order("created_at", { ascending: false })
      .returns<PersonaRow[]>();
    if (error) throw new Error(`personas listelenemedi: ${error.message}`);
    return data ?? [];
  },

  async createPersona(input) {
    const { user, brand } = await requireBrand();
    const supabase = await createClient();

    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .insert({ brand_id: brand.id, user_id: user.id, name: input.name, prompt: input.prompt, default_voice_id: input.defaultVoiceId ?? null })
      .select("id,brand_id,name,prompt,image_asset_id,default_voice_id,is_archived,created_at")
      .single<PersonaRow>();
    if (personaError || !persona) return { ok: false, error: { code: "storage_error", detail: personaError?.message ?? "personas yazılamadı" } };

    // ⭐ FAZ A — persona oluşturulunca kare üretimi OTOMATİK tetiklenir
    // (KESIF_SAHNE §9.1'in prompt'u burada canlı ilk kez kullanılıyor).
    // Kredi harcayan bir işlem — kill switch/rate limit `enqueue()` içinde.
    const enqueued = await enqueue(
      brand.id, "ugc_pipeline", { personaId: persona.id, step: "persona_image" },
      { dedupeKey: `ugc_pipeline:persona:${persona.id}:persona_image` },
    );
    if (!enqueued.ok) {
      // Persona satırı KALIR (görsel olmadan da geçerli bir kayıt — kullanıcı
      // /studio/personas'tan tekrar deneyebilir); yalnızca hatayı bildir.
      return { ok: false, error: enqueued.error };
    }

    const meta = stepMeta("persona_image");
    await supabase.from("media_jobs").insert({
      brand_id: brand.id, user_id: user.id, content_item_id: null, persona_id: persona.id,
      vendor: meta.vendor, vendor_model: meta.model, step: "persona_image", state: "queued", credits_estimated: meta.credits,
    });

    return { ok: true, data: persona };
  },
};
