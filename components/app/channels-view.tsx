"use client";

import { useActionState } from "react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Label } from "@/components/ui/input";
import { AI_ERROR_COPY } from "@/lib/core/ai/error-copy";
import { PLATFORM_META, PLATFORMS, type ChannelAccount, type Platform } from "@/lib/core/types";
import { CREDENTIAL_CONNECT_PLATFORMS, OAUTH_CONNECT_PLATFORMS, PUBLISHABLE_PLATFORMS } from "@/lib/core/publishing";
import {
  connectChannelAction, disconnectChannelAction,
  type ConnectChannelActionState, type DisconnectChannelActionState,
} from "@/app/(app)/channels/actions";

// ⭐ adım 20.5 FAZ C1 dersi — başlangıç state sabitleri BURADA,
// actions.ts'te DEĞİL ("use server" dosyaları yalnızca async fonksiyon
// export edebilir; library-view.tsx'in DELETE_INITIAL_STATE deseni).
const CONNECT_CHANNEL_INITIAL_STATE: ConnectChannelActionState = {
  status: "idle", platform: null, errorCode: null,
};
const DISCONNECT_CHANNEL_INITIAL_STATE: DisconnectChannelActionState = {
  status: "idle", channelId: null,
};

export interface ChannelCardView {
  platform: Platform;
  /** `null` — bu platform için hiç kanal satırı yok (hiç bağlanmamış). */
  account: ChannelAccount | null;
}

/**
 * ⭐ 17a FAZ 0.2 — bu iki eksen artık AYRI: "bugün gerçekten yayınlanabilir"
 * (`PUBLISHABLE_PLATFORMS`, bugün `bluesky`) ile "yol haritasında OAuth'u
 * planlı olan" (yalnızca `instagram`, §12 adım 16/17b — Meta App Review
 * bekliyor) farklı sorular. Önceki hâli ikisini `PUBLISHABLE_PLATFORMS`'un
 * TEK içeriğine bağlıyordu; Bluesky o listeye girince Instagram'ın dürüst
 * "yakında OAuth" ipucu kaybolur, bluesky kartı da yanlışlıkla Instagram'a
 * özgü metni gösterirdi. Instagram'ın ipucu bu yüzden platforma göre
 * (sabit), publishable olup olmama sorusundan BAĞIMSIZ kararlaştırılıyor.
 */
function requirementText(platform: Platform, isPublishable: boolean): { tr: string; en: string } {
  if (platform === "instagram") {
    // ⭐ §12 adım 16 FAZ B1 — "henüz devrede değil" metni kalktı: OAuth artık
    // GERÇEK. Bu metin bugün yalnızca bir kanal zaten bağlıyken (`card.account`
    // dolu) render EDİLMEZ; `ConnectOAuthButton`'ın altındaki ipucu ayrı bir
    // anahtar (`channelsConnectOAuthHint`) — kart görünümü ikiye ayrıldığı için.
    return {
      tr: "Meta İş Hesabı + Instagram Profesyonel hesabı gerekir.",
      en: "Requires a Meta Business account + an Instagram Professional account.",
    };
  }
  if (isPublishable) {
    // Bugün yalnızca bluesky, ve artık gerçek bir form var — bu metin
    // yalnızca fallback (form render edilemezse) olarak kalıyor.
    return {
      tr: "Uygulama şifresiyle bağlanır, onay/inceleme gerekmez.",
      en: "Connects with an app password, no approval/review needed.",
    };
  }
  return {
    tr: "Bu platform için yayıncı entegrasyonu henüz planlanmadı.",
    en: "Publishing integration for this platform hasn't been scheduled yet.",
  };
}

/** ⭐ 17a FAZ A — Bluesky gibi OAuth'suz platformlar için gerçek bağlanma
 *  formu. Token hiçbir zaman istemciye dönmez; `connectChannelAction`
 *  yalnızca `ChannelRow` alır/döner. */
function ConnectCredentialsForm({ platform }: { platform: Platform }) {
  const { ui, lang } = useLang();
  const [state, formAction, pending] = useActionState(connectChannelAction, CONNECT_CHANNEL_INITIAL_STATE);
  const failed = state.status === "error" && state.platform === platform;

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="platform" value={platform} />
      <div className="space-y-1">
        <Label htmlFor={`identifier-${platform}`}>{ui.channelsIdentifierLabel}</Label>
        <Input
          id={`identifier-${platform}`}
          name="identifier"
          required
          autoComplete="off"
          placeholder={ui.channelsIdentifierPlaceholder}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`app-password-${platform}`}>{ui.channelsAppPasswordLabel}</Label>
        <Input
          id={`app-password-${platform}`}
          name="appPassword"
          type="password"
          required
          autoComplete="off"
          placeholder="xxxx-xxxx-xxxx-xxxx"
        />
        <p className="text-xs text-muted-foreground">{ui.channelsAppPasswordHint}</p>
      </div>
      {failed && (
        <p className="text-xs text-destructive" role="alert">
          {state.errorCode ? AI_ERROR_COPY[state.errorCode][lang] : ""}
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="w-full gap-1.5">
        <Icon name="link-2" className="h-3.5 w-3.5" />
        {pending ? ui.channelsConnecting : ui.channelsConnectSubmit}
      </Button>
    </form>
  );
}

