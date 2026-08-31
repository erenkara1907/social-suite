/**
 * ← threadly/lib/ai/client.ts ERROR_COPY
 * Uyarlama: threadly'nin İngilizce-öncelikli, `.env.local` odaklı metinleri
 * bu ürünün gerçeklerine göre yeniden yazıldı (anahtar artık `/settings`'ten
 * girilir, `.env.local`'dan DEĞİL — §8.6). Kapsam threadly'nin 8 kodundan
 * bu ürünün 13 `ApiErrorCode`'una genişletildi (adım 14 FAZ B).
 *
 * Kullanıcıya görünen HER hata kodu için TR/EN metin — BIRLESIM_PLANI §12
 * adım 14 FAZ B. `ApiErrorCode`'a yeni bir üye eklenirse bu dosya derlenmez
 * (Record<ApiErrorCode, L> tam kapsam ister) — kapsama açık bir kapı.
 *
 * ⚠ `ApiError.detail` (RAW sağlayıcı/Postgres hata metni) burada YOK ve
 * kullanıcıya HİÇBİR YERDE gösterilmemeli — worker'ın `sanitizeErrorMessage()`
 * deseninin UI tarafı: en güvenli sızıntı önleme, sızabilecek metni hiç
 * render etmemektir. `detail` yalnızca sunucu logunda/`last_error`'da yaşar.
 */
import type { L } from "@/lib/i18n/config";
import type { ApiErrorCode } from "@/lib/core/ai/types";

export const AI_ERROR_COPY: Record<ApiErrorCode, L> = {
  duplicate: {
    tr: "Bu içerik daha önce üretilmiş (tekrar önleme motoru engelledi).",
    en: "This content was already generated — blocked by duplicate detection.",
  },
  forbidden: {
    tr: "Bu markaya erişim yetkin yok.",
    en: "You don't have access to this brand.",
  },
  invalid_input: {
    tr: "Girdi geçersiz. Kontrol edip tekrar dene.",
    en: "Invalid input. Check it and try again.",
  },
  invalid_key: {
    tr: "Anthropic anahtarı reddedildi. /settings'ten anahtarı kontrol edip güncelle.",
    en: "The Anthropic key was rejected. Check and update it from /settings.",
  },
  missing_key: {
    tr: "Bir Anthropic anahtarı bağlı değil. /settings'ten ekleyebilirsin.",
    en: "No Anthropic key is connected. Add one from /settings.",
  },
  not_configured: {
    tr: "Bu özellik için gerekli yapılandırma eksik.",
    en: "Required configuration for this feature is missing.",
  },
  not_found: {
    tr: "Bu kayıt bulunamadı.",
    en: "That record could not be found.",
  },
  publish_failed: {
    tr: "Yayınlama başarısız oldu. Kanal bağlantısını kontrol et.",
    en: "Publishing failed. Check your channel connection.",
  },
  rate_limited: {
    tr: "Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.",
    en: "Too many requests. Wait a moment and try again.",
  },
  refused: {
    tr: "Model bu isteği yanıtlamadı. Fikri yeniden ifade edip tekrar dene.",
    en: "The model declined this request. Rephrase the idea and try again.",
  },
  service_paused: {
    tr: "AI çağrıları geçici olarak durduruldu. Kısa süre sonra tekrar dene.",
    en: "AI calls are temporarily paused. Try again shortly.",
  },
  storage_error: {
    tr: "Kaydetme başarısız oldu. Birazdan tekrar dene.",
    en: "Saving failed. Try again in a moment.",
  },
  timeout: {
    tr: "İstek zaman aşımına uğradı. Tekrar dene.",
    en: "The request timed out. Try again.",
  },
  unauthenticated: {
    tr: "Önce giriş yapmalısın.",
    en: "Sign in first.",
  },
  upstream_error: {
    tr: "Üretim başarısız oldu (sağlayıcı hatası). Birazdan tekrar dene.",
    en: "Generation failed (a provider error). Try again in a moment.",
  },
};
