/**
 * Medya varlıkları ve üretim işleri — `/studio` ilerleme çubuğu, `/library`.
 *
 * ← threadly `lib/demo/data.ts:135` `assets` + sahne `lib/demo/data.ts:133`
 *   `renderQueue` / `:104` `ugcVideos`.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK.
 *
 * ⚠ S5 — sahne'nin 33 stok mp4'ünün HİÇBİRİ kopyalanmadı. `public_url`
 * değerleri yerel placeholder yolları; `/studio` demo modda statik 9:16 poster
 * + "demo çıktı" rozeti gösterecek. Stok pazarlama videosu UGC stüdyosunun ne
 * ürettiğini yanlış anlatırdı.
 *
 * ⚠ `reelV60` bu yüzden `kind: "video"` DEĞİL — dosya bir `.jpg` poster
 * (`public/demo/ugc/v60-demleme.jpg`), gerçek bir video değil. `duration_ms`
 * `null`: poster'ın süresi yok. Video oynatıcı bileşeni bu posteri gösterir.
 *
 * ⭐ İKİ TABLO, İKİ SORUMLULUK (§4d):
 *   `media_assets` = kalıcı dosya (Storage'da duruyor, `public_url` yayınlanabilir)
 *   `media_jobs`   = üretim denemesi (vendor'ın GEÇİCİ URL'i, kredi, hata)
 * Bir iş başarısız olduğunda varlık YOKTUR; varlık silindiğinde işin kaydı kalır.
 *
 * ⭐ `media_jobs.state` ile `content_items.status` ORTOGONAL (§4a). Aşağıdaki
 * `running` işin içeriği (`...013`) `needs_review` durumda — insan metni
 * onaylarken video hâlâ render oluyor. Tek bir durum alanı bunu anlatamaz.
 */
import type { MediaAssetRow, MediaJobRow } from "@/lib/core/types";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { at, day } from "@/lib/adapters/demo/fixtures/clock";
import { DEMO_PERSONA_IDS, DEMO_VOICE_IDS } from "@/lib/adapters/demo/fixtures/personas";

const ASSET_IDS = {
  personaMira: "a0000000-0000-4000-8000-000000000001",
  personaKerem: "a0000000-0000-4000-8000-000000000002",
  reelV60: "a0000000-0000-4000-8000-000000000003",
  voiceAeropress: "a0000000-0000-4000-8000-000000000004",
  coldBrewImage: "a0000000-0000-4000-8000-000000000005",
} as const;

export function demoMediaAssets(now: Date): MediaAssetRow[] {
  return [
    {
      id: ASSET_IDS.personaMira,
      brand_id: DEMO_BRAND_ID,
      kind: "image",
      storage_path: `${DEMO_BRAND_ID}/personas/mira-01.png`,
      public_url: "/demo/personas/mira-01.png",
      mime_type: "image/png",
      bytes: 1_842_000,
      width: 1080,
      height: 1920,
      duration_ms: null,
      source_vendor: "kie",
      created_at: day(now, -46),
    },
    {
      id: ASSET_IDS.personaKerem,
      brand_id: DEMO_BRAND_ID,
      kind: "image",
      storage_path: `${DEMO_BRAND_ID}/personas/kerem-01.png`,
      public_url: "/demo/personas/kerem-01.png",
      mime_type: "image/png",
      bytes: 1_910_400,
      width: 1080,
      height: 1920,
      duration_ms: null,
      source_vendor: "kie",
      created_at: day(now, -39),
    },
    {
      id: ASSET_IDS.reelV60,
      brand_id: DEMO_BRAND_ID,
      kind: "image",
      storage_path: `${DEMO_BRAND_ID}/ugc/v60-demleme.jpg`,
      public_url: "/demo/ugc/v60-demleme.jpg",
      mime_type: "image/jpeg",
      bytes: 56_368,
      width: 1080,
      height: 1920,
      duration_ms: null,
      source_vendor: "fal",
      created_at: day(now, -12),
    },
    {
      id: ASSET_IDS.voiceAeropress,
      brand_id: DEMO_BRAND_ID,
      kind: "audio",
      storage_path: `${DEMO_BRAND_ID}/voice/aeropress-ada.mp3`,
      public_url: "/demo/voice/aeropress-ada.mp3",
      mime_type: "audio/mpeg",
      bytes: 214_800,
      width: null,
      height: null,
      duration_ms: 18_400,
      source_vendor: "elevenlabs",
      created_at: day(now, -1),
    },
    /* Elle yüklenen dosya — `source_vendor: "upload"`ın tek örneği. */
    {
      id: ASSET_IDS.coldBrewImage,
      brand_id: DEMO_BRAND_ID,
      kind: "image",
      storage_path: `${DEMO_BRAND_ID}/uploads/cold-brew-raf.jpg`,
      public_url: "/demo/uploads/cold-brew-raf.jpg",
      mime_type: "image/jpeg",
      bytes: 642_300,
      width: 1440,
      height: 1440,
      duration_ms: null,
      source_vendor: "upload",
      created_at: day(now, -3),
    },
  ];
}

