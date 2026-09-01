/**
 * Tekrar önleme + devam zinciri motoru — BIRLESIM_PLANI §4c, Akış E.
 * §12 adım 15. Adım 14'ün bıraktığı dikişin (§12 adım 14 FAZ C2) gövdesi.
 *
 * SAF kalır (`lib/core/README.md` kuralı): DB'ye, Anthropic'e, env'e hiçbir
 * doğrudan bağımlılığı yok. Bütün I/O `DedupeDeps` üzerinden İÇERİ enjekte
 * edilir — gerçek Supabase/Anthropic bağlantısı `lib/server/dedupe/run.ts`'te
 * (bkz. `lib/core/plan/skeleton.ts`/`lib/core/ai/caption.ts`'in apiKey'i
 * parametre alması ile aynı ayrım: "ne sorulacak" burada, "nasıl bağlanılır"
 * `lib/server/`de). Testler (`index.test.ts`) sahte `DedupeDeps` ile hiçbir
 * ağ/DB çağrısı yapmadan üç katmanın TAMAMINI sınar.
 *
 * Akış E (özet, tam akış BIRLESIM_PLANI'nda):
 *   Kontrol 1 — fingerprint eşleşmesi VARSA:            duplicate
 *   Katman 2 kapalıysa (embedding sağlayıcı yok):        new (Katman 2/3 atlanır)
 *   Kontrol 2 — en yakın komşunun benzerliği:
 *     >= duplicateThreshold                              duplicate
 *     < continuationThreshold                             new
 *     bandın içi (continuationThreshold..duplicateThreshold):
 *       Kontrol 3a/3b (canConsiderContinuation) geçmezse   duplicate
 *       LLM bütçesi tükendiyse                             duplicate (budget_exhausted)
 *       Kontrol 3c — LLM "devam mı?" derse                 continuation
 *       LLM "hayır" derse ya da çağrı başarısızsa           duplicate
 */
import { DEFAULT_DEDUPE_CONFIG, type DedupeConfig } from "@/lib/core/dedupe/config";
import { computeFingerprint } from "@/lib/core/dedupe/fingerprint";
import { classifySimilarity } from "@/lib/core/dedupe/similarity";
import { canConsiderContinuation } from "@/lib/core/dedupe/continuation";

export interface DedupeCheckInput {
  brandId: string;
  title: string;
  hook: string;
  /** Kaba konu etiketi — varsa embed edilecek metne eklenir. */
  topicKey?: string;
}

export interface SimilarContentMatch {
  id: string;
  title: string;
  hook: string;
  status: string;
  publishedAt: string | null;
  similarity: number;
  chainPosition: number;
}

/** ⚠ FAZ B4 — bir `plan_generate` çalışması boyunca PAYLAŞILAN, mutable
 *  sayaç. Kontrol 3c'nin kaç kez çağrıldığını izler; `createDedupeRunBudget()`
 *  ile bir kez oluşturulup handler'ın döngüsündeki HER `checkDuplicate()`
 *  çağrısına aynı nesne geçirilir (bkz. `lib/server/jobs/handlers.ts`). */
export interface DedupeRunBudget {
  continuationChecksUsed: number;
}

export function createDedupeRunBudget(): DedupeRunBudget {
  return { continuationChecksUsed: 0 };
}

export interface DedupeDeps {
  /** Katman 1 — `content_fingerprint_idx` sorgusu. */
  findByFingerprint(brandId: string, fingerprint: string): Promise<{ id: string } | null>;
  /** Bu marka için Katman 2 denemeye değer mi (sağlayıcı yapılandırılı mı VE
   *  gerçekten embed üretebiliyor mu — bkz. `lib/adapters/live/dedupe.ts`). */
  embeddingAvailable(brandId: string): Promise<boolean>;
  embed(text: string, brandId: string): Promise<{ ok: true; vector: number[] } | { ok: false }>;
  /** `find_similar_content()` RPC'sinin + zincir derinliği sorgusunun sarmalı. */
  findSimilar(
    brandId: string,
    embedding: number[],
    threshold: number,
    limit: number,
  ): Promise<SimilarContentMatch[]>;
  judgeContinuation(
    candidate: { title: string; hook: string },
    neighbor: { title: string; hook: string },
  ): Promise<{ ok: true; isContinuation: boolean; aspect: string } | { ok: false }>;
  now(): Date;
  budget: DedupeRunBudget;
  config?: DedupeConfig;
}

