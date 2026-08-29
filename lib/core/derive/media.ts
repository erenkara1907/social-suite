/**
 * adım 10 C1/C2 — `/studio`nun `media_jobs`'u üretim listesine ve persona
 * kullanım sayacına dönüştüren saf katman.
 *
 * ⚠ İkinci bir "ilerleme motoru" YAZILMADI. `demo/video.ts`'in `start()`
 * yorumunun dediği gibi sahte bir `setTimeout` ilerlemesi burada da yok —
 * bu dosya yalnızca VAR OLAN `media_jobs` satırlarını gruplar/sıralar,
 * hiçbir durumu icat etmez.
 */
import { MEDIA_JOB_STEPS, type MediaJobRow, type MediaJobStep } from "@/lib/core/types";

export interface ProductionGroup {
  contentItemId: string;
  /** §4d'nin beş adımlık sırasına göre sıralı — yalnızca GERÇEKTEN var olan işler. */
  jobs: MediaJobRow[];
  /** Grubun ilk işinin taşıdığı persona — bir prodüksiyon tek persona kullanır. */
  personaId: string | null;
}

const STEP_ORDER: Record<MediaJobStep, number> = Object.fromEntries(
  MEDIA_JOB_STEPS.map((step, i) => [step, i]),
) as Record<MediaJobStep, number>;

/** Bir grubun en "acil" durumu — sıralamanın anahtarı. Küçük sayı önce gösterilir. */
function urgency(jobs: MediaJobRow[]): number {
  if (jobs.some((j) => j.state === "running")) return 0;
  if (jobs.some((j) => j.state === "queued")) return 1;
  if (jobs.some((j) => j.state === "failed")) return 2;
  return 3; // succeeded / cancelled — bitmiş, en altta
}

function latestCreatedAt(jobs: MediaJobRow[]): string {
  return jobs.reduce((max, j) => (j.created_at > max ? j.created_at : max), "");
}

/**
 * `content_item_id` olmayan işler (persona kurulumu, §4d) HARİÇ tutulur —
 * onlar bir "prodüksiyon" değil, personanın kendi geçmişi
 * (`countPersonaUsage` de aynı gerekçeyle onları saymaz).
 *
 * Sıralama: hâlâ çalışan/sırada olan gruplar önce, en yeni iş en üstte.
 */
export function buildProductions(jobs: readonly MediaJobRow[]): ProductionGroup[] {
  const byContent = new Map<string, MediaJobRow[]>();
  for (const job of jobs) {
    if (!job.content_item_id) continue;
    const list = byContent.get(job.content_item_id) ?? [];
    list.push(job);
    byContent.set(job.content_item_id, list);
  }

  const groups: ProductionGroup[] = [...byContent.entries()].map(([contentItemId, contentJobs]) => {
    const sorted = [...contentJobs].sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step]);
    return {
      contentItemId,
      jobs: sorted,
      personaId: sorted.find((j) => j.persona_id)?.persona_id ?? null,
    };
  });

  return groups.sort((a, b) => {
    const byUrgency = urgency(a.jobs) - urgency(b.jobs);
    if (byUrgency !== 0) return byUrgency;
    return latestCreatedAt(b.jobs).localeCompare(latestCreatedAt(a.jobs));
  });
}

/** Bir personanın kaç FARKLI içerikte kullanıldığı — `/studio/personas`'ın sayacı.
 *  Persona kurulum işleri (`content_item_id: null`) sayılmaz. */
export function countPersonaUsage(jobs: readonly MediaJobRow[], personaId: string): number {
  const ids = new Set(
    jobs.filter((j) => j.persona_id === personaId && j.content_item_id).map((j) => j.content_item_id!),
  );
  return ids.size;
}

/** İşlem/kredi toplamı — C3. Ücretlendirilmiş varsa o, yoksa tahmin. */
export function totalCredits(jobs: readonly MediaJobRow[]): number {
  return jobs.reduce((sum, j) => sum + (j.credits_charged ?? j.credits_estimated), 0);
}