/** Beş adımlı boru hattının ortak sabitleri. */
const JOB_BASE = {
  brand_id: DEMO_BRAND_ID,
  persona_id: null,
  vendor_task_id: null,
  output_url: null,
  result_asset_id: null,
  error: null,
  credits_charged: null,
  started_at: null,
  finished_at: null,
} satisfies Omit<
  MediaJobRow,
  "id" | "content_item_id" | "vendor" | "vendor_model" | "step" | "state" | "credits_estimated" | "created_at"
>;

export function demoMediaJobs(now: Date): MediaJobRow[] {
  return [
    /* ── Tamamlanmış boru hattı: /studio'nun "hazır" örneği ─────────────── */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000001",
      content_item_id: "10000000-0000-4000-8000-000000000005",
      persona_id: DEMO_PERSONA_IDS.mira,
      vendor: "elevenlabs",
      vendor_model: "eleven_multilingual_v2",
      vendor_task_id: "el_9f21",
      step: "voice",
      state: "succeeded",
      result_asset_id: ASSET_IDS.voiceAeropress,
      credits_estimated: 0,
      credits_charged: 0,
      started_at: at(now, -13, "10:02"),
      finished_at: at(now, -13, "10:03"),
      created_at: at(now, -13, "10:02"),
    },
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000002",
      content_item_id: "10000000-0000-4000-8000-000000000005",
      persona_id: DEMO_PERSONA_IDS.mira,
      vendor: "fal",
      vendor_model: "fal-ai/sync-lipsync/v3",
      vendor_task_id: "fal_c33b81",
      step: "lipsync",
      state: "succeeded",
      result_asset_id: ASSET_IDS.reelV60,
      credits_estimated: 567,
      credits_charged: 567,
      started_at: at(now, -13, "10:04"),
      finished_at: at(now, -13, "10:11"),
      created_at: at(now, -13, "10:03"),
    },

    /* ── ⭐ ŞU AN ÇALIŞAN İŞ — üretim akışının canlı ucu ─────────────────
       İçeriği (`...013`) `needs_review` durumda: metin onay beklerken video
       render oluyor. §4a'nın ortogonallik kuralı tam olarak bu. */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000003",
      content_item_id: "10000000-0000-4000-8000-000000000013",
      persona_id: DEMO_PERSONA_IDS.kerem,
      vendor: "kie",
      vendor_model: "omnihuman-1-5",
      vendor_task_id: "kie_7a41c2",
      step: "lipsync",
      state: "running",
      credits_estimated: 810,
      started_at: at(now, 0, "09:47"),
      created_at: at(now, 0, "09:46"),
    },
    /* Aynı içeriğin bir önceki adımı bitmiş — ilerleme çubuğu 2/2 değil 1/2. */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000004",
      content_item_id: "10000000-0000-4000-8000-000000000013",
      persona_id: DEMO_PERSONA_IDS.kerem,
      vendor: "elevenlabs",
      vendor_model: "eleven_multilingual_v2",
      vendor_task_id: "el_a17c",
      step: "voice",
      state: "succeeded",
      credits_estimated: 0,
      credits_charged: 0,
      started_at: at(now, 0, "09:44"),
      finished_at: at(now, 0, "09:45"),
      created_at: at(now, 0, "09:44"),
    },

    /* ── Sıradaki iş ve başarısız iş — durum makinesinin kalan uçları ───── */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000005",
      content_item_id: "10000000-0000-4000-8000-000000000010",
      persona_id: DEMO_PERSONA_IDS.mira,
      vendor: "elevenlabs",
      vendor_model: "eleven_multilingual_v2",
      step: "voice",
      state: "queued",
      credits_estimated: 0,
      created_at: at(now, 0, "10:15"),
    },
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000006",
      content_item_id: "10000000-0000-4000-8000-000000000017",
      persona_id: DEMO_PERSONA_IDS.kerem,
      vendor: "kie",
      vendor_model: "kling-3.0/video",
      vendor_task_id: "kie_2b90f1",
      step: "persona_video",
      state: "failed",
      error: "upstream_error: vendor returned 502 after 3 attempts",
      credits_estimated: 405,
      started_at: at(now, -2, "14:20"),
      finished_at: at(now, -2, "14:26"),
      created_at: at(now, -2, "14:19"),
    },
    /* Persona görselinin üretildiği iş — `/studio/personas`'ın kaynağı. */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000007",
      content_item_id: null,
      persona_id: DEMO_PERSONA_IDS.kerem,
      vendor: "kie",
      vendor_model: "nano-banana-pro",
      vendor_task_id: "kie_5d0aa3",
      step: "persona_image",
      state: "succeeded",
      result_asset_id: ASSET_IDS.personaKerem,
      credits_estimated: 24,
      credits_charged: 24,
      started_at: at(now, -39, "16:02"),
      finished_at: at(now, -39, "16:03"),
      created_at: at(now, -39, "16:02"),
    },
    /* İptal edilmiş iş — `cancelled` durumunun tek örneği. */
    {
      ...JOB_BASE,
      id: "j0000000-0000-4000-8000-000000000008",
      content_item_id: "10000000-0000-4000-8000-000000000018",
      vendor: "fal",
      vendor_model: "fal-ai/flux/dev",
      step: "post_image",
      state: "cancelled",
      credits_estimated: 12,
      created_at: at(now, -4, "11:30"),
    },
  ];
}

export { ASSET_IDS as DEMO_ASSET_IDS, DEMO_VOICE_IDS };
