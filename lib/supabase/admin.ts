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
 *   1. cron job rotaları        (§12 adım 12/17/18) — `app/api/cron/*`
 *      DAHİL `health` (adım 21 FAZ A: heartbeat okuması, sır YAZMAZ/OKUMAZ)
 *   2. kanal bağlama akışı      (OAuth callback'i, §12 adım 16 VEYA
 *                                 doğrudan kimlik bilgisi girişi, §12 adım
 *                                 17a FAZ A — ikisi de channel_credentials
 *                                 yazar/siler, bkz. `lib/adapters/live/
 *                                 channel.ts`)
 *   3. provider_credentials okuması/yazması (§12 adım 13 — Vault; adım 14
 *      FAZ C'nin `run-provider-call.ts`'i de BURAYA girer — `ai_usage` yazımı
 *      ve `provider_credentials.last_verified_at/last_error` güncellemesi,
 *      hem canlı önizleme hem KUYRUK/worker çağrısından geliyor. Worker
 *      çağrısında oturum YOK — `record_provider_verification()` RPC'si
 *      `owns_brand()`'a (yani `auth.uid()`'a) dayandığı için ORADA
 *      KULLANILAMAZ; admin client + zaten `requireBrand()`/job satırından
 *      doğrulanmış `brandId` (adım 21 FAZ B denetimi, ADIM_21_RAPOR.md)
 *      buradaki tek doğru desen.)
 *
 * Bu üçü dışında bir çağrı görürsen o bir hatadır: KESIF_THREADLY §11,
 * "tek bir kaçak varsa her şey açılır".
 *
 * ⚠ `find_similar_content`/`brand_latest_metrics` RPC'leri (SECURITY DEFINER)
 * kendi İÇLERİNDE `owns_brand()` kontrolü YAPMAZ — bilinçli: worker/cron
 * bunları admin client ile, oturumsuz çağırıyor (`auth.uid()` NULL olurdu,
 * içeride bir kontrol eklemek servis-rolünü KIRARDI). Savunma çağıran
 * TARAFTA: her iki fonksiyonun de bugünkü tek çağıranları `brand_id`'yi
 * kullanıcı girdisinden değil, `requireBrand()`'dan veya zaten doğrulanmış
 * bir `jobs` satırından alıyor. Yeni bir çağıran eklenirse (adım 21 FAZ B
 * denetimi) o çağıran KENDİSİ `requireBrand()`/`owns_brand()` ile
 * doğrulamalı — fonksiyonun içi DEĞİL.
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
