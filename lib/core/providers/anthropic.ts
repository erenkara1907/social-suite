/**
 * Anthropic — yalnızca kimlik bilgisi doğrulaması için. Gerçek üretim
 * çağrıları (`plan_generate`/`caption_write`) `@anthropic-ai/sdk`'yi
 * DOĞRUDAN kullanıyor (`lib/core/plan/skeleton.ts`, `lib/core/ai/caption.ts`,
 * `lib/core/dedupe/judge-continuation.ts`) — bu dosya onların yerini almaz,
 * §8.6'nın "her sağlayıcının kendi modülü" deseninde YENİ bir tek-amaçlı
 * modül: "test et" düğmesinin en ucuz Anthropic çağrısı.
 *
 * BIRLESIM_PLANI §12 adım 20.5 FAZ B — Models API (`models.list`) modelleri
 * LİSTELER, hiçbir token FATURALANDIRMAZ. `messages.create()` (gerçek
 * üretim) en ucuz haliyle bile en az bir girdi/çıktı token'ı harcar — bu uç
 * nokta harcamaz, salt okunur bir hesap bilgisi sorgusu.
 */
import Anthropic from "@anthropic-ai/sdk";
import { classifyAnthropicError } from "@/lib/core/ai/classify-error";

export interface VendorKeyCheck {
  ok: boolean;
  error?: string;
}

/** Hata sınıflandırması `classifyAnthropicError`'ın AYNISI (adım 14'ten) —
 *  ayrı bir try/catch iskeleti İCAT EDİLMEDİ (DRY). */
export async function verifyAnthropicKey(apiKey: string): Promise<VendorKeyCheck> {
  try {
    await new Anthropic({ apiKey }).models.list({ limit: 1 });
    return { ok: true };
  } catch (error) {
    const { detail } = classifyAnthropicError(error);
    return { ok: false, error: detail };
  }
}
