"use server";

import { revalidatePath } from "next/cache";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { isDemo, port } from "@/lib/adapters";
import type { ApiErrorCode } from "@/lib/core/ai/types";

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
 */
export interface GenerateUgcActionState {
  status: "idle" | "queued" | "error";
  errorCode: ApiErrorCode | null;
}

export const GENERATE_UGC_INITIAL_STATE: GenerateUgcActionState = {
  status: "idle",
  errorCode: null,
};

export async function generateUgcAction(
  _prev: GenerateUgcActionState,
  formData: FormData,
): Promise<GenerateUgcActionState> {
  await requireBrand();
  const overrides = await requestModeOverrides();

  if (isDemo("video", overrides)) {
    return { status: "error", errorCode: "not_configured" };
  }

  const contentItemId = String(formData.get("contentItemId") ?? "").trim();
  const personaId = String(formData.get("personaId") ?? "").trim();
  if (!contentItemId || !personaId) {
    return { status: "error", errorCode: "invalid_input" };
  }

  const videoPort = port("video", overrides);
  const result = await videoPort.start({ contentItemId, personaId, step: "persona_video" });
  if (!result.ok) return { status: "error", errorCode: result.error.code };

  revalidatePath("/studio");
  revalidatePath("/plan");
  return { status: "queued", errorCode: null };
}
