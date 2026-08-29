import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { JOB_RETRY_POLICY, type JobKind } from "@/lib/core/jobs/types";
import { sanitizeErrorMessage } from "@/lib/server/jobs/worker";

/**
 * Takılı iş süpürücüsü — BIRLESIM_PLANI §12 adım 13 FAZ A (ADIM_12
 * varsayım 2). `sm-reaper` cron girdisi zaten `00_schema.sql`'de kurulu
 * (pasif) ve `/api/cron/reaper`'ı hedefliyor; bu dosya o hedefin `jobs`
 * tarafını dolduruyor.
 *
 * ⭐ Service-role client — `lib/server/README.md`'nin "üç yer" kuralının
 * 1. maddesi (cron job rotaları), `worker.ts` ile aynı gerekçe.
 *
 * ── Neden gerekli ────────────────────────────────────────────────────────
 * Normal akışta `jobs.state='running'` HİÇ askıda kalmaz: `processJob`'un
 * try/catch'i her zaman bir durum geçişiyle biter, süre bütçesi dolarsa
 * `requeueUnprocessed` devreye girer. Bu süpürücü yalnızca SÜRECİN TAMAMEN
 * çöktüğü (Vercel fonksiyon sonlandırması, OOM) — yani hiçbir JS kodunun
 * çalışamadığı — durum için var.
 *
 * ── Eşik: sabit, iş tipine göre DEĞİL ───────────────────────────────────
 * `expectedDurationMs` (`lib/core/jobs/types.ts`) kalibre edilmemiş, "kaba
 * tahmin" olarak işaretli bir değer — süpürücünün eşiğini ona bağlamak
 * ikinci, daha kırılgan bir kullanım eklerdi. Onun yerine `worker.ts`'in
 * kendi mimarisinden gelen sabit bir taban kullanılıyor: normal koşulda
 * bir iş `running`'de en fazla `TIME_BUDGET_MS + PER_JOB_TIMEOUT_MS`
 * (~65sn) kalabilir. `STUCK_THRESHOLD_MS` bunun belirgin üstünde ve
 * `worker.ts`'in zaten kalibre kabul ettiği `MAX_BACKOFF_MS` (10dk) ile
 * aynı sayı — yeni bir sabit icat etmek yerine var olan bir kararı
 * tekrar kullanıyor. `sm-reaper`'ın kendi periyodu da 10 dakika
 * (`00_schema.sql`), yani bir tur önceki taramadan beri gerçekten
 * terk edilmiş satırları yakalamaya doğal olarak denk düşüyor.
 *
 * ── Hedef durum: iş tipine göre DEĞİŞİYOR ───────────────────────────────
 * `JOB_RETRY_POLICY[kind].reaperOnStuck` karar verir (gerekçe orada) —
 * tükenmiş deneme sayısı bundan BAĞIMSIZ her zaman `dead`'e gider, normal
 * worker akışıyla aynı kural.
 */
export const STUCK_THRESHOLD_MS = 10 * 60_000;

export interface ReaperSummary {
  thresholdMs: number;
  scanned: number;
  requeued: number;
  dead: number;
}

interface StuckRow {
  id: string;
  kind: string;
  attempts: number;
  max_attempts: number;
}

export async function sweepStuckJobs(): Promise<ReaperSummary> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data, error } = await admin
    .from("jobs")
    .select("id, kind, attempts, max_attempts")
    .eq("state", "running")
    .lt("locked_at", cutoff);
  if (error) throw new Error(`sm-reaper: jobs taraması başarısız: ${error.message}`);

  const rows = (data ?? []) as StuckRow[];
  const summary: ReaperSummary = { thresholdMs: STUCK_THRESHOLD_MS, scanned: rows.length, requeued: 0, dead: 0 };

  for (const row of rows) {
    const policy = JOB_RETRY_POLICY[row.kind as JobKind] as
      | (typeof JOB_RETRY_POLICY)[JobKind]
      | undefined;
    const exhausted = row.attempts >= row.max_attempts;
    const goDead = exhausted || policy?.reaperOnStuck === "dead";

    const message = sanitizeErrorMessage(
      new Error(
        `sm-reaper: ${STUCK_THRESHOLD_MS}ms'den uzun süre 'running' durumunda askıda kaldı, süpürüldü` +
          (exhausted ? " (deneme hakkı tükenmişti)" : ""),
      ),
    );

    if (goDead) {
      await admin
        .from("jobs")
        .update({ state: "dead", last_error: message, locked_at: null, locked_by: null })
        .eq("id", row.id);
      summary.dead += 1;
    } else {
      await admin
        .from("jobs")
        .update({ state: "queued", last_error: message, locked_at: null, locked_by: null, run_after: new Date().toISOString() })
        .eq("id", row.id);
      summary.requeued += 1;
    }
  }

  return summary;
}
