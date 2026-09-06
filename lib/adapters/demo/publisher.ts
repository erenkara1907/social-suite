/**
 * PublisherPort — DEMO implementasyon.
 *
 * ⚠ NO-OP. Hiçbir yere hiçbir şey gitmiyor; damga sahte. FAZ 1'in kabul
 * kriteri tam olarak bu: "hiçbir dış servis çağrılmaz".
 *
 * ⭐ `supported()` GERÇEĞİ söylüyor: `PUBLISHABLE_PLATFORMS`, yani bugün
 * yalnızca `bluesky` (17a — Instagram Meta App Review beklerken onay
 * gerektirmeyen bir platformla kanıtlandı). Demoda altı platformu da
 * "yayınlanabilir" göstermek, satış görüşmesinde tutulamayacak bir söz
 * olurdu. §8.8/adım 16-17b listeyi genişletince demo da kendiliğinden
 * genişler.
 */
import type { PublisherPort } from "@/lib/adapters/ports";
import { PUBLISHABLE_PLATFORMS } from "@/lib/core/publishing";

export const demoPublisher: PublisherPort = {
  async publish(contentItemId) {
    return {
      ok: true,
      data: {
        externalPostId: `demo_${contentItemId.slice(-6)}`,
        publishedAt: new Date().toISOString(),
        permalink: null,
      },
    };
  },
  supported() {
    return PUBLISHABLE_PLATFORMS;
  },
};
