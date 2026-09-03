"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label, Textarea } from "@/components/ui/input";
import { ChainCard, type ChainGroup } from "@/components/app/queue-view";
import { JobsQueueStatus } from "@/components/app/jobs-queue-status";
import { cn } from "@/lib/utils";
import { CONTENT_LANGUAGE_LABEL, PLATFORM_META, type ContentItemRow, type Lang } from "@/lib/core/types";
import type { buildMonthCells, buildWeek } from "@/lib/core/derive/calendar";
import type { PlanHorizon } from "@/lib/core/plan/types";
import { AI_ERROR_COPY } from "@/lib/core/ai/error-copy";
import {
  generatePlanAction, GENERATE_PLAN_INITIAL_STATE, requestUgcAction, REQUEST_UGC_INITIAL_STATE,
} from "@/app/(app)/plan/actions";
import type { JobsSummary } from "@/lib/server/jobs/status";

type Week = ReturnType<typeof buildWeek>;
type Month = ReturnType<typeof buildMonthCells>;

/**
 * BIRLESIM_PLANI §12 adım 9 FAZ C — `/plan`.
 *
 * ⭐ C5 — bu bileşen bir Server Action ÇAĞIRMIYOR. "Planı üret" formu demo
 * modda tamamen `disabled`; sunucu tarafında da sahte bir üretim yapılmıyor
 * (sayfa yüklenirken gösterilen plan zaten `PlannerPort.demo`'nun DÜRÜST
 * çıktısı — bkz. `demoPlanSkeleton`, gerçek `buildSlots()`'u çağırıyor).
 * Gerçek "yeni tema ile yeniden üret" akışı adım 14'ün işi.
 */

/** C1 — ufuk seçimi. Link tabanlı: sayfa yeniden SSR ediliyor, istemci
 *  state'i yok — e2e için de basit, geriye/ileriye gitmek de çalışır. */
