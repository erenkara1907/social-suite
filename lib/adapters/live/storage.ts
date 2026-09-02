/**
 * StoragePort — CANLI implementasyon. §12 adım 19 FAZ C.
 *
 * `persistFromUrl` artık `lib/server/storage.ts`'in `persistVendorAsset()`'ine
 * sarmalanıyor — asıl SSRF-korumalı indirme/yükleme mantığı orada (§4g,
 * FAZ A'nın `fetch-guard.ts`'i üzerinden). Bu dosyanın tek işi ETKİLEŞİMLİ
 * çağıranlar için bağlamı (marka/kullanıcı, oturum istemcisi) çözmek.
 *
 * ⭐ Service-role DEĞİL, oturum istemcisi (`lib/server/auth.ts`'in
 * `requireBrand()`'i) — bu port bir kullanıcı isteğinden çağrılır
 * (`/studio` gibi), kuyruk işleyicisi DEĞİL. `lib/server/README.md`'nin
 * "üç yer" kuralı service-role'ü cron/OAuth/credential okumaya ayırıyor;
 * burası hiçbiri değil, RLS'ten (owns_brand + Storage foldername politikası)
 * geçerek yazar.
 *
 * `persistBytes` — HENÜZ YAZILMADI: doğrudan bayt yükleme (`/library`'nin
 * elle yükleme akışı) 11b'ye ERTELENMİŞ bir ekran, bu adımın kapsamı
 * vendor URL köprüsü (§4g). `list` marka bazlı gerçek bir sorgu.
 */
import type { StoragePort } from "@/lib/adapters/ports";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { persistVendorAsset } from "@/lib/server/storage";
import type { MediaAssetRow } from "@/lib/core/types";

const NOT_IMPLEMENTED = "not implemented";

interface MediaAssetDbRow {
  id: string;
  brand_id: string;
  kind: MediaAssetRow["kind"];
  storage_path: string;
  public_url: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source_vendor: MediaAssetRow["source_vendor"];
  created_at: string;
}

export const liveStorage: StoragePort = {
  async persistFromUrl(input) {
    const { user, brand } = await requireBrand();
    const supabase = await createClient();
    return persistVendorAsset(supabase, {
      brandId: brand.id,
      userId: user.id,
      sourceUrl: input.sourceUrl,
      kind: input.kind,
      vendor: input.vendor,
    });
  },
  async persistBytes() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async list(kind) {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    let query = supabase
      .from("media_assets")
      .select("id,brand_id,kind,storage_path,public_url,mime_type,bytes,width,height,duration_ms,source_vendor,created_at")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false });
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query.returns<MediaAssetDbRow[]>();
    if (error) throw new Error(`media_assets listelenemedi: ${error.message}`);
    return data ?? [];
  },
};
