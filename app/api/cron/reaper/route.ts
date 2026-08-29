import { verifyCronSecret } from "@/lib/server/cron-auth";
import { sweepStuckJobs } from "@/lib/server/jobs/reaper";

/**
 * `/api/cron/reaper` — BIRLESIM_PLANI §12 adım 13 FAZ A.
 *
 * `sm-reaper` cron girdisi zaten `00_schema.sql`'de kurulu (10 dakikada bir,
 * pasif — `docs/CRON_AKTIVASYON.md`); bu, o hedefin ilk gerçek gövdesi.
 *
 * ⚠ Şu an yalnızca `jobs.state='running'` süpürülüyor. `content_items`'ın
 * `publishing` kilidi (`content_locked_idx`, `00_schema.sql`) BURAYA
 * eklenmiyor — o, `PublisherPort.live` ile birlikte adım 17'nin işi
 * (BIRLESIM_PLANI §12 satır 17: "sm-publish + publishing kilidi +
 * sm-reaper"). Aynı cron girdisi/rota adı zaten burada olduğu için adım 17
 * bu dosyaya İKİNCİ bir süpürme çağrısı eklemeli, ayrı bir rota AÇMAMALI.
 *
 * `sm-worker` gibi ELLE tetiklenerek test edilir (cron pasif).
 */

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const summary = await sweepStuckJobs();
  return Response.json(summary);
}
