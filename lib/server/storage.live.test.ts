// @vitest-environment node
//
// Gerçek Supabase Storage + gerçek ağ (fetch-guard üzerinden) — jsdom'un
// fetch/stream polyfill'leri araya girmesin diye `handlers.dedupe.live.
// test.ts` ile AYNI gerekçeyle `node` ortamına geçiyor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistVendorAsset } from "@/lib/server/storage";

/**
 * §4g köprüsünün UÇTAN UCA canlı kanıtı — BIRLESIM_PLANI §12 adım 19 FAZ C.
 *
 * Kie/fal/ElevenLabs kimlikleri henüz sağlanmadı (UGC video üretimi adım
 * 20'nin işi — plan sırası bu oturumda 19→20→16→17→18 olarak değişti,
 * §12 revizyonuna bakın). Bu yüzden "vendor'ın geçici URL'i" burada gerçek
 * Supabase Storage'a yüklenmiş bir dosyanın public URL'i — FAZ A'nın
 * allowlist'i bunu zaten "Kie, fal, ElevenLabs, Supabase Storage" olarak
 * dört vendor'dan biri sayıyor, o yüzden bu GERÇEK bir allowlist-içi
 * indirme, taklit değil. Köprü kendisi vendor'ın NASIL ürettiğini bilmez/
 * umursamaz — yalnızca https + allowlist + içerik tipi + boyut görür.
 * Kie/fal ile birebir aynı yol adım 20'de gerçek üretim çıktısıyla koşacak.
 *
 *   set -a; source .env.local; set +a
 *   RUN_STORAGE_BRIDGE_LIVE_TEST=1 npx vitest run lib/server/storage.live.test.ts
 */
const RUN = process.env.RUN_STORAGE_BRIDGE_LIVE_TEST === "1";

