/**
 * Katman 3, Kontrol 3c — "bu, FARKLI bir yönü mü anlatıyor, yoksa aynı fikri
 * mi tekrarlıyor?" BIRLESIM_PLANI §12 adım 15, Akış E.
 *
 * `lib/core/ai/caption.ts` / `lib/core/plan/skeleton.ts` ile AYNI desen:
 * apiKey parametre (§8.6), model parametre (app.config.ts tek değiştirme
 * noktası — `AI_JOB_MODELS.continuation_judge`), hata sınıflandırması ortak
 * (`classifyAnthropicError`). Ucuz + `effort: "low"` — caption.ts:95
 * deseninin aynısı, çünkü bu tek bir evet/hayır + kısa bir ifade.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ProviderCallOutcome } from "@/lib/core/ai/types";
import { classifyAnthropicError } from "@/lib/core/ai/classify-error";

const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = [
  "You compare two pieces of social content for the same brand.",
  "Decide whether the NEW candidate is a genuine continuation of the EXISTING post: it must cover a clearly",
  "different angle, feature, or story beat — not restate the same idea in different words.",
  "If the candidate is materially the same idea reworded, it is NOT a continuation.",
].join(" ");

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    isContinuation: { type: "boolean" },
    aspect: {
      type: "string",
      description: "One short phrase naming the different angle the candidate covers, or '' when isContinuation is false.",
    },
  },
  required: ["isContinuation", "aspect"],
  additionalProperties: false,
} as const;

export interface ContinuationJudgeInput {
  candidateTitle: string;
  candidateHook: string;
  neighborTitle: string;
  neighborHook: string;
}

export type ContinuationJudgeOutcome = ProviderCallOutcome<{ isContinuation: boolean; aspect: string }>;

function buildPrompt(input: ContinuationJudgeInput): string {
  return [
    "EXISTING (already published):",
    `Title: ${input.neighborTitle}`,
    `Hook: ${input.neighborHook}`,
    "",
    "NEW candidate:",
    `Title: ${input.candidateTitle}`,
    `Hook: ${input.candidateHook}`,
  ].join("\n");
}

function readVerdict(text: string): { isContinuation: boolean; aspect: string } | null {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) return null;
  const { isContinuation, aspect } = parsed as Record<string, unknown>;
  if (typeof isContinuation !== "boolean" || typeof aspect !== "string") return null;
  return { isContinuation, aspect };
}

export async function judgeContinuation(
  input: ContinuationJudgeInput,
  apiKey: string,
  model: string,
): Promise<ContinuationJudgeOutcome> {
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: JUDGE_SCHEMA },
      },
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, code: "refused", detail: message.stop_details?.explanation ?? undefined };
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      return { ok: false, code: "upstream_error", detail: `empty response (${message.stop_reason})` };
    }

    const verdict = readVerdict(textBlock.text);
    if (!verdict) {
      return { ok: false, code: "upstream_error", detail: "response did not match the continuation schema" };
    }

    return {
      ok: true,
      ...verdict,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  } catch (error) {
    const { code, detail } = classifyAnthropicError(error);
    console.error("[dedupe/judge-continuation]", code, detail);
    return { ok: false, code, detail };
  }
}
