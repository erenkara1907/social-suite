import { verifyCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueInternal } from "@/lib/server/jobs/enqueue-internal";
import { daysLeft, REFRESH_WHEN_DAYS_LEFT, tokenFreshness } from "@/lib/core/providers/instagram/tokens";

/**
 * `/api/cron/tokens` — BIRLESIM_PLANI §12 adım 16 FAZ B3.
 *
 * `sm-token-refresh` cron girdisi `00_schema.sql`'de zaten kurulu (günde bir,
 * `30 3 * * *`) ve bu tam yolu hedefliyordu; `docs/ADIM_21_RAPOR.md` madde
 * 14'ün "job kurulu ama pasif, çünkü hedef rota yok" notu buradaydı.
 *
 * ⭐ `sm-publish`/`sm-metrics` ile AYNI iki katmanlı desen: bu rota yalnızca
 * TARAR ve kuyruğa koyar (`token_refresh` işi), asıl yenileme
 * `lib/server/jobs/handlers.ts`'in `token_refresh` işleyicisinde —
 * `usableInstagramToken`'ı çağırıyor, o da yayından-önce kontrolüyle AYNI
 * fonksiyon (DRY).
 *
 * ⚠ `channels`/`channel_credentials` join'i BİLEREK iki ayrı sorgu — bu
 * kod tabanında (`app/api/cron/metrics/route.ts` dahil) embedded-resource
 * (`!inner`) select deseni hiç kullanılmamış; PostgREST'in bu projedeki
 * davranışını yeni bir sözdizimiyle canlıda ilk kez sınamak yerine, zaten
 * kanıtlı iki-sorgu desenini tekrarlamak tercih edildi.
 *
 * Job'ın kendisi `apply.sh`'ın cron koruması dışında (adım 21) — rota
 * yazıldıktan SONRA elle tetiklenip doğrulanmalı, aktivasyon
 * `docs/CRON_AKTIVASYON.md`'nin kademeli deseniyle.
 */

interface ConnectedInstagramChannelRow {
  id: string;
  brand_id: string;
  user_id: string;
}

interface CredentialExpiryRow {
  channel_id: string;
  token_expires_at: string | null;
}

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const admin = createAdminClient();

  const { data: channels, error: channelsError } = await admin
    .from("channels")
    .select("id,brand_id,user_id")
    .eq("platform", "instagram")
    .eq("is_connected", true)
    .returns<ConnectedInstagramChannelRow[]>();
  if (channelsError) {
    return Response.json({ error: `channels taraması başarısız: ${channelsError.message}` }, { status: 500 });
  }
  const connected = channels ?? [];
  if (connected.length === 0) return Response.json({ scanned: 0, enqueued: 0 });

  const { data: credentials, error: credentialsError } = await admin
    .from("channel_credentials")
    .select("channel_id,token_expires_at")
    .in("channel_id", connected.map((c) => c.id))
    .returns<CredentialExpiryRow[]>();
  if (credentialsError) {
    return Response.json({ error: `channel_credentials taraması başarısız: ${credentialsError.message}` }, { status: 500 });
  }
  const expiryByChannel = new Map((credentials ?? []).map((c) => [c.channel_id, c.token_expires_at]));

  // Aynı gün içinde tetiklenen ikinci bir tarama aynı kanal için ikinci bir
  // iş AÇMASIN — dedupe_key günlük, `enqueueInternal`'ın idempotency deseni.
  const today = new Date().toISOString().slice(0, 10);

  let enqueued = 0;
  for (const channel of connected) {
    const expiresAt = expiryByChannel.get(channel.id) ?? null;
    const freshness = tokenFreshness(daysLeft(expiresAt), REFRESH_WHEN_DAYS_LEFT);
    if (freshness === "fresh") continue; // henüz erken — bu tarama turunda atla.

    await enqueueInternal(admin, channel.brand_id, channel.user_id, "token_refresh", { channelId: channel.id }, {
      dedupeKey: `token_refresh:${channel.id}:${today}`,
    });
    enqueued += 1;
  }

  return Response.json({ scanned: connected.length, enqueued });
}
