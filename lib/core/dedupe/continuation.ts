/**
 * Katman 3'ün "denemeye değer mi" kapısı — Akış E Kontrol 3a/3b. Saf: DB'den
 * zaten okunmuş bir komşu satırı + şimdiki zaman alır, LLM'e sormaya
 * DEĞMEYECEK durumları (yayınlanmamış komşu, zincir dolu, çok taze) LLM
 * çağrısından ÖNCE eler — Kontrol 3c'nin parası boşa gitmesin diye.
 */
import type { DedupeConfig } from "@/lib/core/dedupe/config";

export interface ContinuationNeighbor {
  status: string;
  /** ISO tarih, ya da hiç yayınlanmadıysa `null`. */
  publishedAt: string | null;
  chainPosition: number;
}

export type ContinuationGateReason = "not_published" | "chain_full" | "too_recent";

export type ContinuationGateResult =
  | { ok: true }
  | { ok: false; reason: ContinuationGateReason };

const MS_PER_DAY = 86_400_000;

/**
 * "Komşu 'published' DEĞİL ise REDDET" + "zincir derinliği < 12 mi" +
 * "yayınından bu yana >= N gün geçmiş mi" — Akış E'nin üç ön koşulu.
 * Sıralama önemli değil (hepsi bağımsız), ama en ucuz/en kesin olan
 * (durum) önce kontrol edilir.
 */
export function canConsiderContinuation(
  neighbor: ContinuationNeighbor,
  config: DedupeConfig,
  now: Date,
): ContinuationGateResult {
  if (neighbor.status !== "published") return { ok: false, reason: "not_published" };
  if (neighbor.chainPosition >= config.maxChainDepth) return { ok: false, reason: "chain_full" };
  if (!neighbor.publishedAt) return { ok: false, reason: "too_recent" };

  const daysSince = (now.getTime() - new Date(neighbor.publishedAt).getTime()) / MS_PER_DAY;
  if (daysSince < config.minDaysSincePublish) return { ok: false, reason: "too_recent" };

  return { ok: true };
}
