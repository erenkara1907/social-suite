/**
 * PlannerPort — CANLI implementasyon. §12 adım 14 FAZ C.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan `runAnthropicCall()` (§8.6) çözer.
 *
 * ⚠ Bilinçli maliyet notu (adım 14 raporunda ayrıntılı): `/plan` sayfası
 * bu portu HER YÜKLEMEDE çağırıyor (adım 9 C5 kararı — sahte üretim değil,
 * demonun dürüst canlı karşılığı). Yani `APP_MODE=live` iken sayfayı her
 * ziyaret gerçek bir Anthropic çağrısı yapar. Bu ÖNİZLEME amaçlı ve
 * KALICILAŞMAZ — kalıcı üretim (content_items'a yazma, dedupe) yalnızca
 * "Planı üret" düğmesinin tetiklediği `plan_generate` kuyruk işidir
 * (`lib/server/jobs/handlers.ts`). İkisi de aynı `planSkeleton()`'u çağırır,
 * mantık tekrarlanmaz — ama gerçek anahtarla iki ayrı gerçek çağrı olabilir.
 * Bu adımın kapsamı dışında bırakılan bir optimizasyon (önbellekleme/erteleme).
 */
import type { PlannerPort } from "@/lib/adapters/ports";
import { AI_JOB_MODELS } from "@/app.config";
import { planSkeleton } from "@/lib/core/plan/skeleton";
import { runAnthropicCall } from "@/lib/server/ai/run-provider-call";

export const livePlanner: PlannerPort = {
  async generate(input) {
    if (!input.brandId) {
      return { ok: false, error: { code: "invalid_input", detail: "brandId eksik" } };
    }

    const model = AI_JOB_MODELS.plan_generate;
    const outcome = await runAnthropicCall(
      { brandId: input.brandId, kind: "plan_generate", model },
      (apiKey) => planSkeleton(input, apiKey, model),
    );

    if (!outcome.ok) return { ok: false, error: { code: outcome.code, detail: outcome.detail } };
    return { ok: true, data: { title: outcome.title, posts: outcome.posts } };
  },
};
