import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaJobStep, MediaJobVendor } from "@/lib/core/types";

/**
 * `media_jobs` ham satır erişimi — BIRLESIM_PLANI §12 adım 20 FAZ B1.
 *
 * ⭐ AŞAMA İŞARETLEMENİN TEMELİ. Bu dosyanın tek işi, bir (içerik, persona,
 * adım) üçlüsü için VAR OLAN satırı bulmak (`findStepJob`) — pipeline.ts ve
 * poll.ts bu satırın `state`'ine bakarak "yeniden mi başlatacağım, devam mı
 * ettireceğim, hiç mi dokunmayacağım" kararını verir. Ayrı bir "ilerleme"
 * tablosu YOK — `media_jobs`'un kendisi zaten bunu tutuyor (§4d şema notu:
 * "Her adımın çıktısı kalıcı olarak kaydedilsin" — alan zaten vardı, yeni
 * bir migration GEREKMEDİ).
 */
export const MEDIA_COLUMNS =
  "id,brand_id,user_id,content_item_id,persona_id,vendor,vendor_model,vendor_task_id,step," +
  "state,input,output_url,result_asset_id,error,credits_estimated,credits_charged,started_at,finished_at,created_at";

export interface MediaJobDbRow {
  id: string;
  brand_id: string;
  user_id: string;
  content_item_id: string | null;
  persona_id: string | null;
  vendor: MediaJobVendor;
  vendor_model: string;
  vendor_task_id: string | null;
  step: MediaJobStep;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output_url: string | null;
  result_asset_id: string | null;
  error: string | null;
  credits_estimated: number;
  credits_charged: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface FindStepJobInput {
  contentItemId: string | null;
  personaId: string;
  step: MediaJobStep;
}

/** En son (content_item_id, persona_id, step) satırı — bir pipeline
 *  çalışmasında bu üçlü PRATİKTE tek satıra karşılık gelir (§4d); "en son"
 *  yalnızca elle yeniden deneme gibi nadir bir ikinci satır ihtimaline karşı
 *  bir savunma. */
export async function findStepJob(
  supabase: SupabaseClient,
  input: FindStepJobInput,
): Promise<MediaJobDbRow | null> {
  let query = supabase
    .from("media_jobs")
    .select(MEDIA_COLUMNS)
    .eq("persona_id", input.personaId)
    .eq("step", input.step)
    .order("created_at", { ascending: false })
    .limit(1);
  query = input.contentItemId ? query.eq("content_item_id", input.contentItemId) : query.is("content_item_id", null);

  const { data, error } = await query.maybeSingle<MediaJobDbRow>();
  if (error) throw new Error(`media_jobs okunamadı: ${error.message}`);
  return data;
}

export async function getMediaJob(supabase: SupabaseClient, id: string): Promise<MediaJobDbRow | null> {
  const { data, error } = await supabase.from("media_jobs").select(MEDIA_COLUMNS).eq("id", id).maybeSingle<MediaJobDbRow>();
  if (error) throw new Error(`media_jobs okunamadı: ${error.message}`);
  return data;
}

export interface InsertQueuedJobInput {
  brandId: string;
  userId: string;
  contentItemId: string | null;
  personaId: string;
  step: MediaJobStep;
  vendor: MediaJobVendor;
  vendorModel: string;
  creditsEstimated: number;
  input?: Record<string, unknown>;
}

export async function insertQueuedJob(supabase: SupabaseClient, input: InsertQueuedJobInput): Promise<MediaJobDbRow> {
  const { data, error } = await supabase
    .from("media_jobs")
    .insert({
      brand_id: input.brandId,
      user_id: input.userId,
      content_item_id: input.contentItemId,
      persona_id: input.personaId,
      vendor: input.vendor,
      vendor_model: input.vendorModel,
      step: input.step,
      state: "queued",
      credits_estimated: input.creditsEstimated,
      input: input.input ?? {},
    })
    .select(MEDIA_COLUMNS)
    .single<MediaJobDbRow>();
  if (error || !data) throw new Error(`media_jobs yazılamadı: ${error?.message ?? "boş yanıt"}`);
  return data;
}

export async function markDispatched(
  supabase: SupabaseClient,
  id: string,
  vendorTaskId: string,
): Promise<void> {
  const { error } = await supabase
    .from("media_jobs")
    .update({ vendor_task_id: vendorTaskId, state: "running", started_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`media_jobs güncellenemedi: ${error.message}`);
}

export async function markStepFailed(supabase: SupabaseClient, id: string, message: string): Promise<void> {
  await supabase
    .from("media_jobs")
    .update({ state: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("id", id);
}
