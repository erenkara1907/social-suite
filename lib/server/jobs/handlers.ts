import "server-only";

import { AI_JOB_MODELS } from "@/app.config";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import type { AnyJob, JobContext, JobKind } from "@/lib/core/jobs/types";
import { PLAN_CHANNELS, type PlanChannel } from "@/lib/core/types";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import { planSkeleton } from "@/lib/core/plan/skeleton";
import { writeCaption } from "@/lib/core/ai/caption";
import { toPromptBlock } from "@/lib/core/brand/types";
import { skeletonToContentItems } from "@/lib/core/plan/calendar";
import { createDedupeRunBudget, runDedupeCheck } from "@/lib/server/dedupe/run";
import { getBrandForJob } from "@/lib/server/jobs/context";
import { publishContentItem } from "@/lib/server/publish/publish-item";
import { runAnthropicCall } from "@/lib/server/ai/run-provider-call";
import { runUgcPipelineStep } from "@/lib/server/media/pipeline";
import { pollMediaJob } from "@/lib/server/media/poll";

/**
 * İşleyici kaydı — BIRLESIM_PLANI §12 adım 14 FAZ C.
 *
 * `plan_generate` ve `caption_write` adım 14'te dolduruldu (ilk gerçek
 * Anthropic çağrıları); `ugc_pipeline`/`media_poll` adım 20'de (gövdeleri
 * `lib/server/media/{pipeline,poll}.ts`'te — bu dosya yalnızca kaydeder).
 * Kalan dördü hâlâ `NOT_IMPLEMENTED` (adım 16/17/18'in işi,
 * `lib/core/jobs/types.ts`'in adım eşlemesi yorumuna bakın).
 */
const NOT_IMPLEMENTED = "işleyici henüz yazılmadı (adım 15+)";

/** Sağlayıcı hatasını iş kuyruğu hata sınıfına çevirir. Bir sonraki denemede
 *  sonucun DEĞİŞİP değişmeyeceği ayrımı — worker bu ikisine göre farklı
 *  davranıyor (`lib/core/jobs/errors.ts`). */
function toJobError(code: ApiErrorCode, detail: string | undefined, fallback: string): Error {
  const message = detail ? `${code}: ${detail}` : `${code}: ${fallback}`;
  switch (code) {
    case "rate_limited":
    case "timeout":
    case "upstream_error":
      return new TransientJobError(message);
    default:
      // missing_key, invalid_key, service_paused, invalid_input, refused —
      // bir sonraki deneme SONUCU DEĞİŞTİRMEZ (müşteri anahtarı eklemeden/
      // düzeltmeden, ya da ops kill switch'i açmadan).
      return new PermanentJobError(message);
  }
}

/** BIRLESIM_PLANI §4a durum makinesi — `plan_generate`'in yazdığı satırlar
 *  hep `idea`'da doğar, gövdesi `caption_write`'ın işi. */
