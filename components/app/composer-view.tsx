"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { KIND_LABEL, PLATFORM_META, PLATFORMS, POST_KINDS } from "@/lib/core/types";
import { createComposerContentAction, type ComposerActionState } from "@/app/(app)/composer/actions";

// ⭐ adım 20.5 FAZ C1 dersi — başlangıç state sabiti BURADA, actions.ts'te
// DEĞİL ("use server" dosyaları yalnızca async fonksiyon export edebilir).
const COMPOSER_INITIAL_STATE: ComposerActionState = {
  status: "idle",
  errorKey: null,
  duplicateWarning: null,
  savedTitle: null,
};

export interface ComposerParentOption {
  id: string;
  title: string;
  chainPosition: number;
}

const ERROR_MESSAGE: Record<NonNullable<ComposerActionState["errorKey"]>, { tr: string; en: string }> = {
  errComposerTitleRequired: { tr: "Başlık gerekli.", en: "Title is required." },
  errComposerPlatformInvalid: { tr: "Geçerli bir platform seç.", en: "Choose a valid platform." },
  errComposerSaveFailed: { tr: "Kaydedilemedi, tekrar dene.", en: "Could not save, try again." },
};

export function ComposerView({
  parentOptions,
  ugcDisabled,
}: {
  parentOptions: ComposerParentOption[];
  ugcDisabled: boolean;
}) {
  const { ui, lang } = useLang();
  const [state, formAction, pending] = useActionState(createComposerContentAction, COMPOSER_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") formRef.current?.reset();
  }, [state.status, state.savedTitle]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{ui.composerTitle}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{ui.composerHint}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ui.composerFormTitle}</CardTitle>
          <CardDescription>{ui.composerFormHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="composer-title" className="text-sm font-medium">
                {ui.composerFieldTitle}
              </label>
              <input
                id="composer-title"
                name="title"
                required
                disabled={pending}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="composer-platform" className="text-sm font-medium">
                  {ui.composerFieldPlatform}
                </label>
                <select
                  id="composer-platform"
                  name="platform"
                  disabled={pending}
                  defaultValue={PLATFORMS[0]}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_META[p].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="composer-kind" className="text-sm font-medium">
                  {ui.composerFieldKind}
                </label>
                <select
                  id="composer-kind"
                  name="kind"
                  disabled={pending}
                  defaultValue="text"
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {POST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k][lang]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="composer-hook" className="text-sm font-medium">
                {ui.composerFieldHook}
              </label>
              <input
                id="composer-hook"
                name="hook"
                disabled={pending}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="composer-body" className="text-sm font-medium">
                {ui.composerFieldBody}
              </label>
              <textarea
                id="composer-body"
                name="body"
                rows={5}
                disabled={pending}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="composer-hashtags" className="text-sm font-medium">
                {ui.composerFieldHashtags}
              </label>
              <input
                id="composer-hashtags"
                name="hashtags"
                placeholder="#kahve #ugc"
                disabled={pending}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="composer-scheduled" className="text-sm font-medium">
                  {ui.composerFieldScheduledAt}
                </label>
                <input
                  id="composer-scheduled"
                  name="scheduledAt"
                  type="datetime-local"
                  disabled={pending}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="composer-parent" className="text-sm font-medium">
                  {ui.composerFieldParent}
                </label>
                <select
                  id="composer-parent"
                  name="parentId"
                  disabled={pending}
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="">{ui.composerParentNone}</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requestUgc" disabled={pending || ugcDisabled} className="h-4 w-4 rounded border-border" />
              {ui.composerFieldRequestUgc}
              {ugcDisabled && <span className="text-xs text-muted-foreground">({ui.composerRequestUgcDisabledHint})</span>}
            </label>

            <Button type="submit" disabled={pending} className="gap-2">
              <Icon name="save" className="h-4 w-4" />
              {pending ? ui.composerSaving : ui.composerSubmit}
            </Button>

            {state.status === "error" && state.errorKey && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ERROR_MESSAGE[state.errorKey][lang]}
              </p>
            )}

            {state.status === "saved" && (
              <div role="status" className="space-y-1 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                <p>
                  {ui.composerSavedMessage} — <strong>{state.savedTitle}</strong>
                </p>
                <Link href="/queue" className="inline-flex items-center gap-1 underline">
                  {ui.composerViewInQueue}
                  <Icon name="arrow-right" className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {state.status === "saved" && state.duplicateWarning && (
              <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                <Icon name="shield-alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {state.duplicateWarning}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
