/**
 * İş kuyruğu — tip kaydı. BIRLESIM_PLANI §8.5 · §12 adım 12 (FAZ A1).
 *
 * `supabase/00_schema.sql`'deki `jobs.kind` CHECK listesiyle BİREBİR aynı
 * olmak zorunda (bkz. `lib/core/types.ts`'in aynı kuralı) — artı `noop_test`,
 * bu adımda kuyruk döngüsünü dış çağrı yapmadan kanıtlamak için eklendi
 * (aşağıda gerekçesi var).
 *
 * Bu dosya saf kalır: Next'e, Supabase'e, ortam değişkeni okumaya bağımlı
 * değil — `lib/core/README.md`'nin kapı kriteri burada da geçerli.
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

/**
 * `supabase/00_schema.sql` `jobs.state` CHECK'iyle birebir. "Ölü mektup" = `dead`.
 *
 * ⚠ `failed` şemada VAR ama worker (`lib/server/jobs/worker.ts`) onu hiç
 * ÜRETMİYOR — geçici hata `queued`'e (backoff'la), kalıcı/tükenmiş hata
 * doğrudan `dead`'e gider. Bilinçli bırakılmış, gözlenmeyen bir ara durum
 * (§12 adım 13 FAZ A2, `supabase/00_schema.sql`'in aynı yorumu).
 */
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

/**
 * ⚠ adım 20 FAZ B — `contentItemId`/`script`/`voiceId` OPSİYONEL oldu.
 * Sebep: `step='persona_image'` bağımsız çalışabiliyor (`/studio/personas`
 * "yeni persona" akışı — henüz bir içerik yok, yalnızca persona'nın karesi
 * üretiliyor). Diğer üç adım (`persona_video`/`voice`/`lipsync`) bir
 * içeriğe bağlı olmak ZORUNDA — bu, tip sisteminde değil, işleyicide
 * (`lib/server/media/pipeline.ts`) doğrulanır (payload birleşik `AnyJob`
 * için tek bir arayüz kalması DRY'ı korur, ayrı payload tipleri step başına
 * gereksiz bir dallanma olurdu).
 *
 * Her `ugc_pipeline` işi TEK bir adımı yürütür — bir sonraki adım, bu
 * adımın vendor sonucu `media_poll` ile hazır olduğunda AYRI bir
 * `ugc_pipeline` işi olarak kuyruğa girer (bkz. `lib/server/media/pipeline.ts`
 * başlığı). Bu, "3. aşamada patlayan iş 1-2'yi TEKRARLAMAZ" garantisinin
 * KAYNAĞI: tamamlanmış adımlar zaten `jobs` tablosunda `succeeded` ayrı
 * satırlar, retry SADECE kendi satırının (kendi adımının) `attempts`'ini
 * artırır.
 */
export interface UgcPipelinePayload {
  personaId: string;
  step: MediaJobStep;
  contentItemId?: string;
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

/**
 * Bir işleyicinin `payload` DIŞINDA ihtiyaç duyduğu şey — §12 adım 14 FAZ C.
 * `jobs` satırının kendisi zaten taşıyor (`claim_jobs()` `returning j.*`);
 * `lib/server/jobs/worker.ts` bunu `job.brand_id`/`job.user_id`'den kurar.
 * Adım 12'nin `noop_test`'i bunu hiç okumaz ama imza herkeste aynı olmalı.
 */
export interface JobContext {
  jobId: string;
  brandId: string;
  userId: string;
}

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
  /**
   * §12 adım 13 FAZ A — `sm-reaper`'ın "takılı `running`" süpürücüsü bu satırı
   * kullanır. Süreç TAMAMEN çökerse (Vercel fonksiyon sonlandırması, OOM)
   * `processJob`'un try/catch'i hiç çalışmaz, satır `running`'de askıda kalır.
   * Süpürücü onu bulunca:
   *   - `"requeue"` — `queued`'a döner (locked_at temizlenir, backoff YOK —
   *     zaten en az `STUCK_THRESHOLD_MS` beklemiş). Varsayılan: işlemin
   *     çöktüğü an bilinmiyor demek işin BAŞLAMADIĞI da olabilir, yeniden
   *     denemek güvenli sayılır (dedupe_key + içerik kilidi ikinci savunma).
   *   - `"dead"` — insan/adım-20 kararına bırakılır. Yalnızca `ugc_pipeline`:
   *     dispatch deseninde (§4d) çökme ANI vendor çağrısından ÖNCE de SONRA
   *     da olabilir; sonra olduysa kör bir requeue vendor'ı İKİNCİ KEZ
   *     tetikleyip krediyi ikiletebilir — bu, kuyruk katmanının kendi
   *     başına ayırt edemeyeceği bir belirsizlik, o yüzden otomatik
   *     yeniden denemek yerine görünür bir ölü mektup bırakılır.
   * Tükenmiş deneme (`attempts >= max_attempts`) bu alandan BAĞIMSIZ olarak
   * her zaman `dead`'e gider — normal worker akışıyla aynı kural.
   */
  reaperOnStuck: "requeue" | "dead";
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
  plan_generate: { maxAttempts: 3, expectedDurationMs: 20_000, backoffBaseMs: 5_000, reaperOnStuck: "requeue" },
  caption_write: { maxAttempts: 3, expectedDurationMs: 8_000, backoffBaseMs: 3_000, reaperOnStuck: "requeue" },
  // ⚠ tek istisna — gerekçe JobRetryPolicy.reaperOnStuck docstring'inde.
  ugc_pipeline: { maxAttempts: 2, expectedDurationMs: 180_000, backoffBaseMs: 30_000, reaperOnStuck: "dead" },
  media_poll: { maxAttempts: 5, expectedDurationMs: 3_000, backoffBaseMs: 10_000, reaperOnStuck: "requeue" },
  // publish: dedupe_key + content_items.status koşullu geçişi (§4a) zaten
  // ikinci katman — takılı bir publish'i requeue etmek bu savunmanın
  // ARKASINDA kalır, ugc_pipeline'ın vendor-çağrısı belirsizliği yok.
  publish: { maxAttempts: 3, expectedDurationMs: 10_000, backoffBaseMs: 15_000, reaperOnStuck: "requeue" },
  metrics_collect: { maxAttempts: 2, expectedDurationMs: 15_000, backoffBaseMs: 20_000, reaperOnStuck: "requeue" },
  token_refresh: { maxAttempts: 2, expectedDurationMs: 5_000, backoffBaseMs: 30_000, reaperOnStuck: "requeue" },
  embed_backfill: { maxAttempts: 5, expectedDurationMs: 4_000, backoffBaseMs: 5_000, reaperOnStuck: "requeue" },
  noop_test: { maxAttempts: 3, expectedDurationMs: 100, backoffBaseMs: 1_000, reaperOnStuck: "requeue" },
};
