import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runWorker } from "@/lib/server/jobs/worker";

/**
 * `/api/cron/worker` — BIRLESIM_PLANI §12 adım 12 FAZ B1.
 *
 * `cron_fire()` (`00_schema.sql` §10) `net.http_get` ile ÇAĞIRIR — GET,
 * POST DEĞİL. `sm-worker` bugün PASİF (§12 adım 17'ye kadar, FAZ D); bu
 * rota şimdilik yalnızca ELLE tetiklenerek test edilir.
 *
 * Sır doğrulaması `lib/server/cron-auth.ts`'te (§12 adım 13 FAZ A —
 * `/api/cron/reaper`'la paylaşılıyor, gerekçe orada).
 */

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const summary = await runWorker();
  return Response.json(summary);
}