export type DedupeDecisionReason =
  | "fingerprint"
  | "similarity"
  | "continuation_declined"
  | "budget_exhausted";

export type DedupeDecision =
  | { verdict: "new"; fingerprint: string; embedding: number[] | null }
  | {
      verdict: "duplicate";
      reason: DedupeDecisionReason;
      matchedId: string;
      similarity?: number;
    }
  | {
      verdict: "continuation";
      fingerprint: string;
      embedding: number[] | null;
      parentId: string;
      continuationNote: string;
      similarity: number;
    };

const EMBED_TEXT_SEPARATOR = "\n";

function buildEmbedText(input: DedupeCheckInput): string {
  return [input.title, input.hook, input.topicKey].filter(Boolean).join(EMBED_TEXT_SEPARATOR);
}

export async function checkDuplicate(input: DedupeCheckInput, deps: DedupeDeps): Promise<DedupeDecision> {
  const config = deps.config ?? DEFAULT_DEDUPE_CONFIG;
  const fingerprint = computeFingerprint(input.title, input.hook);

  // ── Kontrol 1 — birebir parmak izi ────────────────────────────────────
  const exact = await deps.findByFingerprint(input.brandId, fingerprint);
  if (exact) {
    return { verdict: "duplicate", reason: "fingerprint", matchedId: exact.id };
  }

  // ── Katman 2 kapalıysa (sağlayıcı yok/yazılmadı) — burada dur ─────────
  const layer2On = await deps.embeddingAvailable(input.brandId);
  if (!layer2On) {
    return { verdict: "new", fingerprint, embedding: null };
  }

  const embedResult = await deps.embed(buildEmbedText(input), input.brandId);
  // ⚠ Embed çağrısı BAŞARISIZ olursa AÇIK tarafa düşülür (new) — kapalı
  // tarafa (duplicate) düşmek, geçici bir sağlayıcı hatasında meşru içeriği
  // sessizce engellemek olurdu; Katman 1 zaten en ucuz/en kesin savunma.
  if (!embedResult.ok) {
    return { verdict: "new", fingerprint, embedding: null };
  }

  const matches = await deps.findSimilar(
    input.brandId,
    embedResult.vector,
    config.continuationThreshold,
    5,
  );
  const best = matches[0];
  if (!best) {
    return { verdict: "new", fingerprint, embedding: embedResult.vector };
  }

  const band = classifySimilarity(best.similarity, config);
  if (band === "new") {
    return { verdict: "new", fingerprint, embedding: embedResult.vector };
  }
  if (band === "duplicate") {
    return { verdict: "duplicate", reason: "similarity", matchedId: best.id, similarity: best.similarity };
  }

  // ── band === "continuation_band" — Kontrol 3 ──────────────────────────
  const gate = canConsiderContinuation(
    { status: best.status, publishedAt: best.publishedAt, chainPosition: best.chainPosition },
    config,
    deps.now(),
  );
  if (!gate.ok) {
    return { verdict: "duplicate", reason: "similarity", matchedId: best.id, similarity: best.similarity };
  }

  if (deps.budget.continuationChecksUsed >= config.maxContinuationChecksPerRun) {
    return { verdict: "duplicate", reason: "budget_exhausted", matchedId: best.id, similarity: best.similarity };
  }
  deps.budget.continuationChecksUsed += 1;

  const judged = await deps.judgeContinuation(
    { title: input.title, hook: input.hook },
    { title: best.title, hook: best.hook },
  );
  if (!judged.ok || !judged.isContinuation) {
    return { verdict: "duplicate", reason: "continuation_declined", matchedId: best.id, similarity: best.similarity };
  }

  return {
    verdict: "continuation",
    fingerprint,
    embedding: embedResult.vector,
    parentId: best.id,
    continuationNote: judged.aspect,
    similarity: best.similarity,
  };
}
