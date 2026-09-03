import { isDemo, port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { countPersonaUsage } from "@/lib/core/derive/media";
import type { TurkishVoice } from "@/lib/core/providers/elevenlabs";
import { PersonaStudioView, type PersonaCardView } from "@/components/app/persona-studio-view";

export const metadata = { title: "Personalar" };

/** "Mira — barista" → { displayName: "Mira", role: "barista" }. Ayraç yoksa
 *  tüm ad displayName olur, role boş kalır. */
function splitPersonaName(name: string): { displayName: string; role: string } {
  const [displayName, ...rest] = name.split(" — ");
  return { displayName: displayName.trim(), role: rest.join(" — ").trim() };
}

/**
 * `/studio/personas` — BIRLESIM_PLANI §12 adım 10 FAZ B.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⚠ Veriye yalnızca `port("...")` üzerinden erişiliyor; doğrudan fixture
 * importu veya dosya sistemi okuması YOK (B1 — sahne'nin JSON registry
 * tuzağına düşülmedi).
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const videoPort = port("video", overrides);
  const storagePort = port("storage", overrides);

  const [personas, jobs, images] = await Promise.all([
    videoPort.listPersonas(),
    videoPort.listAllJobs(),
    storagePort.list("image"),
  ]);

  // ⭐ FAZ A — ses seçimi OPSİYONEL (`createPersona`'nın `defaultVoiceId`si
  // öyle). Marka henüz elevenlabs anahtarı yapılandırmadıysa `listTurkish()`
  // hata fırlatır (`liveVoice.ts` `apiKeyOrThrow()`) — formu çökertmek yerine
  // sessizce boş listeyle devam edilir, kullanıcı persona'yı yine oluşturabilir.
  let voices: TurkishVoice[] = [];
  try {
    voices = await port("voice", overrides).listTurkish();
  } catch {
    voices = [];
  }

  const imageById = new Map(images.map((asset) => [asset.id, asset]));

  const views: PersonaCardView[] = personas.map((persona) => {
    const { displayName, role } = splitPersonaName(persona.name);
    return {
      id: persona.id,
      name: displayName,
      role,
      prompt: persona.prompt,
      imageUrl: persona.image_asset_id ? (imageById.get(persona.image_asset_id)?.public_url ?? null) : null,
      usedInCount: countPersonaUsage(jobs, persona.id),
    };
  });

  return <PersonaStudioView personas={views} voices={voices} newPersonaDisabled={isDemo("video", overrides)} />;
}
