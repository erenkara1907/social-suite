"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * `/studio/personas` — BIRLESIM_PLANI §12 adım 10 FAZ B.
 *
 * ⚠ B1 — sahne'nin iki tuzağına düşülmedi:
 *   1. Bu bileşen hiçbir dosyaya YAZMIYOR. Persona verisi sunucudan
 *      (`VideoPort.listPersonas()`, demo modda fixture) prop olarak geliyor;
 *      Vercel'de salt-okunur dosya sistemi hiç devreye girmiyor.
 *   2. Buradan hiçbir API rotası çağrılmıyor — "Yeni persona" düğmesi
 *      `disabled`, tıklanınca hiçbir isteğe yol açmıyor.
 *
 * ⭐ B2 — prompt her zaman GÖRÜNÜR (KESIF_SAHNE §9: "AI görünmeyen UGC
 * selfie" prompt'u ürünün en değerli varlığı, 10 kez elle ayarlanmış).
 * Gizlenip bir "detay" tıklamasının arkasına saklanmadı — kart açılır
 * açılmaz görünsün diye.
 */

export interface PersonaCardView {
  id: string;
  name: string;
  /** `name`'in " — " sonrası kısmı — "Mira — barista" → "barista". Yoksa boş. */
  role: string;
  prompt: string;
  imageUrl: string | null;
  usedInCount: number;
}

export function PersonaStudioView({
  personas,
  newPersonaDisabled,
}: {
  personas: PersonaCardView[];
  newPersonaDisabled: boolean;
}) {
  const { ui } = useLang();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/studio"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left" className="h-3.5 w-3.5" />
            {ui.studioBackToStudio}
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight">{ui.studioPersonasTitle}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{ui.studioPersonasHint}</p>
        </div>
        <Button type="button" variant="outline" disabled={newPersonaDisabled} title={ui.studioNewPersonaDisabledHint} className="gap-2">
          <Icon name="user-plus" className="h-4 w-4" />
          {ui.studioNewPersona}
        </Button>
      </div>

      {personas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{ui.studioPersonasEmpty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <Card key={persona.id} className="flex flex-col overflow-hidden">
              <div className="aspect-[9/16] w-full bg-muted">
                {persona.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- demo asset, local /public path
                  <img src={persona.imageUrl} alt={persona.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-muted-foreground">
                    <Icon name="user-round" className="h-8 w-8" />
                  </div>
                )}
              </div>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{persona.name}</CardTitle>
                  <Badge tone={persona.usedInCount > 0 ? "primary" : "neutral"}>
                    {persona.usedInCount} {ui.studioPersonasUsedIn}
                  </Badge>
                </div>
                {persona.role && <CardDescription>{persona.role}</CardDescription>}
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                <p className="label-mono mb-1.5 text-muted-foreground">{ui.studioPersonasPromptLabel}</p>
                <blockquote className="rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs leading-relaxed text-foreground">
                  {persona.prompt}
                </blockquote>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
