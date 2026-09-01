/**
 * ← threadly/lib/ai/caption.ts
 * Uyarlama: `Channel` → `PlanChannel` ve CHANNEL_BRIEF anahtarları §1.2 gereği
 * küçük harfe; istem satırı görünen etiketi `PLATFORM_META`'dan alıyor.
 * apiKey zaten parametreydi (§8.6 uyumlu) — dokunulmadı.
 *
 * Server-only caption writing. Shared by /api/caption (one-off drafting in the
 * Composer) and /api/plan/post (filling in a planned post), so the prompt and
 * the output schema live in exactly one place.
 */
import Anthropic from "@anthropic-ai/sdk";
import { PLATFORM_META, type Lang, type PlanChannel } from "@/lib/core/types";
import type { CaptionDraft, ProviderCallOutcome } from "@/lib/core/ai/types";
import { classifyAnthropicError } from "@/lib/core/ai/classify-error";

const MAX_TOKENS = 8000;

export const CHANNEL_BRIEF: Record<PlanChannel, string> = {
  x: "One post, under 280 characters. Punchy hook on line one, short lines, no more than two hashtags.",
  linkedin:
    "150-900 characters. Hook on line one, blank lines between short paragraphs, exactly one CTA at the close, two hashtags.",
  instagram:
    "Under 400 characters. Scroll-stopping first line, one or two emoji used sparingly, a save-or-follow CTA, three hashtags.",
};

const SYSTEM_PROMPT = [
  "You write social captions for one business across X, LinkedIn and Instagram.",
  "Write in the brand's own plain voice: no marketing filler, no invented statistics, no generic openers.",
  "Never invent prices, awards or claims the brand has not given you.",
  "The hook is the caption's own first line, repeated verbatim in the hook field.",
  "hashtags is a single space-separated string, each tag starting with #.",
].join(" ");

const CAPTION_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "The caption's first line, verbatim." },
    body: {
      type: "string",
      description: "The full caption including the hook line. Use \\n for line breaks.",
    },
    hashtags: {
      type: "string",
      description: "Space-separated hashtags, e.g. '#buildinpublic #contentstrategy'.",
    },
  },
  required: ["hook", "body", "hashtags"],
  additionalProperties: false,
} as const;

/** §4b devam zinciri — bir halkanın önceki halkalardan model'e taşınan hâli.
 *  `ContentItemRow`'un TAMAMI değil, yalnızca istemin ihtiyaç duyduğu üç alan
 *  (bkz. `lib/adapters/ports.ts`'in `CopyInput.chainContext`'i bu tipi kullanır). */
export interface ChainContextItem {
  title: string;
  hook: string;
  continuationNote: string;
}

export interface CaptionInput {
  idea: string;
  channel: PlanChannel;
  tone: string;
  lang: Lang;
  /** The brand block from lib/brand/types.ts, or "" when there is no profile. */
  brand?: string;
  /** ⚠ §12 adım 15 FAZ C — bu bir devam içeriğiyse (chain_position > 1),
   *  zincirin önceki halkaları `chain_position` sırasıyla. Boşsa/verilmezse
   *  kök içerik — istem "önceki bölümler" bloğu EKLEMEZ. */
  chainContext?: readonly ChainContextItem[];
}

export type CaptionOutcome = ProviderCallOutcome<{ draft: CaptionDraft }>;

/** Zincirin önceki halkalarını "daha önce şunu söyledik" bloğuna çevirir —
 *  §4b'nin vaadi tam bu: "ikinci içerik A'ya atıf yaparak farklı bir
 *  özelliğini anlatır". Model bunu görmezse zincir kendini tekrar eder. */
function buildChainBlock(chainContext: readonly ChainContextItem[] | undefined): string[] {
  if (!chainContext || chainContext.length === 0) return [];
  const parts = chainContext.map(
    (c, i) => `${i + 1}. ${c.title} — ${c.hook}${c.continuationNote ? ` (${c.continuationNote})` : ""}`,
  );
  return [
    "This is a CONTINUATION of an earlier series for the same brand. Earlier parts, in order:",
    ...parts,
    "Cover a DIFFERENT angle than the parts above — do not restate them.",
    "",
  ];
}

function buildPrompt({ idea, channel, tone, lang, brand, chainContext }: CaptionInput): string {
  return [
    `Channel: ${PLATFORM_META[channel].name}`,
    `Channel brief: ${CHANNEL_BRIEF[channel]}`,
    `Tone: ${tone}`,
    `Write the caption in ${lang === "tr" ? "Turkish" : "English"}.`,
    "",
    ...(brand ? [brand, ""] : []),
    ...buildChainBlock(chainContext),
    "The idea to turn into a caption:",
    idea,
  ].join("\n");
}

function readDraft(text: string): CaptionDraft | null {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) return null;
  const { hook, body, hashtags } = parsed as Record<string, unknown>;
  if (typeof hook !== "string" || typeof body !== "string" || typeof hashtags !== "string") {
    return null;
  }
  return { hook, body, hashtags };
}

export async function writeCaption(
  input: CaptionInput,
  apiKey: string,
  /** ⚠ Gömülü değil — adım 14 FAZ A1: `app.config.ts` `AI_JOB_MODELS.caption_write`. */
  model: string,
): Promise<CaptionOutcome> {
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: CAPTION_SCHEMA },
      },
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    if (message.stop_reason === "refusal") {
      return {
        ok: false,
        code: "refused",
        detail: message.stop_details?.explanation ?? undefined,
      };
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      return {
        ok: false,
        code: "upstream_error",
        detail: `empty response (${message.stop_reason})`,
      };
    }

    const draft = readDraft(textBlock.text);
    if (!draft) {
      return {
        ok: false,
        code: "upstream_error",
        detail: "response did not match the caption schema",
      };
    }

    return {
      ok: true,
      draft,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  } catch (error) {
    const { code, detail } = classifyAnthropicError(error);
    console.error("[ai/caption]", code, detail);
    return { ok: false, code, detail };
  }
}
