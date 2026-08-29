import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * BIRLESIM_PLANI §12 adım 13 FAZ C — `/settings` entegrasyon bölümünün okuma
 * yolu. `getJobsSummary()` (`lib/server/jobs/status.ts`) ile aynı desen:
 * kullanıcının KENDİ oturumuyla (`createClient()`), `list_provider_credentials`
 * RPC'si üzerinden — RAW gizli değer bu yoldan asla GEÇMİYOR (fonksiyon
 * onu zaten döndürmüyor, `00_schema.sql`).
 */

export interface CredentialStatus {
  provider: string;
  maskedHint: string;
  label: string;
  isActive: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface ListProviderCredentialsRow {
  provider: string;
  masked_hint: string;
  label: string;
  config: Record<string, unknown>;
  is_active: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

/** Marka için kayıtlı entegrasyonların DURUMU — anahtarın kendisi değil. */
export async function listCredentialStatuses(brandId: string): Promise<CredentialStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_provider_credentials", { p_brand_id: brandId });
  if (error) throw new Error(`entegrasyon durumları okunamadı: ${error.message}`);

  return ((data ?? []) as ListProviderCredentialsRow[]).map((row) => ({
    provider: row.provider,
    maskedHint: row.masked_hint,
    label: row.label,
    isActive: row.is_active,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  }));
}