/**
 * ⭐ §12 adım 16 FAZ B1 — Instagram gibi yönlendirmeli platformlar için gerçek
 * bağlanma düğmesi.
 *
 * ⚠ KANITLANMIŞ KÖK NEDEN (canlı teşhis) — burası ÖNCE bir Server Action
 * (`startInstagramConnectAction` + `next/navigation`'ın `redirect()`'i) idi.
 * Server Action'ın `redirect()`'i GERÇEK bir HTTP 3xx ÜRETMİYOR — Next'in
 * Server Action protokolü üzerinden İSTEMCİ TARAFINDA yorumlanan bir
 * yönlendirme. Bu, canlıda Meta'nın "redirect_uri is not identical"
 * hatasına (yanıltıcı metin — gerçek sebep bu değildi) yol açan
 * zincirin bir parçasıydı. Kaynak (siraya, `components/app/
 * channels-client.tsx`) düz bir `<a href="/api/instagram/connect">` kullanıyor
 * — kendi yorumu: "A full page load, not a fetch: this hands the browser to
 * Instagram." Buraya BİREBİR dönüldü: düğme artık bir `<a>`, `/api/instagram/
 * connect`'e (düz Route Handler, `NextResponse.redirect()`) GERÇEK bir tam
 * sayfa navigasyonu yapıyor.
 */
function ConnectOAuthButton() {
  const { ui } = useLang();

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{ui.channelsConnectOAuthHint}</p>
      <a
        href="/api/instagram/connect"
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Icon name="link-2" className="h-3.5 w-3.5" />
        {ui.channelsConnectOAuthCta}
      </a>
    </div>
  );
}

function DisconnectButton({ channelId }: { channelId: string }) {
  const { ui } = useLang();
  const [state, formAction, pending] = useActionState(disconnectChannelAction, DISCONNECT_CHANNEL_INITIAL_STATE);
  const disconnected = state.status === "disconnected" && state.channelId === channelId;

  if (disconnected) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="channelId" value={channelId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="w-full gap-1.5 text-destructive">
        <Icon name="unlink" className="h-3.5 w-3.5" />
        {pending ? ui.channelsDisconnecting : ui.channelsDisconnectCta}
      </Button>
    </form>
  );
}

function ChannelCard({ card }: { card: ChannelCardView }) {
  const { ui, lang } = useLang();
  const meta = PLATFORM_META[card.platform];
  const isPublishable = (PUBLISHABLE_PLATFORMS as readonly Platform[]).includes(card.platform);
  const isCredentialConnect = (CREDENTIAL_CONNECT_PLATFORMS as readonly Platform[]).includes(card.platform);
  const isOAuthConnect = (OAUTH_CONNECT_PLATFORMS as readonly Platform[]).includes(card.platform);
  const connected = card.account?.connected ?? false;

  return (
    <Card data-testid={`channel-card-${card.platform}`} className="flex flex-col">
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
        ) : isCredentialConnect ? (
          <ConnectCredentialsForm platform={card.platform} />
        ) : isOAuthConnect ? (
          <ConnectOAuthButton />
        ) : (
          <p className="text-sm text-muted-foreground">{requirementText(card.platform, isPublishable)[lang]}</p>
        )}
      </CardContent>

      {connected && card.account && (
        <div className="border-t border-border p-3">
          <DisconnectButton channelId={card.account.id} />
        </div>
      )}

      {!connected && !isCredentialConnect && !isOAuthConnect && (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={requirementText(card.platform, isPublishable)[lang]}
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

/**
 * ⭐ §12 adım 16 FAZ B1 — `oauthError`/`oauthConnected` `redirect()`'in
 * taşıdığı sonucu gösteriyor (bkz. `app/(app)/channels/page.tsx` başlığı:
 * Server Component'in kendi state'i yok, tek kanal URL). `oauthError`
 * ÇAĞIRANDAN (route/action) gelen zaten kullanıcıya gösterilmeye uygun bir
 * metin — burada ekrana basılıyor, ikinci bir çeviri/yorumlama YOK.
 */
export function ChannelsView({
  cards, isDemo, oauthError = null, oauthConnected = false,
}: {
  cards: ChannelCardView[];
  isDemo: boolean;
  oauthError?: string | null;
  oauthConnected?: boolean;
}) {
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

      {oauthError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ui.channelsOAuthErrorBanner}: {oauthError}
        </p>
      )}
      {oauthConnected && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {ui.channelsOAuthConnectedBanner}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((card) => (
          <ChannelCard key={card.platform} card={card} />
        ))}
      </div>
    </div>
  );
}
