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
 *
 * ⭐ Her adım loglanıyor (`console.info`/`console.error`, önek
 * `[instagram-oauth][callback]`) — `code`'un yalnızca İLK 8 KARAKTERİ, `state`
 * için de aynı; tam değerler asla loglanmaz (tek kullanımlık, hassas).
 * Loglara bakmak için: `vercel logs https://app-gold-one-92.vercel.app
 * --since 10m` (terminalden) ya da Vercel Dashboard → proje → **Logs**
 * sekmesi → arama kutusuna `instagram-oauth` yaz.
 *
 * ⚠⚠⚠ CANLI TEŞHİS SONUCU (§12 adım 16 FAZ B1) — `exchangeCode`'un Meta'ya
 * giden isteği, Vercel'in çalışma ortamından tetiklendiğinde (gerçek OAuth
 * akışından ya da doğrudan bir test çağrısından fark etmiyor) SİSTEMATİK
 * olarak "redirect_uri is not identical" hatasıyla reddediliyor; AYNI kod
 * Vercel DIŞINDAN (yerel makine/curl) çağrıldığında HER ZAMAN başarılı.
 * App ID/Secret/redirect_uri/content-type/`cache:"no-store"` — hepsi tek
 * tek elendi. Kalan en güçlü açıklama: Meta, Vercel'in paylaşımlı çıkış IP
 * havuzunu işaretlemiş/kısıtlamış. Detaylar `docs/ADIM_16_17b_RAPOR.md`'de.
 */

const CHANNEL_COLUMNS = "id,platform,handle,followers,growth,engagement,is_connected,last_synced_at";

function channelsRedirect(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/channels", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<Response> {
  const codeParam = request.nextUrl.searchParams.get("code");
  const statePrefix = request.nextUrl.searchParams.get("state")?.slice(0, 8) ?? "(yok)";
  console.info(`[instagram-oauth][callback] başladı: codePrefix="${codeParam?.slice(0, 8) ?? "(yok)"}" statePrefix="${statePrefix}"`);

  const store = await cookies();
  const savedState = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  // Tek kullanımlık — sonuç ne olursa olsun temizlenir (ikinci bir callback
  // isteği aynı çerezi tekrar KULLANAMAZ).
  store.delete(OAUTH_STATE_COOKIE);

  // Kullanıcı Meta'nın onay ekranında "İptal"e basarsa buraya `error`/
  // `error_description` ile döner — kod hiç YOKTUR, exchange'e hiç girilmez.
  const metaError = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error");
  if (metaError) {
    console.error(`[instagram-oauth][callback] Meta hata döndürdü (kullanıcı iptal etmiş olabilir): ${metaError}`);
    return channelsRedirect(request, { ig_error: metaError });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state || !savedState || state !== savedState) {
    console.error(
      `[instagram-oauth][callback] CSRF/eksik parametre reddi: hasCode=${!!code} hasState=${!!state} ` +
      `hasSavedState=${!!savedState} stateMatch=${state === savedState}`,
    );
    return channelsRedirect(request, { ig_error: "geçersiz veya süresi dolmuş bağlanma isteği" });
  }

  const { user, brand } = await requireBrand();
  console.info(`[instagram-oauth][callback] requireBrand tamam: brandId=${brand.id}`);

  const resolved = await resolveInstagramConfig(brand.id);
  if (!resolved.ok) {
    console.error(`[instagram-oauth][callback] resolveInstagramConfig başarısız: ${resolved.error}`);
    return channelsRedirect(request, { ig_error: resolved.error });
  }
  const config = resolved.config;
  // ⚠ Gizli değil: appId ve redirect_uri Meta panelinde zaten açık.
  // app_secret'ın KENDİSİ loglanmıyor, yalnızca dolu olup olmadığı.
  console.info(
    `[instagram-oauth][callback] resolveInstagramConfig tamam: appId="${config.appId}" ` +
    `redirect_uri="${config.redirectUri}" apiVersion="${config.apiVersion}" hasSecret=${!!config.appSecret}`,
  );

  const exchanged = await exchangeCode(config, code);
  if (!exchanged.ok) {
    console.error(`[instagram-oauth][callback] exchangeCode başarısız: ${exchanged.error}`);
    return channelsRedirect(request, { ig_error: exchanged.error });
  }
  console.info(`[instagram-oauth][callback] exchangeCode tamam: userId="${exchanged.userId}"`);

  const longLived = await exchangeForLongLived(config, exchanged.shortToken);
  if (!longLived.ok) {
    console.error(`[instagram-oauth][callback] exchangeForLongLived başarısız: ${longLived.error}`);
    return channelsRedirect(request, { ig_error: longLived.error });
  }
  console.info(`[instagram-oauth][callback] exchangeForLongLived tamam: expiresAt=${longLived.token.expiresAt.toISOString()}`);

  const profile = await fetchProfile(config, longLived.token.accessToken);
  if (!profile.ok) {
    console.error(`[instagram-oauth][callback] fetchProfile başarısız: ${profile.error}`);
    return channelsRedirect(request, { ig_error: profile.error });
  }
  console.info(`[instagram-oauth][callback] fetchProfile tamam: username="${profile.profile.username}" userId="${profile.profile.user_id}"`);

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
    console.error(`[instagram-oauth][callback] channels upsert başarısız: ${channelError?.message ?? "kanal satırı dönmedi"}`);
    return channelsRedirect(request, { ig_error: channelError?.message ?? "kanal satırı yazılamadı" });
  }
  console.info(`[instagram-oauth][callback] channels upsert tamam: channelId=${channelRow.id}`);

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
    console.error(`[instagram-oauth][callback] channel_credentials upsert başarısız: ${credentialError.message}`);
    // Token yazılamadıysa kanal "bağlı" görünmemeli — geri al (Bluesky'nin
    // aynı rollback deseni, `lib/adapters/live/channel.ts`).
    await supabase.from("channels").update({ is_connected: false }).eq("id", channelRow.id);
    return channelsRedirect(request, { ig_error: "kimlik bilgisi kaydedilemedi" });
  }

  console.info(`[instagram-oauth][callback] BAŞARILI: channelId=${channelRow.id} username="${profile.profile.username}"`);
  return channelsRedirect(request, { ig_connected: "1" });
}
