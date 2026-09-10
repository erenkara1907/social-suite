import { isDemo, port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildChannels } from "@/lib/core/derive/calendar";
import { PLATFORMS } from "@/lib/core/types";
import { ChannelsView, type ChannelCardView } from "@/components/app/channels-view";

export const metadata = { title: "Kanallar" };

/**
 * `/channels` — BIRLESIM_PLANI §12 adım 11b FAZ A.
 *
 * ⭐ §12 adım 16 FAZ B1 — `startConnect` artık GERÇEK (yalnızca Instagram —
 * `OAUTH_CONNECT_PLATFORMS`). Bu sayfa `?ig_error=`/`?ig_connected=` sorgu
 * parametrelerini okuyor: `startInstagramConnectAction` (hata) ve
 * `app/api/instagram/callback/route.ts` (başarı/hata) bir `redirect()` ile
 * buraya döner, sonucu STATE'TE değil URL'DE taşır — Server Component'in
 * kendi state'i yok, bu yüzden tek kanal budur.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ig_error?: string; ig_connected?: string }>;
}) {
  const overrides = await requestModeOverrides();
  const channelPort = port("channel", overrides);
  const contentPort = port("content", overrides);
  const params = await searchParams;

  const [rows, items] = await Promise.all([channelPort.list(), contentPort.list()]);
  const accounts = buildChannels(rows, items);
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));

  // ⭐ Beş platformun HEPSİ kart olarak görünür — bağlı olsun olmasın.
  // Bağlı değilse `account` null: kart "ne gerekiyor" metnini gösterir.
  const cards: ChannelCardView[] = PLATFORMS.map((platform) => ({
    platform,
    account: byPlatform.get(platform) ?? null,
  }));

  return (
    <ChannelsView
      cards={cards}
      isDemo={isDemo("channel", overrides)}
      oauthError={params.ig_error ?? null}
      oauthConnected={params.ig_connected === "1"}
    />
  );
}
