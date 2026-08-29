"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  MEDIA_JOB_STATE_LABEL, MEDIA_JOB_STATE_TONE, MEDIA_JOB_STEP_LABEL, PLATFORM_META,
  STATUS_LABEL, STATUS_TONE, type ContentItemRow, type MediaJobRow, type MediaJobStep,
  type PersonaRow,
} from "@/lib/core/types";
import { cn } from "@/lib/utils";

/**
 * `/studio` — BIRLESIM_PLANI §12 adım 10 FAZ C. Ürünün en pahalı işlemi.
 *
 * ⭐ C5 — sahte bir ilerleme çubuğu ÇALIŞTIRILMIYOR. `running` durumundaki
 * satırlar `media_jobs`'un GERÇEK durumunu gösteriyor (bkz. `JobStepRow`);
 * ekranın kendi `setInterval`'i yok.
 */

const PIPELINE_ICON: Record<MediaJobStep, string> = {
  persona_image: "image",
  persona_video: "clapperboard",
  voice: "mic",
  lipsync: "audio-lines",
  post_image: "image",
};

export interface CostRow {
  step: MediaJobStep;
  vendor: string;
  /** `null` — bu adımın kredi maliyeti yok (abonelik dahilinde). */
  credits: string | null;
}

export interface ProductionView {
  contentItemId: string;
  item: ContentItemRow | null;
  persona: PersonaRow | null;
  jobs: MediaJobRow[];
  posterUrl: string | null;
  credits: number;
}

/** C1 — dört adımlık boru hattının statik açıklaması. Belirli bir işe değil,
 *  sürecin kendisine ait; her adım `costRows`'tan sağlayıcı adını taşır. */
