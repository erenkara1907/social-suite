/**
 * CopyPort — CANLI implementasyon. §12 adım 14 FAZ C.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan `runAnthropicCall()` (§8.6) çözer.
 *
 * Bugünkü tek gerçek çağıran `caption_write` kuyruk işi
 * (`lib/server/jobs/handlers.ts`, kendi `writeCaption()` çağrısını doğrudan
 * yapıyor — brand profili zaten elinde). Bu port `/composer` (adım 11b) gibi
 * doğrudan-sayfa çağıranlar için hazır.
 */
import type { CopyPort } from "@/lib/adapters/ports";
import { AI_JOB_MODELS } from "@/app.config";
import { writeCaption } from "@/lib/core/ai/caption";
import { toPromptBlock } from "@/lib/core/brand/types";
import { runAnthropicCall } from "@/lib/server/ai/run-provider-call";

export const liveCopy: CopyPort = {
  async write(input) {
    if (!input.brandId) {
      return { ok: false, error: { code: "invalid_input", detail: "brandId eksik" } };
    }

    const model = AI_JOB_MODELS.caption_write;
    const outcome = await runAnthropicCall(
      { brandId: input.brandId, kind: "caption_write", model },
      (apiKey) =>
        writeCaption(
          {
            idea: input.idea,
            channel: input.channel,
            tone: input.tone,
            lang: input.lang,
            brand: toPromptBlock(input.brand, input.lang),
          },
          apiKey,
          model,
        ),
    );

    if (!outcome.ok) return { ok: false, error: { code: outcome.code, detail: outcome.detail } };
    return { ok: true, data: outcome.draft };
  },
};
