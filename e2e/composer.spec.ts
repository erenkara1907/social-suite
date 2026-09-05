import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 11b FAZ C doğrulaması:
 *   1. İçerik yaz → kaydet → `/queue`'da görünüyor (gerçek tıklamayla).
 *   2. "Bunun devamı" ile işaretle → zincir kuruldu, `chain_position` doğru.
 *   3. Aynı başlık+kanca tekrar yazılırsa tekrar kontrolü UYARIR (engellemez).
 *
 * ⭐ `/composer`'ın KENDİSİ hiçbir mod ayrımına girmeden her zaman gerçek
 * yazıyor (bkz. `actions.ts`/`page.tsx` başlıkları) — ama `/queue`'nun okuma
 * yolu (`port("content")`) demo modda hâlâ fixture döndürür. Bu yüzden
 * `plan-studio-bridge.spec.ts` ile AYNI teknik: yalnızca `content` portu
 * dev-only çerezle canlıya çekiliyor ki `/queue` GERÇEK satırları göstersin.
 *
 *   npm run test:e2e -- composer
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("composer — gerçek yazma, devam zinciri, tekrar kontrolü", () => {
  test("yaz→kaydet→kuyrukta görünür; devam işaretle→zincir kurulur; tekrar yazınca uyarır", async ({ page }) => {
    const admin = adminClient();
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const stamp = Date.now();
    const titleA = `E2E Composer Kök ${stamp}`;
    const titleB = `E2E Composer Devam ${stamp}`;
    const hookA = `e2e composer kancası ${stamp}`;

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");
    // `/queue`'nun okuma yolunu canlıya çek — `/composer`'ın kendisi zaten
    // her zaman gerçek yazıyor, bu çerez yalnızca DOĞRULAMA tarafı için.
    await page.context().addCookies([{ name: "sm:mode:content", value: "live", url: page.url() }]);

    let idA: string | null = null;
    let idB: string | null = null;
    let idDup: string | null = null;

    try {
      // ── 1. Kök içeriği yaz ve kaydet ─────────────────────────────────────
      await page.goto("/composer");
      await page.locator("#composer-title").fill(titleA);
      await page.locator("#composer-hook").fill(hookA);
      await page.locator("#composer-body").fill("e2e composer gövde metni A");
      await page.getByRole("button", { name: "Kaydet" }).click();
      // ⚠ `DemoBanner` de `role="status"` taşıyor (strict-mode çakışması) —
      // "Kaydedildi" metniyle composer'ın KENDİ başarı paneline daralt.
      await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" })).toContainText(titleA);

      const rowA = await admin
        .from("content_items").select("id,chain_position,root_id").eq("title", titleA)
        .single<{ id: string; chain_position: number; root_id: string }>();
      if (rowA.error || !rowA.data) throw new Error(`kök içerik yazılmadı: ${rowA.error?.message}`);
      idA = rowA.data.id;
      expect(rowA.data.chain_position).toBe(1);

      // ⭐ gerçek tıklamayla /queue'ya git — "Kuyrukta gör" bağlantısı.
      await page.getByRole("link", { name: /Kuyrukta gör/ }).click();
      await page.waitForURL("**/queue");
      await expect(page.getByText(titleA)).toBeVisible();

      // ── 2. İkinci içeriği "bunun devamı" olarak işaretle ─────────────────
      await page.goto("/composer");
      await page.locator("#composer-title").fill(titleB);
      await page.locator("#composer-hook").fill(`e2e composer kancası B ${stamp}`);
      await page.locator("#composer-body").fill("e2e composer gövde metni B");
      await page.selectOption("#composer-parent", { label: titleA });
      await page.getByRole("button", { name: "Kaydet" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" })).toContainText(titleB);

      const rowB = await admin
        .from("content_items").select("id,chain_position,root_id,parent_id").eq("title", titleB)
        .single<{ id: string; chain_position: number; root_id: string; parent_id: string }>();
      if (rowB.error || !rowB.data) throw new Error(`devam içeriği yazılmadı: ${rowB.error?.message}`);
      idB = rowB.data.id;

      // ⭐ Zincir bütünlüğü — trigger'ın kendi türetimi, uygulama hesaplamadı.
      expect(rowB.data.parent_id).toBe(idA);
      expect(rowB.data.chain_position).toBe(2);
      expect(rowB.data.root_id).toBe(rowA.data.root_id);

      // /queue'da zincir rozeti görünür ("Zincir · 2. halka").
      await page.goto("/queue");
      await expect(page.getByText(/Zincir · 2\. halka|Chain · link 2/)).toBeVisible();

      // ── 3. Aynı başlık+kanca ile tekrar yaz — UYARI, ENGEL DEĞİL ─────────
      await page.goto("/composer");
      await page.locator("#composer-title").fill(titleA);
      await page.locator("#composer-hook").fill(hookA);
      await page.locator("#composer-body").fill("e2e composer gövde metni — bilinçli tekrar");
      await page.getByRole("button", { name: "Kaydet" }).click();
      // Kaydedildi mesajı YİNE görünür (engellenmedi) + tekrar uyarısı var.
      await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" })).toContainText(titleA);
      await expect(page.getByText(/çok benziyor|too similar|similar to/i)).toBeVisible();

      const dupRows = await admin
        .from("content_items").select("id").eq("title", titleA);
      // İki satır: ilk yazım + bilinçli tekrar — ikisi de DB'de, hiçbiri reddedilmedi.
      expect(dupRows.data?.length ?? 0).toBe(2);
      idDup = (dupRows.data ?? []).find((r) => r.id !== idA)?.id ?? null;
    } finally {
      const ids = [idA, idB, idDup].filter((v): v is string => Boolean(v));
      if (ids.length > 0) {
        await admin.from("activity").delete().in("content_item_id", ids);
        await admin.from("content_items").delete().in("id", ids);
      }
    }
  });
});
