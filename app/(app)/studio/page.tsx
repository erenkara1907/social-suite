import { isDemo, port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildProductions, totalCredits } from "@/lib/core/derive/media";
import {
  LIPSYNC_CREDITS_PER_SECOND, PERSONA_IMAGE_CREDITS, PERSONA_VIDEO_CREDITS_PER_SECOND,
  PERSONA_VIDEO_DURATION_DEFAULT, PERSONA_VIDEO_MODE_DEFAULT,
} from "@/lib/core/providers/kie";
import type { ContentItemRow, MediaJobStep, PersonaRow } from "@/lib/core/types";
import { StudioView, type CostRow, type ProductionView } from "@/components/app/studio-view";

export const metadata = { title: "Stüdyo" };

/**
 * §12 adım 10 C3 — dört adımın gerçek işlem/kredi maliyeti. Rakamlar
 * `lib/core/providers/kie.ts`'in ölçülmüş sabitlerinden — buraya özel bir
 * fiyat İCAT EDİLMEDİ. `voice` (ElevenLabs) hep 0 kredi: fixture'daki her
 * `voice` işinin `credits_estimated`i de 0 — bu, bir API tahmini değil,
 * ElevenLabs'ın abonelik modelinin doğru yansıması.
 */
function buildCostRows(): CostRow[] {
  const personaVideoCredits = Number(PERSONA_VIDEO_DURATION_DEFAULT) * PERSONA_VIDEO_CREDITS_PER_SECOND[PERSONA_VIDEO_MODE_DEFAULT];
  return [
    { step: "persona_image", vendor: "Kie · Nano Banana Pro", credits: `${PERSONA_IMAGE_CREDITS}` },
    { step: "persona_video", vendor: "Kie · Kling 3.0", credits: `~${personaVideoCredits} (${PERSONA_VIDEO_DURATION_DEFAULT}sn)` },
    { step: "voice", vendor: "ElevenLabs", credits: null },
    { step: "lipsync", vendor: "fal · sync-lipsync", credits: `${LIPSYNC_CREDITS_PER_SECOND}/sn` },
  ];
}

/** FAZ C — bir "Üret" tıklamasının tahmini maliyeti: `persona_image` hariç
 *  (personanın kendisi oluşturulurken zaten bir kere yapıldı), `voice` 0
 *  kredi (ElevenLabs abonelik) — yalnızca persona_video + lipsync sayılır. */
function estimateGenerateCredits(): number {
  const personaVideoCredits = Number(PERSONA_VIDEO_DURATION_DEFAULT) * PERSONA_VIDEO_CREDITS_PER_SECOND[PERSONA_VIDEO_MODE_DEFAULT];
  const lipsyncCredits = Number(PERSONA_VIDEO_DURATION_DEFAULT) * LIPSYNC_CREDITS_PER_SECOND;
  return personaVideoCredits + lipsyncCredits;
}

/**
 * `/studio` — BIRLESIM_PLANI §12 adım 10 FAZ C, adım 20 FAZ C1. Ürünün en
 * pahalı işlemi.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⭐ adım 20 FAZ C1 — ADIM_9 varsayım 5'in KAPANIŞI: `/plan`'daki UGC seçimi
 * artık `activity(action='ugc_requested')` satırlarıyla KALICI (React
 * state DEĞİL). `contentPort.listUgcRequested()` bu satırları okur;
 * henüz bir `media_jobs` grubu olmayanlar "üretim sırası" (`pendingItems`)
 * olarak gösterilir — `PendingQueueSection` her satırda persona seçip
 * gerçekten üretimi (`generateUgcAction`) başlatır.
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const videoPort = port("video", overrides);
  const contentPort = port("content", overrides);
  const storagePort = port("storage", overrides);

  const [personas, jobs, images, requestedIds] = await Promise.all([
    videoPort.listPersonas(),
    videoPort.listAllJobs(),
    storagePort.list(),
    contentPort.listUgcRequested(),
  ]);

  const groups = buildProductions(jobs);
  // ⭐ adım 20 FAZ C1 — /plan'da istenmiş (activity: ugc_requested) ama
  // henüz bir media_jobs grubu olmayan içerikler = üretim sırası.
  const groupIds = new Set(groups.map((g) => g.contentItemId));
  const pendingIds = requestedIds.filter((id) => !groupIds.has(id));

  const allContentIds = [...new Set([...groups.map((g) => g.contentItemId), ...pendingIds])];
  const items = await Promise.all(allContentIds.map((id) => contentPort.get(id)));

  const itemById = new Map<string, ContentItemRow>();
  for (const item of items) if (item) itemById.set(item.id, item);
  const personaById = new Map<string, PersonaRow>(personas.map((p) => [p.id, p]));
  const imageById = new Map(images.map((asset) => [asset.id, asset]));

  const pendingItems: ContentItemRow[] = pendingIds
    .map((id) => itemById.get(id))
    .filter((row): row is ContentItemRow => Boolean(row));

  const productions: ProductionView[] = groups.map((group) => {
    // C4 — tamamlanmış bir adımın sonucu bir görsel/poster ise önizlemede göster.
    const posterJob = group.jobs.find((j) => j.state === "succeeded" && j.result_asset_id);
    const posterUrl = posterJob?.result_asset_id ? (imageById.get(posterJob.result_asset_id)?.public_url ?? null) : null;

    return {
      contentItemId: group.contentItemId,
      item: itemById.get(group.contentItemId) ?? null,
      persona: group.personaId ? (personaById.get(group.personaId) ?? null) : null,
      jobs: group.jobs,
      posterUrl,
      credits: totalCredits(group.jobs),
    };
  });

  const PIPELINE_STEPS: MediaJobStep[] = ["persona_image", "persona_video", "voice", "lipsync"];

  return (
    <StudioView
      pipelineSteps={PIPELINE_STEPS}
      costRows={buildCostRows()}
      productions={productions}
      personaCount={personas.length}
      personas={personas}
      pendingItems={pendingItems}
      generateEstimateCredits={estimateGenerateCredits()}
      generateDisabled={isDemo("video", overrides)}
    />
  );
}