describe.skipIf(!RUN)("persistVendorAsset — uçtan uca canlı köprü (adım 19 FAZ C)", () => {
  // ⚠ `describe.skipIf` skip'lense BİLE describe gövdesi TOPLAMA sırasında
  // çalışır — `createAdminClient()` burada üst düzeyde çağrılsaydı env
  // değişkenleri yokken (RUN=false, bayraksız `npm test`) fırlatırdı.
  // `beforeAll` içine ERTELENMESİ bunu önlüyor (deneyle bulundu, adım 19 FAZ C).
  let admin: ReturnType<typeof createAdminClient>;
  let brandId: string;
  let ownerId: string;
  const sourcePaths: string[] = [];
  const bridgedAssetIds: string[] = [];
  const mediaJobIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    const { data: brandRow, error } = await admin
      .from("brands")
      .select("id,owner_id")
      .limit(1)
      .maybeSingle<{ id: string; owner_id: string }>();
    if (error) throw error;
    if (!brandRow) throw new Error("canlı testin çalışması için en az bir marka gerekiyor");
    brandId = brandRow.id;
    ownerId = brandRow.owner_id;
  });

  afterAll(async () => {
    for (const id of bridgedAssetIds) await admin.from("media_assets").delete().eq("id", id);
    for (const id of mediaJobIds) await admin.from("media_jobs").delete().eq("id", id);
    // Köprülenen nesneler kendi yollarını media_assets satırıyla birlikte
    // sildiği için burada yalnızca "kaynak" (vendor'ı taklit eden) nesneler var.
    if (sourcePaths.length) await admin.storage.from("media").remove(sourcePaths);
  });

  /** "Vendor'ın geçici URL'i"ni taklit eden gerçek bir Storage nesnesi yükler. */
  async function uploadFakeVendorSource(name: string, contentType: string, body: Uint8Array): Promise<string> {
    const path = `vendor-fixtures/${crypto.randomUUID()}-${name}`;
    const { error } = await admin.storage.from("media").upload(path, body, { contentType });
    if (error) throw new Error(`kaynak nesne yüklenemedi: ${error.message}`);
    sourcePaths.push(path);
    const { data } = admin.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  }

  it("gerçek dosyayı indirir, kalıcı depolamaya yazar, kalıcı URL üretir, o URL'e erişilebilir", async () => {
    const body = new TextEncoder().encode("adım 19 FAZ C — uçtan uca köprü kanıtı");
    const sourceUrl = await uploadFakeVendorSource("bridge-proof.png", "image/png", body);

    const result = await persistVendorAsset(admin, {
      brandId,
      userId: ownerId,
      sourceUrl,
      kind: "image",
      vendor: "upload",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    bridgedAssetIds.push(result.data.id);

    expect(result.data.storage_path).toBe(`${ownerId}/${brandId}/image/${result.data.storage_path.split("/").pop()}`);
    expect(result.data.bytes).toBe(body.byteLength);
    expect(result.data.mime_type).toBe("image/png");

    const liveRes = await fetch(result.data.public_url);
    expect(liveRes.status).toBe(200);
    expect(new Uint8Array(await liveRes.arrayBuffer())).toEqual(body);
    console.log("[storage bridge live] kalıcı URL:", result.data.public_url);
  }, 30_000);

  it("idempotency (URL bazlı) — aynı sourceUrl iki kez köprülenirse TEK dosya kalır", async () => {
    const body = new TextEncoder().encode("adım 19 FAZ C — idempotency (url)");
    const sourceUrl = await uploadFakeVendorSource("idempotent-url.png", "image/png", body);

    const first = await persistVendorAsset(admin, { brandId, userId: ownerId, sourceUrl, kind: "image", vendor: "upload" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    bridgedAssetIds.push(first.data.id);

    const second = await persistVendorAsset(admin, { brandId, userId: ownerId, sourceUrl, kind: "image", vendor: "upload" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.id).toBe(first.data.id); // yeni satır YOK, aynısı döndü

    const { data: rows, error } = await admin.from("media_assets").select("id").eq("source_url", sourceUrl);
    if (error) throw error;
    expect(rows).toHaveLength(1);
  }, 30_000);

  it("idempotency (media_jobs bazlı) — ikinci çağrı ağa hiç DOKUNMADAN aynı satırı döner + iş satırı güncellenir", async () => {
    const body = new TextEncoder().encode("adım 19 FAZ C — idempotency (media_jobs)");
    const sourceUrl = await uploadFakeVendorSource("idempotent-job.png", "image/png", body);

    const { data: job, error: jobError } = await admin
      .from("media_jobs")
      .insert({
        brand_id: brandId,
        user_id: ownerId,
        vendor: "kie",
        vendor_model: "nano-banana",
        step: "persona_image",
        state: "succeeded",
        output_url: sourceUrl,
      })
      .select("id")
      .single<{ id: string }>();
    if (jobError) throw jobError;
    mediaJobIds.push(job.id);

    const first = await persistVendorAsset(admin, {
      brandId,
      userId: ownerId,
      sourceUrl,
      kind: "image",
      vendor: "kie",
      mediaJobId: job.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    bridgedAssetIds.push(first.data.id);

    const { data: jobAfterFirst } = await admin
      .from("media_jobs")
      .select("state,result_asset_id")
      .eq("id", job.id)
      .single<{ state: string; result_asset_id: string }>();
    expect(jobAfterFirst?.state).toBe("succeeded");
    expect(jobAfterFirst?.result_asset_id).toBe(first.data.id);

    // İkinci çağrı: aynı iş id'si. `findExistingByJob` sonucu ANINDA döner,
    // guardedFetch/Storage'a hiç gidilmez (kod yolu — bkz. storage.ts).
    const second = await persistVendorAsset(admin, {
      brandId,
      userId: ownerId,
      sourceUrl,
      kind: "image",
      vendor: "kie",
      mediaJobId: job.id,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.id).toBe(first.data.id);
  }, 30_000);

  it("içerik tipi uyuşmazlığı → indirme HİÇ BAŞLAMADAN reddedilir, yetim kayıt yok", async () => {
    const body = new TextEncoder().encode("bu bir video değil");
    const sourceUrl = await uploadFakeVendorSource("not-a-video.txt", "text/plain", body);

    const result = await persistVendorAsset(admin, {
      brandId,
      userId: ownerId,
      sourceUrl,
      kind: "video", // beklenen video/*, gelen text/plain
      vendor: "upload",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("storage_error");
    expect(result.error.detail).toContain("content_type_mismatch");

    const { data: rows } = await admin.from("media_assets").select("id").eq("source_url", sourceUrl);
    expect(rows).toHaveLength(0);
  }, 30_000);

  it("başarılı indirme + yükleme SONRASI DB yazımı başarısız olursa depolanan dosya SİLİNİR (yetim nesne kalmaz)", async () => {
    const body = new TextEncoder().encode("adım 19 FAZ C — yarım kalan yükleme temizliği");
    const sourceUrl = await uploadFakeVendorSource("cleanup-proof.png", "image/png", body);

    const bogusBrandId = "00000000-0000-0000-0000-000000000000"; // FK ihlali — insert kesin başarısız olur
    const result = await persistVendorAsset(admin, {
      brandId: bogusBrandId,
      userId: ownerId,
      sourceUrl,
      kind: "image",
      vendor: "upload",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("storage_error");

    // Yüklenen nesnenin yolu hata mesajında yok (kasıtlı — sır/iç yol
    // sızdırmaz), o yüzden klasörü TARIYORUZ: bogusBrandId altında HİÇ
    // nesne kalmamalı.
    const { data: listing, error: listError } = await admin.storage
      .from("media")
      .list(`${ownerId}/${bogusBrandId}/image`);
    if (listError) throw listError;
    expect(listing ?? []).toHaveLength(0);

    const { data: rows } = await admin.from("media_assets").select("id").eq("source_url", sourceUrl);
    expect(rows).toHaveLength(0);
  }, 30_000);
});
