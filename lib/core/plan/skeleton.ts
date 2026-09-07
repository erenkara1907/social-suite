/**
 * ← threadly/lib/plan/skeleton.ts
 * Uyarlama: `Channel` → `PlanChannel` ve kanal enum'ları §1.2 gereği küçük
 * harfe (JSON şemasındaki `enum` dahil); istemdeki görünen ad
 * `PLATFORM_META`'dan. apiKey zaten parametreydi (§8.6 deseninin kaynağı).
 *
 * Server-only plan skeletons: one Claude call that decides what every post in
 * the calendar is about. Bodies are written later, one at a time, by
 * /api/plan/post — drafting forty captions up front would take minutes and most
 * of them never get used.
 *
 * Two modes:
 *   weekly — the calendar comes from lib/plan/template.ts and the model only
 *            writes a title and hook for each slot it is handed.
 *   auto   — the model places the posts itself.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  KIND_LABEL, PLAN_CHANNELS, PLATFORM_META,
  type Lang, type PlanChannel, type PostKind,
} from "@/lib/core/types";
import type { ProviderCallOutcome } from "@/lib/core/ai/types";
import { classifyAnthropicError } from "@/lib/core/ai/classify-error";
import { toPromptBlock, type Brand } from "@/lib/core/brand/types";
import { buildSlots, WEEKDAY_LABEL, type PlannedSlot } from "@/lib/core/plan/template";
import type { PlanHorizon, PlanMode } from "@/lib/core/plan/types";

const MAX_TOKENS = 16000;
const POST_KINDS = Object.keys(KIND_LABEL) as PostKind[];

/** Roughly one post a day for a week, five a week for a month. */
const AUTO_POST_COUNT: Record<PlanHorizon, string> = {
  7: "7 to 9 posts",
  30: "20 to 26 posts",
};

const FORMAT_BRIEF: Record<PostKind, string> = {
  text: "a plain feed post, no image needed",
  thread: "a numbered multi-post thread",
  carousel: "a swipeable deck of 5-8 slides",
  image: "a single feed image with a caption",
  video: "a short filmed video",
  story: "a 24-hour vertical story frame — casual, behind the scenes, often a poll or a question sticker",
  reels: "a short vertical video with a hook in the first two seconds",
};

export interface SkeletonPost {
  dayOffset: number;
  timeOfDay: string;
  channel: PlanChannel;
  kind: PostKind;
  title: string;
  hook: string;
}

export interface SkeletonInput {
  theme: string;
  horizonDays: PlanHorizon;
  lang: Lang;
  mode: PlanMode;
  start: Date;
  brand: Brand | null;
  /** ⚠ adım 14 FAZ C — `planSkeleton()`'un kendisi bunu OKUMAZ (saf kalır);
   *  yalnızca `lib/adapters/live/planner.ts`'in anahtar çözümü + kullanım
   *  kaydı için taşır. Demo modda okunmaz. */
  brandId?: string;
  /** ⭐ adım 18 FAZ C — `lib/core/insights/build-feedback.ts`'in
   *  `toFeedbackPromptBlock()`'u. Boş dize/`null`/`undefined` iken prompt'a
   *  HİÇ eklenmez (§8.3: "sinyal yoksa prompt eskisi gibi çalışsın"). Metin
   *  yalnızca YAKLAŞIM taşır (format/saat/açılış biçimi), KONU taşımaz —
   *  dedupe motoruyla çakışmasın diye (`build-feedback.ts`'in kendi
   *  başlığı). */
  insightBlock?: string | null;
}

export type SkeletonOutcome = ProviderCallOutcome<{ title: string; posts: SkeletonPost[] }>;

/* ── Schemas ──────────────────────────────────────────────────────────────── */

const WEEKLY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short name for the plan, 2-5 words." },
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slot: { type: "integer", description: "The slot number this fills." },
          title: { type: "string", description: "What the post is about, one line." },
          hook: { type: "string", description: "The opening line the post will use." },
        },
        required: ["slot", "title", "hook"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "posts"],
  additionalProperties: false,
} as const;

const AUTO_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short name for the plan, 2-5 words." },
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayOffset: { type: "integer", description: "0 = first day of the plan." },
          timeOfDay: { type: "string", description: "24h clock, e.g. '09:00'." },
          channel: { type: "string", enum: PLAN_CHANNELS },
          kind: { type: "string", enum: POST_KINDS },
          title: { type: "string", description: "What the post is about, one line." },
          hook: { type: "string", description: "The opening line the post will use." },
        },
        required: ["dayOffset", "timeOfDay", "channel", "kind", "title", "hook"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "posts"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You plan a social content calendar for one business across X, LinkedIn and Instagram.",
  "Every post serves the business: its products, its audience, its voice.",
  "Each post is a distinct angle — never the same idea reworded.",
  "Match the format: a story is casual and immediate, a reel opens on movement,",
  "a carousel teaches step by step, a LinkedIn post argues a point.",
  "Never invent statistics, awards, prices or claims the brand has not given you.",
].join(" ");

/* ── Prompts ──────────────────────────────────────────────────────────────── */

function header(input: SkeletonInput): string[] {
  const brandBlock = toPromptBlock(input.brand, input.lang);
  return [
    `Write every title and hook in ${input.lang === "tr" ? "Turkish" : "English"}.`,
    "",
    ...(brandBlock ? [brandBlock, ""] : []),
    // ⭐ adım 18 FAZ C — boş/undefined iken hiçbir satır eklenmez (§8.3).
    ...(input.insightBlock ? [input.insightBlock, ""] : []),
    "The theme to plan around:",
    input.theme,
  ];
}

