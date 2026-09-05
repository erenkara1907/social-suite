"use client";

import { useActionState } from "react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatBytes, formatDate } from "@/lib/utils";
import type { L, MediaKind, MediaSourceVendor } from "@/lib/core/types";
import { deleteMediaAssetAction, type DeleteMediaActionState } from "@/app/(app)/library/actions";

// ⭐ adım 20.5 FAZ C1 dersi — başlangıç state sabiti BURADA, actions.ts'te
// DEĞİL ("use server" dosyaları yalnızca async fonksiyon export edebilir).
const DELETE_INITIAL_STATE: DeleteMediaActionState = { status: "idle", assetId: null };

export interface MediaAssetCardView {
  id: string;
  kind: MediaKind;
  vendor: MediaSourceVendor | null;
  publicUrl: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
  /** `null` — hiçbir üretim işine/personaya bağlı değil (elle yükleme). */
  linkedLabel: L | null;
}

const KIND_ICON: Record<MediaKind, string> = { image: "image", video: "clapperboard", audio: "waves" };

function MediaPreview({ card }: { card: MediaAssetCardView }) {
  const { ui } = useLang();
  if (card.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- gerçek/demo asset, sabit boyut yok
    return <img src={card.publicUrl} alt="" className="h-full w-full object-cover" />;
  }
  if (card.kind === "video") {
    return <video src={card.publicUrl} controls className="h-full w-full object-cover" />;
  }
  return (
    <div className="grid h-full place-items-center gap-2 p-3">
      <Icon name="waves" className="h-6 w-6 text-muted-foreground" />
      <audio src={card.publicUrl} controls className="w-full" aria-label={ui.libraryAudioPreview} />
    </div>
  );
}

function MediaCard({ card, deleteDisabled }: { card: MediaAssetCardView; deleteDisabled: boolean }) {
  const { ui, t } = useLang();
  const [state, formAction, pending] = useActionState(deleteMediaAssetAction, DELETE_INITIAL_STATE);
  const deleted = state.status === "deleted" && state.assetId === card.id;

  if (deleted) return null;

  return (
    <Card data-testid={`media-asset-${card.id}`} className="flex flex-col overflow-hidden">
      <div className="aspect-square w-full bg-muted">
        <MediaPreview card={card} />
      </div>
      <CardContent className="flex-1 space-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">
            <Icon name={KIND_ICON[card.kind]} className="h-3 w-3" />
            {card.kind}
          </Badge>
          {card.vendor && <Badge tone="info">{card.vendor}</Badge>}
        </div>
        <p className="truncate text-sm font-medium" title={card.linkedLabel ? t(card.linkedLabel) : undefined}>
          {card.linkedLabel ? t(card.linkedLabel) : ui.libraryUnlinked}
        </p>
        <p className="label-mono text-muted-foreground">
          {formatDate(card.createdAt)} · {formatBytes(card.bytes)}
        </p>

        {state.status === "error" && state.assetId === card.id && (
          <p className="text-xs text-destructive">{ui.libraryDeleteError}</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="assetId" value={card.id} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={deleteDisabled || pending}
            title={deleteDisabled ? ui.libraryDeleteDisabledHint : undefined}
            className="w-full gap-1.5"
          >
            <Icon name="trash-2" className="h-3.5 w-3.5" />
            {pending ? ui.libraryDeleting : ui.libraryDelete}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LibraryView({ cards, isDemo }: { cards: MediaAssetCardView[]; isDemo: boolean }) {
  const { ui } = useLang();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{ui.libraryTitle}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          {isDemo ? ui.libraryHintDemo : ui.libraryHint}
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center text-center">
          <div>
            <p className="font-medium">{ui.libraryEmpty}</p>
            <p className="mt-1 text-sm text-muted-foreground">{ui.libraryEmptyHint}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <MediaCard key={card.id} card={card} deleteDisabled={isDemo} />
          ))}
        </div>
      )}
    </div>
  );
}
