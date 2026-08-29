/**
 * VideoPort — CANLI implementasyon. §12 adım 20.
 *
 * ⚠ İSKELET. Adım 5 arayüzü kuruyor, gövdeyi yazmıyor.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan gelir (§8.6) ve buraya PARAMETRE
 * olarak iner — env'den okunan bir anahtar tüm müşteriler için ortak olurdu.
 * Çözüm katmanı adım 13'te yazılacak.
 */
import type { VideoPort } from "@/lib/adapters/ports";

const NOT_IMPLEMENTED = "not implemented";

export const liveVideo: VideoPort = {
  async start() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async getJob() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async listJobs() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async listAllJobs() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async listPersonas() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async createPersona() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
