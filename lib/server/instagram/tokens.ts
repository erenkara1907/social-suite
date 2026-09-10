import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshLongLived } from "@/lib/core/providers/instagram/oauth";
import { daysLeft, REFRESH_WHEN_DAYS_LEFT, tokenFreshness } from "@/lib/core/providers/instagram/tokens";
import type { InstagramConfig } from "@/lib/core/providers/instagram/config";

/**
 * ← siraya/lib/instagram/tokens.ts'in DB'ye bağımlı yarısı.
 *
 * `lib/core/providers/instagram/tokens.ts`'in başlığında açıklanan ayrımın
 * server tarafı: kaynağın `usableToken()`'ının gerçek karşılığı burası.
 * Kaynaktan FARKI — `throw` yerine `Result` dönüyor (§12 adım 16 FAZ A'nın
 * genelindeki kararla tutarlı) ve `admin` (service-role) parametre olarak
 * geliyor (kaynak kendi `SupabaseClient`'ını içeride kurmuyordu, aynı kaldı).
 */

export interface InstagramChannelCredential {
  channel_id: string;
  access_token: string;
  token_expires_at: string | null;
}

export type UsableInstagramTokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; error: string; expired: boolean };

/**
 * Yayından hemen önce çağrılır (kaynağın "her yayında çalışır, umutlu bir
 * zamanlamada değil" kararıyla aynı — 60 günlük token yenilenmeden geçen
 * her gün onu kalıcı ölüme biraz daha yaklaştırıyor) VE `/api/cron/tokens`
 * sweep'inin işlediği her `token_refresh` işinde.
 */
export async function usableInstagramToken(
  admin: SupabaseClient,
  config: InstagramConfig,
  credential: InstagramChannelCredential,
): Promise<UsableInstagramTokenResult> {
  const left = daysLeft(credential.token_expires_at);
  const freshness = tokenFreshness(left, REFRESH_WHEN_DAYS_LEFT);

  if (freshness === "expired") {
    return { ok: false, error: "Instagram bağlantısının süresi doldu. Kanalı yeniden bağla.", expired: true };
  }
  if (freshness === "fresh") {
    return { ok: true, accessToken: credential.access_token, refreshed: false };
  }

  const refreshed = await refreshLongLived(config, credential.access_token);
  if (!refreshed.ok) {
    return { ok: false, error: refreshed.error, expired: false };
  }

  // Yenileme upstream'de BAŞARILI oldu; saklayamamak bağırılmaya değer —
  // aksi hâlde bir sonraki çalıştırma aynı eski token'dan tekrar yenilemeye
  // çalışır (kaynağın kendi yorumuyla aynı gerekçe).
  const { error } = await admin
    .from("channel_credentials")
    .update({
      access_token: refreshed.token.accessToken,
      token_expires_at: refreshed.token.expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("channel_id", credential.channel_id);

  if (error) {
    return { ok: false, error: `Token yenilendi ama kaydedilemedi: ${error.message}`, expired: false };
  }

  return { ok: true, accessToken: refreshed.token.accessToken, refreshed: true };
}
