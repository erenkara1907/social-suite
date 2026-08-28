import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * A3 — ilk smoke testi: giriş → `/dashboard` → sidebar'daki her modüle git.
 *
 * Modül listesi `app/(app)/layout.tsx`'in `SHELL_MODULES`'ı ile ELLE
 * eşleşiyor (bilinçli — e2e testi kara kutu olarak kalsın, uygulama
 * kaynağını import etmesin).
 *
 * ⚠ `expectStub` bu ADIMIN İÇİNDEKİ ilerlemeyi takip eder — statik bir liste
 * değil. FAZ A'nın kontrol noktasında `/plan` ve `/settings` HÂLÂ ScreenStub
 * (FAZ B/C henüz yazılmadı); her ikisi kendi fazı bittiğinde `false`'a çevrilir.
 * `/studio` bu ADIMIN kapsamı dışı (adım 10), bu yüzden hep `true` kalır.
 */
const MODULES = [
  { path: "/dashboard", expectStub: false },
  { path: "/plan", expectStub: true }, // FAZ C bitince false
  { path: "/queue", expectStub: false },
  { path: "/studio", expectStub: true }, // adım 10'un işi — hep true kalacak
  { path: "/analytics", expectStub: false },
  { path: "/settings", expectStub: true }, // FAZ B bitince false
] as const;

/** components/app/screen-stub.tsx'in ayırt edici, başka hiçbir yerde
 *  kullanılmayan sarmalayıcı sınıfı. */
const SCREEN_STUB_MARKER = "min-h-[60vh]";

test.describe("smoke — giriş ve altı modül", () => {
  test("giriş yapar, her modüle gider, ScreenStub durumu doğru, ağ dışarı çıkmaz", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL eksik — .env.local kontrol et.");
    const supabaseHost = new URL(supabaseUrl).hostname;

    // ⭐ ağ kontrolü — ADIM_27 ve ADIM_8'in yapamadığı çalışma zamanı fetch
    // denetimi. Bütün oturum boyunca atılan HER isteği topluyoruz.
    const foreignRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return; // data:, blob:, vb. yok say
      const host = new URL(url).hostname;
      const isOwnOrigin = host === "localhost" || host === "127.0.0.1";
      const isSupabase = host === supabaseHost;
      if (!isOwnOrigin && !isSupabase) foreignRequests.push(url);
    });

    // ── Giriş ──────────────────────────────────────────────────────────
    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    // ── Sidebar'daki her modül ────────────────────────────────────────
    for (const mod of MODULES) {
      const response = await page.goto(mod.path);
      expect(response?.status(), `${mod.path} 200 dönmeli`).toBe(200);

      const html = await page.content();
      const hasStub = html.includes(SCREEN_STUB_MARKER);
      if (mod.expectStub) {
        expect(hasStub, `${mod.path} hâlâ ScreenStub göstermeli (bu oturumun kapsamı dışı)`).toBe(true);
      } else {
        expect(hasStub, `${mod.path} artık ScreenStub GÖSTERMEMELİ`).toBe(false);
      }
    }

    // ── Ağ raporu ─────────────────────────────────────────────────────
    console.log(`[ağ raporu] toplam istek: yabancı köke giden 0 bekleniyor, izinli kökler: localhost, ${supabaseHost}`);
    expect(foreignRequests, `Supabase/kendi kök dışına giden istekler: ${foreignRequests.join(", ")}`).toEqual([]);
  });
});
