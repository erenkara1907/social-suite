/**
 * ChannelPort — CANLI implementasyon. §12 adım 16 (OAuth) / 11b (kabuk) /
 * 17a FAZ A (Bluesky, kimlik bilgisiyle bağlanma).
 *
 * ⭐ 11b FAZ A — `list()` artık GERÇEK bir okuma: `channels` tablosu OAuth
 * beklemeden de var (adım 5'in şeması), bu yüzden `/channels` ekranı canlı
 * modda "not implemented" ile çökmek yerine (bugün için) boş bir liste
 * görür — hiçbir marka henüz bağlanmadığı için satır sayısı sıfır, ama
 * sorgu GERÇEK ve RLS'ten geçiyor. Adım 16 Instagram OAuth callback'i
 * `channels`'a satır yazmaya başladığında bu ekran DEĞİŞMEDEN onu gösterir.
 *
 * ⭐ 17a FAZ A — `connectWithCredentials`/`disconnect` GERÇEK (yalnızca
 * Bluesky için — `CREDENTIAL_CONNECT_PLATFORMS`).
 *
 * ⭐ §12 adım 16 FAZ B1 — `startConnect` artık GERÇEK (yalnızca Instagram
 * için — `OAUTH_CONNECT_PLATFORMS`). Yalnızca `{ authorizeUrl, state }`
 * ÜRETİR — `state`'i bir çereze yazmak (`app/api/instagram/connect/
 * route.ts` — BİLEREK bir Route Handler, server action DEĞİL, bkz. o
 * dosyanın başlığı) ve callback'te doğrulamak (`app/api/instagram/
 * callback/route.ts`) bu fonksiyonun DIŞINDA, çünkü bu dosya `next/
 * headers`'a bağımlı değil (§8.6'nın "Next'e bağımlılık yok" kuralı
 * `lib/adapters/live/*` için de geçerli — yalnızca Supabase'e bağımlı
 * olabilir, cookie/request nesnesine değil).
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Bluesky kimlik bilgisi (identifier +
 * uygulama şifresi) kullanıcıdan FORM ile gelir, `connectWithCredentials`'a
 * PARAMETRE olarak iner — env'den okunan bir anahtar tüm müşteriler için
 * ortak olurdu (zaten Bluesky'de "tek anahtar" diye bir şey yok, her müşteri
 * kendi hesabına bağlanıyor).
 *
 * ⚠ Token bu dosyadan DIŞARI hiçbir zaman dönmez — `connectWithCredentials`
 * yalnızca `ChannelRow` döner (token alanı yok), `disconnect` yalnızca
 * `ApiResult<void>`. `channel_credentials` yazımı/silinmesi service-role
 * istemcisiyle olur (`lib/supabase/admin.ts`'in "üç yer" kuralının 2.
 * maddesi — OAuth callback'i VE kimlik-bilgisi-bağlama akışı).
 */
import { randomBytes } from "node:crypto";
import type { ChannelPort } from "@/lib/adapters/ports";
import { CREDENTIAL_CONNECT_PLATFORMS, OAUTH_CONNECT_PLATFORMS } from "@/lib/core/publishing";
import { connectBluesky, revokeBlueskySession, verifyBlueskySession } from "@/lib/core/providers/bluesky";
import { authorizeUrl } from "@/lib/core/providers/instagram/oauth";
import { resolveInstagramConfig } from "@/lib/server/instagram/resolve-config";
import { requireBrand } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ChannelRow, Platform } from "@/lib/core/types";

/** CSRF state — `authorizeUrl()`'e giden ve callback'in doğrulayacağı dize.
 *  32 bayt (256 bit) rastgelelik; tahmin edilebilirlik burada tek risk. */
const OAUTH_STATE_BYTES = 32;

const CHANNEL_COLUMNS = "id,platform,handle,followers,growth,engagement,is_connected,last_synced_at";

interface StoredCredentialRow {
  access_token: string;
  refresh_token: string | null;
}

