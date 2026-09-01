/**
 * Katman 1 — birebir parmak izi. BIRLESIM_PLANI §4c, Akış E Kontrol 1.
 *
 * Fingerprint NEDEN title+hook ve gövde değil: bu fonksiyon `plan_generate`
 * içinde, satır `content_items`'a yazılmadan ÖNCE çalışır (bkz.
 * `lib/server/jobs/handlers.ts`) — o anda gövde henüz YOK, `caption_write`
 * onu SONRA dolduruyor (§4a durum makinesi: `idea` → `draft`). Tekrar
 * kontrolünün tek çalıştığı nokta budur (`lib/core/jobs/types.ts`'in
 * "content.dedupe YOK, tek kontrol noktası plan_generate içinde" notu) —
 * yani title+hook genişletmek değil, mecburiyet: o anda başka içerik yok.
 * Gövde farklı olup başlık+kanca aynı kalan nadir durum zaten Katman 2'nin
 * (embedding, title+hook+topic_key üzerinden) yakalayacağı yakın-ama-
 * birebir-değil bandına düşer.
 */
import { createHash } from "node:crypto";

/**
 * Küçük harf (Türkçe kurallarıyla — İ→i, I→ı `toLocaleLowerCase("tr-TR")`
 * `toLowerCase()`'den FARKLI davranır), hashtag, emoji, noktalama atılır,
 * çoklu boşluk teke iner.
 */
export function normalizeForFingerprint(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/#\S+/gu, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** `title + "\n" + hook` normalize edilip SHA-256 hex. `content_fingerprint`
 *  kolonuna direkt yazılabilir hâl. */
export function computeFingerprint(title: string, hook: string): string {
  const normalized = normalizeForFingerprint(`${title}\n${hook}`);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
