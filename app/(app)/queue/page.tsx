import { port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildChains, buildQueue } from "@/lib/core/derive/calendar";
import { QueueView, type QueueRowView } from "@/components/app/queue-view";

export const metadata = { title: "Kuyruk" };

/**
 * `/queue` — BIRLESIM_PLANI §12 adım 8b (FAZ B).
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 * `requireBrand()` `cache()`'li — layout zaten çözdü, burada ikinci bir
 * Supabase sorgusu olmaz (A2, `lib/server/auth.ts`).
 *
 * ⚠ Veriye yalnızca `port("...")` üzerinden erişiliyor; doğrudan fixture
 * importu veya Supabase sorgusu YOK.
 */
export default async function Page() {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  const contentPort = port("content", overrides);
  const videoPort = port("video", overrides);

  const [items, activity] = await Promise.all([
    contentPort.list(),
    contentPort.listActivity(),
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

  return <QueueView rows={rows} chains={chains} duplicateBlocked={duplicateBlocked} />;
}