function PipelineExplainer({ steps, costRows }: { steps: MediaJobStep[]; costRows: CostRow[] }) {
  const { ui, t } = useLang();
  const vendorByStep = new Map(costRows.map((row) => [row.step, row.vendor]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="workflow" className="h-4 w-4 text-primary" />
          {ui.studioPipelineTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-stretch gap-2">
          {steps.map((step, i) => (
            <div key={step} className="flex items-stretch gap-2">
              <div className="w-40 rounded-xl border border-border bg-card p-3 text-center">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={PIPELINE_ICON[step]} className="h-4 w-4" />
                </span>
                <p className="mt-2 text-sm font-medium">{t(MEDIA_JOB_STEP_LABEL[step])}</p>
                <p className="label-mono mt-0.5 text-muted-foreground">{vendorByStep.get(step)}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="grid place-items-center text-muted-foreground">
                  <Icon name="arrow-right" className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** C3 — gerçek fiyat yazılmadı (sağlayıcı fiyatı değişir); işlem/kredi sayısı gösterildi. */
function CostTable({ rows }: { rows: CostRow[] }) {
  const { ui, t } = useLang();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="coins" className="h-4 w-4 text-primary" />
          {ui.studioCostTitle}
        </CardTitle>
        <CardDescription>{ui.studioCostHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.step} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name={PIPELINE_ICON[row.step]} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{t(MEDIA_JOB_STEP_LABEL[row.step])}</span>
              <span className="label-mono truncate text-muted-foreground">{row.vendor}</span>
            </div>
            <span className="label-mono shrink-0 text-foreground">
              {row.credits ?? ui.studioCostVoiceNote}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function JobStepRow({ job }: { job: MediaJobRow }) {
  const { ui, t } = useLang();
  const isRunning = job.state === "running";
  const credits = job.credits_charged ?? job.credits_estimated;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm",
        isRunning && "glow border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          name={isRunning ? "loader-circle" : PIPELINE_ICON[job.step]}
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", isRunning && "animate-spin text-primary")}
        />
        <span className="truncate font-medium">{t(MEDIA_JOB_STEP_LABEL[job.step])}</span>
        <span className="label-mono truncate text-muted-foreground">{job.vendor_model}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {job.error && (
          <span className="max-w-[16rem] truncate text-xs text-destructive" title={job.error}>
            {job.error}
          </span>
        )}
        <span className="label-mono text-muted-foreground">{credits} {ui.studioCreditsUnit}</span>
        <Badge tone={MEDIA_JOB_STATE_TONE[job.state]}>{t(MEDIA_JOB_STATE_LABEL[job.state])}</Badge>
      </div>
    </div>
  );
}

/** C4 — adım 8'de üretilen 9:16 poster; gerçek video yok (S5), oynatıcı bu posteri gösterir. */
function ProductionPreview({ posterUrl }: { posterUrl: string | null }) {
  const { ui } = useLang();
  return (
    <div className="relative aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
      {posterUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- demo asset, local /public path */}
          <img src={posterUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 grid place-items-center bg-black/10">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-foreground shadow-soft">
              <Icon name="play" className="h-4 w-4" />
            </span>
          </div>
          <Badge tone="neutral" className="absolute bottom-1.5 left-1.5 right-1.5 justify-center">
            {ui.studioDemoOutputBadge}
          </Badge>
        </>
      ) : (
        <div className="grid h-full place-items-center px-2 text-center text-xs text-muted-foreground">
          {ui.studioNoPreviewYet}
        </div>
      )}
    </div>
  );
}

function ProductionCard({ production }: { production: ProductionView }) {
  const { ui, t } = useLang();
  const { item, persona, jobs, posterUrl, credits } = production;
  const platform = item ? PLATFORM_META[item.platform] : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-4">
        <ProductionPreview posterUrl={posterUrl} />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {platform && <Icon name={platform.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <p className="truncate font-medium">{item?.title ?? production.contentItemId}</p>
              {item && <Badge tone={STATUS_TONE[item.status]}>{t(STATUS_LABEL[item.status])}</Badge>}
            </div>
            <span className="label-mono shrink-0 text-muted-foreground">
              {credits} {ui.studioCreditsUnit} · {ui.studioTotalCredits}
            </span>
          </div>

          {persona && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon name="user-round" className="h-3.5 w-3.5" />
              {ui.studioPersonaLabel}: <span className="font-medium text-foreground">{persona.name}</span>
            </p>
          )}

          <div className="space-y-1.5">
            {jobs.map((job) => (
              <JobStepRow key={job.id} job={job} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function StudioView({
  pipelineSteps,
  costRows,
  productions,
  personaCount,
  generateDisabled,
}: {
  pipelineSteps: MediaJobStep[];
  costRows: CostRow[];
  productions: ProductionView[];
  personaCount: number;
  generateDisabled: boolean;
}) {
  const { ui } = useLang();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{ui.studioTitle}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{ui.studioHint}</p>
        </div>
        <Link href="/studio/personas">
          <Button type="button" variant="outline" className="gap-2">
            <Icon name="users" className="h-4 w-4" />
            {ui.studioPersonasLink}
            <Badge tone="neutral">{personaCount} {ui.studioPersonasCount}</Badge>
          </Button>
        </Link>
      </div>

      {/* ⭐ C2 — /plan ile buradaki liste arasındaki kopukluk gizlenmiyor, anlatılıyor. */}
      <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-muted-foreground">{ui.studioLinkNote}</p>
      </div>

      <PipelineExplainer steps={pipelineSteps} costRows={costRows} />
      <CostTable rows={costRows} />

      <Card>
        <CardHeader>
          <CardTitle>{ui.studioGenerateCta}</CardTitle>
        </CardHeader>
        <CardContent title={ui.studioGenerateDisabledHint}>
          <Button type="button" disabled={generateDisabled} className="gap-2">
            <Icon name="sparkles" className="h-4 w-4" />
            {ui.studioGenerateCta}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold">{ui.studioProductionsTitle}</h2>
          <p className="text-sm text-muted-foreground">{ui.studioProductionsHint}</p>
        </div>

        {productions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{ui.studioProductionsEmpty}</p>
        ) : (
          <div className="space-y-3">
            {productions.map((production) => (
              <ProductionCard key={production.contentItemId} production={production} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
