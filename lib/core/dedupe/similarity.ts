/**
 * Katman 2'nin eşik mantığı — saf, sayı girip karar alan fonksiyon.
 * BIRLESIM_PLANI §4c / Akış E Kontrol 2. Eşikler `config.ts`'ten gelir,
 * burada hardcode YOK.
 */
import type { DedupeConfig } from "@/lib/core/dedupe/config";

export type SimilarityBand = "new" | "continuation_band" | "duplicate";

/**
 * `similarity >= duplicateThreshold`         → "duplicate" (tekrar, üretme)
 * `continuationThreshold <= similarity < duplicateThreshold` → "continuation_band" (devam adayı — Kontrol 3'e)
 * `similarity < continuationThreshold`       → "new"
 */
export function classifySimilarity(similarity: number, config: DedupeConfig): SimilarityBand {
  if (similarity >= config.duplicateThreshold) return "duplicate";
  if (similarity >= config.continuationThreshold) return "continuation_band";
  return "new";
}