function weeklyPrompt(input: SkeletonInput, slots: PlannedSlot[]): string {
  const lines = slots.map((slot, index) => {
    const weekday = WEEKDAY_LABEL[slot.weekday].en;
    return `Slot ${index}: day ${slot.dayOffset + 1} (${weekday}) ${slot.timeOfDay} — ${PLATFORM_META[slot.channel].name} ${slot.kind} (${FORMAT_BRIEF[slot.kind]})`;
  });

  return [
    ...header(input),
    "",
    `The calendar is already fixed. Fill in all ${slots.length} slots below, exactly once each, using the slot number.`,
    "Respect each slot's channel and format — a story slot must be story-shaped, a reel slot must be a reel idea.",
    "",
    ...lines,
  ].join("\n");
}

function autoPrompt(input: SkeletonInput): string {
  return [
    ...header(input),
    "",
    `Plan horizon: ${input.horizonDays} days (dayOffset 0 to ${input.horizonDays - 1}).`,
    `Day 0 is a ${WEEKDAY_LABEL[(input.start.getUTCDay() + 6) % 7].en}.`,
    `Produce ${AUTO_POST_COUNT[input.horizonDays]}.`,
    "Spread posts across the horizon and the three channels; vary the format.",
    "Leave some days empty rather than padding the calendar.",
  ].join("\n");
}

/* ── Readers — the model's output is untrusted too ────────────────────────── */

function readEnvelope(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) return null;
  const { title, posts } = parsed as Record<string, unknown>;
  if (typeof title !== "string" || !Array.isArray(posts)) return null;
  return { title: title.trim(), posts };
}

function readLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readWeekly(text: string, slots: PlannedSlot[]): SkeletonPost[] | null {
  const envelope = readEnvelope(text);
  if (!envelope) return null;

  const filled = new Map<number, SkeletonPost>();
  for (const entry of envelope.posts) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.slot !== "number" || !Number.isInteger(p.slot)) continue;
    const slot = slots[p.slot];
    if (!slot || filled.has(p.slot)) continue;

    const title = readLine(p.title);
    const hook = readLine(p.hook);
    if (!title || !hook) continue;

    filled.set(p.slot, {
      dayOffset: slot.dayOffset,
      timeOfDay: slot.timeOfDay,
      channel: slot.channel,
      kind: slot.kind,
      title,
      hook,
    });
  }

  if (filled.size === 0) return null;
  // Slots the model skipped simply drop out; order stays calendar order.
  return [...filled.keys()].sort((a, b) => a - b).map((key) => filled.get(key)!);
}

function readAuto(text: string, horizonDays: number): SkeletonPost[] | null {
  const envelope = readEnvelope(text);
  if (!envelope) return null;

  const clean: SkeletonPost[] = [];
  for (const entry of envelope.posts) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.dayOffset !== "number" || p.dayOffset < 0 || p.dayOffset >= horizonDays) continue;
    if (typeof p.timeOfDay !== "string" || !/^\d{2}:\d{2}$/.test(p.timeOfDay)) continue;
    if (typeof p.channel !== "string" || !(PLAN_CHANNELS as readonly string[]).includes(p.channel)) continue;
    if (typeof p.kind !== "string" || !POST_KINDS.includes(p.kind as PostKind)) continue;

    const title = readLine(p.title);
    const hook = readLine(p.hook);
    if (!title || !hook) continue;

    clean.push({
      dayOffset: Math.floor(p.dayOffset),
      timeOfDay: p.timeOfDay,
      channel: p.channel as PlanChannel,
      kind: p.kind as PostKind,
      title,
      hook,
    });
  }

  return clean.length > 0 ? clean : null;
}

/* ── The call ─────────────────────────────────────────────────────────────── */

export async function planSkeleton(
  input: SkeletonInput,
  apiKey: string,
  /** ⚠ Gömülü değil — adım 14 FAZ A1: `app.config.ts` `AI_JOB_MODELS.plan_generate`. */
  model: string,
): Promise<SkeletonOutcome> {
  const isWeekly = input.mode === "weekly";
  const slots = isWeekly ? buildSlots(input.start, input.horizonDays) : [];
  if (isWeekly && slots.length === 0) {
    return { ok: false, code: "invalid_input", detail: "the template produced no slots" };
  }

  try {
    const message = await new Anthropic({ apiKey }).messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: isWeekly ? WEEKLY_SCHEMA : AUTO_SCHEMA },
      },
      messages: [
        { role: "user", content: isWeekly ? weeklyPrompt(input, slots) : autoPrompt(input) },
      ],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, code: "refused", detail: message.stop_details?.explanation ?? undefined };
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      return { ok: false, code: "upstream_error", detail: `empty response (${message.stop_reason})` };
    }

    const envelope = readEnvelope(textBlock.text);
    const posts = isWeekly
      ? readWeekly(textBlock.text, slots)
      : readAuto(textBlock.text, input.horizonDays);

    if (!envelope || !posts) {
      return { ok: false, code: "upstream_error", detail: "plan did not match the schema" };
    }

    return {
      ok: true,
      title: envelope.title,
      posts,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  } catch (error) {
    const { code, detail } = classifyAnthropicError(error);
    console.error("[plan/skeleton] anthropic", code, detail);
    return { ok: false, code, detail };
  }
}
