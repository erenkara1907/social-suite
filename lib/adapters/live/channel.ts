/**
 * ChannelPort — CANLI implementasyon. §12 adım 16 (OAuth) / 11b (kabuk).
 *
 * ⭐ 11b FAZ A — `list()` artık GERÇEK bir okuma: `channels` tablosu OAuth
 * beklemeden de var (adım 5'in şeması), bu yüzden `/channels` ekranı canlı
 * modda "not implemented" ile çökmek yerine (bugün için) boş bir liste
 * görür — hiçbir marka henüz bağlanmadığı için satır sayısı sıfır, ama
 * sorgu GERÇEK ve RLS'ten geçiyor. Adım 16 Instagram OAuth callback'i
 * `channels`'a satır yazmaya başladığında bu ekran DEĞİŞMEDEN onu gösterir.
 *
 * `startConnect`/`disconnect` hâlâ İSKELET: `/channels`'ın "Bağla" düğmesi
 * bu fazda bilerek `disabled` (görev metni: "sahte OAuth akışı kurma"),
 * yani bu iki metot bugün hiçbir UI yolundan çağrılmıyor. Gövdeleri adım
 * 16'nın işi.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ. Müşteri anahtarı
 * `provider_credentials` + Vault'tan gelir (§8.6) ve buraya PARAMETRE
 * olarak iner — env'den okunan bir anahtar tüm müşteriler için ortak olurdu.
 * Çözüm katmanı adım 13'te yazılacak.
 */
import type { ChannelPort } from "@/lib/adapters/ports";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import type { ChannelRow } from "@/lib/core/types";

const NOT_IMPLEMENTED = "not implemented";

const CHANNEL_COLUMNS = "id,platform,handle,followers,growth,engagement,is_connected,last_synced_at";

export const liveChannel: ChannelPort = {
  async list() {
    const { brand } = await requireBrand();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("channels")
      .select(CHANNEL_COLUMNS)
      .eq("brand_id", brand.id)
      .order("platform", { ascending: true })
      .returns<ChannelRow[]>();
    if (error) throw new Error(`channels listelenemedi: ${error.message}`);
    return data ?? [];
  },
  async startConnect() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async disconnect() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
