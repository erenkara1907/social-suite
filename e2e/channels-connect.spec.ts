import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 17a FAZ A doğrulaması: "gerçek bir hesap gerçekten
 * bağlanıyor (kısayok yok)". Gerçek bir Bluesky test hesabı + uygulama
 * şifresi gerektirir — bunlar olmadan bu dosya BÜTÜNÜYLE atlanır (aşağıdaki
 * `test.skip`), CI'ı veya kimlik bilgisi olmayan bir oturumu kırmaz.
 *
 *   BLUESKY_TEST_IDENTIFIER=<handle> BLUESKY_TEST_APP_PASSWORD=<app-password> \
 *     npm run test:e2e -- channels-connect
 *
 * ⚠ Bu test GERÇEKTEN Bluesky'ye bağlanır ve GERÇEKTEN oturumu iptal eder
 * (disconnect adımı `revokeBlueskySession` çağırır) — kullan-at bir test
 * hesabı kullanın, günlük kullanılan bir hesap DEĞİL.
 */
const IDENTIFIER = process.env.BLUESKY_TEST_IDENTIFIER ?? "";
const APP_PASSWORD = process.env.BLUESKY_TEST_APP_PASSWORD ?? "";
const RUN = Boolean(IDENTIFIER && APP_PASSWORD);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Anon key + kullanıcının kendi JWT'si — RLS'in GERÇEKTEN devrede olduğunu
 *  (service-role'ün AKSİNE) kanıtlamanın tek yolu bu. */
async function userClient(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase anon env eksik — .env.local kontrol et.");
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`e2e kullanıcı girişi başarısız: ${error.message}`);
  return client;
}

test.describe("channels — Bluesky gerçek bağlanma (17a FAZ A)", () => {
  test.skip(!RUN, "BLUESKY_TEST_IDENTIFIER / BLUESKY_TEST_APP_PASSWORD ayarlı değil — bu test atlanıyor");

  test("gerçek hesap bağlanır → token RLS arkasında → disconnect token'ı siler", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const admin = adminClient();

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    // ⭐ `channel` portunu canlıya çek — dev-only çerez (mode.ts), diğer e2e
    // testlerinin (plan-studio-bridge.spec.ts) izlediği aynı desen. Bu
    // olmadan `/channels` demo modda kalır ve form hiç render edilmez.
    await page.context().addCookies([{ name: "sm:mode:channel", value: "live", url: page.url() }]);

    await page.goto("/channels");
    const card = page.getByTestId("channel-card-bluesky");
    await expect(card).toBeVisible();
    await expect(card.getByText("Bağlı değil")).toBeVisible();

    await card.locator("#identifier-bluesky").fill(IDENTIFIER);
    await card.locator("#app-password-bluesky").fill(APP_PASSWORD);
    await card.getByRole("button", { name: "Bağla" }).click();

    // Sunucu eylemi tamamlanınca kart "Bağlı" rozetine döner.
    await expect(card.getByText("Bağlı", { exact: true })).toBeVisible({ timeout: 15_000 });

    // ⭐ SQL kanıtı 1 — service-role: satır GERÇEKTEN var, token dolu.
    //
    // ⚠ CANLI BULGU — `brand_id` filtresi ZORUNLU. Aynı gerçek Bluesky test
    // hesabı (`IDENTIFIER`) artık birden fazla markada bağlı olabiliyor
    // (FAZ B/C'nin "Carino Pizza" canlı testleri AYNI hesabı kullanıyor) —
    // yalnızca platform+handle'a göre sorgulamak `PGRST116` (birden fazla
    // satır) ile patladı, marka bazlı ayrım olmadan bu sorgu YAPISAL OLARAK
    // yanlıştı.
    const { data: brand, error: brandError } = await admin
      .from("brands").select("id").eq("owner_id", user.userId).single<{ id: string }>();
    if (brandError || !brand) throw new Error(`marka bulunamadı: ${brandError?.message}`);

    const { data: channelRow, error: channelError } = await admin
      .from("channels")
      .select("id,platform,handle,is_connected")
      .eq("brand_id", brand.id)
      .eq("platform", "bluesky")
      .eq("handle", `@${IDENTIFIER}`)
      .maybeSingle();
    expect(channelError).toBeNull();
    expect(channelRow).toBeTruthy();
    expect(channelRow!.is_connected).toBe(true);
    const channelId = channelRow!.id as string;

    const { data: credRow, error: credError } = await admin
      .from("channel_credentials")
      .select("access_token,refresh_token")
      .eq("channel_id", channelId)
      .maybeSingle();
    expect(credError).toBeNull();
    expect(credRow?.access_token?.length).toBeGreaterThan(0);
    expect(credRow?.refresh_token?.length).toBeGreaterThan(0);

    // ⭐ SQL kanıtı 2 — kullanıcı oturumuyla (RLS altında) 0 satır.
    // `channel_credentials` RLS açık + sıfır politika (§12 adım 5) — service
    // role DIŞINDA hiçbir istemci bu tabloyu okuyamamalı.
    const asUser = await userClient(user.email, user.password);
    const { data: userVisibleCreds, error: userCredError } = await asUser
      .from("channel_credentials")
      .select("channel_id")
      .eq("channel_id", channelId);
    expect(userCredError).toBeNull();
    expect(userVisibleCreds).toEqual([]);

    // Disconnect — gerçek düğme, gerçek tıklama (adım 20.5 kuralı).
    await page.reload();
    const connectedCard = page.getByTestId("channel-card-bluesky");
    await connectedCard.getByRole("button", { name: "Bağlantıyı kes" }).click();
    await expect(connectedCard.getByText("Bağlı değil")).toBeVisible({ timeout: 15_000 });

    // ⭐ SQL kanıtı 3 — disconnect token'ı GERÇEKTEN sildi.
    const { data: credAfterDisconnect } = await admin
      .from("channel_credentials")
      .select("channel_id")
      .eq("channel_id", channelId)
      .maybeSingle();
    expect(credAfterDisconnect).toBeNull();

    const { data: channelAfterDisconnect } = await admin
      .from("channels")
      .select("is_connected")
      .eq("id", channelId)
      .maybeSingle();
    expect(channelAfterDisconnect?.is_connected).toBe(false);
  });
});
