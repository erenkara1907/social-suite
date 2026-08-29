/**
 * İş hata sınıflandırması — BIRLESIM_PLANI §12 adım 12 FAZ B3.
 *
 * Bir işleyici (`lib/server/jobs/handlers.ts`) attığı hatanın TÜRÜNÜ bu iki
 * sınıftan biriyle bildirir; worker (`lib/server/jobs/worker.ts`) buna göre
 * karar verir:
 *
 *   - `PermanentJobError` — kalıcı hata (örn. geçersiz payload, desteklenmeyen
 *     platform). Yeniden denemek SONUCU DEĞİŞTİRMEZ — worker doğrudan `dead`
 *     durumuna geçirir, `max_attempts`'i beklemez.
 *   - `TransientJobError` — geçici hata (örn. ağ, sağlayıcı 429/5xx, zaman
 *     aşımı). Worker üstel geri çekilmeyle YENİDEN KUYRUĞA koyar;
 *     `max_attempts` aşılınca yine `dead`.
 *
 * Bir işleyici bu ikisinden BİRİNİ atmazsa (düz `Error`/beklenmeyen istisna),
 * worker onu GEÇİCİ sayar — varsayılan güvenli taraf: gerçekten kalıcı bir
 * hatayı yanlışlıkla geçici saymak birkaç fazla deneme sonunda yine `dead`'e
 * varır (israf ama zararsız); geçici bir hatayı yanlışlıkla kalıcı saymak
 * kurtarılabilir bir işi ERKEN gömer (geri dönüşü yok).
 */

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class TransientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientJobError";
  }
}
