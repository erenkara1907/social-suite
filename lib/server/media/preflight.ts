import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaJobStep } from "@/lib/core/types";
import { TransientJobError } from "@/lib/core/jobs/errors";
import {
  evaluateUgcPreflight, remainingUgcSteps, ugcStepVendor,
  type PreflightIssue, type UgcVendor,
} from "@/lib/core/media/preflight";
import { maxScriptCharsForClip, PERSONA_VIDEO_DURATION_DEFAULT } from "@/lib/core/providers/kie";
import { resolveProviderCredential } from "@/lib/server/credentials";

/**
 * `ugc_pipeline` ön kontrol kapısı — iş kuyruğu (cron/worker) tarafı.
 * BIRLESIM_PLANI §12 adım 20.5 FAZ A.
 *
 * Service-role — `lib/server/README.md`'nin "üç yer" kuralının 1. maddesi
 * (cron job'ları): bu modül yalnızca `lib/server/media/pipeline.ts`'ten,
 * yani worker'ın iş işleyicisinden çağrılır. Karar mantığının kendisi
 * `lib/core/media/preflight.ts`'te SAF — burası yalnızca o fonksiyonun
 * ihtiyaç duyduğu olguları (facts) TOPLAR.
 *
 * ⭐ Hiçbir vendor'a gitmez — yalnızca `provider_credentials` (Vault
 * ÜZERİNDEN, sağlayıcı henüz çağrılmadan "anahtar var mı" sorusu) ve
 * `personas`/`content_items` okur.
 */
export interface PreflightPersonaFacts {
  imageAssetId: string | null;
}

export interface CheckUgcPreflightArgs {
  brandId: string;
  personaId: string;
  persona: PreflightPersonaFacts;
  fromStep: MediaJobStep;
  contentItemId: string | null;
}

interface PersonaVoiceRow {
  default_voice_id: string | null;
}

interface ContentScriptRow {
  hook: string;
  body: string;
}

async function loadDefaultVoiceId(admin: SupabaseClient, personaId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("personas").select("default_voice_id").eq("id", personaId).maybeSingle<PersonaVoiceRow>();
  if (error) throw new TransientJobError(`preflight: personas okunamadı: ${error.message}`);
  return data?.default_voice_id ?? null;
}

async function loadScript(admin: SupabaseClient, contentItemId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("content_items").select("hook,body").eq("id", contentItemId).maybeSingle<ContentScriptRow>();
  if (error) throw new TransientJobError(`preflight: content_items okunamadı: ${error.message}`);
  if (!data) return null;
  return [data.hook, data.body].map((s) => s.trim()).filter(Boolean).join(" ") || null;
}

export async function checkUgcPreflight(admin: SupabaseClient, args: CheckUgcPreflightArgs): Promise<PreflightIssue[]> {
  const remaining = remainingUgcSteps(args.fromStep, args.contentItemId);
  const vendorsNeeded = Array.from(
    new Set(remaining.map((step) => ugcStepVendor(step)).filter((v): v is UgcVendor => v !== null)),
  );

  const credentialEntries = await Promise.all(
    vendorsNeeded.map(async (vendor): Promise<[UgcVendor, boolean]> => {
      const { apiKey } = await resolveProviderCredential(args.brandId, vendor);
      return [vendor, !!apiKey];
    }),
  );
  // Değerlendirilmemiş sağlayıcılar (bu zincirde gerekmeyen) `true` ile
  // doldurulur — `evaluateUgcPreflight` yalnızca `vendorsNeeded` için mesaj
  // üretir, bu yalnızca `Record<UgcVendor, boolean>` tipini tamamlamak için.
  const credentialConfigured = { kie: true, elevenlabs: true, fal: true } as Record<UgcVendor, boolean>;
  for (const [vendor, ok] of credentialEntries) credentialConfigured[vendor] = ok;

  const needsVoiceStep = remaining.includes("voice");
  const [defaultVoiceId, script] = await Promise.all([
    needsVoiceStep ? loadDefaultVoiceId(admin, args.personaId) : Promise.resolve(null),
    needsVoiceStep && args.contentItemId ? loadScript(admin, args.contentItemId) : Promise.resolve(null),
  ]);

  return evaluateUgcPreflight({
    fromStep: args.fromStep,
    contentItemId: args.contentItemId,
    credentialConfigured,
    personaImageAssetId: args.persona.imageAssetId,
    personaDefaultVoiceId: defaultVoiceId,
    script,
    maxScriptChars: maxScriptCharsForClip(PERSONA_VIDEO_DURATION_DEFAULT),
  });
}
