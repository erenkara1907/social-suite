/**
 * VoicePort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/personas.ts` → `DEMO_VOICES` / `DEMO_TURKISH_VOICES`.
 * ⚠ Sıfır ağ isteği. Canlı karşılığı ElevenLabs (§12 adım 20).
 *
 * `synthesize` boş bir tampon döndürüyor — demoda ses çalınmıyor, akış
 * gösteriliyor. Sahte bir mp3 gömmek ~200 KB'lık ölü ağırlık olurdu.
 */
import type { VoicePort } from "@/lib/adapters/ports";
import { DEMO_TURKISH_VOICES, DEMO_VOICES } from "@/lib/adapters/demo/fixtures/personas";

const EMPTY_AUDIO_BYTES = 0;

export const demoVoice: VoicePort = {
  async list() {
    return DEMO_VOICES;
  },
  async listTurkish() {
    return DEMO_TURKISH_VOICES;
  },
  async synthesize() {
    return { ok: true, data: new ArrayBuffer(EMPTY_AUDIO_BYTES) };
  },
};
