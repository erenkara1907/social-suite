// @vitest-environment node
//
// Gerçek Bluesky yayını + gerçek Supabase — 17a FAZ B'nin dört doğrulama
// kriterini kanıtlar: (1) gerçek gönderi gerçekten yayınlanır, (2) iki
// eşzamanlı çağrı → tek gönderi (çifte yayın kilidi), (3) metin sınırı aşan
// içerik yayından ÖNCE durur, (4) 'publishing'de askıda bırakılan bir satır
// reaper tarafından 'scheduled'a döndürülür.
//
// "Carino Pizza" markası kullanılır (verify.live.test.ts ile aynı emsal) —
// bu test kendi yazdığı channels/channel_credentials/content_items
// satırlarını SONUNDA siler, paylaşılan markada iz bırakmaz.
//
//   set -a; source .env.local; set +a
//   RUN_BLUESKY_LIVE_TEST=1 npx vitest run lib/server/publish/publish-item.live.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectBluesky, type BlueskySession } from "@/lib/core/providers/bluesky";
import { publishContentItem } from "./publish-item";
import { sweepStuckPublishing } from "@/lib/server/jobs/reaper";

const RUN = process.env.RUN_BLUESKY_LIVE_TEST === "1";
const IDENTIFIER = process.env.BLUESKY_TEST_IDENTIFIER ?? "";
const APP_PASSWORD = process.env.BLUESKY_TEST_APP_PASSWORD ?? "";

