/**
 * StoragePort — CANLI implementasyon. §12 adım 19.
 *
 * ⚠ İSKELET. Adım 5 arayüzü kuruyor, gövdeyi yazmıyor.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan gelir (§8.6) ve buraya PARAMETRE
 * olarak iner — env'den okunan bir anahtar tüm müşteriler için ortak olurdu.
 * Çözüm katmanı adım 13'te yazılacak.
 */
import type { StoragePort } from "@/lib/adapters/ports";

const NOT_IMPLEMENTED = "not implemented";

export const liveStorage: StoragePort = {
  async persistFromUrl() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async persistBytes() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async list() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
