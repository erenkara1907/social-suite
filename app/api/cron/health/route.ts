import { verifyCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `/api/cron/health` — adım 21 FAZ A.
 *
 * `apply.sh`'ın eski varsayılanı üretimdeki cron'u sessizce kapatabiliyordu
 * (ADIM_18 varsayım 6) ve bunu görmenin hiçbir yolu yoktu — hata yok, log
 * yok, sadece durur. `00_schema.sql`'deki `cron_fire()` artık her
 * tetiklenmede `public.cron_heartbeats`'e yazıyor; bu rota o yaşı okur.
 *
 * ⚠ Bu yalnızca "cron TETİKLENDİ mi" sorusuna cevap verir — hedef rotanın
 * BAŞARIYLA bittiğini değil (`net.http_get` fire-and-forget, `cron_fire()`
 * kalp atışını http isteğinden ÖNCE yazıyor). Ayrı bir izlenebilirlik
 * konusu, kapsam dışı.
 *
 * Diğer cron rotalarıyla aynı kapı: `CRON_SECRET` + boş 401 (bilgi
 * sızdırmama kuralı `cron-auth.ts`'te). Admin client kullanımı
 * `lib/supabase/admin.ts`'in "yalnızca 3 yerde" listesindeki 1. kategoriye
 * (cron job rotaları) girer — 4. bir kategori AÇMIYOR.
 *
 * Eşikler kalibre edilmedi (`docs/KALIBRASYON.md`) — her job'ın kendi
 * zamanlama aralığının ~4 katı, "hiç ateşlenmemiş" gürültüsünü bastırmak
 * için kaba bir güvenlik payı.
 */

const STALE_THRESHOLD_SECONDS: Record<string, number> = {
  "sm-worker": 4 * 60, // 1dk zamanlama
  "sm-publish": 4 * 5 * 60, // 5dk
  "sm-metrics": 4 * 60 * 60, // saatlik
  "sm-token-refresh": 4 * 24 * 60 * 60, // günlük
  "sm-reaper": 4 * 10 * 60, // 10dk
};

interface HeartbeatRow {
  jobname: string;
  fired_at: string;
}

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin.from("cron_heartbeats").select("jobname, fired_at");

  if (error) {
    return Response.json({ error: "cron_heartbeats okunamadı" }, { status: 500 });
  }

  const rows = (data ?? []) as HeartbeatRow[];
  const byName = new Map(rows.map((row) => [row.jobname, row.fired_at]));
  const now = Date.now();

  const jobs = Object.keys(STALE_THRESHOLD_SECONDS).map((jobname) => {
    const firedAt = byName.get(jobname) ?? null;
    if (!firedAt) {
      return { jobname, firedAt: null, secondsSince: null, stale: null as null };
    }
    const secondsSince = Math.floor((now - new Date(firedAt).getTime()) / 1000);
    return {
      jobname,
      firedAt,
      secondsSince,
      stale: secondsSince > STALE_THRESHOLD_SECONDS[jobname],
    };
  });

  const anyStale = jobs.some((job) => job.stale === true);
  return Response.json({ checkedAt: new Date(now).toISOString(), jobs }, { status: anyStale ? 503 : 200 });
}
