import { isDemo, port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { findAssetLink } from "@/lib/core/derive/media";
import { LibraryView, type MediaAssetCardView } from "@/components/app/library-view";

export const metadata = { title: "Kütüphane" };

/**
 * `/library` — BIRLESIM_PLANI §12 adım 11b FAZ B.
 *
 * ⚠ Medyaya yalnızca `port("storage")` üzerinden erişiliyor —
 * `StoragePort.list()` canlı modda `media_assets`'i `brand_id` ile SCOPE'lu
 * okuyor (`lib/adapters/live/storage.ts`), RLS ("brand media" politikası)
 * ikinci bir kat. A markasının medyası B'ye asla gelmiyor — kanıtı
 * `e2e/library.spec.ts`.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const storagePort = port("storage", overrides);
  const videoPort = port("video", overrides);
  const contentPort = port("content", overrides);

  const [assets, jobs, personas, items] = await Promise.all([
    storagePort.list(),
    videoPort.listAllJobs(),
    videoPort.listPersonas(),
    contentPort.list(),
  ]);

  const personaById = new Map(personas.map((p) => [p.id, p]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const cards: MediaAssetCardView[] = assets
    .map((asset) => {
      const link = findAssetLink(asset.id, jobs);
      const linkedLabel = link?.personaId
        ? { tr: `Persona: ${personaById.get(link.personaId)?.name ?? "—"}`, en: `Persona: ${personaById.get(link.personaId)?.name ?? "—"}` }
        : link?.contentItemId
          ? { tr: `İçerik: ${itemById.get(link.contentItemId)?.title ?? "—"}`, en: `Content: ${itemById.get(link.contentItemId)?.title ?? "—"}` }
          : null;

      return {
        id: asset.id,
        kind: asset.kind,
        vendor: asset.source_vendor,
        publicUrl: asset.public_url,
        mimeType: asset.mime_type,
        bytes: asset.bytes,
        createdAt: asset.created_at,
        linkedLabel,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <LibraryView cards={cards} isDemo={isDemo("storage", overrides)} />;
}
