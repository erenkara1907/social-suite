import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Service-role istemcisi — RLS'i BAYPAS EDER.
 *
 * `import "server-only"` bu dosyanın bir Client Component'ten import
 * edilmesini DERLEME ZAMANINDA hata yapar. siraya'nın `typeof window`
 * kontrolü yalnızca çalışma zamanında patlıyordu; o noktada anahtar zaten
 * bundle'a girmiş oluyordu. Kapı derleyicide olmalı.
 *
 * BIRLESIM_PLANI §5 — yalnızca üç yerde kullanılır:
 *   1. cron job rotaları        (§12 adım 12/17/18)
 *   2. kanal bağlama akışı      (OAuth callback'i, §12 adım 16 VEYA
 *                                 doğrudan kimlik bilgisi girişi, §12 adım
 *                                 17a FAZ A — ikisi de channel_credentials
 *                                 yazar/siler, bkz. `lib/adapters/live/
 *                                 channel.ts`)
 *   3. provider_credentials okuması (§12 adım 13 — Vault)
 *
 * Bu üçü dışında bir çağrı görürsen o bir hatadır: KESIF_THREADLY §11,
 * "tek bir kaçak varsa her şey açılır".
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !serviceKey) {
    throw new Error(
      "Service-role istemcisi kurulamadı: NEXT_PUBLIC_SUPABASE_URL ve " +
        "SUPABASE_SERVICE_ROLE_KEY .env.local'da dolu olmalı.",
    );
  }

  return createSupabaseClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
