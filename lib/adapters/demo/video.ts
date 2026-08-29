/**
 * VideoPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/media.ts` (işler) + `fixtures/personas.ts`.
 *
 * ⚠ S5 — stok video ALINMADI. sahne'nin 33 mp4'ü kendi tanıtım videosuydu,
 * UGC örneği değil; kopyalansaydı demo, stüdyonun ne ürettiğini YANLIŞ
 * anlatırdı. `/studio` demo modda statik 9:16 poster + "demo çıktı" rozeti
 * gösterecek.
 *
 * ⚠ `start()` gerçek bir iş kuyruğa koymuyor; `queued` durumda bir satır
 * döndürüyor. Sahte ilerleme (`queued → running → succeeded`) ekranın kendi
 * zamanlayıcısıyla oynatılacak (adım 10) — burada bir `setTimeout` çalıştırmak
 * sunucu tarafında istekler arası sızan bir durum yaratırdı.
 */
import type { VideoPort } from "@/lib/adapters/ports";
import type { MediaJobRow } from "@/lib/core/types";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { demoMediaJobs } from "@/lib/adapters/demo/fixtures/media";
import { demoPersonas } from "@/lib/adapters/demo/fixtures/personas";

/** `lib/core/providers/kie.ts:26` — playground'da elle ölçülmüş sabit. */
const DEMO_CREDITS_ESTIMATE = 810;

const DEMO_MODEL_BY_STEP: Record<MediaJobRow["step"], { vendor: MediaJobRow["vendor"]; model: string }> = {
  persona_image: { vendor: "kie", model: "nano-banana-pro" },
  persona_video: { vendor: "kie", model: "kling-3.0/video" },
  voice: { vendor: "elevenlabs", model: "eleven_multilingual_v2" },
  lipsync: { vendor: "kie", model: "omnihuman-1-5" },
  post_image: { vendor: "fal", model: "fal-ai/flux/dev" },
};

export const demoVideo: VideoPort = {
  async start(input) {
    const now = new Date().toISOString();
    const { vendor, model } = DEMO_MODEL_BY_STEP[input.step];
    return {
      ok: true,
      data: {
        id: `demo-job-${now}`,
        brand_id: DEMO_BRAND_ID,
        content_item_id: input.contentItemId,
        persona_id: input.personaId,
        vendor,
        vendor_model: model,
        vendor_task_id: null,
        step: input.step,
        state: "queued",
        output_url: null,
        result_asset_id: null,
        error: null,
        credits_estimated: DEMO_CREDITS_ESTIMATE,
        credits_charged: null,
        started_at: null,
        finished_at: null,
        created_at: now,
      },
    };
  },

  async getJob(jobId) {
    return demoMediaJobs(new Date()).find((j) => j.id === jobId) ?? null;
  },

  async listJobs(contentItemId) {
    return demoMediaJobs(new Date())
      .filter((j) => j.content_item_id === contentItemId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async listAllJobs() {
    return demoMediaJobs(new Date());
  },

  async listPersonas() {
    return demoPersonas(new Date()).filter((p) => !p.is_archived);
  },

  async createPersona(input) {
    const now = new Date().toISOString();
    return {
      ok: true,
      data: {
        id: `demo-persona-${now}`,
        brand_id: DEMO_BRAND_ID,
        name: input.name,
        prompt: input.prompt,
        image_asset_id: null,
        default_voice_id: input.defaultVoiceId ?? null,
        is_archived: false,
        created_at: now,
      },
    };
  },
};
