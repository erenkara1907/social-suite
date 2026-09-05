"use client";

import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PLATFORM_META, PLATFORMS, type ChannelAccount, type Platform } from "@/lib/core/types";
import { PUBLISHABLE_PLATFORMS } from "@/lib/core/publishing";

export interface ChannelCardView {
  platform: Platform;
  /** `null` — bu platform için hiç kanal satırı yok (hiç bağlanmamış). */
  account: ChannelAccount | null;
}

/** Instagram §12 adım 16'da OAuth alacak — diğer dördü için henüz bir
 *  yayıncı implementasyonu planlanmadı (§8.8: yalnızca x/linkedin/tiktok
 *  adı geçiyor, "FAZ 2'nin en sonu"; youtube o listede bile yok). İkisini
 *  ayıran tek şey PUBLISHABLE_PLATFORMS'un bugünkü içeriği — ileride
 *  genişlerse bu kart otomatik doğru mesajı gösterir. */
function requirementText(platform: Platform, willConnectSoon: boolean): { tr: string; en: string } {
  if (willConnectSoon) {
    return {
      tr: "Meta İş Hesabı + Instagram Profesyonel hesabı gerekir. Bağlama OAuth akışıyla olacak — henüz devrede değil.",
      en: "Requires a Meta Business account + an Instagram Professional account. Connecting will use an OAuth flow — not live yet.",
    };
  }
  return {
    tr: "Bu platform için yayıncı entegrasyonu henüz planlanmadı.",
    en: "Publishing integration for this platform hasn't been scheduled yet.",
  };
}

function ChannelCard({ card }: { card: ChannelCardView }) {
  const { ui, lang } = useLang();
  const meta = PLATFORM_META[card.platform];
  const willConnectSoon = (PUBLISHABLE_PLATFORMS as readonly Platform[]).includes(card.platform);
  const connected = card.account?.connected ?? false;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Icon name={meta.icon} className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">{meta.name}</CardTitle>
          </div>
          <Badge tone={connected ? "success" : "neutral"}>
            {connected ? ui.channelsConnected : ui.channelsNotConnected}
          </Badge>
        </div>
        {card.account && <CardDescription>{card.account.handle}</CardDescription>}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {card.account ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-semibold">{card.account.followers}</p>
                <p className="label-mono text-muted-foreground">{ui.channelsFollowers}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{card.account.growth}%</p>
                <p className="label-mono text-muted-foreground">{ui.channelsGrowth}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{card.account.engagement}%</p>
                <p className="label-mono text-muted-foreground">{ui.channelsEngagement}</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="refresh-cw" className="h-3.5 w-3.5" />
              {ui.channelsLastSynced}:{" "}
              {card.account.lastSyncedAt
                ? new Date(card.account.lastSyncedAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")
                : ui.channelsNeverSynced}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{requirementText(card.platform, willConnectSoon)[lang]}</p>
        )}
      </CardContent>

      {!connected && (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={willConnectSoon ? ui.channelsConnectDisabledHint : requirementText(card.platform, false)[lang]}
            className="w-full gap-1.5"
          >
            <Icon name="link-2" className="h-3.5 w-3.5" />
            {ui.channelsConnectCta}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ChannelsView({ cards, isDemo }: { cards: ChannelCardView[]; isDemo: boolean }) {
  const { ui } = useLang();

  // Görünüm sırası PLATFORMS'un kanonik sırası — kartlar sayfadan sayfaya
  // (demo/canlı, farklı markalar) aynı yerde durur.
  const ordered = [...cards].sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{ui.channelsTitle}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          {isDemo ? ui.channelsHintDemo : ui.channelsHint}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((card) => (
          <ChannelCard key={card.platform} card={card} />
        ))}
      </div>
    </div>
  );
}
