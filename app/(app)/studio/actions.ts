"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { isDemo, port } from "@/lib/adapters";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import { maxScriptCharsForClip, PERSONA_VIDEO_DURATION_DEFAULT } from "@/lib/core/providers/kie";
import { evaluateUgcPreflight, type UgcVendor } from "@/lib/core/media/preflight";
import { isProviderConfigured } from "@/lib/server/credentials";

/**
 * "Üret" düğmesi — BIRLESIM_PLANI §12 adım 20 FAZ C.
 *
 * ⭐ Burada GERÇEKTEN para harcanır. `videoPort.start()` çağrısı `step:
 * "persona_video"` ile başlar — `persona_image` bu üretimin parçası DEĞİL,
 * personanın KENDİSİ oluşturulurken bir kere yapıldı (`lib/adapters/live/
 * video.ts` `createPersona()`). Maliyet uyarısı `StudioView`'da düğmenin
 * hemen üstünde, tıklamadan ÖNCE görünür (`studioGenerateCostWarning`).
 *
 * Demo mod ikinci katman savunması: `StudioView`'daki düğme zaten
 * `disabled`, ama bir server action her zaman doğrudan POST edilebilir —
 * `requestUgcAction`/`generatePlanAction` ile aynı ihtiyat.
 *
 * ⚠ adım 20.5 FAZ C1 — başlangıç state sabiti BURADA DEĞİL, `StudioView`'da
 * (bkz. `app/(app)/plan/actions.ts`'in aynı düzeltmesi: "use server"
 * dosyaları yalnızca async fonksiyon export edebilir).
 */
export interface GenerateUgcActionState {
  status: "idle" | "queued" | "error";
  errorCode: ApiErrorCode | null;
  /** BIRLESIM_PLANI §12 adım 20.5 FAZ A — ön kontrol hangi maddede takıldı,
   *  kullanıcıya ONU söyler (genel bir "hata oluştu" değil). */
  detail: string | null;
}

interface PersonaPreflightRow {
  image_asset_id: string | null;
  default_voice_id: string | null;
}

interface ContentPreflightRow {
  hook: string;
  body: string;
}

/**
 * FAZ A — kullanıcı OTURUMUYLA (RLS'ten geçer, service-role YOK) aynı ön
 * kontrolü `lib/core/media/preflight.ts`'in SAF kurallarına uygular.
 * `lib/server/media/preflight.ts` (job kuyruğu, service-role) ile AYNI karar
 * mantığını paylaşır — burada yalnızca "olguları" (facts) TOPLAMA yolu
 * farklı: iş kuyruğu servis-rolüyle, burası kullanıcının kendi oturumuyla.
 * Amaç: kullanıcı "üret"e basar basmaz, iş kuyruğa girip persona_video
 * (pahalı) dispatch edilmeden ÖNCE aynı hatayı görsün — iş zaten bunu
 * yapıyor ama kuyruğa bir kez girip `dead`e düşmesini beklemek yerine.
 */
async function collectPreflightIssuesForUser(brandId: string, personaId: string, contentItemId: string) {
  const supabase = await createClient();

  const [persona, item, kieOk, elevenlabsOk, falOk] = await Promise.all([
    supabase.from("personas").select("image_asset_id,default_voice_id").eq("id", personaId).maybeSingle<PersonaPreflightRow>(),
    supabase.from("content_items").select("hook,body").eq("id", contentItemId).maybeSingle<ContentPreflightRow>(),
    isProviderConfigured(brandId, "kie"),
    isProviderConfigured(brandId, "elevenlabs"),
    isProviderConfigured(brandId, "fal"),
  ]);

  const script = persona.data && item.data
    ? [item.data.hook, item.data.body].map((s) => s.trim()).filter(Boolean).join(" ") || null
    : null;

  const credentialConfigured: Record<UgcVendor, boolean> = { kie: kieOk, elevenlabs: elevenlabsOk, fal: falOk };

  return evaluateUgcPreflight({
    fromStep: "persona_video",
    contentItemId,
    credentialConfigured,
    personaImageAssetId: persona.data?.image_asset_id ?? null,
    personaDefaultVoiceId: persona.data?.default_voice_id ?? null,
    script,
    maxScriptChars: maxScriptCharsForClip(PERSONA_VIDEO_DURATION_DEFAULT),
  });
}

export async function generateUgcAction(
  _prev: GenerateUgcActionState,
  formData: FormData,
): Promise<GenerateUgcActionState> {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  if (isDemo("video", overrides)) {
    return { status: "error", errorCode: "not_configured", detail: null };
  }

  const contentItemId = String(formData.get("contentItemId") ?? "").trim();
  const personaId = String(formData.get("personaId") ?? "").trim();
  if (!contentItemId || !personaId) {
    return { status: "error", errorCode: "invalid_input", detail: null };
  }

  const issues = await collectPreflightIssuesForUser(brand.id, personaId, contentItemId);
  if (issues.length > 0) {
    return { status: "error", errorCode: "missing_key", detail: issues.map((i) => i.message).join(" · ") };
  }

  const videoPort = port("video", overrides);
  const result = await videoPort.start({ contentItemId, personaId, step: "persona_video" });
  if (!result.ok) return { status: "error", errorCode: result.error.code, detail: result.error.detail ?? null };

  revalidatePath("/studio");
  revalidatePath("/plan");
  return { status: "queued", errorCode: null, detail: null };
}
