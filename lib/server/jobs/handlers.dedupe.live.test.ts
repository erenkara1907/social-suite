// @vitest-environment node
//
// ⚠ jsdom (vitest.config.mts'in projede genel varsayılanı) `window` global'i
// tanımlıyor; Anthropic SDK'sı bunu "tarayıcı ortamı" sanıp GERÇEK isteği
// güvenlik gerekçesiyle reddediyor ("dangerouslyAllowBrowser" hatası). Bu,
// üretimde ASLA olmaz (lib/server/* yalnızca Node'da çalışır) — yalnızca bu
// dosyanın test ortamını `node`'a çeviriyoruz, projenin geri kalanına
// dokunmadan.
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeFingerprint } from "@/lib/core/dedupe/fingerprint";
import { createDedupeRunBudget, runDedupeCheck } from "@/lib/server/dedupe/run";

/**
 * Entegrasyon testi — GERÇEK Supabase (Anthropic YOK). BIRLESIM_PLANI §12
 * adım 15 FAZ C DOĞRULAMA — kısmi kanıt.
 *
 * ⚠ ADIM_15_RAPOR.md'de açıkça not edildi: bu, `plan_generate`'in UÇTAN UCA
 * gerçek Anthropic çağrısıyla dedupe'u tetiklemesini KANITLAMIYOR. Deneme
 * sırasında iki bağımsız engelle karşılaşıldı:
 *   1. `get_provider_secret()`'in "config" kolon/OUT-parametre çakışması —
 *      BULUNDU ve canlıya UYGULANDI (00_schema.sql, bu adımda).
 *   2. `/settings`'e girili Anthropic anahtarı "identity-linked" bir anahtar
 *      (Anthropic bunun için `anthropic-workspace-id` header'ı istiyor,
 *      ürün göndermiyor) — bu adımın KAPSAMI DIŞINDA, ayrı bir oturuma
 *      bırakıldı (kullanıcı onayı ile).
 * Bu dosya bu ikinci engeli ATLAYIP motorun GERÇEK Postgres'e karşı doğru
 * çalıştığını (Katman 1 fingerprint sorgusu + `content_chain_guard`
 * trigger'ı) kanıtlıyor — `plan_generate`'in kendisinin YAZACAĞI satır
 * şeklini elle, gerçek `computeFingerprint()` ile üreterek.
 *
 *   RUN_DEDUPE_LIVE_TEST=1 npx vitest run lib/server/jobs/handlers.dedupe.live.test.ts
 */
const RUN = process.env.RUN_DEDUPE_LIVE_TEST === "1";

describe.skipIf(!RUN)("dedupe motoru — gerçek Supabase (Anthropic hariç)", () => {
  const contentItemIds: string[] = [];
  let brandId: string | null = null;

  it("Katman 1 gerçek fingerprint eşleşmesini engeller; zincir trigger'ı gerçek DB'de çalışır", async () => {
    const admin = createAdminClient();

    const { data: brandRow, error: brandError } = await admin
      .from("brands")
      .select("id,owner_id")
      .limit(1)
      .maybeSingle<{ id: string; owner_id: string }>();
    if (brandError) throw brandError;
    if (!brandRow) {
      console.warn("[dedupe live test] atlanıyor — hiç marka yok");
      return;
    }
    brandId = brandRow.id;
    const ownerId = brandRow.owner_id;

    const title = `dedupe canlı test — ${Date.now()}`;
    const hook = "gerçek Postgres'e karşı Katman 1 kanıtı";
    const fingerprint = computeFingerprint(title, hook);

    // ── plan_generate'in YAZACAĞI şekilde bir satır — elle, gerçek fingerprint ile
    const { data: root, error: rootError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId,
        user_id: ownerId,
        platform: "x",
        kind: "text",
        title,
        hook,
        content_fingerprint: fingerprint,
      })
      .select("id,chain_position")
      .single<{ id: string; chain_position: number }>();
    if (rootError) throw rootError;
    contentItemIds.push(root.id);

    // ── 1) Katman 1 — GERÇEK fingerprint_idx sorgusu, GERÇEK DB'ye karşı ──
    const decision = await runDedupeCheck(admin, { brandId, title, hook }, createDedupeRunBudget());
    console.log("[dedupe live test] aynı title+hook GERÇEK DB'ye karşı:", JSON.stringify(decision));
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "fingerprint", matchedId: root.id });

    // Farklı title+hook → gerçek DB'de eşleşme yok → "new" (Katman 2 kapalı olduğu için).
    const freshDecision = await runDedupeCheck(
      admin,
      { brandId, title: `${title}-farklı`, hook: `${hook}-farklı` },
      createDedupeRunBudget(),
    );
    expect(freshDecision.verdict).toBe("new");

    // ── 2) Zincir — gerçek content_chain_guard trigger'ı ─────────────────
    const { data: child, error: childError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId,
        user_id: ownerId,
        platform: "x",
        kind: "text",
        title: "dedupe canlı test — devam",
        parent_id: root.id,
        continuation_note: "canlı test zinciri",
      })
      .select("id,root_id,chain_position,parent_id")
      .single<{ id: string; root_id: string; chain_position: number; parent_id: string }>();
    if (childError) throw childError;
    contentItemIds.push(child.id);

    console.log("[dedupe live test] zincir satırı (trigger'dan):", JSON.stringify(child));
    expect(child.parent_id).toBe(root.id);
    expect(child.root_id).toBe(root.id);
    expect(child.chain_position).toBe(root.chain_position + 1);
  }, 30_000);

  afterAll(async () => {
    if (!RUN || !brandId) return;
    const admin = createAdminClient();
    // Zincir çocuğu ÖNCE silinmeli — bkz. dosya başlığı / ADIM_15_RAPOR.md.
    for (const id of [...contentItemIds].reverse()) {
      await admin.from("content_items").delete().eq("id", id);
    }
  });
});
