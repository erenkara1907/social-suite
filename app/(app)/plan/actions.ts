"use server";

import { revalidatePath } from "next/cache";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { isDemo, port } from "@/lib/adapters";
import { enqueue } from "@/lib/server/jobs/enqueue";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import type { PlanHorizon } from "@/lib/core/plan/types";

/**
 * "Planı üret" düğmesi — BIRLESIM_PLANI §12 adım 14 FAZ D.
 *
 * ⭐ Kuyruk üzerinden, WORKER'I DOĞRUDAN TETİKLEMEZ. Karar + gerekçe (adım
 * 14 raporunda ayrıntılı): cron hâlâ pasif (§17'ye kadar), ama düğmenin
 * isteği bloke edip senkron bir Anthropic çağrısını (10-20sn) beklemesi
 * TAM OLARAK adım 12/13'ün kurduğu kuyruk altyapısının (yeniden deneme,
 * hız sınırı, kill switch, görünürlük) çözdüğü sorunu tekrarlardı. Bu
 * adımda worker `/api/cron/worker`'a elle tetiklenerek test edilir —
 * üretimde cron aktive olunca (adım 17) kullanıcı hiçbir şey fark etmez,
 * yalnızca "kuyrukta" süresi kısalır.
 *
 * ⭐ Demo mod ikinci katman savunması — `GenerateForm`'un düğmesi zaten
 * `disabled`, ama bir server action her zaman doğrudan POST edilebilir.
 * `proxy.ts`'in guard deseniyle aynı ihtiyat: UI'ya güvenme, sunucuda da
 * kontrol et.
 */

export interface GeneratePlanActionState {
  status: "idle" | "queued" | "error";
  errorCode: ApiErrorCode | null;
  jobId: string | null;
}

export const GENERATE_PLAN_INITIAL_STATE: GeneratePlanActionState = {
  status: "idle",
  errorCode: null,
  jobId: null,
};

function parseHorizonField(raw: FormDataEntryValue | null): PlanHorizon {
  return raw === "30" ? 30 : 7;
}

export async function generatePlanAction(
  _prev: GeneratePlanActionState,
  formData: FormData,
): Promise<GeneratePlanActionState> {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  if (isDemo("planner", overrides)) {
    return { status: "error", errorCode: "not_configured", jobId: null };
  }

  const theme = String(formData.get("theme") ?? "").trim();
  if (!theme) return { status: "error", errorCode: "invalid_input", jobId: null };

  const horizonDays = parseHorizonField(formData.get("horizonDays"));

  const result = await enqueue(
    brand.id,
    "plan_generate",
    { theme, horizonDays, lang: brand.contentLanguage, mode: "weekly", startIso: new Date().toISOString() },
    // Aynı ufuk için art arda tıklamalar tek işe düşer — enqueue_job()'un
    // dedupe_key'i (queued/running iken) ikinci satırı hiç AÇMAZ.
    { dedupeKey: `plan_generate:${brand.id}:${horizonDays}` },
  );

  if (!result.ok) return { status: "error", errorCode: result.error.code, jobId: null };

  // İş kuyruğu paneli (JobsQueueStatus) yeni işi görsün diye.
  revalidatePath("/plan");
  return { status: "queued", errorCode: null, jobId: result.data.id };
}

/**
 * "UGC videosu iste" düğmesi — BIRLESIM_PLANI §12 adım 20 FAZ C1.
 *
 * ⭐ ADIM_9 varsayım 5'in kapanışı: seçim artık `activity(action=
 * 'ugc_requested')` satırlarıyla KALICI — sayfa değişince kaybolmuyor.
 * `/studio` bu satırları `contentPort.listUgcRequested()` ile okuyup
 * "bekleyen istekler" sırasını gösterir (`app/(app)/studio/page.tsx`).
 *
 * Bu, VİDEO ÜRETMEZ — yalnızca "bunu üretmek istiyorum" niyetini kaydeder.
 * Gerçek üretim (para harcayan adım) `/studio`'daki ayrı bir düğmeyle,
 * persona seçildikten SONRA başlar (`app/(app)/studio/actions.ts`
 * `generateUgcAction`) — bu ayrım kasıtlı: seçim ücretsiz, üretim değil.
 */
export interface RequestUgcActionState {
  status: "idle" | "queued" | "error";
  count: number;
}

export const REQUEST_UGC_INITIAL_STATE: RequestUgcActionState = { status: "idle", count: 0 };

export async function requestUgcAction(
  _prev: RequestUgcActionState,
  formData: FormData,
): Promise<RequestUgcActionState> {
  await requireBrand();
  const overrides = await requestModeOverrides();

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { status: "error", count: 0 };

  const contentPort = port("content", overrides);
  const result = await contentPort.markUgcRequested(ids);
  if (!result.ok) return { status: "error", count: 0 };

  revalidatePath("/plan");
  revalidatePath("/studio");
  return { status: "queued", count: result.data };
}
