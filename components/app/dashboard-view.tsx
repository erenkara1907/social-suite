"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { buildNav } from "@/app.config";
import {
  ACTIVITY_ACTION_ICON, ACTIVITY_ACTION_LABEL, PLATFORM_META, STATUS_LABEL, STATUS_TONE,
  type ActivityRow, type DKpi, type QueueItem,
} from "@/lib/core/types";

const TILE_GRADIENT: Record<NonNullable<DKpi["tone"]>, string> = {
  1: "var(--grad-tile-1)",
  2: "var(--grad-tile-2)",
  3: "var(--grad-tile-3)",
  4: "var(--grad-tile-4)",
};

/** Hızlı erişimin kritik yolu — D4'ün dört ekranı: /plan, /studio, /queue,
 *  /analytics. `buildNav` kullanılıyor ki etiket/ikon `app.config.ts`'in tek
 *  kaynağından gelsin, burada ikinci bir kopya olmasın. */
const QUICK_ACCESS_MODULES = ["plan", "studio", "queue", "analytics"] as const;

function KpiTile({ kpi }: { kpi: DKpi }) {
  const { t } = useLang();
  return (
    <div
      className="rounded-2xl p-4 shadow-soft"
      style={{ backgroundImage: TILE_GRADIENT[kpi.tone ?? 1] }}
      title={kpi.hint ? t(kpi.hint) : undefined}
    >
      <div className="flex items-center gap-2">
        {kpi.icon && <Icon name={kpi.icon} className="h-4 w-4 text-foreground/70" />}
        <p className="label-mono text-foreground/70">{t(kpi.label)}</p>
      </div>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight">{kpi.value}</p>
    </div>
  );
}

function UpcomingCard({ items }: { items: QueueItem[] }) {
  const { t, ui } = useLang();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.dashboardUpcoming}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{ui.dashboardUpcomingEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon name={PLATFORM_META[item.platform].icon} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t(item.title)}</p>
                  <p className="text-xs text-muted-foreground">{t(item.when)}</p>
                </div>
                <Badge tone={STATUS_TONE[item.status]}>{t(STATUS_LABEL[item.status])}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ rows, tz, lang }: { rows: ActivityRow[]; tz: string; lang: "tr" | "en" }) {
  const { t, ui } = useLang();
  const formatter = new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-US", {
    timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.recentActivity}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{ui.dashboardEmptyActivity}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon name={ACTIVITY_ACTION_ICON[row.action]} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{t(ACTIVITY_ACTION_LABEL[row.action])}</span>
                    {" · "}
                    <span className="text-muted-foreground">{row.target}</span>
                  </p>
                  <p className="label-mono mt-0.5 text-muted-foreground">
                    {row.actor} · {formatter.format(new Date(row.created_at))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuickAccessCard() {
  const { t, ui } = useLang();
  const items = buildNav(QUICK_ACCESS_MODULES);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.dashboardQuickAccess}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center text-sm font-medium transition-colors hover:bg-muted"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon name={item.icon} className="h-4 w-4" />
            </span>
            {t(item.label)}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardView({
  kpis,
  upcoming,
  activity,
  timezone,
}: {
  kpis: DKpi[];
  upcoming: QueueItem[];
  activity: ActivityRow[];
  timezone: string;
}) {
  const { lang } = useLang();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label.tr} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingCard items={upcoming} />
        <ActivityCard rows={activity} tz={timezone} lang={lang} />
      </div>

      <QuickAccessCard />
    </div>
  );
}
