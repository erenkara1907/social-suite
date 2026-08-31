import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 9 FAZ C doğrulaması:
 *   /plan'a git → ufku değiştir → üç içerik seç → sayaç 3.
 */
test.describe("plan", () => {
  test("ufuk geçişi slot sayısını değiştirir, UGC seçim sayacı doğru sayar", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    await page.goto("/plan");

    // ⭐ adım 14 FAZ D — demo modda "Planı üret" düğmesi devre dışı kalmaya
    // devam ediyor (gerçek AI çağrısı gerektiren tek düğme). smoke.spec.ts
    // zaten bu sayfada sıfır dış istek olduğunu doğruluyor; burası düğmenin
    // GÖRSEL olarak da devre dışı olduğunu kanıtlıyor.
    await expect(page.getByRole("button", { name: /Planı üret|Generate plan/ })).toBeDisabled();

    // ⭐ C1 — 1 haftalık ufuk her zaman 8 slot verir (WEEKLY_TEMPLATE sabit,
    // hangi günden başlarsa başlasın — lib/core/plan/template.test.ts'in
    // "hangi günden başlarsa başlasın 7 günlük ufuk sekiz slot verir" bulgusu).
    await expect(page.getByText(/^8 slot(s)?$/)).toBeVisible();

    // Her checkbox satırı bir slot — sayı tutarlı olmalı.
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(8);

    // Aylık ufka geç.
    await page.getByRole("link", { name: /1 (ay|month)/ }).click();
    await page.waitForURL("**/plan?horizon=30");

    // ⭐ Aylık ufuk her zaman haftalıktan daha kalabalık — tam sayı başlangıç
    // gününe göre değiştiği için burada sabit bir sayı İDDİA EDİLMİYOR
    // (ADIM_34'ün "~39 değil 35" bulgusu tam olarak bunun için: gerçek sayı
    // ölçülmeli, varsayılmamalı). Sadece haftalıktan büyük olduğu doğrulanıyor.
    const monthCheckboxCount = await page.locator('input[type="checkbox"]').count();
    expect(monthCheckboxCount).toBeGreaterThan(8);

    // ⭐ C3 — üç içerik seç, sayaç 3 göstersin.
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    await expect(page.getByText(/^3 (içerik seçildi|items selected)/)).toBeVisible();

    // Birini geri al — sayaç 2'ye düşsün (tersinirlik).
    await checkboxes.nth(0).uncheck();
    await expect(page.getByText(/^2 (içerik seçildi|items selected)/)).toBeVisible();

    // "Seçimi temizle" hepsini sıfırlar.
    await page.getByRole("button", { name: /Seçimi temizle|Clear selection/ }).click();
    await expect(checkboxes.nth(1)).not.toBeChecked();
  });
});
