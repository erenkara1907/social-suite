import "server-only";

/**
 * Hata mesajı temizleme — `lib/server/jobs/worker.ts`'ten çıkarıldı (§12 adım
 * 17a FAZ B3). Sebep: `handlers.ts`'in yeni `publish` işleyicisi de bu
 * fonksiyona ihtiyaç duyuyor (`content_items.failure_error`'a yazmadan
 * önce), ama `worker.ts` zaten `JOB_HANDLERS`'ı `handlers.ts`'ten import
 * ediyor — tersi yönde bir import DÖNGÜSEL olurdu. Nötr bir üçüncü dosya
 * bu döngüyü ortadan kaldırıyor. `reaper.ts` de (jobs.last_error için)
 * buradan okur.
 *
 * `err.stack`/tam obje ASLA kaydedilmez — yalnızca `.message`, ve bilinen
 * sır desenleri (Bearer token, API anahtarı benzeri uzun hex/base64 dizi)
 * maskelenir. Bu ürün müşteri API anahtarları taşıyor (§8.6) — bir
 * işleyici hata mesajına yanlışlıkla anahtarı gömerse (örn. sağlayıcının
 * kendi hata metni isteği yankılarsa) burası son savunma hattı.
 */
const MAX_ERROR_MESSAGE_LEN = 500;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT benzeri
  /[A-Za-z0-9+/]{40,}={0,2}/g, // uzun base64/hex anahtar benzeri gövdeler
];

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  let msg = raw;
  for (const pattern of SECRET_PATTERNS) msg = msg.replace(pattern, "[REDACTED]");
  return msg.length > MAX_ERROR_MESSAGE_LEN ? `${msg.slice(0, MAX_ERROR_MESSAGE_LEN)}…` : msg;
}