function HorizonToggle({ horizonDays }: { horizonDays: PlanHorizon }) {
  const { ui } = useLang();
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
      {([7, 30] as const).map((h) => (
        <Link
          key={h}
          href={`/plan?horizon=${h}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            h === horizonDays ? "bg-card shadow-soft text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {h === 7 ? ui.planHorizonWeek : ui.planHorizonMonth}
        </Link>
      ))}
    </div>
  );
}

/** B4 — profil eksikse görünür uyarı, /settings'e tek tıkla dönüş. */
function BrandWarning({ completion }: { completion: number }) {
  const { ui } = useLang();
  if (completion >= 100) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Icon name="circle-alert" className="h-4 w-4 shrink-0 text-warning-foreground" />
        <span>
          {ui.planBrandWarning} <span className="label-mono text-muted-foreground">({completion}%)</span>
        </span>
      </div>
      <Link href="/settings">
        <Button size="sm" variant="outline">{ui.planBrandWarningCta}</Button>
      </Link>
    </div>
  );
}

/**
 * C5 → adım 14 FAZ D — tema + üret formu. Demo modda TAMAMEN devre dışı
 * (sahte üretim yok); canlı modda `generatePlanAction`'ı çağırır (kuyruğa
 * ekler, worker'ı DOĞRUDAN tetiklemez — `app/(app)/plan/actions.ts`'in
 * yorumu). Hata FAZ B'nin `AI_ERROR_COPY`'siyle gösterilir, `detail`
 * (raw sağlayıcı metni) HİÇBİR ZAMAN render edilmez.
 */
function GenerateForm({
  defaultTheme,
  disabled,
  contentLanguage,
  horizonDays,
}: {
  defaultTheme: string;
  disabled: boolean;
  contentLanguage: Lang;
  horizonDays: PlanHorizon;
}) {
  const { ui, t } = useLang();
  const [state, formAction, pending] = useActionState(generatePlanAction, GENERATE_PLAN_INITIAL_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.planGenerateCta}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" title={disabled ? ui.planGenerateDisabledHint : undefined}>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="horizonDays" value={horizonDays} />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="theme">{ui.planThemeLabel}</Label>
              {/* ⭐ adım 10 A1 — İÇERİK dili marka alanından; arayüz dilinden
                  bağımsız (bir arayüz İngilizce iken bile içerik Türkçe olabilir). */}
              <span className="label-mono text-muted-foreground">
                {ui.planContentLanguageLabel} · {t(CONTENT_LANGUAGE_LABEL[contentLanguage])}
              </span>
            </div>
            <Textarea
              id="theme"
              name="theme"
              rows={2}
              disabled={disabled || pending}
              defaultValue={defaultTheme}
              placeholder={ui.planThemePlaceholder}
            />
          </div>
          <Button type="submit" disabled={disabled || pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon name="sparkles" className="h-4 w-4" />}
            {pending ? ui.planGenerating : ui.planGenerateCta}
          </Button>
        </form>

        {!disabled && state.status === "queued" && (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{ui.planGenerateQueued}</p>
        )}
        {!disabled && state.status === "error" && state.errorCode && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(AI_ERROR_COPY[state.errorCode])}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WeekGrid({ week }: { week: Week }) {
  const { lang, t } = useLang();
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 gap-2">
        {week.days[lang].map((d, dayIdx) => (
          <div key={dayIdx} className="space-y-1.5">
            <p className="label-mono text-center text-muted-foreground">{d.short} {d.num}</p>
            <div className="min-h-[80px] space-y-1.5">
              {week.weekPosts
                .filter((p) => p.day === dayIdx)
                .map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Icon name={PLATFORM_META[p.platform].icon} className="h-3 w-3" />
                      <span className="label-mono">{p.hour}</span>
                    </div>
                    <p className="mt-1 truncate font-medium">{t(p.title)}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ month }: { month: Month }) {
  const { lang } = useLang();
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1 text-center">
        {month.weekdays[lang].map((d) => (
          <p key={d} className="label-mono text-muted-foreground">{d}</p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {month.cells.map((cell) => (
          <div
            key={cell.key}
            className={cn(
              "min-h-[64px] rounded-lg border border-border p-1.5 text-xs",
              !cell.mo && "opacity-40",
              cell.today && "border-primary",
            )}
          >
            <p className="text-right text-muted-foreground">{cell.d}</p>
            {cell.posts.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cell.posts.map((p, i) => (
                  <span
                    key={i}
                    title={`${PLATFORM_META[p.platform].name} · ${p.time}`}
                    className="grid h-4 w-4 place-items-center rounded bg-primary/10 text-primary"
                  >
                    <Icon name={PLATFORM_META[p.platform].icon} className="h-2.5 w-2.5" />
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ⭐ C3 — ürünün en pahalı işleminin seçim arayüzü.
 *
 * Tasarım kararları:
 *  - İçerik başına net bir kontrol: her satır kendi checkbox'ını taşıyor,
 *    satırın tamamı tıklanabilir (`<label>` sarmalıyor) — hedef alanı büyük.
 *  - Sayaç HER ZAMAN görünür olduğunda (seçim > 0) ne anlama geldiğini de
 *    söylüyor ("kredi harcar") — sessiz bir sayı değil.
 *  - "Tümünü seç" bilinçli olarak KÜÇÜK, outline, üstte, checkbox'lardan
 *    fiziksel olarak ayrı — yanlışlıkla checkbox'a tıklarken basılamaz.
 *    Demo modda geri dönüşü bedelsiz (state-only) ama üretimde de aynı
 *    fiziksel ayrım korunacak. Tek tıkla YAYINLAMAZ/ÜRETMEZ — yalnızca
 *    seçim state'ini değiştirir, "Tümünü seç" bile tersinir.
 *  - Demo modda seçim yalnızca `useState`'te yaşar, DB'ye YAZILMAZ.
 */
function UgcSelectionCard({ items, demoMode }: { items: ContentItemRow[]; demoMode: boolean }) {
  const { ui } = useLang();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(requestUgcAction, REQUEST_UGC_INITIAL_STATE);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon name="clapperboard" className="h-4 w-4 text-primary" />
              {ui.planUgcTitle}
            </CardTitle>
            <CardDescription>{ui.planUgcHint}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>
              {ui.planUgcSelectAll}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              {ui.planUgcClearAll}
            </Button>
          </div>
        </div>
      </CardHeader>
      {/* ⭐ FAZ C1 — kimlikler forma HİDDEN input olarak akar; sunucu tarafı
          `requestUgcAction` bunları `activity(action='ugc_requested')`
          olarak KALICI yazar (`/studio` bu kaydı okuyup bekleyen sıraya
          koyar). Demo modda düğme yine tıklanabilir ama `demoContent.
          markUgcRequested()` no-op — port zaten savunuyor (§9.1). */}
      <form action={formAction}>
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <CardContent className="space-y-3">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
              <p className="label-mono text-primary">
                {selected.size} {ui.planUgcSelectedSuffix}
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={pending || demoMode}
                title={demoMode ? ui.studioGenerateDisabledHint : undefined}
                className="gap-1.5"
              >
                <Icon name={pending ? "loader-circle" : "send"} className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
                {ui.planUgcRequestCta}
              </Button>
            </div>
          )}
          {state.status === "queued" && (
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              {state.count} {ui.planUgcRequestQueued}
            </p>
          )}
          {state.status === "error" && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{ui.planUgcRequestError}</p>
          )}

          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{ui.planEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const platform = PLATFORM_META[item.platform];
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon name={platform.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{item.title}</span>
                          <Badge tone="neutral">
                            {item.day_offset !== null ? `+${item.day_offset}g` : ""} {item.time_of_day}
                          </Badge>
                        </span>
                        {item.hook && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.hook}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </form>
    </Card>
  );
}

export function PlanView({
  horizonDays,
  planTitle,
  planItems,
  week,
  month,
  chains,
  completion,
  generateDisabled,
  ugcDemoMode,
  defaultTheme,
  contentLanguage,
  jobsSummary,
}: {
  horizonDays: PlanHorizon;
  planTitle: string;
  planItems: ContentItemRow[];
  week: Week | null;
  month: Month | null;
  chains: ChainGroup[];
  completion: number;
  generateDisabled: boolean;
  /** adım 20 FAZ C1 — video portu demo modda mı (UGC isteği ikinci katman
   *  savunması, `requestUgcAction`'ın aynı kontrolüyle eşleşir). */
  ugcDemoMode: boolean;
  defaultTheme: string;
  contentLanguage: Lang;
  /** adım 14 FAZ D — "Planı üret" kuyruğa eklendikten sonra kullanıcının
   *  takip edeceği panel (adım 12'nin `/queue`'daki paneliyle aynı bileşen). */
  jobsSummary: JobsSummary;
}) {
  const { ui } = useLang();

  return (
    <div className="space-y-6">
      <BrandWarning completion={completion} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{planTitle}</h1>
          {/* ⭐ C1 — gerçek slot sayısı, dokümandaki "~39" değil ölçülen değer. */}
          <p className="label-mono mt-0.5 text-muted-foreground">
            {planItems.length} {ui.planSlotCount}
          </p>
        </div>
        <HorizonToggle horizonDays={horizonDays} />
      </div>

      <GenerateForm
        defaultTheme={defaultTheme}
        disabled={generateDisabled}
        contentLanguage={contentLanguage}
        horizonDays={horizonDays}
      />

      {!generateDisabled && <JobsQueueStatus summary={jobsSummary} />}

      <Card>
        <CardContent className="pt-5">
          {week && <WeekGrid week={week} />}
          {month && <MonthGrid month={month} />}
        </CardContent>
      </Card>

      <ChainCard chains={chains} title={ui.planChainTitle} description={ui.planChainHint} />

      <UgcSelectionCard items={planItems} demoMode={ugcDemoMode} />
    </div>
  );
}
