/**
 * `checkDuplicate()`'in Supabase/Anthropic'e bağlanan tarafı — BIRLESIM_PLANI
 * §12 adım 15 FAZ C. `lib/server/ai/run-provider-call.ts`'in
 * `runAnthropicCall()`'ı ile AYNI ayrım: "ne sorulacak" `lib/core/dedupe/`'de
 * saf kalır, "nasıl bağlanılır" burada.
 *
 * ⚠ `port("dedupe")` (demo/live mod çözümü) DEĞİL — `liveDedupe`'i DOĞRUDAN
 * import ediyor. Gerekçe: `plan_generate` bir kuyruk işi, her zaman gerçek
 * altyapıya karşı çalışır (`lib/core/plan/skeleton.ts`'i de `planSkeleton()`
 * ile doğrudan çağırıyor, `port("planner")` ile değil) — "demo bir
 * plan_generate" diye bir şey yok, o yüzden MODE_DEDUPE çerezi/env'i burada
 * anlamsız olurdu.
 *
 * ⚠ Embedding SENKRON hesaplanır (§12 adım 15 FAZ C kararı). Asenkron
 * (`embed_backfill`'e bırakmak) yeni yazılan satırların KENDİ plan'ı
 * içindeki kardeşleriyle bile karşılaştırılamaması demek — Katman 2'nin
 * amacı tam olarak bu satırları yakalamak. `embed_backfill` bunun YERİNE
 * değil, bunun TAMAMLAYICISI: bir marka Voyage'ı SONRADAN eklerse, o ana
 * kadar `embedding IS NULL` yazılmış eski satırları geriye dönük doldurmak
 * için var (bkz. `lib/core/jobs/types.ts`). Bu oturumda handler'ı YAZILMADI
 * — yol burada tarif edildi, `docs/ADIM_15_RAPOR.md`'de de var.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_JOB_MODELS } from "@/app.config";
import {
  checkDuplicate,
  createDedupeRunBudget,
  type DedupeDecision,
  type DedupeRunBudget,
  type SimilarContentMatch,
} from "@/lib/core/dedupe";
import { DEFAULT_DEDUPE_CONFIG } from "@/lib/core/dedupe/config";
import { judgeContinuation } from "@/lib/core/dedupe/judge-continuation";
import { liveDedupe } from "@/lib/adapters/live/dedupe";
import { runAnthropicCall } from "@/lib/server/ai/run-provider-call";

export { createDedupeRunBudget };
export type { DedupeDecision, DedupeRunBudget };

export interface RunDedupeCheckInput {
  brandId: string;
  title: string;
  hook: string;
  topicKey?: string;
}

interface FindSimilarRow {
  id: string;
  title: string;
  hook: string;
  status: string;
  published_at: string | null;
  similarity: number;
}

/** `find_similar_content()` chain_position DÖNDÜRMÜYOR (bkz. 00_schema.sql) —
 *  Kontrol 3a'nın zincir derinliği kontrolü için ayrı, ucuz bir sorgu (yalnızca
 *  "yakın" bandına düşen adaylarda çalışır, ana sorgu yolunda DEĞİL). */
async function attachChainPosition(
  admin: SupabaseClient,
  rows: FindSimilarRow[],
): Promise<SimilarContentMatch[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data, error } = await admin.from("content_items").select("id,chain_position").in("id", ids);
  if (error) throw new Error(`dedupe chain_position sorgusu başarısız: ${error.message}`);
  const byId = new Map((data ?? []).map((r) => [r.id as string, r.chain_position as number]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    hook: r.hook,
    status: r.status,
    publishedAt: r.published_at,
    similarity: r.similarity,
    chainPosition: byId.get(r.id) ?? 1,
  }));
}

/**
 * `checkDuplicate()`'i gerçek Supabase/Anthropic'e bağlar. `budget` çağıran
 * tarafından oluşturulup (`createDedupeRunBudget()`) TÜM plan boyunca aynı
 * nesne olarak taşınmalı (FAZ B4 — LLM çağrı tavanı plan başına, satır başına
 * değil).
 */
export async function runDedupeCheck(
  admin: SupabaseClient,
  input: RunDedupeCheckInput,
  budget: DedupeRunBudget,
): Promise<DedupeDecision> {
  return checkDuplicate(input, {
    config: DEFAULT_DEDUPE_CONFIG,
    now: () => new Date(),
    budget,

    async findByFingerprint(brandId, fingerprint) {
      const { data, error } = await admin
        .from("content_items")
        .select("id")
        .eq("brand_id", brandId)
        .eq("content_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (error) throw new Error(`dedupe fingerprint sorgusu başarısız: ${error.message}`);
      return data;
    },

    async embeddingAvailable(brandId) {
      return liveDedupe.isAvailable(brandId);
    },

    async embed(text, brandId) {
      const result = await liveDedupe.embed(text, brandId);
      return result.ok ? { ok: true, vector: result.data } : { ok: false };
    },

    async findSimilar(brandId, embedding, threshold, limit) {
      const { data, error } = await admin.rpc("find_similar_content", {
        p_brand_id: brandId,
        p_embedding: embedding,
        p_threshold: threshold,
        p_limit: limit,
      });
      if (error) throw new Error(`find_similar_content başarısız: ${error.message}`);
      return attachChainPosition(admin, (data ?? []) as FindSimilarRow[]);
    },

    async judgeContinuation(candidate, neighbor) {
      const model = AI_JOB_MODELS.continuation_judge;
      const outcome = await runAnthropicCall(
        { brandId: input.brandId, kind: "continuation_judge", model },
        (apiKey) =>
          judgeContinuation(
            {
              candidateTitle: candidate.title,
              candidateHook: candidate.hook,
              neighborTitle: neighbor.title,
              neighborHook: neighbor.hook,
            },
            apiKey,
            model,
          ),
      );
      if (!outcome.ok) return { ok: false };
      return { ok: true, isContinuation: outcome.isContinuation, aspect: outcome.aspect };
    },
  });
}
