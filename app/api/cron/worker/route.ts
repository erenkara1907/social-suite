import { createHash, timingSafeEqual } from "node:crypto";
import { runWorker } from "@/lib/server/jobs/worker";

/**
 * `/api/cron/worker` — BIRLESIM_PLANI §12 adım 12 FAZ B1.
 *
 * `cron_fire()` (`00_schema.sql` §10) `net.http_get` ile ÇAĞIRIR — GET,
 * POST DEĞİL. `sm-worker` bugün PASİF (§12 adım 17'ye kadar, FAZ D); bu
 * rota şimdilik yalnızca ELLE tetiklenerek test edilir.
 *
 * ⚠ 401 gövdesi BOŞ — hangi kontrolün (sır tanımsız / sır yanlış / başlık
 * eksik) başarısız olduğunu SÖYLEMEZ. Ayrıntılı bir 401 mesajı bir
 * saldırgana "neye yaklaştığını" söyler; bu üründe bu uç nokta tetiklenince
 * GERÇEK iş kuyruğu tüketir (adım 14+'ten sonra müşteri kredisi de
 * harcayabilir) — bilgi sızdırmamak bilinçli.
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

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return unauthorized();

  const header = request.headers.get("authorization") ?? "";
  if (!constantTimeEquals(header, `Bearer ${secret}`)) return unauthorized();

  const summary = await runWorker();
  return Response.json(summary);
}
