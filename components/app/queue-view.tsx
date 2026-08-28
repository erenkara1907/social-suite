"use client";

import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  ACTIVITY_ACTION_ICON, MEDIA_JOB_STEP_LABEL, PLATFORM_META, STATUS_LABEL, STATUS_TONE,
  type ActivityRow, type MediaJobRow, type QueueItem,
} from "@/lib/core/types";
import type { ChainGroup } from "@/lib/core/derive/calendar";

export type { ChainGroup };

/** Bir kuyruk satırının render için ihtiyaç duyduğu her şey — `buildQueue()`'nun
 *  çıktısı (§4a durum makinesi) + §4b zincir alanları + o içeriğin `media_jobs`'ı. */
export interface QueueRowView extends QueueItem {
  chainPosition: number;
  continuationNote: string;
  jobs: MediaJobRow[];
}

function QueueActions({ status, hint }: { status: QueueRowView["status"]; hint: string }) {
  const { ui } = useLang();

  // §4a — `publishing` çifte yayın kalkanının kilit anı; aksiyon yerine kilit gösterilir.
  if (status === "publishing") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-primary" title={ui.queuePublishingHint}>
        <Icon name="lock" className="h-3.5 w-3.5" />
        {ui.queuePublishingTitle}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" title={hint}>
      <Button size="sm" variant="outline" disabled>
        <Icon name="check" className="h-3.5 w-3.5" />
        {ui.approve}
      </Button>
      <Button size="sm" variant="outline" disabled>
        <Icon name="calendar-clock" className="h-3.5 w-3.5" />
        {ui.queueReschedule}
      </Button>
      <Button size="sm" variant="outline" disabled>
        <Icon name="x" className="h-3.5 w-3.5" />
        {ui.queueCancel}
      </Button>
    </div>
  );
}

function JobProgress({ jobs }: { jobs: MediaJobRow[] }) {
  const { ui, t } = useLang();
  const running = jobs.find((j) => j.state === "running");
  if (!running) return null;

  const done = jobs.filter((j) => j.state === "succeeded").length;

  return (
    <div className="glow inline-flex w-fit items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
      <Icon name="loader-circle" className="h-3.5 w-3.5 animate-spin" />
      {ui.queueJobRunning} · {t(MEDIA_JOB_STEP_LABEL[running.step])}
      <span className="text-primary/70">
        ({done}/{jobs.length})
      </span>
    </div>
  );
}

function QueueRow({ row }: { row: QueueRowView }) {
  const { t, ui } = useLang();
  const platform = PLATFORM_META[row.platform];

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon name={platform.icon} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-medium">{t(row.title)}</p>
              <Badge tone={STATUS_TONE[row.status]}>{t(STATUS_LABEL[row.status])}</Badge>
              {row.best && <Badge tone="primary">{platform.name} · best time</Badge>}
              {row.chainPosition > 1 && (
                <Badge tone="info" title={row.continuationNote}>
                  <Icon name="link-2" className="h-3 w-3" />
                  {t({ tr: `Zincir · ${row.chainPosition}. halka`, en: `Chain · link ${row.chainPosition}` })}
                </Badge>
              )}
            </div>
            {t(row.body) && (
              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{t(row.body)}</p>
            )}
            <p className="label-mono mt-2 text-muted-foreground">{t(row.when)}</p>
            <div className="mt-2">
              <JobProgress jobs={row.jobs} />
            </div>
          </div>
        </div>

        <QueueActions status={row.status} hint={ui.queueActionDisabledHint} />
      </div>
    </Card>
  );
}

/** `/plan` bu kartı FARKLI bir başlık/açıklamayla yeniden kullanıyor (C4) —
 *  "zincir bu" değil, "bu yeni fikir bunlardan birinin devamı olabilir mi" sorusu. */
export function ChainCard({
  chains,
  title,
  description,
}: {
  chains: ChainGroup[];
  title?: string;
  description?: string;
}) {
  const { ui } = useLang();
  if (chains.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="link-2" className="h-4 w-4 text-primary" />
          {title ?? ui.queueChainTitle}
        </CardTitle>
        <CardDescription>{description ?? ui.queueChainHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {chains.map((chain) => (
          <div key={chain[0].root_id} className="flex flex-wrap items-stretch gap-2">
            {chain.map((item, i) => (
              <div key={item.id} className="flex items-stretch gap-2">
                <div className="w-48 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="neutral">{item.chain_position}</Badge>
                    <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status].tr}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</p>
                  {item.continuation_note && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.continuation_note}
                    </p>
                  )}
                </div>
                {i < chain.length - 1 && (
                  <div className="grid place-items-center text-muted-foreground">
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DuplicateCard({ rows }: { rows: ActivityRow[] }) {
  const { ui } = useLang();
  if (rows.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name={ACTIVITY_ACTION_ICON.duplicate_blocked} className="h-4 w-4 text-warning-foreground" />
          {ui.queueDuplicateTitle}
        </CardTitle>
        <CardDescription>{ui.queueDuplicateHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <p key={row.id} className="text-sm">
            {row.target}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export function QueueView({
  rows,
  chains,
  duplicateBlocked,
}: {
  rows: QueueRowView[];
  chains: ChainGroup[];
  duplicateBlocked: ActivityRow[];
}) {
  const { ui } = useLang();

  if (rows.length === 0) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-center">
        <div>
          <p className="font-medium">{ui.emptyQueue}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui.emptyQueueHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DuplicateCard rows={duplicateBlocked} />
      <div className="space-y-3">
        {rows.map((row) => (
          <QueueRow key={row.id} row={row} />
        ))}
      </div>
      <ChainCard chains={chains} />
    </div>
  );
}
