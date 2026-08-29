/**
 * İş kuyruğu — tip kaydı. BIRLESIM_PLANI §8.5 · §12 adım 12 (FAZ A1).
 *
 * `supabase/00_schema.sql`'deki `jobs.kind` CHECK listesiyle BİREBİR aynı
 * olmak zorunda (bkz. `lib/core/types.ts`'in aynı kuralı) — artı `noop_test`,
 * bu adımda kuyruk döngüsünü dış çağrı yapmadan kanıtlamak için eklendi
 * (aşağıda gerekçesi var).
 *
 * Bu dosya saf kalır: Next'e, Supabase'e, `process.env`'e bağımlı değil —
 * `lib/core/README.md`'nin kapı kriteri burada da geçerli.
 */
import type { Lang, MediaJobStep } from "@/lib/core/types";
import type { PlanHorizon, PlanMode } from "@/lib/core/plan/types";

/* ── İş tipleri ──────────────────────────────────────────────────────────── */

export const JOB_KINDS = [
  "plan_generate",
  "caption_write",
  "ugc_pipeline",
  "media_poll",
  "publish",
  "metrics_collect",
  "token_refresh",
  "embed_backfill",
  // ⚠ SAPMA — şemada yoktu, bu adımda eklendi (00_schema.sql'e de işlendi).
  // Görev metni örnek isimleri nokta gösterimiyle verdi ("plan.generate" vb.);
  // gerçek `jobs.kind` CHECK listesi alt çizgili (`plan_generate`), o yüzden
  // yeni tip de aynı sözleşmeye uyuyor, nokta gösterimi KULLANILMADI.
  "noop_test",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

/** `supabase/00_schema.sql` `jobs.state` CHECK'iyle birebir. "Ölü mektup" = `dead`. */
export const JOB_STATES = ["queued", "running", "succeeded", "failed", "dead"] as const;
export type JobState = (typeof JOB_STATES)[number];

/* ── Adım eşlemesi (yalnızca dokümantasyon — çalışma zamanında okunmaz) ────
 *
 *   plan_generate    → adım 14 (LIVE #1, Anthropic planner)
 *   caption_write    → adım 14 (LIVE #1, Anthropic copy)
 *   ugc_pipeline     → adım 20 (LIVE #4, Kie/ElevenLabs/fal, 5 adım)
 *   media_poll       → adım 20 (ugc_pipeline'ın vendor durumu sorgulayan eşi)
 *   publish          → adım 17 (LIVE #3, Instagram Graph)
 *   metrics_collect  → adım 18 (Instagram Insights toplayıcı)
 *   token_refresh    → adım 16/17 (kanal token tazeleme, sm-token-refresh)
 *   embed_backfill   → adım 15 (tekrar önleme motoru — embedding backfill)
 *   noop_test        → adım 12 (bu adım) — yalnızca worker döngüsünü kanıtlar
 *
 * ⚠ "content.dedupe" YOK. Tekrar önleme (§8.1/§4c) `lib/core/dedupe/*`
 * içinde SENKRON çalışır — `plan_generate` işleyicisinin İÇİNDE (adım 15),
 * kendi kuyruk işi DEĞİL. Kuyruğa yalnızca "embedding'i sonradan doldur"
 * (embed_backfill) ihtiyacı düşer — örn. eski satırlar ya da senkron embed
 * çağrısı başarısız olduğunda.
 */

/* ── Payload'lar ─────────────────────────────────────────────────────────── */
/* Kural: bir job satırı zaten `brand_id` ve `user_id` taşıyor — payload onları
 * TEKRARLAMAZ. `jsonb` kolonuna gideceği için yalnızca JSON-serileştirilebilir
 * alanlar var (örn. `Date` değil `string` ISO). */

export interface PlanGeneratePayload {
  theme: string;
  horizonDays: PlanHorizon;
  lang: Lang;
  mode: PlanMode;
  /** ISO tarih — plan üretiminin başlangıç günü. */
  startIso: string;
}

export interface CaptionWritePayload {
  contentItemId: string;
}

export interface UgcPipelinePayload {
  contentItemId: string;
  personaId: string;
  script: string;
  voiceId: string;
  step: MediaJobStep;
}

export interface MediaPollPayload {
  /** `media_jobs.id` — hangi üretim işinin vendor durumu sorgulanacak. */
  mediaJobId: string;
}

export interface PublishPayload {
  contentItemId: string;
}

/** Brand kapsamlı tarama — hangi içeriğin sırası geldiğine işleyici karar
 *  verir (§8.2: "hangi içeriğin sırası geldiğini endpoint seçer"). */
export interface MetricsCollectPayload {
  /** Verilmezse markanın yayınlanmış tüm uygun satırları taranır. */
  contentItemId?: string;
}

/** Verilmezse markanın tüm kanalları taranır (günlük sweep, sm-token-refresh). */
export interface TokenRefreshPayload {
  channelId?: string;
}

export interface EmbedBackfillPayload {
  contentItemId: string;
}

/**
 * Gerçek iş yapmaz — worker döngüsünü (ve hata yollarını) kanıtlamak
 * dışında amacı yok. `forceFailure` YALNIZCA testte kullanılır: worker'ın
 * kalıcı/geçici hata ayrımını ve ölü mektup geçişini dış çağrı yapmadan
 * tetiklemenin yolu (FAZ B doğrulama: "sürekli patlayan bir iş").
 */
export interface NoopTestPayload {
  forceFailure?: "transient" | "permanent";
  /** Yalnızca test — worker'ın süre bütçesi/zaman aşımı davranışını dış
   *  çağrı yapmadan kanıtlamak için yapay bir gecikme (ms). */
  delayMs?: number;
}

export interface JobPayloadMap {
  plan_generate: PlanGeneratePayload;
  caption_write: CaptionWritePayload;
  ugc_pipeline: UgcPipelinePayload;
  media_poll: MediaPollPayload;
  publish: PublishPayload;
  metrics_collect: MetricsCollectPayload;
  token_refresh: TokenRefreshPayload;
  embed_backfill: EmbedBackfillPayload;
  noop_test: NoopTestPayload;
}

/** Ayrıştırılmış birlik — bir işleyici kaydı `kind`'a göre daraltabilsin diye. */
export type AnyJob = { [K in JobKind]: { kind: K; payload: JobPayloadMap[K] } }[JobKind];

/* ── Yeniden deneme politikası ───────────────────────────────────────────── */

export interface JobRetryPolicy {
  /** `jobs.max_attempts` — bu değerde `enqueue` edilir, aşılınca `dead`. */
  maxAttempts: number;
  /**
   * Kaba beklenen çalışma süresi (ms). Doğru değer değil — worker'ın süre
   * bütçesi kararını KALIBRE ETMEK için (bkz. `lib/server/jobs/worker.ts`
   * `TIME_BUDGET_MS` gerekçesi). Ölçülmedi, ⚠ kalibre edilmeli (adım 14+).
   */
  expectedDurationMs: number;
  /** Üstel geri çekilmenin taban gecikmesi — gerçek gecikme
   *  `backoffBaseMs * 2^(attempts-1)` (bkz. `lib/server/jobs/worker.ts`). */
  backoffBaseMs: number;
}

/**
 * Kind başına politika. Gerekçeler:
 *  - AI çağrıları (plan/caption) ucuz ve hızlı ama sağlayıcı 429/5xx
 *    verebilir → orta deneme sayısı, kısa taban gecikme.
 *  - `ugc_pipeline`/`media_poll` dakikalar sürer (vendor render kuyruğu) →
 *    az deneme (her deneme gerçek kredi harcıyor olabilir — §8.5), uzun taban
 *    gecikme.
 *  - `publish` MÜŞTERİNİN hesabına yazıyor — az deneme, orta gecikme; çok
 *    denemek aynı içeriği farklı hata yollarından iki kez yayınlama riskini
 *    büyütür (dedupe_key ayrıca korur, ama savunma tek katman olmamalı).
 *  - `metrics_collect`/`token_refresh` sweep işleri — bir sonraki cron
 *    turunda zaten yeniden denenecek, kuyrukta agresif yeniden denemeye
 *    gerek yok.
 *  - `embed_backfill` ucuz, çok deneme güvenli.
 *  - `noop_test` gerçek iş yapmaz; politika testte kullanılan sabit değer.
 */
export const JOB_RETRY_POLICY: Record<JobKind, JobRetryPolicy> = {
  plan_generate: { maxAttempts: 3, expectedDurationMs: 20_000, backoffBaseMs: 5_000 },
  caption_write: { maxAttempts: 3, expectedDurationMs: 8_000, backoffBaseMs: 3_000 },
  ugc_pipeline: { maxAttempts: 2, expectedDurationMs: 180_000, backoffBaseMs: 30_000 },
  media_poll: { maxAttempts: 5, expectedDurationMs: 3_000, backoffBaseMs: 10_000 },
  publish: { maxAttempts: 3, expectedDurationMs: 10_000, backoffBaseMs: 15_000 },
  metrics_collect: { maxAttempts: 2, expectedDurationMs: 15_000, backoffBaseMs: 20_000 },
  token_refresh: { maxAttempts: 2, expectedDurationMs: 5_000, backoffBaseMs: 30_000 },
  embed_backfill: { maxAttempts: 5, expectedDurationMs: 4_000, backoffBaseMs: 5_000 },
  noop_test: { maxAttempts: 3, expectedDurationMs: 100, backoffBaseMs: 1_000 },
};