async function handlePlanGenerate(
  payload: Extract<AnyJob, { kind: "plan_generate" }>["payload"],
  ctx: JobContext,
): Promise<void> {
  const admin = createAdminClient();

  const brand = await getBrandForJob(admin, ctx.brandId);
  if (!brand) throw new PermanentJobError(`marka bulunamadı: ${ctx.brandId}`);

  const model = AI_JOB_MODELS.plan_generate;
  const start = new Date(payload.startIso);

  const outcome = await runAnthropicCall(
    { brandId: ctx.brandId, kind: "plan_generate", model, jobId: ctx.jobId },
    (apiKey) =>
      planSkeleton(
        { theme: payload.theme, horizonDays: payload.horizonDays, lang: payload.lang, mode: payload.mode, start, brand },
        apiKey,
        model,
      ),
  );

  if (!outcome.ok) throw toJobError(outcome.code, outcome.detail, "plan üretimi başarısız");

  const { data: plan, error: planError } = await admin
    .from("plans")
    .insert({
      brand_id: ctx.brandId,
      user_id: ctx.userId,
      title: outcome.title,
      theme: payload.theme,
      horizon_days: payload.horizonDays,
      lang: payload.lang,
      start_date: payload.startIso.slice(0, 10),
      mode: payload.mode,
    })
    .select("id")
    .single<{ id: string }>();
  if (planError || !plan) throw new TransientJobError(`plans yazılamadı: ${planError?.message ?? "boş yanıt"}`);

  const projected = skeletonToContentItems(outcome.posts, start, ctx.brandId, brand.timezone);

  // ⚠ FAZ B4 — bir plan'ın TÜMÜNde paylaşılan LLM çağrı bütçesi (Kontrol 3c).
  // Tek bir plan_generate çalışması onlarca "yakın" aday üretebilir; bu
  // sayaç olmadan her biri ayrı bir Anthropic çağrısına çıkardı.
  const dedupeBudget = createDedupeRunBudget();

  let written = 0;
  let blocked = 0;
  for (const item of projected) {
    // ⭐ FAZ C2 — dedupe DİKİŞİ (adım 14) doldu: checkDuplicate() artık Akış
    // E'nin üç katmanını gerçekten çalıştırıyor (adım 15 — lib/core/dedupe/).
    const decision = await runDedupeCheck(
      admin,
      { brandId: ctx.brandId, title: item.title, hook: item.hook, topicKey: item.topic_key ?? undefined },
      dedupeBudget,
    );

    if (decision.verdict === "duplicate") {
      blocked += 1;
      await admin.from("activity").insert({
        brand_id: ctx.brandId,
        user_id: ctx.userId,
        actor: "plan_generate",
        action: "duplicate_blocked",
        target: item.title,
        meta: { reason: decision.reason, matchedId: decision.matchedId, similarity: decision.similarity ?? null },
      });
      continue;
    }

    // `item.id` skeletonToContentItems()'ın SENTETİK önizleme id'si
    // (`SKELETON_ID_PREFIX`) — DB kendi uuid'ini üretecek, INSERT'e girmez.
    const insertable: Record<string, unknown> = { ...item, plan_id: plan.id, user_id: ctx.userId };
    delete insertable.id;
    // Katman 1 fingerprint HER ZAMAN yazılır (bir sonraki plan_generate'in
    // Kontrol 1'i bunu okuyacak); embedding yalnızca Katman 2 açıkken dolu —
    // senkron hesaplanır (bkz. lib/server/dedupe/run.ts başlığı).
    insertable.content_fingerprint = decision.fingerprint;
    insertable.embedding = decision.embedding;
    if (decision.verdict === "continuation") {
      insertable.parent_id = decision.parentId;
      insertable.continuation_note = decision.continuationNote;
    }

    const { data: inserted, error: itemError } = await admin
      .from("content_items")
      .insert(insertable)
      .select("id")
      .single<{ id: string }>();
    if (itemError) throw new TransientJobError(`content_items yazılamadı: ${itemError.message}`);
    written += 1;

    if (decision.verdict === "continuation") {
      await admin.from("activity").insert({
        brand_id: ctx.brandId,
        user_id: ctx.userId,
        actor: "plan_generate",
        action: "continuation_created",
        target: item.title,
        content_item_id: inserted?.id ?? null,
        meta: { parentId: decision.parentId, similarity: decision.similarity },
      });
    }
  }

  await admin.from("activity").insert({
    brand_id: ctx.brandId,
    user_id: ctx.userId,
    actor: "plan_generate",
    action: "plan_generated",
    target: outcome.title,
    meta: { written, blocked, horizonDays: payload.horizonDays },
  });
}

interface ContentItemForCaption {
  id: string;
  brand_id: string;
  platform: string;
  title: string;
  hook: string;
  root_id: string | null;
  chain_position: number;
}

interface ChainAncestorRow {
  title: string;
  hook: string;
  continuation_note: string;
}

/** §4b — bu bir devam içeriğiyse (chain_position > 1), zincirin önceki
 *  halkalarını `writeCaption()`'ın `chainContext`'i için getirir. Kök içerik
 *  (chain_position === 1) için boş dizi — istem "önceki bölümler" bloğu
 *  eklemez (bkz. caption.ts `buildChainBlock`). */
async function fetchChainContext(
  admin: ReturnType<typeof createAdminClient>,
  item: ContentItemForCaption,
): Promise<ChainAncestorRow[]> {
  if (item.chain_position <= 1 || !item.root_id) return [];
  const { data, error } = await admin
    .from("content_items")
    .select("title,hook,continuation_note")
    .eq("root_id", item.root_id)
    .lt("chain_position", item.chain_position)
    .order("chain_position", { ascending: true })
    .returns<ChainAncestorRow[]>();
  if (error) throw new TransientJobError(`zincir bağlamı okunamadı: ${error.message}`);
  return data ?? [];
}

