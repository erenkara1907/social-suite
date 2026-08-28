"use client";

import { Fragment } from "react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { HEATMAP_WINDOWS } from "@/lib/core/derive/analytics";
import { WEEKDAYS } from "@/lib/core/derive/calendar";
import { PLATFORM_META, type BestWindow, type MetricTier, type TopPost, type TrendPoint } from "@/lib/core/types";
import { cn } from "@/lib/utils";

/** Marka hue'sunun tek renkli, açık→koyu sıralı büyüklük rampası (dataviz
 *  skill'i — "Sequential = one hue, light→dark", kategorik değil, bu yüzden
 *  CVD doğrulayıcısından geçmiyor: sıralı rampalar zaten geçmiyor). */
const SEQUENTIAL_HUE = 262;

function heatColor(score: number) {
  const t = Math.max(0, Math.min(1, score / 100));
  const l = 95 - 45 * t; // 95% (yüzeye yakın) → 50% (koyu)
  const c = 0.02 + 0.2 * t;
  return `oklch(${l.toFixed(1)}% ${c.toFixed(3)} ${SEQUENTIAL_HUE})`;
}

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function TierBadge({ tier }: { tier: MetricTier | null }) {
  const { ui } = useLang();
  if (tier === "final") return <Badge tone="success">{ui.analyticsTierFinal}</Badge>;
  if (tier === "d1") return <Badge tone="info">{ui.analyticsTierD1}</Badge>;
  return null;
}

function TopPostsCard({ posts, tiers }: { posts: TopPost[]; tiers: Record<string, MetricTier | null> }) {
  const { t, ui } = useLang();
  const maxReach = Math.max(1, ...posts.map((p) => Number(p.reach.replace("K", "")) * (p.reach.includes("K") ? 1000 : 1)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.analyticsTopPosts}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {posts.map((post) => {
          const reachNum = Number(post.reach.replace("K", "")) * (post.reach.includes("K") ? 1000 : 1);
          const width = Math.max(6, (reachNum / maxReach) * 100);
          return (
            <div key={post.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name={PLATFORM_META[post.platform].icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{t(post.title)}</span>
                  <TierBadge tier={tiers[post.id] ?? null} />
                </div>
                <span className="shrink-0 text-muted-foreground">{t(post.when)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, background: `oklch(56% 0.22 ${SEQUENTIAL_HUE})` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">{post.reach}</span>
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {post.engagement}%
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function HeatmapCard({ grid, bestWindows }: { grid: number[][]; bestWindows: BestWindow[] }) {
  const { ui, t, lang } = useLang();
  const weekdays = WEEKDAYS[lang];
  const hasSignal = grid.some((row) => row.some((v) => v > 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.analyticsHeatmapTitle}</CardTitle>
        <CardDescription>{ui.analyticsHeatmapHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasSignal ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{ui.emptyHeatmap}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="grid min-w-[420px] grid-cols-[2.5rem_repeat(6,1fr)] gap-1">
                <div />
                {HEATMAP_WINDOWS.map((w) => (
                  <div key={w} className="label-mono pb-1 text-center text-muted-foreground">
                    {w}
                  </div>
                ))}
                {grid.map((row, d) => (
                  <Fragment key={`row-${d}`}>
                    <div className="flex items-center text-xs text-muted-foreground">{weekdays[d]}</div>
                    {row.map((score, w) => (
                      <div
                        key={`${d}-${w}`}
                        title={`${weekdays[d]} ${HEATMAP_WINDOWS[w]} · ${score}`}
                        className="aspect-square rounded-md"
                        style={{ background: score > 0 ? heatColor(score) : "var(--color-muted)" }}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
            {bestWindows.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {bestWindows.map((bw, i) => (
                  <Badge key={i} tone="primary">
                    {t(bw.day)} {bw.time}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ points, delta }: { points: TrendPoint[]; delta: number }) {
  const { ui } = useLang();
  const withData = points.filter((p) => p.value > 0);

  if (withData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ui.analyticsTrendTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">{ui.emptyAnalytics}</p>
        </CardContent>
      </Card>
    );
  }

  const w = 100;
  const h = 30;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = w / (points.length - 1 || 1);
  const coords = points.map((p, i) => [i * step, h - (p.value / max) * h] as const);
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const last = coords[coords.length - 1];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{ui.analyticsTrendTitle}</CardTitle>
        {delta !== 0 && (
          <Badge tone={delta > 0 ? "success" : "destructive"}>
            <Icon name={delta > 0 ? "trending-up" : "trending-down"} className="h-3 w-3" />
            {delta > 0 ? "+" : ""}
            {delta}%
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full overflow-visible" preserveAspectRatio="none">
          <line x1="0" y1={h} x2={w} y2={h} stroke="var(--color-border)" strokeWidth="0.3" />
          <polygon points={area} fill={`oklch(56% 0.22 ${SEQUENTIAL_HUE} / 0.10)`} />
          <polyline
            points={line}
            fill="none"
            stroke={`oklch(56% 0.22 ${SEQUENTIAL_HUE})`}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={last[0]} cy={last[1]} r="1.6" fill={`oklch(56% 0.22 ${SEQUENTIAL_HUE})`} stroke="var(--color-card)" strokeWidth="0.6" />
        </svg>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          {points.map((p) => (
            <span key={p.label}>{p.label}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export interface AnalyticsViewProps {
  reach14d: number[];
  trend: TrendPoint[];
  trendDelta: number;
  heatmap: number[][];
  bestWindows: BestWindow[];
  topPosts: TopPost[];
  topPostTiers: Record<string, MetricTier | null>;
  publishedCount: number;
  finalCount: number;
  d1Count: number;
  h6ExcludedCount: number;
}

export function AnalyticsView({
  reach14d, trend, trendDelta, heatmap, bestWindows, topPosts, topPostTiers,
  publishedCount, finalCount, d1Count, h6ExcludedCount,
}: AnalyticsViewProps) {
  const { ui } = useLang();

  const totalReach = reach14d.reduce((a, b) => a + b, 0);
  const measuredCount = finalCount + d1Count;

  // ⚠ Boş durum ZORUNLU — canlıda content_metrics adım 18'e kadar boş olacak.
  if (publishedCount === 0 || measuredCount === 0) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon name="chart-line" className="h-5 w-5" />
          </span>
          <p className="mt-4 font-medium">{ui.emptyAnalytics}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui.emptyAnalyticsHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4")}>
        <StatTile label={ui.analyticsReach14d} value={compact(totalReach)} />
        <StatTile
          label={ui.analyticsAvgEngagement}
          value={`${trend.filter((p) => p.value > 0).slice(-1)[0]?.value ?? 0}%`}
          hint={trendDelta !== 0 ? `${trendDelta > 0 ? "+" : ""}${trendDelta}%` : undefined}
        />
        <StatTile label={ui.analyticsPublished} value={String(publishedCount)} />
        <StatTile
          label={ui.analyticsMeasurement}
          value={`${finalCount} / ${d1Count}`}
          hint={ui.analyticsTierHint}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        <Icon name="info" className="mr-1 inline h-3 w-3" />
        {ui.analyticsH6Excluded} ({h6ExcludedCount})
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopPostsCard posts={topPosts} tiers={topPostTiers} />
        <HeatmapCard grid={heatmap} bestWindows={bestWindows} />
      </div>

      <TrendCard points={trend} delta={trendDelta} />
    </div>
  );
}
