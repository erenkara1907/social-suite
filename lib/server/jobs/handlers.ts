import "server-only";

import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import type { AnyJob, JobKind } from "@/lib/core/jobs/types";

/**
 * İşleyici kaydı — BIRLESIM_PLANI §12 adım 12 FAZ B4.
 *
 * ⚠ Bu adımda `noop_test` DIŞINDA hiçbiri gerçek iş yapmıyor — hepsi
 * `PermanentJobError(NOT_IMPLEMENTED)` atar. Adım 14 (plan_generate,
 * caption_write), adım 15 (embed_backfill), adım 17 (publish), adım 18
 * (metrics_collect), adım 20 (ugc_pipeline, media_poll), adım 16/17
 * (token_refresh) bu gövdeleri dolduracak.
 *
 * Kalıcı seçildi (geçici değil): bugün hiçbir çağıran bu türleri kuyruğa
 * eklemiyor (adım 14+'nin işi), ama biri yanlışlıkla eklerse yeniden
 * denemenin bir anlamı yok — kod deploy edilmeden sonuç DEĞİŞMEZ. Worker bu
 * yolu `max_attempts`'i beklemeden `dead`'e alır.
 */
const NOT_IMPLEMENTED = "işleyici henüz yazılmadı (adım 14+)";

/** `kind` başına bir işleyici; `payload` o kind'ın `AnyJob`'daki daralmış
 *  hâli — her gövde yalnızca kendi payload tipini görür. */
export const JOB_HANDLERS: { [K in JobKind]: (payload: Extract<AnyJob, { kind: K }>["payload"]) => Promise<void> } = {
  async plan_generate() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async caption_write() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async ugc_pipeline() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async media_poll() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
  async publish() {
    throw new PermanentJobError(NOT_IMPLEMENTED);
  },
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
