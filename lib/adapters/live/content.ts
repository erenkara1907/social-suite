/**
 * ContentPort — CANLI implementasyon. §12 adım 8, 12, 17a FAZ D.
 *
 * ⚠ KISMİ — `create`/`listChain` hâlâ `NOT_IMPLEMENTED`: hiçbir canlı
 * çağıran yok — `plan_generate`/`caption_write` işleyicileri
 * `content_items`'ı service-role admin client'la DOĞRUDAN yazıyor
 * (`lib/server/jobs/handlers.ts`), bu portun ÜZERİNDEN GEÇMİYOR (aynı "üç
 * yer" ayrımı: kuyruk işleyicisi service-role, etkileşimli sayfa oturum
 * istemcisi). İkisi gerçek bir çağıran belirince dolacak.
 *
 * `update`/`archive` FAZ D'de dolduruldu — `/queue`'nun onay/yeniden
 * zamanlama/iptal düğmeleri artık gerçek çağıran (`app/(app)/queue/
 * actions.ts`).
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentPort } from "@/lib/adapters/ports";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ContentItemRow } from "@/lib/core/types";

const NOT_IMPLEMENTED = "not implemented";

const CONTENT_COLUMNS =
  "id,brand_id,plan_id,channel_id,platform,kind,media_type,day_offset,time_of_day,scheduled_at," +
  "published_at,is_best_time,title,hook,body,hashtags,media_url,status,external_post_id," +
  "parent_id,root_id,chain_position,continuation_note,content_fingerprint,topic_key";

const DEFAULT_ACTIVITY_LIMIT = 12;

interface ActivityDbRow {
  id: string;
  actor: string;
  action: string;
  target: string;
  created_at: string;
}

async function scopedClient(): Promise<{ supabase: SupabaseClient; brandId: string }> {
  const { brand } = await requireBrand();
  const supabase = await createClient();
  return { supabase, brandId: brand.id };
}

export const liveContent: ContentPort = {
  async list(query) {
    const { supabase, brandId } = await scopedClient();
    let q = supabase.from("content_items").select(CONTENT_COLUMNS).eq("brand_id", brandId);

    if (query?.status) q = q.in("status", query.status as string[]);
    else q = q.neq("status", "archived");
    if (query?.platform) q = q.in("platform", query.platform as string[]);
    if (query?.from) q = q.gte("scheduled_at", query.from);
    if (query?.to) q = q.lte("scheduled_at", query.to);
    q = q.order("created_at", { ascending: false });
    if (query?.limit) q = q.limit(query.limit);

    const { data, error } = await q.returns<ContentItemRow[]>();
    if (error) throw new Error(`content_items listelenemedi: ${error.message}`);
    return data ?? [];
  },

  async get(id) {
    const { supabase, brandId } = await scopedClient();
    const { data, error } = await supabase
      .from("content_items").select(CONTENT_COLUMNS).eq("id", id).eq("brand_id", brandId)
      .maybeSingle<ContentItemRow>();
    if (error) throw new Error(`content_items okunamadı: ${error.message}`);
    return data;
  },

  async listChain() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async create() {
    throw new Error(NOT_IMPLEMENTED);
  },
  // ⭐ 17a FAZ D — /queue'nun onay/yeniden zamanlama/iptal düğmeleri artık
  // gerçek çağıran. RLS'ten geçen normal oturum istemcisiyle (`owns_brand()`),
  // service-role DEĞİL — bu etkileşimli bir kullanıcı eylemi (§5 "üç yer"
  // kuralı bunu kapsamıyor, tıpkı list/get gibi).
  async update(id, patch) {
    const { supabase, brandId } = await scopedClient();
    const { data, error } = await supabase
      .from("content_items")
      .update(patch)
      .eq("id", id)
      .eq("brand_id", brandId)
      .select(CONTENT_COLUMNS)
      .maybeSingle<ContentItemRow>();
    if (error) return { ok: false, error: { code: "upstream_error", detail: error.message } };
    if (!data) return { ok: false, error: { code: "not_found" } };
    return { ok: true, data };
  },
  // §4a — silme YOK, yalnızca 'archived'. Tekrar önleme motoru (§4c) arşivli
  // satırları da fingerprint/embedding kontrolünde okuyor — bu yüzden UPDATE,
  // DELETE değil.
  async archive(id) {
    const { supabase, brandId } = await scopedClient();
    const { data, error } = await supabase
      .from("content_items")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("brand_id", brandId)
      .select(CONTENT_COLUMNS)
      .maybeSingle<ContentItemRow>();
    if (error) return { ok: false, error: { code: "upstream_error", detail: error.message } };
    if (!data) return { ok: false, error: { code: "not_found" } };
    return { ok: true, data };
  },

  async listActivity(limit = DEFAULT_ACTIVITY_LIMIT) {
    const { supabase, brandId } = await scopedClient();
    const { data, error } = await supabase
      .from("activity").select("id,actor,action,target,created_at").eq("brand_id", brandId)
      .order("created_at", { ascending: false }).limit(limit)
      .returns<ActivityDbRow[]>();
    if (error) throw new Error(`activity listelenemedi: ${error.message}`);
    return (data ?? []) as ActivityRow[];
  },

  async markUgcRequested(contentItemIds) {
    if (contentItemIds.length === 0) return { ok: true, data: 0 };
    const { supabase, brandId } = await scopedClient();
    const { user } = await requireBrand();
    const rows = contentItemIds.map((id) => ({
      brand_id: brandId, user_id: user.id, actor: "plan", action: "ugc_requested" as const,
      target: "UGC video isteği", content_item_id: id,
    }));
    const { error } = await supabase.from("activity").insert(rows);
    if (error) return { ok: false, error: { code: "upstream_error", detail: error.message } };
    return { ok: true, data: rows.length };
  },

  async listUgcRequested() {
    const { supabase, brandId } = await scopedClient();
    const { data, error } = await supabase
      .from("activity").select("content_item_id").eq("brand_id", brandId).eq("action", "ugc_requested")
      .not("content_item_id", "is", null)
      .returns<{ content_item_id: string }[]>();
    if (error) throw new Error(`activity (ugc_requested) okunamadı: ${error.message}`);
    return [...new Set((data ?? []).map((r) => r.content_item_id))];
  },
};
