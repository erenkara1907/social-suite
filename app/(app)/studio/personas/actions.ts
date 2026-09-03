"use server";

import { revalidatePath } from "next/cache";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { isDemo, port } from "@/lib/adapters";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import type { PersonaRow } from "@/lib/core/types";

/**
 * "Yeni persona" formu — BIRLESIM_PLANI §12 adım 20 FAZ A.
 *
 * ⭐ `videoPort.createPersona()` KENDİSİ persona satırını yazar VE
 * `persona_image` adımını kuyruğa sokar (bkz. `lib/adapters/live/video.ts`)
 * — bu action ikinci bir enqueue YAPMAZ, yalnızca form verisini geçirir.
 * Kill switch/rate limit kontrolü `createPersona()`'nın içindeki
 * `enqueue()`'da zaten var.
 */
export interface CreatePersonaActionState {
  status: "idle" | "created" | "error";
  errorCode: ApiErrorCode | null;
  persona: Pick<PersonaRow, "id" | "name"> | null;
}

export const CREATE_PERSONA_INITIAL_STATE: CreatePersonaActionState = {
  status: "idle",
  errorCode: null,
  persona: null,
};

export async function createPersonaAction(
  _prev: CreatePersonaActionState,
  formData: FormData,
): Promise<CreatePersonaActionState> {
  await requireBrand();
  const overrides = await requestModeOverrides();

  if (isDemo("video", overrides)) {
    return { status: "error", errorCode: "not_configured", persona: null };
  }

  const name = String(formData.get("name") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const defaultVoiceId = String(formData.get("defaultVoiceId") ?? "").trim();
  if (!name || !prompt) {
    return { status: "error", errorCode: "invalid_input", persona: null };
  }

  const videoPort = port("video", overrides);
  const result = await videoPort.createPersona({
    name,
    prompt,
    defaultVoiceId: defaultVoiceId || undefined,
  });
  if (!result.ok) return { status: "error", errorCode: result.error.code, persona: null };

  revalidatePath("/studio/personas");
  revalidatePath("/studio");
  return { status: "created", errorCode: null, persona: { id: result.data.id, name: result.data.name } };
}
