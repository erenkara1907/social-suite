import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 17a FAZ D doğrulaması: "/queue'nun onay/yeniden
 * zamanlama/iptal düğmeleri GERÇEKTEN tıklanıyor" (adım 20.5 kuralı — bir
 * düğmenin yazılmış olması onun ÇALIŞTIĞI anlamına gelmez, `/plan`'ın UGC
 * seçimi tam bu yüzden 11 adım boyunca bozuk kalmıştı).
 *
 * Bluesky'ye GERÇEKTEN yayınlamıyor — o kanıt zaten `lib/server/publish/
 * publish-item.live.test.ts`'te (FAZ B) ve production cron'da (FAZ C).
 * Burada yalnızca `content_items` durumunu değiştiren üç düğmenin UI'dan
 * uçtan uca çalıştığı kanıtlanıyor; kanal satırı GERÇEK Bluesky kimlik
 * bilgisi OLMADAN, yalnızca `is_connected=true` ile sahnelendi (approve'un
 * "bağlı kanal var mı" kontrolünü geçmesi için yeterli — approve
 * `channel_credentials`'ı hiç okumuyor).
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("/queue — gerçek onay/yeniden zamanlama/iptal (17a FAZ D)", () => {
  test("üç düğme de GERÇEKTEN tıklanır ve content_items durumunu değiştirir", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const admin = adminClient();
    const stamp = Date.now();

    const { data: brand, error: brandError } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (brandError || !brand) throw new Error(`marka bulunamadı: ${brandError?.message}`);
    const brandId = brand.id;

    // Sahnelenen kanal — GERÇEK Bluesky kimlik bilgisi YOK, yalnızca
    // "bağlı" görünmesi yeterli (approveAction channel_credentials okumuyor).
    const { data: channel, error: channelError } = await admin
      .from("channels")
      .insert({
        brand_id: brandId, user_id: user.userId, platform: "bluesky",
        handle: `@e2e-queue-${stamp}.bsky.social`, is_connected: true,
      })
      .select("id").single<{ id: string }>();
    if (channelError || !channel) throw new Error(`channels yazılamadı: ${channelError?.message}`);

    const title = `E2E Kuyruk Testi ${stamp}`;
    const { data: item, error: itemError } = await admin
      .from("content_items")
      .insert({
        brand_id: brandId, user_id: user.userId, platform: "bluesky", kind: "text",
        status: "needs_review", title, hook: "e2e kuyruk testi", body: "e2e kuyruk testi gövdesi",
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id").single<{ id: string }>();
    if (itemError || !item) throw new Error(`content_items yazılamadı: ${itemError?.message}`);

    try {
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");

      // ⭐ `content`/`channel` portlarını canlıya çek — dev-only çerez.
      await page.context().addCookies([
        { name: "sm:mode:content", value: "live", url: page.url() },
        { name: "sm:mode:channel", value: "live", url: page.url() },
      ]);

      await page.goto("/queue");
      const row = page.getByTestId(`queue-row-${item.id}`);
      await expect(row).toBeVisible();
      await expect(row.getByText(title)).toBeVisible();

      // ── 1. Onayla — needs_review → scheduled + channel_id atanır ────────
      await row.getByRole("button", { name: "Onayla" }).click();
      await expect
        .poll(async () => {
          const { data } = await admin.from("content_items").select("status,channel_id").eq("id", item.id).single();
          return data;
        }, { timeout: 10_000 })
        .toMatchObject({ status: "scheduled", channel_id: channel.id });

      // ── 2. Yeniden zamanla — gerçek tarih girişi, gerçek submit ─────────
      await page.reload();
      const rowAfterApprove = page.getByTestId(`queue-row-${item.id}`);
      await rowAfterApprove.getByRole("button", { name: "Yeniden zamanla" }).click();
      // `datetime-local` saat dilimi TAŞIMAZ — markanın kendi saat diliminde
      // (varsayılan Europe/Istanbul, DST'siz sabit UTC+3, 2016'dan beri)
      // yorumlanır. Beklenen UTC değeri +3 saat elle hesaplanıyor — e2e
      // testleri BİLEREK uygulama kaynağını import etmiyor (kara kutu).
      const localWallClock = new Date(Date.now() + 2 * 86_400_000);
      const localValue = localWallClock.toISOString().slice(0, 16);
      const expectedUtc = new Date(localWallClock.getTime() - 3 * 3_600_000);
      await rowAfterApprove.locator('input[type="datetime-local"]').fill(localValue);
      await rowAfterApprove.getByRole("button", { name: "Kaydet" }).click();
      await expect
        .poll(async () => {
          const { data } = await admin.from("content_items").select("scheduled_at").eq("id", item.id).single<{ scheduled_at: string }>();
          return data?.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : null;
        }, { timeout: 10_000 })
        .toBe(expectedUtc.toISOString().slice(0, 16));

      // ── 3. İptal — scheduled → archived, satır kuyruktan kaybolur ───────
      await page.reload();
      const rowAfterReschedule = page.getByTestId(`queue-row-${item.id}`);
      await rowAfterReschedule.getByRole("button", { name: "İptal" }).click();
      await expect
        .poll(async () => {
          const { data } = await admin.from("content_items").select("status").eq("id", item.id).single<{ status: string }>();
          return data?.status;
        }, { timeout: 10_000 })
        .toBe("archived");

      await page.reload();
      await expect(page.getByTestId(`queue-row-${item.id}`)).toHaveCount(0);
    } finally {
      await admin.from("content_items").delete().eq("id", item.id);
      await admin.from("channels").delete().eq("id", channel.id);
    }
  });
});