export const liveChannel: ChannelPort = {
  async list() {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("channels")
      .select(CHANNEL_COLUMNS)
      .eq("brand_id", brand.id)
      .order("platform", { ascending: true })
      .returns<ChannelRow[]>();
    if (error) throw new Error(`channels listelenemedi: ${error.message}`);
    return data ?? [];
  },
  async startConnect(platform) {
    if (!(OAUTH_CONNECT_PLATFORMS as readonly Platform[]).includes(platform)) {
      return { ok: false, error: { code: "invalid_input", detail: `${platform} yönlendirmeli bağlanmayı desteklemiyor` } };
    }

    const { brand } = await requireBrand();
    const resolved = await resolveInstagramConfig(brand.id);
    if (!resolved.ok) {
      return { ok: false, error: { code: "invalid_key", detail: resolved.error } };
    }

    // Çağıran (`app/api/instagram/connect/route.ts` — düz bir Route Handler,
    // BİLEREK bir server action DEĞİL, bkz. o dosyanın başlığı) bunu httpOnly
    // bir çereze yazar, callback aynı adı okuyup karşılaştırır — bu fonksiyon
    // çerez YAZMAZ, `next/headers`'a bağımlı değil (ChannelPort'un diğer
    // implementasyonlarıyla — demo — aynı imza, test edilebilirlik).
    const state = randomBytes(OAUTH_STATE_BYTES).toString("hex");

    return { ok: true, data: { authorizeUrl: authorizeUrl(resolved.config, state), state } };
  },
  async connectWithCredentials(platform, credentials) {
    if (!(CREDENTIAL_CONNECT_PLATFORMS as readonly Platform[]).includes(platform)) {
      return { ok: false, error: { code: "invalid_input", detail: `${platform} kimlik bilgisiyle bağlanmayı desteklemiyor` } };
    }
    const identifier = credentials.identifier.trim();
    const appPassword = credentials.appPassword.trim();
    if (!identifier || !appPassword) {
      return { ok: false, error: { code: "invalid_input", detail: "kullanıcı adı ve uygulama şifresi gerekli" } };
    }

    const { user, brand } = await requireBrand();

    const connectResult = await connectBluesky(identifier, appPassword);
    if (!connectResult.ok) {
      return { ok: false, error: { code: "invalid_key", detail: connectResult.error } };
    }
    const session = connectResult.session;

    // Adım 20.5 "en ucuz uç nokta" deseni — giriş zaten doğrulanmış olsa da,
    // dönen token'ın gerçekten kullanılabilir olduğunu ayrıca sınıyoruz.
    const verifyResult = await verifyBlueskySession(session);
    if (!verifyResult.ok) {
      return { ok: false, error: { code: "upstream_error", detail: verifyResult.error } };
    }

    const supabase = await createClient();
    const { data: channelRow, error: channelError } = await supabase
      .from("channels")
      .upsert(
        {
          brand_id: brand.id,
          user_id: user.id,
          platform,
          handle: `@${session.handle}`,
          external_account_id: session.did,
          username: session.handle,
          is_connected: true,
        },
        { onConflict: "brand_id,platform,handle" },
      )
      .select(CHANNEL_COLUMNS)
      .single<ChannelRow>();
    if (channelError || !channelRow) {
      return { ok: false, error: { code: "storage_error", detail: channelError?.message ?? "kanal satırı yazılamadı" } };
    }

    // ⚠ Yalnızca service-role — channel_credentials RLS açık + sıfır politika.
    const admin = createAdminClient();
    const { error: credentialError } = await admin.from("channel_credentials").upsert({
      channel_id: channelRow.id,
      user_id: user.id,
      provider: platform,
      external_account_id: session.did,
      access_token: session.accessJwt,
      refresh_token: session.refreshJwt,
      last_refreshed_at: new Date().toISOString(),
    });
    if (credentialError) {
      // Token yazılamadıysa kanal "bağlı" görünmemeli — geri al.
      await supabase.from("channels").update({ is_connected: false }).eq("id", channelRow.id);
      return { ok: false, error: { code: "storage_error", detail: "kimlik bilgisi kaydedilemedi" } };
    }

    return { ok: true, data: channelRow };
  },
  async disconnect(channelId) {
    // RLS'ten geçen normal istemciyle sahiplik doğrula — owns_brand()
    // brand_id üzerinden çalışıyor, başka markanın kanalı burada 0 satır
    // döner (§7.1 "sahiplik reddi" deseni).
    const supabase = await createClient();
    const { data: channel, error: fetchError } = await supabase
      .from("channels")
      .select("id,platform")
      .eq("id", channelId)
      .maybeSingle<{ id: string; platform: Platform }>();
    if (fetchError) {
      return { ok: false, error: { code: "storage_error", detail: fetchError.message } };
    }
    if (!channel) {
      return { ok: false, error: { code: "not_found" } };
    }

    const admin = createAdminClient();
    if (channel.platform === "bluesky") {
      const { data: credRow } = await admin
        .from("channel_credentials")
        .select("access_token,refresh_token")
        .eq("channel_id", channelId)
        .maybeSingle<StoredCredentialRow>();
      if (credRow?.refresh_token) {
        // En iyi çaba — sunucu tarafı iptal başarısız olsa bile disconnect
        // devam eder, aksi halde süresi dolmuş bir token kullanıcıyı
        // sonsuza dek kanalın bağlantısını kesemez hâlde bırakırdı.
        const revoked = await revokeBlueskySession({
          did: "", handle: "",
          accessJwt: credRow.access_token,
          refreshJwt: credRow.refresh_token,
        });
        if (!revoked.ok) {
          console.info(`[channel] bluesky sunucu-taraflı iptal başarısız (channel=${channelId}): ${revoked.error}`);
        }
      }
    }

    const { error: deleteError } = await admin.from("channel_credentials").delete().eq("channel_id", channelId);
    if (deleteError) {
      return { ok: false, error: { code: "storage_error", detail: "kimlik bilgisi silinemedi" } };
    }

    const { error: updateError } = await supabase.from("channels").update({ is_connected: false }).eq("id", channelId);
    if (updateError) {
      return { ok: false, error: { code: "storage_error", detail: updateError.message } };
    }

    return { ok: true, data: undefined };
  },
};
