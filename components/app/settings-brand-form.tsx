"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { BRAND_LABEL, BRAND_PLACEHOLDER, MAX_LENGTH } from "@/lib/core/brand/types";
import { COMMON_TIMEZONES } from "@/lib/core/tz";
import { saveBrandAction, type SettingsState } from "@/app/(app)/settings/actions";
import type { OwnedBrand } from "@/lib/server/auth";

/** "use server" dosyaları yalnızca async fonksiyon export edebilir — bu sabit
 *  o yüzden burada, actions.ts'te değil (Next.js kısıtı, e2e'de yakalandı). */
const SETTINGS_INITIAL_STATE: SettingsState = { errorKey: null, savedAt: null };

/** BRAND_FIELDS sırasıyla aynı — `name`/`industry` üstte (Input), geri kalanı altta (Textarea). */
const TEXTAREA_FIELDS = ["description", "products", "audience", "voice", "keywords", "links"] as const;

export function SettingsBrandForm({ brand, completion }: { brand: OwnedBrand; completion: number }) {
  const { ui, t } = useLang();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveBrandAction, SETTINGS_INITIAL_STATE);

  // Kaydetme başarılıysa: sunucu bileşenini tazele (tamamlanma yüzdesi ve
  // /plan'ın okuyacağı revalidatePath'lenmiş sayfalar güncel gelsin).
  useEffect(() => {
    if (state.savedAt) router.refresh();
  }, [state.savedAt, router]);

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{ui.settingsBrandTitle}</CardTitle>
          <CardDescription>{ui.settingsBrandHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span>{ui.settingsBrandRealNote}</span>
            <span className="label-mono shrink-0 font-medium text-foreground">
              {ui.brandCompletionLabel} · {completion}%
            </span>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t(BRAND_LABEL.name)}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={MAX_LENGTH.name}
                  defaultValue={brand.name}
                  placeholder={t(BRAND_PLACEHOLDER.name)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timezone">{ui.fieldTimezoneLabel}</Label>
                <select
                  id="timezone"
                  name="timezone"
                  required
                  defaultValue={brand.timezone}
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-colors"
                >
                  {/* DB'deki değer listede yoksa (göç edilmiş bir hesap) yine de bir seçenek olarak görünsün. */}
                  {!(COMMON_TIMEZONES as readonly string[]).includes(brand.timezone) && (
                    <option value={brand.timezone}>{brand.timezone}</option>
                  )}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="industry">{t(BRAND_LABEL.industry)}</Label>
                <Input
                  id="industry"
                  name="industry"
                  maxLength={MAX_LENGTH.industry}
                  defaultValue={brand.industry}
                  placeholder={t(BRAND_PLACEHOLDER.industry)}
                />
              </div>
            </div>

            {TEXTAREA_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={field}>{t(BRAND_LABEL[field])}</Label>
                <Textarea
                  id={field}
                  name={field}
                  rows={field === "keywords" || field === "links" ? 2 : 3}
                  maxLength={MAX_LENGTH[field]}
                  defaultValue={brand[field]}
                  placeholder={t(BRAND_PLACEHOLDER[field])}
                />
              </div>
            ))}

            {state.errorKey && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ui[state.errorKey]}
              </p>
            )}

            {!state.errorKey && state.savedAt && (
              <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                {ui.settingsSaved}
              </p>
            )}

            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? ui.saving : ui.save}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
