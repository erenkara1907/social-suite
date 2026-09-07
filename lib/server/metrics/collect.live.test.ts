// @vitest-environment node
//
// Gerçek Bluesky metrik toplama + gerçek Supabase — adım 18 FAZ A'nın
// doğrulama kriterlerini kanıtlar: (1) gerçek bir gönderinin metrikleri
// gerçekten çekilir, (2) `content_metrics_final_idx` UNIQUE ikinci bir
// 'final' yazımını engeller, (3) 'final' sonrası o içerik bir daha
// taranmaz, (4) erişilemeyen/var olmayan bir gönderi işi PATLATMAZ —
// içerik 'final' ile işaretlenip atlanır.
//
// "Carino Pizza" markası kullanılır (17a'nın canlı testleriyle aynı emsal).
// Gerçek gönderi olarak adım 17a FAZ C'nin ürettiği, hâlâ canlı olan gönderi
// kullanılıyor (bsky.app'te görülebilir) — YENİ bir gönderi AÇILMIYOR.
//
//   set -a; source .env.local; set +a
//   RUN_BLUESKY_LIVE_TEST=1 npx vitest run lib/server/metrics/collect.live.test.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectBluesky, contentItemIdToRkey, type BlueskySession } from "@/lib/core/providers/bluesky";
import { collectContentMetrics } from "./collect";

const RUN = process.env.RUN_BLUESKY_LIVE_TEST === "1";
const IDENTIFIER = process.env.BLUESKY_TEST_IDENTIFIER ?? "";
const APP_PASSWORD = process.env.BLUESKY_TEST_APP_PASSWORD ?? "";

// adım 17a FAZ C'nin canlı kanıtı — gerçek, hâlâ yayında olan bir gönderi.
// docs/ADIM_17a_RAPOR.md: https://bsky.app/profile/did:plc:h4uy2bqzvjobgsyhzslvloys/post/7dq3qqlzljuz2
const REAL_POST_URI = "at://did:plc:h4uy2bqzvjobgsyhzslvloys/app.bsky.feed.post/7dq3qqlzljuz2";

