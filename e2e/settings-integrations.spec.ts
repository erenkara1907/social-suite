import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

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
});
