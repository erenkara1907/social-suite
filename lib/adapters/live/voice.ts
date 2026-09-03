/**
 * VoicePort — CANLI implementasyon. §12 adım 20.
 *
 * Bu üç metot vendor'ı DOĞRUDAN çağırır (kuyruk üzerinden DEĞİL) — burası
 * "canlı önizleme" yüzeyi: `/studio`'nun ses seçicisi menüyü doldururken
 * (`list`/`listTurkish`) ya da kullanıcı bir sesi ÖNİZLERKEN (`synthesize`,
 * kalıcılaştırma YOK) para harcanır ama bu bir ÜRETİM işi değil — kredi
 * maliyeti göz ardı edilebilir düzeyde (birkaç saniyelik TTS) ve kuyruğun
 * "para harcayan her şey kuyruktan geçer" kuralı `ugc_pipeline`in KENDİSİ
 * için var (§4d); bir menü doldurma çağrısını kuyruklamak gecikme katardı.
 */
import type { VoicePort } from "@/lib/adapters/ports";
import { requireBrand } from "@/lib/server/auth";
import { resolveProviderCredential } from "@/lib/server/credentials";
import { listVoices, listTurkishVoices, synthesizeSpeech, MAX_SCRIPT_CHARS } from "@/lib/core/providers/elevenlabs";

async function apiKeyOrThrow(): Promise<string> {
  const { brand } = await requireBrand();
  const { apiKey } = await resolveProviderCredential(brand.id, "elevenlabs");
  if (!apiKey) throw new Error("elevenlabs anahtarı yapılandırılmamış");
  return apiKey;
}

export const liveVoice: VoicePort = {
  async list() {
    return listVoices(await apiKeyOrThrow());
  },
  async listTurkish() {
    return listTurkishVoices(await apiKeyOrThrow());
  },
  async synthesize(text, voiceId) {
    if (text.length > MAX_SCRIPT_CHARS) {
      return { ok: false, error: { code: "invalid_input", detail: `metin ${MAX_SCRIPT_CHARS} karakteri aşıyor` } };
    }
    try {
      const apiKey = await apiKeyOrThrow();
      const bytes = await synthesizeSpeech(text, voiceId, apiKey);
      return { ok: true, data: bytes };
    } catch (err) {
      return { ok: false, error: { code: "upstream_error", detail: (err as Error).message } };
    }
  },
};
