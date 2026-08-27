/**
 * ChannelPort — CANLI implementasyon. §12 adım 16.
 *
 * ⚠ İSKELET. Adım 5 arayüzü kuruyor, gövdeyi yazmıyor.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan gelir (§8.6) ve buraya PARAMETRE
 * olarak iner — env'den okunan bir anahtar tüm müşteriler için ortak olurdu.
 * Çözüm katmanı adım 13'te yazılacak.
 */
import type { ChannelPort } from "@/lib/adapters/ports";

const NOT_IMPLEMENTED = "not implemented";

export const liveChannel: ChannelPort = {
  async list() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async startConnect() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async disconnect() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
