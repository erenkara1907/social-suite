/**
 * ← siraya/lib/instagram/tokens.ts
 *
 * UYARLAMA (§12 adım 16 FAZ A) — kaynak dosya TEK PARÇAYDI: saf gün-hesabı
 * (`daysLeft`) ile DB erişimi (`usableToken`'ın `channel_credentials`
 * UPDATE'i, `@supabase/supabase-js` importu) aynı fonksiyonun içindeydi.
 * `lib/core` saflık kuralı (§8.6: Supabase'e bağımlılık yok) bunu ikiye
 * ayırmayı zorunlu kılıyor:
 *   - BURASI (`lib/core/providers/instagram/tokens.ts`) — yalnızca saf gün
 *     hesabı ve eşik kararı. `SupabaseClient` importu YOK.
 *   - `lib/server/instagram/tokens.ts` — DB'ye bağımlı orkestrasyon
 *     (`refreshLongLived` çağrısı + `channel_credentials` UPDATE'i), kaynağın
 *     `usableToken()`'ının gerçek karşılığı.
 *
 * Kaynağın `ChannelCredential` arayüzü ve `DAY_MS` sabiti server tarafına
 * taşındı (DB satır şekli, bu dosyanın işi değil).
 */

/** Bkz. `./config.ts` `REFRESH_WHEN_DAYS_LEFT` — burada da re-export
 *  edilmiyor, çağıran ikisini birden `./config`'ten alır; bu dosya yalnızca
 *  o sayıyı KULLANAN kararı taşır. */
export { REFRESH_WHEN_DAYS_LEFT } from "./config";

const DAY_MS = 86_400_000;

/**
 * `expiresAt` (ISO) şu andan kaç gün sonra dolacak. `null`/geçmiş bir tarih
 * için 0 veya negatif döner — kaynağın `daysLeft()`'i ile birebir aynı formül.
 */
export function daysLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return (new Date(expiresAt).getTime() - Date.now()) / DAY_MS;
}

/**
 * Kaynağın `usableToken()`'ının karar mantığının saf hâli:
 *   - `left <= 0` → token ölü, yeniden bağlanma şart (server tarafı bir hata
 *     döner, burada yalnızca soruluyor).
 *   - `left > REFRESH_WHEN_DAYS_LEFT` → olduğu gibi kullanılabilir.
 *   - aksi hâlde → yenileme zamanı geldi.
 */
export type TokenFreshness = "expired" | "fresh" | "needs_refresh";

export function tokenFreshness(daysRemaining: number, refreshWhenDaysLeft: number): TokenFreshness {
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining > refreshWhenDaysLeft) return "fresh";
  return "needs_refresh";
}
