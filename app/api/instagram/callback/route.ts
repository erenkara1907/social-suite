import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInstagramConfig } from "@/lib/server/instagram/resolve-config";
import { exchangeCode, exchangeForLongLived, fetchProfile } from "@/lib/core/providers/instagram/oauth";
import { OAUTH_STATE_COOKIE } from "@/lib/core/providers/instagram/config";
import type { ChannelRow } from "@/lib/core/types";

/**
 * `/api/instagram/callback` — BIRLESIM_PLANI §12 adım 16 FAZ B1.
 *
 * Meta panelinde kayıtlı redirect_uri bu tam yolu hedefliyor (bkz. `.env`
 * `INSTAGRAM_REDIRECT_URI`). Akış: kod → kısa ömürlü token (`exchangeCode`)
 * → 60 günlük uzun ömürlü token (`exchangeForLongLived`) → profil
 * (`fetchProfile`, kanalı adlandırmak için) → `channels` + `channel_credentials`.
 *
 * ⭐ CSRF — `app/api/instagram/connect/route.ts`'in yazdığı
 * `OAUTH_STATE_COOKIE` ile URL'deki `state` BİREBİR eşleşmeli. Eşleşmezse
 * (çerez yok, süresi dolmuş, ya da bir saldırganın kendi `state`'iyle bu
 * URL'e doğrudan istek attığı durum) akış burada REDDEDİLİR — kod hiç
 * değişime sokulmaz. Çerez tek kullanımlıktır: sonuç ne olursa olsun siliniyor.
 *
 * ⚠ Token bu rotanın YANITINDA hiçbir zaman görünmez — yalnızca
 * `channel_credentials`'a (service-role, RLS açık + sıfır politika) yazılır,
 * kullanıcıya dönen tek şey bir `/channels?ig_connected=1` yönlendirmesi.
 */

const CHANNEL_COLUMNS = "id,platform,handle,followers,growth,engagement,is_connected,last_synced_at";

function channelsRedirect(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/channels", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<Response> {
  const store = await cookies();
  const savedState = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  // Tek kullanımlık — sonuç ne olursa olsun temizlenir (ikinci bir callback
  // isteği aynı çerezi tekrar KULLANAMAZ).
  store.delete(OAUTH_STATE_COOKIE);

  // Kullanıcı Meta'nın onay ekranında "İptal"e basarsa buraya `error`/
  // `error_description` ile döner — kod hiç YOKTUR, exchange'e hiç girilmez.
  const metaError = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error");
  if (metaError) {
    return channelsRedirect(request, { ig_error: metaError });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state || !savedState || state !== savedState) {
    return channelsRedirect(request, { ig_error: "geçersiz veya süresi dolmuş bağlanma isteği" });
  }

  const { user, brand } = await requireBrand();

  const resolved = await resolveInstagramConfig(brand.id);
  if (!resolved.ok) return channelsRedirect(request, { ig_error: resolved.error });
  const config = resolved.config;

  const exchanged = await exchangeCode(config, code);
  if (!exchanged.ok) return channelsRedirect(request, { ig_error: exchanged.error });

  const longLived = await exchangeForLongLived(config, exchanged.shortToken);
  if (!longLived.ok) return channelsRedirect(request, { ig_error: longLived.error });

  const profile = await fetchProfile(config, longLived.token.accessToken);
  if (!profile.ok) return channelsRedirect(request, { ig_error: profile.error });

  // ⚠ Kullanıcı OTURUMUYLA — `channels`'ın RLS'i (`owns_brand`) burada da
  // geçerli olmalı; `connectWithCredentials`'ın (Bluesky) aynı deseni.
  const supabase = await createClient();
  const { data: channelRow, error: channelError } = await supabase
    .from("channels")
    .upsert(
      {
        brand_id: brand.id,
        user_id: user.id,
        platform: "instagram",
        handle: `@${profile.profile.username}`,
        external_account_id: profile.profile.user_id,
        username: profile.profile.username,
        is_connected: true,
      },
      { onConflict: "brand_id,platform,handle" },
    )
    .select(CHANNEL_COLUMNS)
    .single<ChannelRow>();

  if (channelError || !channelRow) {
    return channelsRedirect(request, { ig_error: channelError?.message ?? "kanal satırı yazılamadı" });
  }

  // ⚠ Yalnızca service-role — channel_credentials RLS açık + sıfır politika.
  const admin = createAdminClient();
  const { error: credentialError } = await admin.from("channel_credentials").upsert({
    channel_id: channelRow.id,
    user_id: user.id,
    provider: "instagram",
    external_account_id: profile.profile.user_id,
    access_token: longLived.token.accessToken,
    token_expires_at: longLived.token.expiresAt.toISOString(),
    last_refreshed_at: new Date().toISOString(),
  });

  if (credentialError) {
    // Token yazılamadıysa kanal "bağlı" görünmemeli — geri al (Bluesky'nin
    // aynı rollback deseni, `lib/adapters/live/channel.ts`).
    await supabase.from("channels").update({ is_connected: false }).eq("id", channelRow.id);
    return channelsRedirect(request, { ig_error: "kimlik bilgisi kaydedilemedi" });
  }

  return channelsRedirect(request, { ig_connected: "1" });
}
