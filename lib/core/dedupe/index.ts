/**
 * Tekrar önleme dikişi — BIRLESIM_PLANI §12 adım 14 FAZ C2.
 *
 * ⚠ İSKELET. Bu adım gerçek fingerprint/embedding kontrolünü YAZMIYOR —
 * her zaman "new" döner. Amacı yalnızca `plan_generate` handler'ının
 * (`lib/server/jobs/handlers.ts`) içeriği `content_items`'a YAZMADAN ÖNCE
 * geçtiği kontrol noktasını BELİRGİN bir yerde sabitlemek. Adım 15
 * (§4c — hash + pgvector) bu dosyanın GÖVDESİNİ dolduracak; handler'ı
 * yeniden yazmayacak, yalnızca `checkDuplicate()`'in içini doldurup
 * imzasını (muhtemelen bir DB istemcisi parametresi eklenerek) genişletecek.
 *
 * Neden burada (`lib/core/dedupe/`), `lib/core/plan/skeleton.ts`'in İÇİNDE
 * değil: `planSkeleton()` saf kalır (Anthropic'e ne sorulacağı), tekrar
 * kontrolü ayrı bir sorumluluk (üretileni DB'ye yazmadan önce süzmek) —
 * §3'ün dizin ayrımı bunu zaten öngörmüştü.
 */

export interface DedupeCheckInput {
  brandId: string;
  title: string;
  hook: string;
}

/**
 * "new"      — üretilebilir, `content_items`'a yazılır.
 * "duplicate" — birebir/anlamsal tekrar, ATLANIR (`duplicate_blocked`
 *               aktivitesi loglanır — `activity.action` CHECK'inde zaten var).
 * "continuation" — yakın bir fikir, devam zinciri olarak yeniden çerçevelenebilir
 *               (adım 15'in kararı — bu adımda hiç dönmez).
 */
export type DedupeVerdict = "new" | "duplicate" | "continuation";

/** ⚠ Adım 15'ten önce HER ZAMAN "new" döner — fingerprint/embedding kolonları
 *  dolu olsa da (§4c) bu fonksiyon onları henüz OKUMAZ. */
export async function checkDuplicate(_input: DedupeCheckInput): Promise<DedupeVerdict> {
  return "new";
}