describe.skipIf(!RUN)("publishContentItem — canlı (17a FAZ B)", () => {
  // ⚠ `createAdminClient()` BURADA DEĞİL — `describe` gövdesi `skipIf` ile
  // atlanan testlerde bile ÇALIŞIR (yalnızca `it` blokları atlanır);
  // env değişkenleri yokken burada çağrılırsa suit tümüyle patlar
  // (verify.live.test.ts'in izlediği desen: her zaman beforeAll içinde).
  let admin: ReturnType<typeof createAdminClient>;
  let brandId: string;
  let userId: string;
  let channelId: string;
  let session: BlueskySession;
  const createdContentIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    const { data: brand, error: brandError } = await admin
      .from("brands").select("id,owner_id").eq("name", "Carino Pizza").maybeSingle<{ id: string; owner_id: string }>();
    if (brandError) throw brandError;
    if (!brand) throw new Error("canlı test için 'Carino Pizza' markası bulunamadı");
    brandId = brand.id;
    userId = brand.owner_id;

    const connectResult = await connectBluesky(IDENTIFIER, APP_PASSWORD);
    if (!connectResult.ok) throw new Error(`bluesky bağlantısı başarısız: ${connectResult.error}`);
    session = connectResult.session;

    const { data: channel, error: channelError } = await admin
      .from("channels")
      .insert({
        brand_id: brandId, user_id: userId, platform: "bluesky",
        handle: `@${session.handle}`, external_account_id: session.did, username: session.handle,
        is_connected: true,
      })
      .select("id").single<{ id: string }>();
    if (channelError || !channel) throw new Error(`channels yazılamadı: ${channelError?.message}`);
    channelId = channel.id;

    const { error: credError } = await admin.from("channel_credentials").insert({
      channel_id: channelId, user_id: userId, provider: "bluesky",
      external_account_id: session.did, access_token: session.accessJwt, refresh_token: session.refreshJwt,
    });
    if (credError) throw new Error(`channel_credentials yazılamadı: ${credError.message}`);
  }, 30_000);

  afterAll(async () => {
    for (const id of createdContentIds) await admin.from("content_items").delete().eq("id", id);
    if (channelId) {
      await admin.from("channel_credentials").delete().eq("channel_id", channelId);
      await admin.from("channels").delete().eq("id", channelId);
    }
  });

  async function insertScheduledItem(body: string): Promise<string> {
    const stamp = Date.now();
    const { data, error } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: userId, channel_id: channelId, platform: "bluesky",
        title: `17a FAZ B canlı test ${stamp}`, body, hashtags: "",
        status: "scheduled", scheduled_at: new Date().toISOString(),
      })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`content_items yazılamadı: ${error?.message}`);
    createdContentIds.push(data.id);
    return data.id;
  }

  it("gerçek bir gönderi gerçekten yayınlanır — bsky.app URL'i", async () => {
    const itemId = await insertScheduledItem(`17a FAZ B canlı yayın kanıtı ${Date.now()}`);

    const result = await publishContentItem(admin, itemId, "live-test");
    expect(result).not.toBeNull();
    expect(result!.permalink).toMatch(/^https:\/\/bsky\.app\/profile\//);
    console.log("[publish canlı] GERÇEK GÖNDERİ URL'İ:", result!.permalink);

    const { data: row } = await admin
      .from("content_items").select("status,external_post_id").eq("id", itemId)
      .single<{ status: string; external_post_id: string | null }>();
    expect(row!.status).toBe("published");
    expect(row!.external_post_id).toBeTruthy();
  }, 30_000);

  it("⭐ ÇİFTE YAYIN TESTİ — iki eşzamanlı çağrı → yalnızca BİR gönderi", async () => {
    const itemId = await insertScheduledItem(`17a FAZ B çifte yayın testi ${Date.now()}`);

    const [a, b] = await Promise.all([
      publishContentItem(admin, itemId, "worker-a"),
      publishContentItem(admin, itemId, "worker-b"),
    ]);
    console.log("[çifte yayın canlı] worker-a —", JSON.stringify(a));
    console.log("[çifte yayın canlı] worker-b —", JSON.stringify(b));

    // Koşullu UPDATE'in garantisi: tam olarak BİRİ kilidi kazanır (gerçek
    // sonuç döner), diğeri `null` görür (0 satır etkiledi, sessizce çıktı).
    const winners = [a, b].filter((r) => r !== null);
    expect(winners.length).toBe(1);

    const { data: row } = await admin
      .from("content_items").select("status").eq("id", itemId).single<{ status: string }>();
    expect(row!.status).toBe("published");
  }, 30_000);

  it("metin sınırı aşan içerik yayından ÖNCE durur — 'failed', hiç ağa çıkmadan", async () => {
    const tooLong = "x".repeat(400); // 400 grapheme > bluesky'nin 300 sınırı
    const itemId = await insertScheduledItem(tooLong);

    await expect(publishContentItem(admin, itemId, "live-test")).rejects.toThrow(/metin sınırı aşıldı/);

    const { data: row } = await admin
      .from("content_items").select("status,failure_error").eq("id", itemId)
      .single<{ status: string; failure_error: string | null }>();
    expect(row!.status).toBe("failed");
    expect(row!.failure_error).toMatch(/metin sınırı/);
  }, 15_000);

  it("⭐ ASILI KALMA TESTİ — eski 'publishing' kilidi → reaper → 'scheduled'a döner", async () => {
    const itemId = await insertScheduledItem(`17a FAZ B asılı kalma testi ${Date.now()}`);

    // Süreç yayın SIRASINDA çökmüş gibi elle simüle et — 20dk önce kilitlendi
    // (reaper eşiği 15dk, bkz. CONTENT_PUBLISHING_STUCK_THRESHOLD_MS).
    const staleLockedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    await admin
      .from("content_items")
      .update({ status: "publishing", locked_at: staleLockedAt, locked_by: "crashed-worker" })
      .eq("id", itemId);

    const summary = await sweepStuckPublishing();
    console.log("[reaper canlı] özet —", JSON.stringify(summary));
    expect(summary.reverted).toBeGreaterThanOrEqual(1);

    const { data: row } = await admin
      .from("content_items").select("status,locked_at").eq("id", itemId)
      .single<{ status: string; locked_at: string | null }>();
    expect(row!.status).toBe("scheduled");
    expect(row!.locked_at).toBeNull();
  }, 15_000);
});
