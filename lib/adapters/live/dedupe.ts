/**
 * DedupePort (EmbeddingPort) — CANLI implementasyon. §12 adım 15, revize A0/A3.3.
 *
 * ⚠ BUGÜNKÜ DURUM (revize A0) — Voyage anahtarı hiçbir markada GİRİLMEDİ ve
 * Voyage entegrasyonu bu oturumda YAZILMADI (⚠ DOĞRULANMALI kalan model
 * adı/`output_dimension` teyidi olmadan sağlayıcıya özgü kod yazmamak için —
 * bkz. `docs/BIRLESIM_PLANI.md` §11 S3, bu adımda "açık" olarak güncellendi).
 * Bu KALICI bir ürün durumu olabilir (BYOK modelinde her müşteri beşinci
 * anahtarı girmeyecek) — motor bunu bir HATA değil bir MOD olarak ele alıyor
 * (bkz. `lib/core/dedupe/index.ts`'in "Katman 2 kapalıysa" dalı).
 *
 * ⚠ `isAvailable()` bugün HER ZAMAN false — yalnızca "marka için Voyage
 * anahtarı var mı" sorusuna DEĞİL, "bu implementasyon gerçekten embed
 * üretebiliyor mu" sorusuna da bağlı. İkincisi bugün her zaman hayır. Bunu
 * yalnızca kimlik bilgisi varlığına bağlamak bir tuzak kurardı: bir marka
 * Voyage anahtarını girse bile `embed()` aşağıda hâlâ `not_configured`
 * döner — `isAvailable()` bunu gizleyip motoru boş bir `embed()` çağrısına
 * sürüklemesin diye kimlik bilgisini HİÇ SORMUYOR, bilerek sabit false.
 *
 * Voyage entegrasyonu yazıldığında (ayrı bir oturum): `embed()` gerçek HTTP
 * çağrısını yapar, `resolveProviderCredential(brandId, "voyage")` ile
 * anahtarı çözer (§8.6 — `process.env` OKUMAZ), dönen vektör uzunluğunu
 * `EMBEDDING_DIMENSIONS`'a karşı doğrular ve FARKLIYSA fırlatır (D3 —
 * sessizce kırpma/doldurma yok); `isAvailable()` o zaman gerçek kimlik
 * bilgisi kontrolüne geçer.
 */
import type { DedupePort } from "@/lib/adapters/ports";

export const liveDedupe: DedupePort = {
  async embed() {
    return {
      ok: false,
      error: { code: "not_configured", detail: "Voyage entegrasyonu henüz yazılmadı (§12 adım 15+)" },
    };
  },
  async isAvailable() {
    return false;
  },
};
