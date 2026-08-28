"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/i18n/language-provider";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { MAX_LENGTH } from "@/lib/core/brand/types";
import { createBrandAction, type OnboardingState } from "./actions";

const INITIAL: OnboardingState = { errorKey: null };

export function OnboardingForm() {
  const { ui } = useLang();
  const [state, formAction, pending] = useActionState(createBrandAction, INITIAL);

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="absolute right-5 top-5">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-sm space-y-7">
        <Logo />

        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {ui.onboardingTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {ui.onboardingHint}
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{ui.brandNameLabel}</Label>
            <Input
              id="name"
              name="name"
              required
              autoFocus
              maxLength={MAX_LENGTH.name}
              placeholder={ui.brandNamePlaceholder}
            />
          </div>

          {state.errorKey && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ui[state.errorKey]}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? ui.creatingBrand : ui.createBrandCta}
          </Button>
        </form>
      </div>
    </main>
  );
}
