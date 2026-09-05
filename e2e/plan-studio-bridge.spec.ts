import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 20.5 FAZ C1 — `/plan`↔`/studio` köprüsünün tarayıcı
 * E2E kanıtı (ADIM_9 varsayım 5'in gerçek kapanışı; ADIM_20'nin bıraktığı
 * boşluk).
 *
 * ⭐ Diğer tüm e2e dosyaları `APP_MODE=demo` webServer'ında koşuyor
 * (`playwright.config.ts`) — demo modda `contentPort.markUgcRequested()`/
 * `listUgcRequested()` KASITLI olarak no-op (bkz. `lib/adapters/demo/
 * content.ts` başlığı), yani bu köprü demo modda HİÇ test EDİLEMEZ. Bu
 * dosya `sm:mode:content`/`sm:mode:video` GELİŞTİRME ÇEREZLERİNİ (yalnızca
 * `NODE_ENV !== "production"` iken okunur, `lib/adapters/mode.ts`) elle
 * kurarak SADECE bu iki portu canlıya çeker — geri kalan uygulama demoda
 * kalır, gerçek para harcayan hiçbir şey (Kie/ElevenLabs/fal) tetiklenmez.
 *
 * ⚠ Bu test SIRASINDA bulunan gerçek hata: `UgcSelectionCard` önceden
 * `planItems`'i (AI önizlemesi, KALICILAŞMAYAN sentetik `"skeleton-N"`
 * id'ler) besliyordu — canlı modda seçip "İste" demek `activity.
 * content_item_id` (gerçek uuid FK) sütununa geçersiz bir değer yazmaya
 * çalışıp ANINDA patlıyordu (canlı `psql` ile doğrulandı). Düzeltme:
 * `app/(app)/plan/page.tsx` artık GERÇEK `contentPort.list()` satırlarını
 * (`ugcCandidates`) besliyor. Bu test o düzeltmenin kanıtı.
 *
 *   npm run test:e2e -- plan-studio-bridge
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("plan↔studio köprüsü — canlı content/video portlarıyla gerçek kalıcılık", () => {
  test("seç → İste → /studio'da görünür → yenilemeden sonra durur → /studio/personas listeler", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const admin = adminClient();
    const stamp = Date.now();

    const { data: brand, error: brandError } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (brandError || !brand) throw new Error(`e2e markası bulunamadı: ${brandError?.message}`);
    const brandId = brand.id;

    const titleA = `E2E Köprü İçerik A ${stamp}`;
    const titleB = `E2E Köprü İçerik B ${stamp}`;
    const personaName = `E2E Köprü Persona ${stamp}`;

    // ── Kurulum — GERÇEK satırlar, service-role (Kie/ElevenLabs/fal'a HİÇ gidilmez) ──
    const { data: items, error: itemsError } = await admin
      .from("content_items")
      .insert([
        { brand_id: brandId, user_id: user.userId, platform: "instagram", kind: "reels", status: "idea", title: titleA, hook: "e2e köprü testi A", body: "" },
        { brand_id: brandId, user_id: user.userId, platform: "instagram", kind: "reels", status: "idea", title: titleB, hook: "e2e köprü testi B", body: "" },
      ])
      .select("id,title");
    if (itemsError || !items) throw new Error(`content_items yazılamadı: ${itemsError?.message}`);
    const contentItemIds = items.map((i) => i.id);

    const { data: persona, error: personaError } = await admin
      .from("personas")
      .insert({ brand_id: brandId, user_id: user.userId, name: personaName, prompt: "e2e köprü testi — gerçek görsel üretilmeyecek." })
      .select("id").single<{ id: string }>();
    if (personaError || !persona) throw new Error(`persona yazılamadı: ${personaError?.message}`);

    try {
      // ── Giriş ──────────────────────────────────────────────────────────
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");

      // ⭐ Yalnızca bu iki portu canlıya çek — dev-only çerez (mode.ts).
      // `voice`/`storage`/`planner` demoda kalır: persona sesi seçimi ve
      // AI plan önizlemesi bu testin konusu değil, gerçek çağrı YAPILMASIN.
      await page.context().addCookies([
        { name: "sm:mode:content", value: "live", url: page.url() },
        { name: "sm:mode:video", value: "live", url: page.url() },
      ]);

      // ── /plan — GERÇEK içerik görünüyor, seç, İste ──────────────────────
      await page.goto("/plan");
      await expect(page.getByText(titleA)).toBeVisible();
      await expect(page.getByText(titleB)).toBeVisible();

      await page.getByText(titleA).locator("xpath=ancestor::label").locator('input[type="checkbox"]').check();
      await expect(page.getByText(/^1 (içerik seçildi|item selected)/)).toBeVisible();

      await page.getByRole("button", { name: /UGC video iste|Request UGC video/ }).click();
      await expect(page.getByText(/^1 (içerik için istek kaydedildi|items requested)/)).toBeVisible();

      // ── /studio — GERÇEK istek "Üretim sırası"nda görünüyor ─────────────
      await page.goto("/studio");
      await expect(page.getByText(titleA)).toBeVisible();
      // Persona <select><option> — kapalı dropdown'da <option> ayrı GÖRÜNÜR
      // değildir (Playwright "hidden" der), o yüzden toBeVisible değil
      // seçenek metni doğrulanıyor.
      await expect(page.locator("option", { hasText: personaName })).toHaveCount(1);

      // ── /studio/personas — seeded persona listeleniyor ──────────────────
      await page.goto("/studio/personas");
      await expect(page.getByText(personaName)).toBeVisible();

      // ── ADIM_9 varsayım 5'in KAPANIŞI — /plan'a DÖN (yenileme), istek
      // KALICI: A artık seçim listesinde YOK (istendi), B hâlâ orada ────
      await page.goto("/plan");
      await expect(page.getByText(titleB)).toBeVisible();
      await expect(page.getByText(titleA)).toHaveCount(0);
    } finally {
      await admin.from("activity").delete().in("content_item_id", contentItemIds);
      await admin.from("content_items").delete().in("id", contentItemIds);
      await admin.from("personas").delete().eq("id", persona.id);
    }
  });
});
