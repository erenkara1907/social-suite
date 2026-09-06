import { verifyCronSecret } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueInternal } from "@/lib/server/jobs/enqueue-internal";
import { PUBLISHABLE_PLATFORMS } from "@/lib/core/publishing";

/**
 * `/api/cron/publish` — BIRLESIM_PLANI §12 adım 17a FAZ B3.
 *
 * `sm-publish` cron girdisi `00_schema.sql`'de zaten kurulu (5 dakikada
 * bir, pasif — "siraya ritmi") ve bu tam yolu hedefliyordu; bugüne kadar
 * rota yoktu (`docs/CRON_AKTIVASYON.md`'nin "rotası yazılmamış job pasif
 * kalır" uyarısı).
 *
 * ⭐ Bu rota yalnızca ZAMANLAYICI — vadesi gelen `content_items` satırlarını
 * bulup `publish` işi olarak KUYRUĞA KOYAR, kendisi yayınlamaz. Gerçek yayın
 * `sm-worker`/`/api/cron/worker`'ın `handlePublish`'inde (§4a durum
 * makinesinin kilidi orada). İki cron'un ayrı olması bilinçli: zamanlayıcı
 * 5 dakikada bir "ne var" diye bakar, worker dakikada bir kuyruğu boşaltır —
 * ikisi çakışsa da (aynı içerik iki kez zamanlayıcıdan geçse de) `dedupe_key`
 * (`enqueueInternal`) ikinci satırı AÇMAZ.
 *
 * ⭐ `PUBLISHABLE_PLATFORMS` filtresi savunma amaçlı: `canPublish()` zaten
 * "yayınlanamayan platformu ZAMANLAMAMA" sözleşmesini `/queue`'nun onay
 * akışına yüklüyor (`PublisherPort`'un yorumu), ama bu filtre olmadan
 * yanlışlıkla `scheduled`'a düşmüş bir Instagram satırı boşuna bir `publish`
 * işi açar (worker onu zaten `PermanentJobError`'la reddeder — bu filtre
 * o israfı baştan önlüyor, ikinci bir savunma katmanı).
 *
 * Sır doğrulaması `lib/server/cron-auth.ts`'te — diğer cron rotalarıyla
 * paylaşılıyor.
 */

interface DueContentRow {
  id: string;
  brand_id: string;
  user_id: string;
}

function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_items")
    .select("id,brand_id,user_id")
    .eq("status", "scheduled")
    .in("platform", PUBLISHABLE_PLATFORMS)
    .lte("scheduled_at", new Date().toISOString())
    .returns<DueContentRow[]>();
  if (error) {
    return Response.json({ error: `content_items taraması başarısız: ${error.message}` }, { status: 500 });
  }

  const rows = data ?? [];
  for (const row of rows) {
    await enqueueInternal(admin, row.brand_id, row.user_id, "publish", { contentItemId: row.id }, {
      dedupeKey: `publish:${row.id}`,
    });
  }

  return Response.json({ scanned: rows.length });
}
