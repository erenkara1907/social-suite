import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `CRON_SECRET` doğrulaması — `app/api/cron/worker/route.ts`'ten (§12 adım 12
 * FAZ B1) çıkarıldı. §12 adım 13 FAZ A'nın `/api/cron/reaper`'ı aynı kontrolü
 * ikinci kez kopyalamasın diye (ve adım 16-18'in yazacağı diğer dört cron
 * rotası da).
 *
 * ⚠ Başarısızlıkta gövde HER ZAMAN boş — hangi kontrolün (sır tanımsız / sır
 * yanlış / başlık eksik) başarısız olduğunu SÖYLEMEZ. Bu uç noktalar
 * tetiklenince gerçek iş kuyruğu tüketir (adım 14+'ten sonra müşteri kredisi
 * de harcayabilir) — bilgi sızdırmamak bilinçli.
 */

function constantTimeEquals(a: string, b: string): boolean {
  // Sabit zamanlı karşılaştırma: iki değeri ÖNCE aynı uzunluklu bir digest'e
  // indirger, SONRA timingSafeEqual ile karşılaştırır. `timingSafeEqual`
  // farklı uzunluklu buffer'larda FIRLATIR — uzunluğu doğrudan karşılaştırmak
  // (`a.length === b.length`) da kendi başına bir zamanlama sızıntısıdır;
  // digest'e indirgemek bu ayrımı ortadan kaldırır (ikisi de her zaman 32 bayt).
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/** `true` → istek `CRON_SECRET` ile doğrulandı. Rota bunun dışında hiçbir
 *  şey yapmamalı: `false` dönerse çağıran `new Response(null, {status:401})` döner. */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  return constantTimeEquals(header, `Bearer ${secret}`);
}
