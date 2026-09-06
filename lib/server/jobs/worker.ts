import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermanentJobError } from "@/lib/core/jobs/errors";
import { JOB_RETRY_POLICY, type JobContext, type JobKind } from "@/lib/core/jobs/types";
import { JOB_HANDLERS } from "@/lib/server/jobs/handlers";
import { sanitizeErrorMessage } from "@/lib/server/jobs/sanitize";

/**
 * Çalışma döngüsü — BIRLESIM_PLANI §12 adım 12 FAZ B2/B3.
 *
 * ⭐ Service-role client. `lib/server/README.md`'nin "üç yer" kuralının
 * 1. maddesi tam bu: "cron job rotaları" (`lib/supabase/admin.ts` docstring'i
 * §12 adım 12/17/18'i açıkça sayıyor). `claim_jobs()` zaten
 * `authenticated`'dan REVOKE edilmiş (adım 2) — yalnızca service-role
 * çağırabilir. `jobs` tablosunun UPDATE politikası da YOK (`own jobs read`
 * yalnızca SELECT) — durum geçişleri (succeeded/dead/requeue) de bu yüzden
 * service-role gerektiriyor.
 */

/**
 * ⚠ SÜRE BÜTÇESİ — muhafazakâr sabit, ölçülmedi.
 *
 * Sınırlayan şey Vercel'in fonksiyon süresi DEĞİL (Fluid Compute varsayılan
 * 300sn). Sınırlayan şey `cron_fire()`'ın KENDİSİ: `00_schema.sql`
 * `net.http_get(..., timeout_milliseconds := 55000)` — pg_net bu isteğin
 * bağlantısını 55sn'de KAPATIR (schema yorumu: "uzun iş bu yüzden
 * endpoint'in içinde değil, jobs tablosunda yaşar: endpoint sadece
 * tetikler"). Worker'ın kendisi 55sn'i AŞARSA `cron.job_run_details` o
 * çalışmayı hatalı gösterir — iş aslında bitmiş olsa bile.
 *
 * 45000 seçildi: 55000'in altında GÜVENLİ bir pay (ağ + PostgREST gecikmesi
 * için ~10sn), ve `sm-worker`'ın kendi tetikleme sıklığından (dakikada bir)
 * de rahatça kısa — bir çalışma bir sonraki tetiklemeyle ÇAKIŞMAZ. Gerçek
 * elverişli süre ölçülünce (adım 14+, gerçek işleyicilerle) bu sabit
 * kalibre edilmeli — şimdilik bilinmeyen tarafta muhafazakâr durulan taraf.
 */
export const TIME_BUDGET_MS = 45_000;

/**
 * ⚠ İŞ BAŞINA ZAMAN AŞIMI — TIME_BUDGET_MS'in bir bölümü, tek bir işleyicinin
 * BÜTÜN bütçeyi yemesini engeller. 20000 seçildi: bütçenin ~%44'ü, yani en
 * kötü ihtimalle art arda iki zaman aşımı bile bütçeyi hemen tüketmez (worker
 * yine de düzgün kapanıp özet döner) — ve `JOB_RETRY_POLICY`'nin en hızlı
 * beklenen süreli türlerinin (caption_write 8sn, plan_generate 20sn) rahatça
 * sığması için yeterli.
 *
 * ⚠ `ugc_pipeline`'ın `expectedDurationMs: 180000`'i (adım 20) bu sabitle
 * ÇELİŞMEZ: mimari gereği o işleyici vendor render'ı BAŞLATIP hemen döner
 * (dispatch), gerçek bekleme ayrı `media_poll` işlerinde, kısa tekrar
 * tetiklemeler hâlinde yaşar (§4d). Tek bir işleyici çağrısı hiçbir zaman
 * dakikalarca BLOKE olmamalı — olursa bu, o işleyicinin YANLIŞ tasarlandığının
 * işaretidir, `PER_JOB_TIMEOUT_MS`'in değil.
 */
export const PER_JOB_TIMEOUT_MS = 20_000;

/**
 * ⚠ KAÇ İŞ — `claim_jobs(worker, batch)`'a verilen parti büyüklüğü.
 *
 * 5 seçildi: adım 2'nin eşzamanlılık testinde zaten kullanılan/doğrulanmış
 * varsayılan değer (`00_schema.sql` `claim_jobs`'un kendi varsayılanı da 5).
 * Büyük parti YANLIŞ yönde risk: TIME_BUDGET_MS dolmadan önce hepsini
 * işleyemezsek kalanlar `requeueUnprocessed` ile geri açılır — bu her zaman
 * GÜVENLİ ama sık olursa israf (claim + hemen requeue). Küçük parti + döngü
 * (aşağıda `runWorker`) bunu dengeliyor: bütçe elverdiğince yeni parti
 * ALINMAYA devam edilir, tek seferde büyük bir parti taahhüt edilmez.
 */
export const BATCH_SIZE = 5;

/** Üstel geri çekilmenin üst sınırı — bir kind'ın `backoffBaseMs`'i ne kadar
 *  büyürse büyüsün, bir işi 10 dakikadan uzun süre kuyrukta bekletmenin
 *  worker'ın kendisi için anlamı yok (sm-worker zaten dakikada bir dönüyor). */
const MAX_BACKOFF_MS = 10 * 60_000;

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

export interface WorkerSummary {
  claimedBatches: number;
  claimed: number;
  succeeded: number;
  requeued: number;
  dead: number;
  elapsedMs: number;
}

