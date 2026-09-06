import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { JOB_RETRY_POLICY, type JobKind } from "@/lib/core/jobs/types";
import { sanitizeErrorMessage } from "@/lib/server/jobs/sanitize";

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

/**
 * `content_items.status='publishing'` kilidi süpürücüsü — §4a/§12 adım 17a
 * FAZ B2. `00_schema.sql`'in `sm-reaper` cron yorumu bunu zaten vaat
 * ediyordu ("Kilit süpürücü: 15 dakikadan uzun 'publishing'de kalanı geri
 * alır") ama gövde hiç yazılmamıştı — bu fonksiyon o boşluğu dolduruyor.
 *
 * Yalnızca SÜRECİN TAMAMEN çöktüğü an içindir — normal akışta
 * `handlePublish` (`lib/server/jobs/handlers.ts`) kendi try/catch'iyle her
 * zaman `published`/`scheduled`/`failed`'e döner, `publishing`'de takılı
 * bırakmaz.
 *
 * ⚠ KARAR — 'scheduled'a GERİ DÖNER, 'failed'e DEĞİL. Görev metninin
 * uyardığı risk ("içerik vendor'a gitmiş olabilir, geri döndürüp tekrar
 * denemek çifte gönderi demek") burada YAPISAL OLARAK kapatıldı: Bluesky
 * yayını artık deterministik `rkey` (= `content_items.id`) ile
 * `com.atproto.repo.putRecord` (createRecord DEĞİL) kullanıyor —
 * `publishBlueskyPost` (`lib/core/providers/bluesky.ts`). `putRecord`
 * resmi olarak UPSERT'tir: aynı rkey'e ikinci bir yazım YENİ bir gönderi
 * AÇMAZ, var olanı aynı içerikle değiştirir (görünürde HİÇBİR ŞEY
 * değişmez). Bu yüzden bir retry — ilk deneme vendor'a hiç ulaşmamış da
 * olsa, ulaşıp DB güncellemesinden ÖNCE çökmüş de olsa — güvenlidir.
 * `failed`'e gitmek burada gereksiz bir insan müdahalesi dayatırdı;
 * gerçek gerekçe `docs/ADIM_17a_RAPOR.md` FAZ B2'de.
 */
export const CONTENT_PUBLISHING_STUCK_THRESHOLD_MS = 15 * 60_000;

export interface ContentReaperSummary {
  thresholdMs: number;
  scanned: number;
  reverted: number;
}

interface StuckContentRow {
  id: string;
}

export async function sweepStuckPublishing(): Promise<ContentReaperSummary> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - CONTENT_PUBLISHING_STUCK_THRESHOLD_MS).toISOString();

  const { data, error } = await admin
    .from("content_items")
    .select("id")
    .eq("status", "publishing")
    .lt("locked_at", cutoff);
  if (error) throw new Error(`sm-reaper: content_items taraması başarısız: ${error.message}`);

  const rows = (data ?? []) as StuckContentRow[];
  const summary: ContentReaperSummary = {
    thresholdMs: CONTENT_PUBLISHING_STUCK_THRESHOLD_MS, scanned: rows.length, reverted: 0,
  };

  const message = sanitizeErrorMessage(
    new Error(`sm-reaper: ${CONTENT_PUBLISHING_STUCK_THRESHOLD_MS}ms'den uzun süre 'publishing' durumunda askıda kaldı, 'scheduled'a döndürüldü`),
  );

  for (const row of rows) {
    // ⚠ Koşullu UPDATE — bu tarama ile şimdi arasında worker kendisi
    // bitirmiş olabilir (published/failed); ikinci kez 'publishing'
    // koşuluyla yazmak o durumda 0 satır etkiler, zararsız.
    const { data: updated } = await admin
      .from("content_items")
      .update({ status: "scheduled", failure_error: message, locked_at: null, locked_by: null })
      .eq("id", row.id)
      .eq("status", "publishing")
      .select("id")
      .maybeSingle();
    if (updated) summary.reverted += 1;
  }

  return summary;
}
