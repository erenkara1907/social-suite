"use client";

import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { DeadJob, JobsSummary } from "@/lib/server/jobs/status";

/**
 * `/queue`'nun genel iş kuyruğu bölümü — BIRLESIM_PLANI §12 adım 12 FAZ C.
 *
 * Tam bir yönetim paneli DEĞİL (adım 21'in işi). Yalnızca "bir şey
 * bozulduğunda haberim olsun" seviyesi: bekleyen/çalışan/ölü mektup sayıları
 * + ölü mektuptaki işlerin listesi (tür + son hata).
 */
function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "primary" | "destructive" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums" data-tone={tone}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function DeadJobRow({ job }: { job: DeadJob }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge tone="destructive">{job.kind}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleString()}</span>
      </div>
      {job.lastError && <p className="line-clamp-2 text-xs text-muted-foreground">{job.lastError}</p>}
    </div>
  );
}

export function JobsQueueStatus({ summary }: { summary: JobsSummary }) {
  const { ui } = useLang();
  const { counts, deadJobs } = summary;
  const totalEver = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="server" className="h-4 w-4 text-primary" />
          {ui.jobsQueueTitle}
        </CardTitle>
        <CardDescription>{ui.jobsQueueHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={ui.jobsQueuePending} value={counts.queued} tone="neutral" />
          <Stat label={ui.jobsQueueRunning} value={counts.running} tone="primary" />
          <Stat label={ui.jobsQueueDead} value={counts.dead} tone="destructive" />
          <Stat label={ui.jobsQueueSucceeded} value={counts.succeeded} tone="neutral" />
        </div>

        {totalEver === 0 && <p className="text-xs text-muted-foreground">{ui.jobsQueueEmptyNote}</p>}

        {counts.dead > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{ui.jobsQueueDeadListTitle}</p>
            <div className="space-y-2">
              {deadJobs.map((job) => (
                <DeadJobRow key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
