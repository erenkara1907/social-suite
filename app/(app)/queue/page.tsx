import { port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { getJobsSummary } from "@/lib/server/jobs/status";
import { buildChains, buildQueue } from "@/lib/core/derive/calendar";
import { QueueView, type QueueRowView } from "@/components/app/queue-view";
import { JobsQueueStatus } from "@/components/app/jobs-queue-status";

export const metadata = { title: "Kuyruk" };

/**
 * `/queue` — BIRLESIM_PLANI §12 adım 8b (FAZ B).
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 * `requireBrand()` `cache()`'li — layout zaten çözdü, burada ikinci bir
 * Supabase sorgusu olmaz (A2, `lib/server/auth.ts`).
 *
 * ⚠ İçerik/medya verisine yalnızca `port("...")` üzerinden erişiliyor;
 * doğrudan fixture importu veya Supabase sorgusu YOK — TEK istisna
 * `getJobsSummary()` (§12 adım 12 FAZ C): genel `jobs` kuyruğu 12 port'un
 * hiçbirine ait değil, auth gibi platform altyapısı — gerekçe
 * `lib/server/jobs/status.ts`'te.
 */
export default async function Page() {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  const contentPort = port("content", overrides);
  const videoPort = port("video", overrides);

  const [items, activity, jobsSummary] = await Promise.all([
    contentPort.list(),
    contentPort.listActivity(),
    getJobsSummary(),
  ]);

  const now = new Date();
  const queue = buildQueue(items, now, brand.timezone);
  const itemById = new Map(items.map((item) => [item.id, item]));

  // Yalnızca kuyrukta görünen satırlar için iş listesi çekiliyor — yayınlanmış
  // halkaların (§4b) medya işiyle ilgilenmiyoruz.
  const jobLists = await Promise.all(queue.map((q) => videoPort.listJobs(q.id)));

  const rows: QueueRowView[] = queue.map((q, i) => {
    const item = itemById.get(q.id);
    return {
      ...q,
      chainPosition: item?.chain_position ?? 1,
      continuationNote: item?.continuation_note ?? "",
      jobs: jobLists[i],
    };
  });

  // §4b — `root_id` paylaşan satırlar, `chain_position` sırasıyla. Tam liste
  // (yayınlanmış halkalar dahil) kullanılıyor çünkü zincirin ilk halkaları
  // genelde zaten yayında — `queue` onları filtreler ama zincir görünürlüğü
  // hepsini ister.
  const chains = buildChains(items);

  const duplicateBlocked = activity.filter((row) => row.action === "duplicate_blocked");

  return (
    <div className="space-y-6">
      <JobsQueueStatus summary={jobsSummary} />
      <QueueView rows={rows} chains={chains} duplicateBlocked={duplicateBlocked} />
    </div>
  );
}
