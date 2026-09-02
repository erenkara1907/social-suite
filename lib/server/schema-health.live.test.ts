// @vitest-environment node
//
// jsdom `window` global'i tanımlıyor; gerçek Supabase istemcisi tarayıcı
// ortamı sanabileceği köşeler barındırıyor — `handlers.dedupe.live.test.ts`
// ile AYNI gerekçeyle `node` ortamına geçiyor.
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Devralınan sağlık taraması — BIRLESIM_PLANI §12 adım 19 FAZ 0.
 *
 * ADIM_15_RAPOR.md §8.1'in bulduğu hata sınıfı (bir OUT parametresi + bare
 * kolon adı çakışması, `get_provider_secret()`'te) `find_similar_content` ve
 * `brand_latest_metrics`'te YAPISAL OLARAK yok — ikisi de `language sql`,
 * `returns table` gövdesi TEK bir SELECT, `plpgsql`'in `select ... into
 * <OUT parametreyle aynı adlı değişken>` kalıbı hiç kullanılmıyor (kod
 * incelemesiyle doğrulandı, 00_schema.sql:1071-1098 ve 1430-1458). Bu test
 * dosyası kod incelemesini DEĞİL, ikisinin de canlı Postgres'e karşı
 * GERÇEKTEN ÇALIŞTIĞINI kanıtlıyor — görevin istediği şey bu.
 *
 *   set -a; source .env.local; set +a
 *   RUN_SCHEMA_HEALTH_LIVE_TEST=1 npx vitest run lib/server/schema-health.live.test.ts
 */
const RUN = process.env.RUN_SCHEMA_HEALTH_LIVE_TEST === "1";

/** vector(1024) SABİT (§4c D3) — sahte ama boyutu doğru bir vektör.
 *  Tek bir bileşen dışında sıfır: iki "yakın" vektör arasındaki kosinüs
 *  benzerliğini deterministik ve okunabilir kılmak için. */
function fakeEmbedding(seedIndex: number, magnitude = 1): number[] {
  const v = new Array(1024).fill(0);
  v[seedIndex] = magnitude;
  return v;
}

describe.skipIf(!RUN)("SQL fonksiyon sağlık taraması — canlı Supabase (adım 19 FAZ 0)", () => {
  const contentItemIds: string[] = [];
  const metricsIds: string[] = [];
  let brandId: string | null = null;
  let ownerId: string | null = null;

  afterAll(async () => {
    if (!RUN || !brandId) return;
    const admin = createAdminClient();
    for (const id of metricsIds) await admin.from("content_metrics").delete().eq("id", id);
    for (const id of contentItemIds) await admin.from("content_items").delete().eq("id", id);
  });

  it("find_similar_content() — gerçek 1024 boyutlu vektörle gerçek eşleşme + gerçek ret", async () => {
    const admin = createAdminClient();

    const { data: brandRow, error: brandError } = await admin
      .from("brands")
      .select("id,owner_id")
      .limit(1)
      .maybeSingle<{ id: string; owner_id: string }>();
    if (brandError) throw brandError;
    if (!brandRow) {
      console.warn("[schema-health live] atlanıyor — hiç marka yok");
      return;
    }
    brandId = brandRow.id;
    ownerId = brandRow.owner_id;

    const neighborEmbedding = fakeEmbedding(7, 1);
    const { data: neighbor, error: neighborError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId,
        user_id: ownerId,
        platform: "x",
        kind: "text",
        title: "find_similar_content canlı test — komşu",
        hook: "adım 19 FAZ 0 sağlık taraması",
        embedding: neighborEmbedding,
      })
      .select("id")
      .single<{ id: string }>();
    if (neighborError) throw neighborError;
    contentItemIds.push(neighbor.id);

    // ── Sorgu vektörü komşuyla NEREDEYSE AYNI (kosinüs benzerliği ≈ 1) ──────
    const queryEmbedding = fakeEmbedding(7, 0.999);
    const { data: matches, error: matchError } = await admin.rpc("find_similar_content", {
      p_brand_id: brandId,
      p_embedding: queryEmbedding,
      p_threshold: 0.9,
      p_limit: 5,
    });
    if (matchError) throw matchError;
    console.log("[schema-health live] find_similar_content eşleşme:", JSON.stringify(matches));
    expect(matches).toHaveLength(1);
    expect((matches as Array<{ id: string }>)[0].id).toBe(neighbor.id);

    // ── Ortogonal bir vektör → EŞLEŞME YOK (fonksiyonun ret yolu da çalışıyor) ──
    const orthogonalEmbedding = fakeEmbedding(500, 1);
    const { data: noMatches, error: noMatchError } = await admin.rpc("find_similar_content", {
      p_brand_id: brandId,
      p_embedding: orthogonalEmbedding,
      p_threshold: 0.9,
      p_limit: 5,
    });
    if (noMatchError) throw noMatchError;
    console.log("[schema-health live] find_similar_content ret (ortogonal):", JSON.stringify(noMatches));
    expect(noMatches).toHaveLength(0);
  }, 30_000);

  it("brand_latest_metrics() — gerçek content_metrics satırı gerçekten okunuyor", async () => {
    const admin = createAdminClient();
    if (!brandId || !ownerId) {
      const { data: brandRow, error: brandError } = await admin
        .from("brands")
        .select("id,owner_id")
        .limit(1)
        .maybeSingle<{ id: string; owner_id: string }>();
      if (brandError) throw brandError;
      if (!brandRow) {
        console.warn("[schema-health live] atlanıyor — hiç marka yok");
        return;
      }
      brandId = brandRow.id;
      ownerId = brandRow.owner_id;
    }

    const { data: item, error: itemError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId,
        user_id: ownerId,
        platform: "instagram",
        kind: "reels",
        title: "brand_latest_metrics canlı test",
        hook: "adım 19 FAZ 0 sağlık taraması",
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (itemError) throw itemError;
    contentItemIds.push(item.id);

    const { data: metric, error: metricError } = await admin
      .from("content_metrics")
      .insert({
        content_item_id: item.id,
        brand_id: brandId,
        user_id: ownerId,
        tier: "d1",
        reach: 1000,
        likes: 42,
        comments: 3,
        saves: 5,
        shares: 1,
        engagement_rate: 5.1,
      })
      .select("id")
      .single<{ id: string }>();
    if (metricError) throw metricError;
    metricsIds.push(metric.id);

    const { data: rows, error: rpcError } = await admin.rpc("brand_latest_metrics", {
      p_brand_id: brandId,
      p_days: 35,
    });
    if (rpcError) throw rpcError;
    console.log("[schema-health live] brand_latest_metrics satırı:", JSON.stringify(rows));

    const row = (rows as Array<{ content_item_id: string; tier: string; reach: number; tier_weight: number }>).find(
      (r) => r.content_item_id === item.id,
    );
    expect(row).toBeDefined();
    expect(row?.tier).toBe("d1");
    expect(row?.reach).toBe(1000);
    expect(row?.tier_weight).toBeCloseTo(0.7); // ⭐ D1 — final=1.0, d1=0.7
  }, 30_000);
});
