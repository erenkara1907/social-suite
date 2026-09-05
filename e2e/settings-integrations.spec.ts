import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * BIRLESIM_PLANI §12 adım 13 FAZ C doğrulaması:
 *   "kaydet → yenile → maskeli görünüyor; sil → gitti"
 *
 * Provider "voyage" seçildi — settings.spec.ts / plan.spec.ts hiçbir
 * provider_credentials satırına dokunmuyor, bu yüzden aynı paylaşılan
 * e2e markasını (workers:1, fullyParallel:false) kullanmak güvenli. Test
 * kendi yazdığı satırı SONUNDA siliyor (UI'ın kendi silme akışıyla) —
 * paylaşılan markada iz bırakmıyor.
 */
test.describe("settings — entegrasyonlar (Vault)", () => {
  test("anahtar kaydediyor → maskeli görünüyor, silince kayboluyor", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    await page.goto("/settings");

    const row = page.getByTestId("integration-row-voyage");
    await expect(row).toBeVisible();
    await expect(row.getByText("Girilmemiş")).toBeVisible();

    const fakeKey = `voyage-e2e-fake-key-${Date.now()}`;
    await row.locator("#apiKey-voyage").fill(fakeKey);
    await row.getByRole("button", { name: "Anahtarı gir" }).click();
    await expect(row.getByRole("status")).toBeVisible();

    // Kaydedildi mesajı geldi ama görünürlük yenilemeye (router.refresh) bağlı —
    // settings.spec.ts'in Turbopack dev-reload notunun aynısı, tolere edelim.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("integration-row-voyage").getByText("Girilmiş").isVisible();
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    const rowAfterSave = page.getByTestId("integration-row-voyage");
    const maskedText = await rowAfterSave.locator(".label-mono").innerText();
    // ⭐ Ekranda RAW anahtar hiçbir zaman görünmemeli — yalnızca maskeli önizleme.
    expect(maskedText).not.toBe(fakeKey);
    expect(maskedText.length).toBeLessThan(fakeKey.length);
    expect(await page.content()).not.toContain(fakeKey);

    // Silme
    await rowAfterSave.getByRole("button", { name: "Sil" }).click();

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("integration-row-voyage").getByText("Girilmemiş").isVisible();
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(page.getByTestId("integration-row-voyage").locator(".label-mono")).toHaveCount(0);
  });

  /**
   * BIRLESIM_PLANI §12 adım 11b FAZ D — `verifyCredentialAction`in "Test et"
   * düğmesi hiçbir e2e testinde GERÇEKTEN tıklanmamıştı (FAZ 0.2 envanteri):
   * yukarıdaki test bilinçli olarak `voyage` (doğrulayıcısı yok) kullanıyor.
   * `kie` seçildi — `verify.live.test.ts`nin zaten kanıtladığı "geçersiz
   * anahtar → net ok:false" davranışının AYNISI, ama bu kez gerçek buton
   * tıklamasıyla, sunucu eylemi kabuğundan geçerek (rate-limit RPC'si +
   * `resolveProviderCredential` + `record_provider_verification` dahil).
   */
  test("'Test et' gerçek doğrulama çağrısı yapar — geçersiz anahtar net hatayla döner", async ({ page }) => {
    const admin = adminClient();
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const { data: brand } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (!brand) throw new Error("Paylaşılan e2e kullanıcısının markası bulunamadı.");

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    await page.goto("/settings");
    const row = page.getByTestId("integration-row-kie");

    try {
      await row.locator("#apiKey-kie").fill(`e2e-invalid-kie-key-${Date.now()}`);
      await row.getByRole("button", { name: "Anahtarı gir" }).click();
      await expect
        .poll(
          async () => {
            await page.reload();
            return page.getByTestId("integration-row-kie").getByText("Girilmiş").isVisible();
          },
          { timeout: 15_000 },
        )
        .toBe(true);

      const rowAfterSave = page.getByTestId("integration-row-kie");
      await rowAfterSave.getByRole("button", { name: "Test et" }).click();
      await expect(rowAfterSave.getByRole("alert")).toBeVisible({ timeout: 15_000 });

      const { data: cred } = await admin
        .from("provider_credentials").select("last_error").eq("brand_id", brand.id).eq("provider", "kie")
        .single<{ last_error: string | null }>();
      expect(cred?.last_error, "record_provider_verification gerçek bir hata yazmış olmalı").toBeTruthy();
    } finally {
      const rowNow = page.getByTestId("integration-row-kie");
      if (await rowNow.getByRole("button", { name: "Sil" }).isVisible().catch(() => false)) {
        await rowNow.getByRole("button", { name: "Sil" }).click();
      } else {
        await admin.from("provider_credentials").delete().eq("brand_id", brand.id).eq("provider", "kie");
      }
    }
  });
});
