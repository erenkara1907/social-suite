import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ApiResult, ApiErrorCode } from "@/lib/core/ai/types";
import { JOB_RETRY_POLICY, type JobKind, type JobPayloadMap, type JobState } from "@/lib/core/jobs/types";

/**
 * İşe ekleme — BIRLESIM_PLANI §12 adım 12 (FAZ A2).
 *
 * ⭐ ANON KEY + kullanıcı çerezi (`createClient()`), service-role DEĞİL.
 * `lib/server/README.md`'nin "üç yer" kuralı enqueue'yi kapsamıyor — bu
 * fonksiyon kullanıcının OTURUMUYLA `public.enqueue_job()` RPC'sini çağırır;
 * sahiplik doğrulaması (`owns_brand`) veritabanı tarafında, bu dosyada değil.
 *
 * ⭐ Tip güvenliği: `K extends JobKind` payload'ı `JobPayloadMap[K]`'a
 * KİLİTLER. `enqueue(brandId, "publish", { theme: "x" })` derleme hatası
 * verir çünkü `publish` yalnızca `{ contentItemId: string }` kabul eder —
 * kanıt: `lib/server/jobs/enqueue.type-check.test.ts`.
 *
 * ⚠ Çifte yayın koruması — iki katman:
 *   1. KUYRUK katmanı (burada): `dedupeKey` verilirse `enqueue_job()`
 *      `jobs_dedupe_idx` (dedupe_key üzerinde partial unique) ile aynı
 *      anahtarlı queued/running bir satır varsa YENİ satır AÇMAZ, var olanı
 *      döner. `publish` işi için çağıran taraf
 *      `dedupeKey: "publish:" + contentItemId` VERMELİ (adım 17'nin işi).
 *   2. İÇERİK katmanı (§4a, `content_items.status`): `scheduled → publishing`
 *      geçişi `where status = 'scheduled'` koşullu UPDATE'tir — iki cron
 *      çalışması aynı satırı ikinci kez YAYINLAYAMAZ, ilk çalışma satırı
 *      zaten `publishing`'e çevirmiştir.
 *   İkisi FARKLI yarış koşullarını kapatır: (1) aynı `publish` işinin İKİ KEZ
 *   KUYRUĞA GİRMESİNİ (örn. kullanıcı "yayınla" düğmesine çift tıklarsa) —
 *   (2) kuyruğa bir kez giren işin worker tarafından İKİ KEZ İŞLENMESİNİ
 *   (örn. bir claim_jobs çağrısı takılırsa ve iş yeniden kuyruğa düşerse).
 *   Yalnızca birine güvenmek yeterli değil: (1) olmadan aynı çift tıklama iki
 *   ayrı iş satırı açar (ikisi de content'i `publishing`'e çevirmeye çalışır,
 *   ama biri kaybeder — güvenli, sadece israf); (2) `claim_jobs`'un SKIP
 *   LOCKED'ı zaten engelliyor ama içerik katmanı savunma derinliği olarak
 *   kalıyor — kuyruk dışı bir çağrı (örn. elle retry) content'i yine korur.
 */

export interface EnqueueOptions {
  /** Küçük = önce. Varsayılan 100 (§5 `jobs.priority` varsayılanı). */
  priority?: number;
  /** Bu zamandan önce alınmaz. Varsayılan: şimdi. */
  runAfter?: Date;
  /** Varsayılan: `JOB_RETRY_POLICY[kind].maxAttempts`. */
  maxAttempts?: number;
  /** Aynı anahtarla queued/running bir iş varsa yeni satır açılmaz. */
  dedupeKey?: string;
}

export interface QueuedJob {
  id: string;
  brandId: string;
  kind: JobKind;
  state: JobState;
  createdAt: string;
}

interface EnqueueJobRpcRow {
  id: string;
  brand_id: string;
  kind: string;
  state: string;
  created_at: string;
}

function toQueuedJob(row: EnqueueJobRpcRow): QueuedJob {
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind as JobKind,
    state: row.state as JobState,
    createdAt: row.created_at,
  };
}

/** Postgres SQLSTATE → `ApiErrorCode`. `enqueue_job()`'un fırlattığı üç
 *  errcode burada karşılanır (§12 adım 13 FAZ D'de `RLIM1` eklendi);
 *  geri kalanı (ağ, beklenmeyen) `upstream_error`. */
function mapPostgresError(code: string | undefined): ApiErrorCode {
  switch (code) {
    case "28000": // "enqueue_job: oturum yok"
      return "unauthenticated";
    case "42501": // "enqueue_job: marka sahibi değil" — PostgREST bunu 403'e çevirir
      return "forbidden";
    case "23514": // check kısıtı (örn. geçersiz kind) — client yine de yanlış bir şey gönderdi
      return "invalid_input";
    // §12 adım 13 FAZ D — özel SQLSTATE, gerçek bir Postgres kodu değil
    // (rate limit için standart bir sınıf yok). "enqueue_job: hiz siniri
    // asildi" mesajını taşır — HTTP_STATUS_BY_CODE zaten 429'a eşliyor.
    case "RLIM1":
      return "rate_limited";
    default:
      return "upstream_error";
  }
}

/**
 * Bir iş kuyruğa ekler. `brand_id` zorunlu (parametre, atlanamaz) ve
 * `enqueue_job()` içinde `owns_brand()` ile doğrulanır.
 */
export async function enqueue<K extends JobKind>(
  brandId: string,
  kind: K,
  payload: JobPayloadMap[K],
  options: EnqueueOptions = {},
): Promise<ApiResult<QueuedJob>> {
  if (!brandId) {
    return { ok: false, error: { code: "invalid_input", detail: "brand_id zorunlu" } };
  }

  const supabase = await createClient();
  const policy = JOB_RETRY_POLICY[kind];

  const { data, error } = await supabase
    .rpc("enqueue_job", {
      p_brand_id: brandId,
      p_kind: kind,
      p_payload: payload,
      p_priority: options.priority ?? 100,
      p_run_after: (options.runAfter ?? new Date()).toISOString(),
      p_max_attempts: options.maxAttempts ?? policy.maxAttempts,
      p_dedupe_key: options.dedupeKey ?? null,
    })
    .single<EnqueueJobRpcRow>();

  if (error) {
    return {
      ok: false,
      error: { code: mapPostgresError(error.code), detail: error.message },
    };
  }

  if (!data) {
    return { ok: false, error: { code: "upstream_error", detail: "enqueue_job boş döndü" } };
  }

  return { ok: true, data: toQueuedJob(data) };
}
