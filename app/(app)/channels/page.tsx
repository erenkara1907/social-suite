import { isDemo, port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildChannels } from "@/lib/core/derive/calendar";
import { PLATFORMS } from "@/lib/core/types";
import { ChannelsView, type ChannelCardView } from "@/components/app/channels-view";

export const metadata = { title: "Kanallar" };

/**
 * `/channels` — BIRLESIM_PLANI §12 adım 11b FAZ A.
 *
 * ⚠ Bu ekran adım 16'nın (Instagram OAuth) KABUĞU. `ChannelPort.list()`
 * canlı modda `channels` tablosunu GERÇEKTEN okuyor (bkz. `lib/adapters/
 * live/channel.ts`) — bugün hiçbir marka bağlı olmadığı için satır sayısı
 * sıfır olacak, ama sorgu gerçek ve adım 16 bu sayfayı DEĞİŞTİRMEDEN
 * kullanabilecek. `startConnect`/`disconnect` hâlâ iskelet — "Bağla"
 * düğmesi bilerek `disabled`, sahte bir OAuth akışı KURULMADI.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const channelPort = port("channel", overrides);
  const contentPort = port("content", overrides);

  const [rows, items] = await Promise.all([channelPort.list(), contentPort.list()]);
  const accounts = buildChannels(rows, items);
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));

  // ⭐ Beş platformun HEPSİ kart olarak görünür — bağlı olsun olmasın.
  // Bağlı değilse `account` null: kart "ne gerekiyor" metnini gösterir.
  const cards: ChannelCardView[] = PLATFORMS.map((platform) => ({
    platform,
    account: byPlatform.get(platform) ?? null,
  }));

  return <ChannelsView cards={cards} isDemo={isDemo("channel", overrides)} />;
}