interface JobsRow {
  id: string;
  brand_id: string;
  user_id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

// sanitizeErrorMessage artık lib/server/jobs/sanitize.ts'te — 17a FAZ B3
// (yukarıdaki import), gerekçe o dosyanın başlığında.

function backoffDelayMs(kind: JobKind, attempts: number): number {
  const base = JOB_RETRY_POLICY[kind].backoffBaseMs;
  const exp = base * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, MAX_BACKOFF_MS);
}

class JobTimeoutError extends Error {
  constructor(ms: number) {
    super(`işleyici ${ms}ms içinde bitmedi (zaman aşımı)`);
    this.name = "JobTimeoutError";
  }
}

async function runWithTimeout(fn: () => Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JobTimeoutError(ms)), ms);
  });
  try {
    await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** İş bir sonuca ULAŞMADI (henüz işlenmedi) — claim edilmiş ama bütçe
 *  yetmedi. `locked_*` temizlenir, `attempts` DOKUNULMAZ (claim_jobs zaten
 *  artırdı) — bu satır yeniden claim edilebilir hâle döner. */
async function requeueUnprocessed(admin: SupabaseClient, jobId: string): Promise<void> {
  await admin
    .from("jobs")
    .update({ state: "queued", locked_at: null, locked_by: null })
    .eq("id", jobId);
}

/** Bir işi işler, sonucuna göre `jobs` satırını GÜNCELLER. Hiçbir durumda
 *  fırlatmaz — bir işin patlaması diğerlerini ETKİLEMEMELİ (FAZ B2 "iş
 *  başına izolasyon"); çağıran taraf try/catch'e ihtiyaç duymaz. */
async function processJob(admin: SupabaseClient, job: JobsRow): Promise<"succeeded" | "requeued" | "dead"> {
  const kind = job.kind as JobKind;
  const handler = JOB_HANDLERS[kind] as ((payload: unknown, ctx: JobContext) => Promise<void>) | undefined;

  try {
    if (!handler) {
      // Şemanın CHECK'i geçse de JOB_HANDLERS'ta karşılığı olmayan bir kind —
      // olması gerekmez ama savunma: kalıcı sayılır, sessizce yutulmaz.
      throw new PermanentJobError(`bilinmeyen iş tipi: ${job.kind}`);
    }
    // §12 adım 14 FAZ C — payload dışında brand_id/user_id de gerekiyor
    // (anahtar çözümü, content_items yazımı). `jobs` satırının kendisi
    // (`claim_jobs()` `returning j.*`) zaten taşıyor.
    const ctx: JobContext = { jobId: job.id, brandId: job.brand_id, userId: job.user_id };
    await runWithTimeout(() => handler(job.payload, ctx), PER_JOB_TIMEOUT_MS);

    await admin.from("jobs").update({ state: "succeeded", locked_at: null, locked_by: null }).eq("id", job.id);
    return "succeeded";
  } catch (error) {
    const isPermanent = error instanceof PermanentJobError;
    const message = sanitizeErrorMessage(error);
    const exhausted = job.attempts >= job.max_attempts;

    if (isPermanent || exhausted) {
      await admin
        .from("jobs")
        .update({ state: "dead", last_error: message, locked_at: null, locked_by: null })
        .eq("id", job.id);
      return "dead";
    }

    await admin
      .from("jobs")
      .update({
        state: "queued",
        last_error: message,
        locked_at: null,
        locked_by: null,
        run_after: new Date(Date.now() + backoffDelayMs(kind, job.attempts)).toISOString(),
      })
      .eq("id", job.id);
    return "requeued";
  }
}

async function claimBatch(admin: SupabaseClient, batch: number): Promise<JobsRow[]> {
  const { data, error } = await admin.rpc("claim_jobs", { worker: WORKER_ID, batch });
  if (error) throw new Error(`claim_jobs başarısız: ${error.message}`);
  return (data ?? []) as JobsRow[];
}

/**
 * Ana döngü — süre bütçesi doluncaya veya kuyruk boşalıncaya kadar parti
 * parti iş alır. Bir parti İÇİNDE her iş sırayla işlenir; bütçe bir işin
 * ORTASINDA tükenirse o iş (ve o partiden geri kalanlar) `requeueUnprocessed`
 * ile GERİ AÇILIR — asla `running` durumunda askıda bırakılmaz.
 */
export async function runWorker(): Promise<WorkerSummary> {
  const admin = createAdminClient();
  const startedAt = Date.now();
  const summary: WorkerSummary = { claimedBatches: 0, claimed: 0, succeeded: 0, requeued: 0, dead: 0, elapsedMs: 0 };

  while (Date.now() - startedAt < TIME_BUDGET_MS - PER_JOB_TIMEOUT_MS) {
    const batch = await claimBatch(admin, BATCH_SIZE);
    if (batch.length === 0) break;

    summary.claimedBatches += 1;
    summary.claimed += batch.length;

    for (const job of batch) {
      const remaining = TIME_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < PER_JOB_TIMEOUT_MS) {
        await requeueUnprocessed(admin, job.id);
        summary.requeued += 1;
        continue;
      }

      const outcome = await processJob(admin, job);
      if (outcome === "succeeded") summary.succeeded += 1;
      else if (outcome === "dead") summary.dead += 1;
      else summary.requeued += 1;
    }
  }

  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}
