/**
 * UGC personaları ve ses menüsü — `/studio/personas` ve `/studio`.
 *
 * ← sahne `lib/demo/data.ts:31` `actors` + ElevenLabs'ın gerçek `Voice` /
 *   `TurkishVoice` şekli (`lib/core/providers/elevenlabs.ts`).
 *
 * ⚠ Bu dosyada TİP TANIMI YOK.
 *
 * ⚠ sahne'nin `public/personas/*.png` dosyaları KOPYALANMADI. §9.2 onları demo
 * kaynağı olarak sayıyor ama S5'in gerekçesi burada da geçerli: bunlar başka
 * bir markanın üretilmiş varlıkları. `image_asset_id` `media.ts`'teki
 * placeholder varlıklara bağlanıyor — üretim akışı doğru anlatılıyor, başkasının
 * görseli taşınmıyor.
 *
 * ⚠ `TurkishVoice.isNative` ayrımı korundu: ElevenLabs'ın `?language=tr`
 * filtresi katı ve hesapta yalnızca üç ses döndürüyor, hepsi kadın
 * (`elevenlabs.ts:88-97`). Erkek persona için menüde "Türkçe konuştuğu
 * doğrulanmış" sesler var — demo bu gerçeği gizlemiyor.
 */
import type { TurkishVoice, Voice } from "@/lib/core/providers/elevenlabs";
import type { PersonaRow } from "@/lib/core/types";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { day } from "@/lib/adapters/demo/fixtures/clock";

export const DEMO_PERSONA_IDS = {
  mira: "e0000000-0000-4000-8000-000000000001",
  kerem: "e0000000-0000-4000-8000-000000000002",
  selin: "e0000000-0000-4000-8000-000000000003",
} as const;

export const DEMO_VOICE_IDS = {
  ada: "voice_demo_ada",
  deniz: "voice_demo_deniz",
  kaan: "voice_demo_kaan",
  elif: "voice_demo_elif",
} as const;

export function demoPersonas(now: Date): PersonaRow[] {
  return [
    {
      id: DEMO_PERSONA_IDS.mira,
      brand_id: DEMO_BRAND_ID,
      name: "Mira — barista",
      prompt:
        "30'lu yaşlarında kadın barista, koyu yeşil önlük, arkada bulanık " +
        "espresso makinesi ve ahşap tezgâh, sıcak sabah ışığı, dikey kadraj, " +
        "doğal ten dokusu, kameraya bakıyor",
      image_asset_id: "a0000000-0000-4000-8000-000000000001",
      default_voice_id: DEMO_VOICE_IDS.ada,
      is_archived: false,
      created_at: day(now, -46),
    },
    {
      id: DEMO_PERSONA_IDS.kerem,
      brand_id: DEMO_BRAND_ID,
      name: "Kerem — kavurma ustası",
      prompt:
        "40'lı yaşlarında erkek, kısa sakal, gri iş önlüğü, arkada kavurma " +
        "makinesi ve çuvallar, endüstriyel tavan ışığı, dikey kadraj",
      image_asset_id: "a0000000-0000-4000-8000-000000000002",
      default_voice_id: DEMO_VOICE_IDS.kaan,
      is_archived: false,
      created_at: day(now, -39),
    },
    /* Arşivli persona: liste filtresinin çalıştığını gösteriyor
       (`personas_brand_idx ... where not is_archived`). */
    {
      id: DEMO_PERSONA_IDS.selin,
      brand_id: DEMO_BRAND_ID,
      name: "Selin — ilk deneme",
      prompt: "20'li yaşlarında kadın, beyaz arka plan, stüdyo ışığı",
      image_asset_id: null,
      default_voice_id: null,
      is_archived: true,
      created_at: day(now, -52),
    },
  ];
}

/** Hesabın tüm sesleri — `listVoices()`'ın şekli. */
export const DEMO_VOICES: Voice[] = [
  { id: DEMO_VOICE_IDS.ada, name: "Ada", accent: "turkish", gender: "female" },
  { id: DEMO_VOICE_IDS.deniz, name: "Deniz", accent: "turkish", gender: "female" },
  { id: DEMO_VOICE_IDS.elif, name: "Elif", accent: "turkish", gender: "female" },
  { id: DEMO_VOICE_IDS.kaan, name: "Kaan", accent: "european", gender: "male" },
];

/** `listTurkishVoices()`'ın şekli — iki katmanlı liste (native + doğrulanmış). */
export const DEMO_TURKISH_VOICES: TurkishVoice[] = [
  {
    voiceId: DEMO_VOICE_IDS.ada,
    name: "Ada",
    labels: { gender: "female", age: "young", accent: "turkish", descriptive: "warm" },
    previewUrl: null,
    isNative: true,
  },
  {
    voiceId: DEMO_VOICE_IDS.deniz,
    name: "Deniz",
    labels: { gender: "female", age: "middle-aged", accent: "turkish", descriptive: "calm" },
    previewUrl: null,
    isNative: true,
  },
  {
    voiceId: DEMO_VOICE_IDS.elif,
    name: "Elif",
    labels: { gender: "female", age: "young", accent: "turkish", descriptive: "bright" },
    previewUrl: null,
    isNative: true,
  },
  /* ⚠ Erkek ses native listede YOK — hesabın Türkçe sesleri üç ve hepsi kadın.
     Bu satır "Türkçe konuştuğu doğrulanmış" katmandan geliyor. */
  {
    voiceId: DEMO_VOICE_IDS.kaan,
    name: "Kaan",
    labels: { gender: "male", age: "middle-aged", accent: "european", descriptive: "steady" },
    previewUrl: null,
    isNative: false,
  },
];
