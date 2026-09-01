/**
 * DedupePort (EmbeddingPort) — DEMO implementasyon. §12 adım 15, revize A3.2.
 *
 * ⭐ `isAvailable()` HER ZAMAN true, `embed()` HER ZAMAN başarılı — demo modun
 * amacı ürünün akışını göstermek, bu yüzden Katman 2 burada "her zaman açık".
 * Bu, ÖNCEKİ tasarımın tersi (bkz. git geçmişi — eskiden demo embed hep
 * `not_configured` dönerdi, "ölçülmemiş bir eşiği ölçülmüş gibi göstermeyelim"
 * gerekçesiyle). O gerekçe hâlâ geçerli AMA görev revizyonu farklı bir
 * ihtiyacı önceliklendirdi: testlerin (ve bu portu çağıran hiçbir gerçek akış
 * olmadığı için asıl faydası testlerin) Katman 2/3 mantığını MOCK'SUZ
 * sınayabilmesi. Vektörler `demoEmbed()`'den — deterministik, dış istek YOK,
 * gerçek bir sağlayıcının anlamsal yapısını taklit ETMEZ (bkz. o dosyanın
 * başlığı). `/settings`'te "ölçülmedi" uyarısı whenMissing metniyle DEĞİL,
 * `DEFAULT_DEDUPE_CONFIG`'in ⚠ yorumuyla taşınıyor.
 */
import type { DedupePort } from "@/lib/adapters/ports";
import { demoEmbed } from "@/lib/core/dedupe/demo-embedding";

export const demoDedupe: DedupePort = {
  async embed(input) {
    return { ok: true, data: demoEmbed(input) };
  },
  async isAvailable() {
    return true;
  },
};
