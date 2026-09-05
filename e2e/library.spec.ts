import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 11b FAZ B doğrulaması:
 *   1. Gerçek bir `media_assets` kaydı listeleniyor ve önizleniyor.
 *   2. A markasının medyası B kullanıcısına GÖRÜNMÜYOR (canlı RLS kanıtı).
 *   3. Silme: hem depolama hem DB temiz (yetim kalmaz).
 *
 * ⭐ `/plan`↔`/studio` köprüsüyle AYNI teknik (`plan-studio-bridge.spec.ts`):
 * yalnızca `storage` portu dev-only çerezle canlıya çekiliyor — geri kalan
 * uygulama demoda kalır, gerçek para harcayan hiçbir şey tetiklenmez.
 *
 *   npm run test:e2e -- library
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// 1×1 saydam PNG — gerçek, minik bir dosya.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("library — gerçek medya, RLS izolasyonu, silme", () => {
  test("kaydı listeler + önizler, başka markaya görünmez, sil: depolama+DB birlikte temizlenir", async ({ page }) => {
    const admin = adminClient();
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const { data: brand } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (!brand) throw new Error("Paylaşılan e2e kullanıcısının markası bulunamadı.");

    const stamp = Date.now();
    const storagePath = `${user.userId}/${brand.id}/image/e2e-${stamp}.png`;
    const bytes = Buffer.from(PNG_BASE64, "base64");

    const { error: uploadError } = await admin.storage
      .from("media")
      .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(`e2e dosyası yüklenemedi: ${uploadError.message}`);
    const { data: pub } = admin.storage.from("media").getPublicUrl(storagePath);

    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .insert({
        brand_id: brand.id, user_id: user.userId, kind: "image", storage_path: storagePath,
        public_url: pub.publicUrl, mime_type: "image/png", bytes: bytes.byteLength, source_vendor: "upload",
      })
      .select("id")
      .single<{ id: string }>();
    if (assetError || !asset) throw new Error(`media_assets yazılamadı: ${assetError?.message}`);

    let intruderUserId: string | null = null;

    try {
      // ── Sahip (A) girişi + storage portunu canlıya çek ──────────────────
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");
      await page.context().addCookies([{ name: "sm:mode:storage", value: "live", url: page.url() }]);

      await page.goto("/library");
      const card = page.getByTestId(`media-asset-${asset.id}`);
      await expect(card).toBeVisible();
      await expect(card.locator("img")).toHaveAttribute("src", pub.publicUrl);

      // ── RLS kanıtı — ikinci, tek kullanımlık marka/kullanıcı ────────────
      const intruderEmail = `e2e-library-rls-${stamp}@ornekmarka.test`;
      const intruderPassword = randomUUID();
      const { data: intruderUser, error: createError } = await admin.auth.admin.createUser({
        email: intruderEmail, password: intruderPassword, email_confirm: true,
      });
      if (createError || !intruderUser.user) throw new Error(`saldırgan hesabı oluşturulamadı: ${createError?.message}`);
      intruderUserId = intruderUser.user.id;
      const { error: intruderBrandError } = await admin
        .from("brands").insert({ owner_id: intruderUserId, name: "E2E Saldırgan Marka" });
      if (intruderBrandError) throw new Error(`saldırgan markası oluşturulamadı: ${intruderBrandError.message}`);

      // Doğrudan DB kanıtı — B'nin OTURUMUYLA A'nın asset id'sini sorgula.
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!anonKey || !supabaseUrl) throw new Error("Supabase env eksik.");
      const asIntruder = createClient(supabaseUrl, anonKey);
      const { error: signInError } = await asIntruder.auth.signInWithPassword({
        email: intruderEmail, password: intruderPassword,
      });
      if (signInError) throw new Error(`saldırgan girişi başarısız: ${signInError.message}`);
      const { data: leaked, error: leakError } = await asIntruder.from("media_assets").select("id").eq("id", asset.id);
      console.log(
        "[RLS kanıtı /library] B'nin A'nın medyasını okuma denemesi — error:",
        leakError?.message ?? null, "dönen satır:", leaked?.length ?? 0,
      );
      expect(leakError).toBeNull();
      expect(leaked ?? []).toEqual([]);

      // Tarayıcı üzerinden de aynı kanıt — B'nin /library'sinde A'nın kartı YOK.
      await page.context().clearCookies();
      await page.goto("/login");
      await page.locator("#email").fill(intruderEmail);
      await page.locator("#password").fill(intruderPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");
      await page.context().addCookies([{ name: "sm:mode:storage", value: "live", url: page.url() }]);
      await page.goto("/library");
      await expect(page.getByTestId(`media-asset-${asset.id}`)).toHaveCount(0);

      // ── Silme — SAHİBİN (A) oturumuna dön, depolama + DB birlikte gitsin ─
      await page.context().clearCookies();
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");
      await page.context().addCookies([{ name: "sm:mode:storage", value: "live", url: page.url() }]);
      await page.goto("/library");
      await page.getByTestId(`media-asset-${asset.id}`).getByRole("button", { name: "Sil" }).click();
      await expect(page.getByTestId(`media-asset-${asset.id}`)).toHaveCount(0);

      await expect
        .poll(
          async () => {
            const { data } = await admin.from("media_assets").select("id").eq("id", asset.id).maybeSingle();
            return data;
          },
          { timeout: 10_000 },
        )
        .toBeNull();

      const { data: stillThere } = await admin.storage
        .from("media")
        .list(`${user.userId}/${brand.id}/image`, { search: `e2e-${stamp}.png` });
      expect(stillThere ?? []).toEqual([]);
    } finally {
      if (intruderUserId) await admin.auth.admin.deleteUser(intruderUserId);
      // Test kendi silme akışıyla temizlenmiş olmalı; yine de garantiye al —
      // aksi halde başarısız bir koşu gerçek bir dosyayı geride bırakır.
      try {
        await admin.storage.from("media").remove([storagePath]);
      } catch {
        /* zaten silinmiş olabilir */
      }
      try {
        await admin.from("media_assets").delete().eq("id", asset.id);
      } catch {
        /* zaten silinmiş olabilir */
      }
    }
  });
});
