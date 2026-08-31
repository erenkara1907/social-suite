import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnedBrand } from "@/lib/server/auth";
import type { Lang } from "@/lib/core/types";

/**
 * İş işleyicileri için marka okuma — BIRLESIM_PLANI §12 adım 14 FAZ C.
 *
 * ⭐ `lib/server/auth.ts`'in `requireBrand()`'i KULLANILAMAZ: o kullanıcı
 * OTURUMUYLA sorgular (`owns_brand()` RLS'i `auth.uid()` ister), worker'ın
 * hiç oturumu yok — yalnızca `jobs.brand_id` (kuyruğa eklenirken zaten
 * `owns_brand()` ile bir kez doğrulandı, `enqueue_job()`'da). Bu yüzden
 * admin/service-role client ile, `brands.id` üzerinden doğrudan okunur —
 * `lib/server/README.md`'nin "üç yer" kuralının aynısı (worker zaten
 * service-role, `lib/server/jobs/worker.ts`).
 */

interface BrandRow {
  id: string;
  name: string;
  industry: string;
  description: string;
  products: string;
  audience: string;
  voice: string;
  keywords: string;
  links: string;
  timezone: string;
  content_language: Lang;
  is_active: boolean;
}

const BRAND_COLUMNS =
  "id,name,industry,description,products,audience,voice,keywords,links,timezone,content_language,is_active";

function toOwnedBrand(row: BrandRow): OwnedBrand {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    products: row.products,
    audience: row.audience,
    voice: row.voice,
    keywords: row.keywords,
    links: row.links,
    timezone: row.timezone,
    contentLanguage: row.content_language,
    isActive: row.is_active,
  };
}

/** `brandId` artık geçersizse (silinmiş marka) `null` döner — çağıran taraf
 *  bunu `PermanentJobError` olarak ele almalı (yeniden denemenin anlamı yok). */
export async function getBrandForJob(admin: SupabaseClient, brandId: string): Promise<OwnedBrand | null> {
  const { data, error } = await admin.from("brands").select(BRAND_COLUMNS).eq("id", brandId).maybeSingle<BrandRow>();
  if (error) throw new Error(`brands okunamadı (job context): ${error.message}`);
  return data ? toOwnedBrand(data) : null;
}
