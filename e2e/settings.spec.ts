import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 9 FAZ B doğrulaması:
 *   1. Form kaydediyor, sayfa yenilendiğinde değerler geliyor.
 *   2. Başka bir kullanıcının markasına yazma denemesi RLS tarafından reddedilir.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("settings — marka profili", () => {
  test("form kaydediyor, sayfa yenilendiğinde değerler geliyor", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    await page.goto("/settings");

    // Benzersiz değerler — koşu her seferinde yeni bir temp hesapla çalışır,
    // ama yine de "eski değer zaten oradaydı" yanılgısını önlemek için.
    const stamp = Date.now();
    const values = {
      name: `E2E Kahve Durağı ${stamp}`,
      industry: "E2E test sektörü",
      description: "E2E testinin yazdığı açıklama.",
      audience: "E2E test kitlesi",
      voice: "Net ve kısa",
      links: "example.com",
    };

    await page.locator("#name").fill(values.name);
    await page.locator("#industry").fill(values.industry);
    await page.locator("#description").fill(values.description);
    await page.locator("#audience").fill(values.audience);
    await page.locator("#voice").fill(values.voice);
    await page.locator("#links").fill(values.links);
    await page.selectOption("#timezone", "America/New_York");

    // ⚠ `button[type="submit"]` belirsiz — sidebar'ın "Çıkış yap" düğmesi de
    // kendi formunda submit tipinde. Metne göre ayırt ediliyor.
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    // ⚠ Kaydetme veritabanına ANINDA yazıyor (doğrulandı — admin istemciyle
    // yazımdan hemen sonra okuma her zaman güncel geldi). Ama `next dev`
    // Turbopack'te bir reload bazen tek istekte requireBrand()'i İKİ KEZ
    // çalıştırıyor — önce eski, hemen ardından taze sonuçla (React/Next'in
    // dev-only render davranışı, üretimde yok). Bu yüzden reload'u
    // gerekirse birkaç kez tekrarlayıp yerleşmesini bekliyoruz.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator("#name").inputValue();
        },
        { timeout: 15_000 },
      )
      .toBe(values.name);
    await expect(page.locator("#industry")).toHaveValue(values.industry);
    await expect(page.locator("#description")).toHaveValue(values.description);
    await expect(page.locator("#audience")).toHaveValue(values.audience);
    await expect(page.locator("#voice")).toHaveValue(values.voice);
    await expect(page.locator("#links")).toHaveValue(values.links);
    await expect(page.locator("#timezone")).toHaveValue("America/New_York");

    // ⭐ B4 — sekiz alandan altısı dolu (name, industry, description, audience,
    // voice, links; products/keywords boş kaldı) → tamamlanma %75 görünmeli.
    await expect(page.getByText(/75%/)).toBeVisible();
  });

  test("⭐ RLS kanıtı — başka bir kullanıcının markasına yazma denemesi tutmaz", async () => {
    const admin = adminClient();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!anonKey || !supabaseUrl) throw new Error("Supabase env eksik.");

    const ownerA: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const { data: brandA } = await admin
      .from("brands")
      .select("id,name")
      .eq("owner_id", ownerA.userId)
      .single();
    if (!brandA) throw new Error("Paylaşılan e2e kullanıcısının markası bulunamadı.");

    // İkinci, tek kullanımlık bir saldırgan hesabı — bu testin kendi kapsamı.
    const intruderEmail = `e2e-rls-${Date.now()}@ornekmarka.test`;
    const intruderPassword = randomUUID();
    const { data: intruderUser, error: createError } = await admin.auth.admin.createUser({
      email: intruderEmail,
      password: intruderPassword,
      email_confirm: true,
    });
    if (createError || !intruderUser.user) throw new Error(`saldırgan hesabı oluşturulamadı: ${createError?.message}`);

    try {
      const asIntruder = createClient(supabaseUrl, anonKey);
      const { error: signInError } = await asIntruder.auth.signInWithPassword({
        email: intruderEmail,
        password: intruderPassword,
      });
      if (signInError) throw new Error(`saldırgan girişi başarısız: ${signInError.message}`);

      const { data: updated, error: updateError } = await asIntruder
        .from("brands")
        .update({ name: "HACKED" })
        .eq("id", brandA.id)
        .select();

      // RLS `own brands` politikası `using (auth.uid() = owner_id)` — satır
      // saldırganın USING filtresinden hiç geçmiyor. PostgREST bunu hata
      // olarak DEĞİL, "eşleşen satır yok" (boş sonuç) olarak raporluyor.
      console.log("[RLS kanıtı] update sonucu — error:", updateError?.message ?? null, "etkilenen satır:", updated?.length ?? 0);
      expect(updateError).toBeNull();
      expect(updated ?? []).toEqual([]);

      const { data: brandAAfter } = await admin.from("brands").select("name").eq("id", brandA.id).single();
      expect(brandAAfter?.name, "marka A'nın adı DEĞİŞMEMİŞ olmalı").toBe(brandA.name);
    } finally {
      await admin.auth.admin.deleteUser(intruderUser.user.id);
    }
  });
});
