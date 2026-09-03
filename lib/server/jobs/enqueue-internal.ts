import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_RETRY_POLICY, type JobKind, type JobPayloadMap } from "@/lib/core/jobs/types";

/**
 * İç zincirleme — BIRLESIM_PLANI §12 adım 20 FAZ B.
 *
 * `lib/server/jobs/enqueue.ts`'in `enqueue()`'undan KASITLI olarak AYRI:
 * o fonksiyon kullanıcının OTURUMUYLA `enqueue_job()` RPC'sini çağırır
 * (owns_brand + kill switch + rate limit hepsi orada) — bir CRON işleyicisi
 * içinde çalışan `ugc_pipeline`/`media_poll`'un ZİNCİRLEME çağrısı ne
 * oturuma sahip (worker'ın kendisi `/api/cron/worker`'da, kullanıcı
 * çerezi yok) ne de rate limit'e/kill switch'e TEKRAR tabi olmalı — bunlar
 * halihazırda ONAYLANMIŞ (kullanıcı bir kez "üret" dedi, `enqueue_job()`
 * o isteği zaten saydı) bir boru hattının DEVAMI, YENİ bir istek değil.
 *
 * Kill switch kontrolü yine de var — ama BURADA değil, `lib/server/media/
 * pipeline.ts`'in her vendor çağrısından ÖNCE yaptığı kendi kontrolünde
 * (§4d'nin "aşamalar arası iptal kontrolü" maddesi). Bu fonksiyon yalnızca
 * `jobs` satırını AÇAR; hangi koşullarda açılacağına çağıran karar verir.
 *
 * Service-role — `jobs` tablosunda RLS açık ama service-role zaten
 * bypass eder (aynı `lib/server/README.md` "üç yer" kuralı: cron rotaları).
 */
export interface EnqueueInternalOptions {
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
}

export async function enqueueInternal<K extends JobKind>(
  admin: SupabaseClient,
  brandId: string,
  userId: string,
  kind: K,
  payload: JobPayloadMap[K],
  options: EnqueueInternalOptions = {},
): Promise<void> {
  const policy = JOB_RETRY_POLICY[kind];

  // ⭐ `enqueue_job()` RPC'siyle AYNI idempotency deseni — dedupe_key
  // verilmişse ve queued/running bir satır zaten varsa yeni satır AÇILMAZ.
  // `jobs_dedupe_idx` (partial unique) bunu eşzamanlı çağrılarda da
  // garanti eder; burada ayrıca ÖNCEDEN kontrol edilir ki normal akışta
  // (yarış olmadan) gereksiz bir unique_violation'a hiç düşülmesin.
  if (options.dedupeKey) {
    const { data: existing } = await admin
      .from("jobs")
      .select("id")
      .eq("dedupe_key", options.dedupeKey)
      .in("state", ["queued", "running"])
      .maybeSingle<{ id: string }>();
    if (existing) return;
  }

  const { error } = await admin.from("jobs").insert({
    brand_id: brandId,
    user_id: userId,
    kind,
    payload,
    priority: options.priority ?? 100,
    run_after: (options.runAfter ?? new Date()).toISOString(),
    max_attempts: options.maxAttempts ?? policy.maxAttempts,
    dedupe_key: options.dedupeKey ?? null,
  });

  if (error) {
    // unique_violation (23505) — yarışı kaybettik, var olan satır zaten
    // aynı işi temsil ediyor; bu GÜVENLİ bir sonuç, fırlatmaya gerek yok.
    if (error.code === "23505") return;
    throw new Error(`iç kuyruğa ekleme başarısız (${kind}): ${error.message}`);
  }
}
