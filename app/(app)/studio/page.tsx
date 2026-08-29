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
    { step: "voice", vendor: "ElevenLabs", credits: null },
    { step: "persona_video", vendor: "Kie · Kling 3.0", credits: `~${personaVideoCredits} (${PERSONA_VIDEO_DURATION_DEFAULT}sn)` },
    { step: "lipsync", vendor: "fal · sync-lipsync", credits: `${LIPSYNC_CREDITS_PER_SECOND}/sn` },
  ];
}

/**
 * `/studio` — BIRLESIM_PLANI §12 adım 10 FAZ C. Ürünün en pahalı işlemi.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⭐ C2 — `/plan`'ın UGC seçimiyle burası BİLEREK birleştirilmedi (seçim
 * React state'te, sayfa değişince kayboluyor — ADIM_9 varsayım 5).
 * Aşağıdaki üretim listesi zaten kuyruğa girmiş GERÇEK `media_jobs`
 * kayıtlarından geliyor; `StudioView`'daki not bu kopukluğu kullanıcıya
 * açıkça anlatıyor.
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const videoPort = port("video", overrides);
  const contentPort = port("content", overrides);
  const storagePort = port("storage", overrides);

  const [personas, jobs, images] = await Promise.all([
    videoPort.listPersonas(),
    videoPort.listAllJobs(),
    storagePort.list(),
  ]);

  const groups = buildProductions(jobs);
  const items = await Promise.all(groups.map((g) => contentPort.get(g.contentItemId)));

  const itemById = new Map<string, ContentItemRow>();
  for (const item of items) if (item) itemById.set(item.id, item);
  const personaById = new Map<string, PersonaRow>(personas.map((p) => [p.id, p]));
  const imageById = new Map(images.map((asset) => [asset.id, asset]));

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

  const PIPELINE_STEPS: MediaJobStep[] = ["persona_image", "voice", "persona_video", "lipsync"];

  return (
    <StudioView
      pipelineSteps={PIPELINE_STEPS}
      costRows={buildCostRows()}
      productions={productions}
      personaCount={personas.length}
      generateDisabled={isDemo("video", overrides)}
    />
  );
}