describe.skipIf(!RUN)("collectContentMetrics — canlı (adım 18 FAZ A)", () => {
  let admin: ReturnType<typeof createAdminClient>;
  let brandId: string;
  let userId: string;
  let channelId: string;
  let session: BlueskySession;
  const createdContentIds: string[] = [];

  let ownChannel = false; // yalnızca BU TEST açtıysa afterAll'da temizlenir

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

    // ⭐ adım 17a'nın KALICI, gerçekten bağlı kanalını yeniden kullan (aynı
    // brand+platform+handle) — yeni bir INSERT `channels_brand_id_platform_
    // handle_key` UNIQUE'ini ihlal ediyordu (bu hesap zaten bağlı).
    const { data: existing } = await admin
      .from("channels").select("id").eq("brand_id", brandId).eq("platform", "bluesky")
      .eq("handle", `@${session.handle}`).maybeSingle<{ id: string }>();

    if (existing) {
      channelId = existing.id;
      await admin.from("channel_credentials").update({
        access_token: session.accessJwt, refresh_token: session.refreshJwt,
      }).eq("channel_id", channelId);
    } else {
      ownChannel = true;
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
    }
  }, 30_000);

  afterAll(async () => {
    for (const id of createdContentIds) {
      await admin.from("content_metrics").delete().eq("content_item_id", id);
      await admin.from("content_items").delete().eq("id", id);
    }
    if (channelId && ownChannel) {
      await admin.from("channel_credentials").delete().eq("channel_id", channelId);
      await admin.from("channels").delete().eq("id", channelId);
    }
  });

  async function insertPublishedItem(publishedAt: Date, externalPostId: string): Promise<string> {
    const stamp = Date.now();
    const { data, error } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: userId, channel_id: channelId, platform: "bluesky",
        title: `adım 18 FAZ A canlı test ${stamp}`, body: "test", hashtags: "",
        status: "published", published_at: publishedAt.toISOString(),
        external_post_id: externalPostId,
      })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`content_items yazılamadı: ${error?.message}`);
    createdContentIds.push(data.id);
    return data.id;
  }

  it("gerçek gönderinin metrikleri GERÇEKTEN çekilir — h6 tier, taze içerik", async () => {
    const itemId = await insertPublishedItem(new Date(), REAL_POST_URI);

    const result = await collectContentMetrics(admin, itemId);
    expect(result.status).toBe("collected");
    expect(result.tier).toBe("h6");

    const { data: row } = await admin
      .from("content_metrics")
      .select("tier,likes,comments,shares,reach,raw")
      .eq("content_item_id", itemId)
      .single<{ tier: string; likes: number; comments: number; shares: number; reach: number; raw: unknown }>();
    console.log("[metrics canlı] GERÇEK ÇEKİLEN SATIR —", JSON.stringify(row));
    expect(row!.tier).toBe("h6");
    expect(row!.reach).toBe(0); // ⚠ Bluesky reach vermiyor — dürüstçe 0, uydurma değil
    expect(typeof row!.likes).toBe("number");
    expect(typeof row!.comments).toBe("number");
    expect(typeof row!.shares).toBe("number");
  }, 20_000);

  it("⭐ 30 günü geçmiş içerik → final yazılır; İKİNCİ deneme UNIQUE tarafından engellenir; sonrası taranmaz", async () => {
    const oldPublishedAt = new Date(Date.now() - 31 * 86_400_000);
    const itemId = await insertPublishedItem(oldPublishedAt, REAL_POST_URI);

    const first = await collectContentMetrics(admin, itemId);
    expect(first.status).toBe("collected");
    expect(first.tier).toBe("final");

    const { count: countAfterFirst } = await admin
      .from("content_metrics").select("id", { count: "exact", head: true }).eq("content_item_id", itemId);
    expect(countAfterFirst).toBe(1);

    // ⭐ İkinci `metrics_collect` çağrısı — `metricsCollectionStatus` latest.tier
    // === 'final' gördüğü için hiç Bluesky'ye ÇIKMADAN "skipped" döner —
    // bu, "final sonrası o içerik bir daha taranmıyor" kanıtı.
    const second = await collectContentMetrics(admin, itemId);
    expect(second.status).toBe("skipped_final_exists");
    console.log("[metrics canlı] final-sonrası tarama —", JSON.stringify(second));

    const { count: countAfterSecond } = await admin
      .from("content_metrics").select("id", { count: "exact", head: true }).eq("content_item_id", itemId);
    expect(countAfterSecond).toBe(1); // yeni satır YAZILMADI

    // ⭐ UNIQUE kısıtının KENDİSİ — doğrudan bir ikinci 'final' INSERT denemesi.
    const { error: dupError } = await admin.from("content_metrics").insert({
      content_item_id: itemId, brand_id: brandId, user_id: userId, tier: "final",
    });
    console.log("[metrics canlı] ikinci final INSERT hatası —", dupError?.code, dupError?.message);
    expect(dupError).not.toBeNull();
    expect(dupError!.code).toBe("23505"); // content_metrics_final_idx UNIQUE
  }, 20_000);

  it("silinmiş/erişilemeyen gönderi → iş PATLAMAZ, içerik 'final' ile işaretlenip atlanır", async () => {
    // Gerçek DID, ama VAR OLMAYAN bir rkey — getPosts bu uri'yi dönmeyecek
    // (bkz. lib/core/providers/bluesky.ts başlığı: sessizce eksik, hata değil).
    const fakeRkey = contentItemIdToRkey(randomUUID());
    const missingUri = `at://${session.did}/app.bsky.feed.post/${fakeRkey}`;
    const itemId = await insertPublishedItem(new Date(), missingUri);

    const result = await collectContentMetrics(admin, itemId);
    console.log("[metrics canlı] bulunamayan gönderi —", JSON.stringify(result));
    expect(result.status).toBe("not_found");
    expect(result.tier).toBe("final"); // bir daha taranmasın diye final işaretlendi

    const { data: row } = await admin
      .from("content_metrics").select("tier,raw").eq("content_item_id", itemId)
      .single<{ tier: string; raw: { status?: string } }>();
    expect(row!.tier).toBe("final");
    expect(row!.raw.status).toBe("not_found");
  }, 20_000);
});
