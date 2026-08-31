import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProviderCredential } from "@/lib/server/credentials";
import type { ApiErrorCode, ProviderCallOutcome } from "@/lib/core/ai/types";

/**
 * Anahtar çözümü + kullanım kaydı + doğrulama durumu — BIRLESIM_PLANI §12
 * adım 14 FAZ C. Hem `lib/adapters/live/{planner,copy}.ts` (sayfa önizlemesi,
 * kalıcılaşmaz) hem `lib/server/jobs/handlers.ts` (kuyruk — kalıcı üretim)
 * bunu kullanır, ikisi de aynı "anahtarı çöz → çağır → kaydet" koreografisini
 * tekrarlamasın diye (DRY).
 *
 * Sırasıyla:
 *   1. `resolveProviderCredential(brandId, "anthropic")` — anahtar yoksa
 *      erken döner (`missing_key`), sağlayıcı hiç ÇAĞRILMAZ.
 *   2. `call(apiKey)` — `planSkeleton`/`writeCaption` gibi saf bir fonksiyon.
 *   3. Başarılıysa: `ai_usage`'a BİR satır (FAZ A2, fiyat hesaplanmaz) +
 *      `provider_credentials.last_verified_at` güncellenir, `last_error`
 *      temizlenir (FAZ C3 — "Girilmiş" rozeti "Doğrulandı"ya geçebilsin).
 *      Başarısızsa (`missing_key` HARİÇ — o zaten bu fonksiyonun kendi erken
 *      dönüşü, denenmiş bir çağrı değil): `last_error` yazılır.
 *
 * ⚠ `detail` (`last_error`'a giden metin) RAW sağlayıcı hata metnidir.
 * `classifyAnthropicError()` zaten SDK'nın kendi `.message`'ını taşıyor —
 * worker.ts'in `sanitizeErrorMessage()` deseniyle aynı ihtiyat burada da
 * uygulanır (aşağıda).
 */

const MAX_ERROR_MESSAGE_LEN = 500;

/** worker.ts `sanitizeErrorMessage()` ile AYNI desen — iki yerde de sır
 *  sızıntısına karşı son savunma hattı olması gerektiği için kasıtlı
 *  tekrar (worker.ts `lib/server/jobs/` altında, burası `lib/server/ai/`
 *  altında; ortak bir üçüncü dosyaya taşımak bu ikisinin birbirinden
 *  BAĞIMSIZ kalması gereken tek savunma katmanı olma amacını bulanıklaştırırdı). */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /[A-Za-z0-9+/]{40,}={0,2}/g,
];

function sanitizeDetail(detail: string | undefined, code: ApiErrorCode): string {
  let msg = detail || code;
  for (const pattern of SECRET_PATTERNS) msg = msg.replace(pattern, "[REDACTED]");
  return msg.length > MAX_ERROR_MESSAGE_LEN ? `${msg.slice(0, MAX_ERROR_MESSAGE_LEN)}…` : msg;
}

export interface RunProviderCallInput {
  brandId: string;
  /** `ai_usage.kind` — iş tipiyle aynı string, ama bu fonksiyon `JobKind`'a
   *  bağımlı değil (canlı önizleme çağrısının arkasında bir iş YOK). */
  kind: "plan_generate" | "caption_write";
  model: string;
  /** Yalnızca kuyruktan gelen çağrılarda dolu — `ai_usage.job_id`. */
  jobId?: string;
}

export async function runAnthropicCall<TSuccess>(
  input: RunProviderCallInput,
  call: (apiKey: string) => Promise<ProviderCallOutcome<TSuccess>>,
): Promise<ProviderCallOutcome<TSuccess>> {
  const admin = createAdminClient();
  const { apiKey } = await resolveProviderCredential(input.brandId, "anthropic");

  if (!apiKey) {
    return { ok: false, code: "missing_key", detail: "anthropic anahtarı yapılandırılmamış" };
  }

  const outcome = await call(apiKey);

  if (outcome.ok) {
    await Promise.all([
      admin.from("ai_usage").insert({
        brand_id: input.brandId,
        job_id: input.jobId ?? null,
        kind: input.kind,
        model: input.model,
        input_tokens: outcome.usage.inputTokens,
        output_tokens: outcome.usage.outputTokens,
      }),
      admin
        .from("provider_credentials")
        .update({ last_verified_at: new Date().toISOString(), last_error: null })
        .eq("brand_id", input.brandId)
        .eq("provider", "anthropic"),
    ]);
  } else {
    await admin
      .from("provider_credentials")
      .update({ last_error: sanitizeDetail(outcome.detail, outcome.code) })
      .eq("brand_id", input.brandId)
      .eq("provider", "anthropic");
  }

  return outcome;
}
