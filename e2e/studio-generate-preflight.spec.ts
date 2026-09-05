import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 11b FAZ D — `generateUgcAction`in "Üret" düğmesi
 * (`/studio`) hiçbir e2e testinde GERÇEKTEN tıklanmamıştı (FAZ 0.2
 * envanteri) — haklı bir sebeple, bu ürünün EN PAHALI işlemi. Bu test o
 * pahalı yola GİRMEDEN, düğmenin kendisini ve ÜCRETSİZ ön kontrol
 * (preflight) dalını gerçek bir tıklamayla kanıtlar: persona'nın görseli
 * olmadan "Üret"e basmak `videoPort.start()`'a (dolayısıyla Kie/ElevenLabs/
 * fal'a) HİÇ girmeden, adım 20.5 FAZ A'nın ön kontrolünde reddedilmeli.
 *
 * ⭐ `/plan`↔`/studio` köprüsüyle AYNI teknik: `content` + `video` portları
 * dev-only çerezle canlıya çekiliyor.
 *
 *   npm run test:e2e -- studio-generate-preflight
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("studio — 'Üret' gerçek tıklaması, ücretsiz ön kontrol dalı", () => {
  test("persona görseli yokken 'Üret' tıklanır → videoPort.start()'a HİÇ girmeden ön kontrolde reddedilir", async ({ page }) => {
    const admin = adminClient();
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const { data: brand } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (!brand) throw new Error("Paylaşılan e2e kullanıcısının markası bulunamadı.");

    const stamp = Date.now();
    const title = `E2E Preflight İçerik ${stamp}`;
    const personaName = `E2E Preflight Persona ${stamp}`;

    const { data: item, error: itemError } = await admin
      .from("content_items")
      .insert({
        brand_id: brand.id, user_id: user.userId, platform: "instagram", kind: "reels",
        status: "needs_review", title, hook: "e2e preflight testi", body: "",
      })
      .select("id").single<{ id: string }>();
    if (itemError || !item) throw new Error(`content_items yazılamadı: ${itemError?.message}`);

    // ⭐ BİLEREK image_asset_id YOK — preflight'ın "persona_video atlanamaz"
    // kontrolünü, marka kimlik bilgisi durumundan BAĞIMSIZ, deterministik
    // şekilde tetiklemek için.
    const { data: persona, error: personaError } = await admin
      .from("personas")
      .insert({ brand_id: brand.id, user_id: user.userId, name: personaName, prompt: "e2e preflight — görseli yok." })
      .select("id").single<{ id: string }>();
    if (personaError || !persona) throw new Error(`persona yazılamadı: ${personaError?.message}`);

    const { error: activityError } = await admin
      .from("activity")
      .insert({
        brand_id: brand.id, user_id: user.userId, actor: "plan", action: "ugc_requested",
        target: "UGC video isteği", content_item_id: item.id,
      });
    if (activityError) throw new Error(`activity yazılamadı: ${activityError.message}`);

    try {
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");
      await page.context().addCookies([
        { name: "sm:mode:content", value: "live", url: page.url() },
        { name: "sm:mode:video", value: "live", url: page.url() },
      ]);

      await page.goto("/studio");
      const row = page.locator("form", { has: page.locator(`input[value="${item.id}"]`) });
      await expect(row).toBeVisible();
      await row.locator('select[name="personaId"]').selectOption({ label: personaName });
      await row.getByRole("button", { name: "Üret" }).click();

      // ⭐ Ön kontrol reddi — GERÇEK hata mesajı, jenerik "tekrar dene" DEĞİL.
      await expect(row.getByText(/persona henüz görsel üretmedi/)).toBeVisible({ timeout: 15_000 });

      // Kanıt: hiçbir media_jobs satırı AÇILMADI — `videoPort.start()`'a hiç girilmedi.
      const { data: jobs } = await admin.from("media_jobs").select("id").eq("content_item_id", item.id);
      expect(jobs ?? []).toEqual([]);
    } finally {
      await admin.from("activity").delete().eq("content_item_id", item.id);
      await admin.from("content_items").delete().eq("id", item.id);
      await admin.from("personas").delete().eq("id", persona.id);
    }
  });
});
