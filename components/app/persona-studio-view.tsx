"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { TurkishVoice } from "@/lib/core/providers/elevenlabs";
import { DEFAULT_PERSONA_PROMPT_TR } from "@/lib/core/providers/persona-prompt";
import { createPersonaAction, CREATE_PERSONA_INITIAL_STATE } from "@/app/(app)/studio/personas/actions";

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

/** FAZ A — "yeni persona" formu. Prompt textarea `DEFAULT_PERSONA_PROMPT_TR`
 *  ile başlar (KESIF_SAHNE §9'un elle ayarlanmış metni), kullanıcı isterse
 *  düzenler. Ses seçimi OPSİYONEL — `createPersona()`'nın `defaultVoiceId`si
 *  isteğe bağlı, ElevenLabs anahtarı yoksa `voices` boş gelir. */
function NewPersonaForm({ voices, onCreated }: { voices: TurkishVoice[]; onCreated: () => void }) {
  const { ui } = useLang();
  const [state, formAction, pending] = useActionState(createPersonaAction, CREATE_PERSONA_INITIAL_STATE);

  useEffect(() => {
    if (state.status === "created") onCreated();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated intentionally not tracked, only status transitions should trigger this
  }, [state.status]);

  return (
    <Card className="p-4">
      <form action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="persona-name" className="text-sm font-medium">
            {ui.studioNewPersonaNameLabel}
          </label>
          <input
            id="persona-name"
            name="name"
            required
            disabled={pending}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            placeholder={ui.studioNewPersonaNamePlaceholder}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="persona-prompt" className="text-sm font-medium">
            {ui.studioPersonasPromptLabel}
          </label>
          <textarea
            id="persona-prompt"
            name="prompt"
            required
            disabled={pending}
            defaultValue={DEFAULT_PERSONA_PROMPT_TR}
            rows={6}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
          />
        </div>

        {voices.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="persona-voice" className="text-sm font-medium">
              {ui.studioNewPersonaVoiceLabel}
            </label>
            <select
              id="persona-voice"
              name="defaultVoiceId"
              disabled={pending}
              defaultValue=""
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">{ui.studioNewPersonaVoiceNone}</option>
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" disabled={pending} className="gap-2">
          <Icon name="user-plus" className="h-4 w-4" />
          {ui.studioNewPersona}
        </Button>

        {state.status === "error" && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ui.studioNewPersonaError}
          </p>
        )}
      </form>
    </Card>
  );
}

export function PersonaStudioView({
  personas,
  voices,
  newPersonaDisabled,
}: {
  personas: PersonaCardView[];
  /** FAZ A — persona oluşturma formunun opsiyonel ses seçici listesi. */
  voices: TurkishVoice[];
  newPersonaDisabled: boolean;
}) {
  const { ui } = useLang();
  const [formOpen, setFormOpen] = useState(false);

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
        <Button
          type="button"
          variant="outline"
          disabled={newPersonaDisabled}
          title={newPersonaDisabled ? ui.studioNewPersonaDisabledHint : undefined}
          onClick={() => setFormOpen((v) => !v)}
          className="gap-2"
        >
          <Icon name="user-plus" className="h-4 w-4" />
          {ui.studioNewPersona}
        </Button>
      </div>

      {!newPersonaDisabled && formOpen && (
        <NewPersonaForm voices={voices} onCreated={() => setFormOpen(false)} />
      )}

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
