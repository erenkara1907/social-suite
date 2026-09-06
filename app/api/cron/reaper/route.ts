import { verifyCronSecret } from "@/lib/server/cron-auth";
import { sweepStuckJobs, sweepStuckPublishing } from "@/lib/server/jobs/reaper";

/**
 * `/api/cron/reaper` — BIRLESIM_PLANI §12 adım 13 FAZ A / adım 17a FAZ B2.
 *
 * `sm-reaper` cron girdisi zaten `00_schema.sql`'de kurulu (10 dakikada bir,
 * pasif — `docs/CRON_AKTIVASYON.md`); bu, o hedefin ilk gerçek gövdesi.
 *
 * ⭐ 17a FAZ B2 — `content_items`'ın `publishing` kilidi süpürücüsü
 * (`sweepStuckPublishing`) BURAYA, önceki yorumun kendi talimatına uyarak
 * İKİNCİ bir çağrı olarak eklendi (ayrı bir rota AÇILMADI).
 *
 * `sm-worker` gibi ELLE tetiklenerek test edilir (cron pasif).
 */

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const [jobs, content] = await Promise.all([sweepStuckJobs(), sweepStuckPublishing()]);
  return Response.json({ jobs, content });
}