/** BIRLESIM_PLANI §4a — `idea` → `draft` geçişi, gövde bu adımda yazılır. */
async function handleCaptionWrite(
  payload: Extract<AnyJob, { kind: "caption_write" }>["payload"],
  ctx: JobContext,
): Promise<void> {
  const admin = createAdminClient();

  const brand = await getBrandForJob(admin, ctx.brandId);
  if (!brand) throw new PermanentJobError(`marka bulunamadı: ${ctx.brandId}`);

  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id,brand_id,platform,title,hook,root_id,chain_position")
    .eq("id", payload.contentItemId)
    .eq("brand_id", ctx.brandId)
    .maybeSingle<ContentItemForCaption>();
  if (itemError) throw new TransientJobError(`content_items okunamadı: ${itemError.message}`);
  if (!item) throw new PermanentJobError(`content_item bulunamadı: ${payload.contentItemId}`);
  if (!(PLAN_CHANNELS as readonly string[]).includes(item.platform)) {
    throw new PermanentJobError(`caption_write bu platformu desteklemiyor: ${item.platform}`);
  }

  const model = AI_JOB_MODELS.caption_write;
  const idea = [item.title, item.hook].filter(Boolean).join(" — ");
  // §4b/§12 adım 15 FAZ C — devam içeriğiyse model "daha önce ne söyledik"i
  // görsün, yoksa zincir kendini tekrar eder (bkz. caption.ts buildChainBlock).
  const chain = await fetchChainContext(admin, item);
  const chainContext = chain.map((c) => ({ title: c.title, hook: c.hook, continuationNote: c.continuation_note }));

  const outcome = await runAnthropicCall(
    { brandId: ctx.brandId, kind: "caption_write", model, jobId: ctx.jobId },
    (apiKey) =>
      writeCaption(
        {
          idea,
          channel: item.platform as PlanChannel,
          tone: brand.voice || "samimi, abartısız",
          lang: brand.contentLanguage,
          brand: toPromptBlock(brand, brand.contentLanguage),
          chainContext,
        },
        apiKey,
        model,
      ),
  );

  if (!outcome.ok) throw toJobError(outcome.code, outcome.detail, "caption yazımı başarısız");

  const { error: updateError } = await admin
    .from("content_items")
    .update({
      hook: outcome.draft.hook,
      body: outcome.draft.body,
      hashtags: outcome.draft.hashtags,
      status: "draft",
    })
    .eq("id", item.id);
  if (updateError) throw new TransientJobError(`content_items güncellenemedi: ${updateError.message}`);

  await admin.from("activity").insert({
    brand_id: ctx.brandId,
    user_id: ctx.userId,
    actor: "caption_write",
    action: "caption_written",
    target: item.title,
    content_item_id: item.id,
  });
}

/**
 * İnce sarmalayıcı — asıl mantık `lib/server/publish/publish-item.ts`'te
 * (§12 adım 17a FAZ B2/B3; `PublisherPort.live.publish()` de AYNI
 * fonksiyonu çağırır, gerekçe o dosyanın başlığında — DRY).
 */
async function handlePublish(
  payload: Extract<AnyJob, { kind: "publish" }>["payload"],
  ctx: JobContext,
): Promise<void> {
  const admin = createAdminClient();
  await publishContentItem(admin, payload.contentItemId, ctx.jobId);
}

/** `kind` başına bir işleyici; `payload` o kind'ın `AnyJob`'daki daralmış
 *  hâli — her gövde yalnızca kendi payload tipini görür. */
export const JOB_HANDLERS: {
  [K in JobKind]: (payload: Extract<AnyJob, { kind: K }>["payload"], ctx: JobContext) => Promise<void>;
} = {
  plan_generate: handlePlanGenerate,
  caption_write: handleCaptionWrite,
  ugc_pipeline: runUgcPipelineStep,
  media_poll: pollMediaJob,
  publish: handlePublish,
  async metrics_collect() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async token_refresh() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async embed_backfill() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },

  /** Döngüyü kanıtlar — hiçbir dış çağrı yapmaz. `forceFailure` yalnızca
   *  worker'ın hata yollarını test etmek için (bkz. `NoopTestPayload`). */
  async noop_test(payload) {
    if (payload.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
    }
    if (payload.forceFailure === "permanent") {
      throw new PermanentJobError("noop_test: kasıtlı kalıcı hata (test)");
    }
    if (payload.forceFailure === "transient") {
      throw new TransientJobError("noop_test: kasıtlı geçici hata (test)");
    }
  },
};

export type { JobKind };
