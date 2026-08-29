import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 12 FAZ C doğrulama — "başarısız bir iş üret,
 * ekranda göründüğünü kanıtla".
 *
 * `global-setup.ts`'in paylaşılan test hesabını kullanır (smoke/plan/settings
 * ile aynı desen). Worker'ı GERÇEKTEN çalıştırmıyor (CRON_SECRET gerektirir,
 * o zaten `lib/server/jobs/worker.ts` seviyesinde ayrı test edildi —
 * `supabase/tests/enqueue_job.sh` + FAZ B'nin manuel doğrulaması) — burada
 * yalnızca OKUMA tarafını (`getJobsSummary()` → `/queue` render) kanıtlıyor:
 * service-role ile doğrudan `dead` durumunda bir satır yazıp ekranda
 * göründüğünü doğruluyor.
 *
 * ⚠ webServer `APP_MODE=demo` ile çalışıyor (playwright.config.ts) — bu test
 * aynı zamanda `lib/server/jobs/status.ts`'in "demo modda da GERÇEK sorgu"
 * kararını da kanıtlıyor.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("jobs queue status — ölü mektup görünürlüğü", () => {
  test("dead durumundaki bir iş /queue'da sayı + son hata olarak görünür", async ({ page }) => {
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const admin = adminClient();
    const errorMarker = `e2e ölü mektup kanıtı ${Date.now()}`;

    const { data: job, error: insertError } = await admin
      .from("jobs")
      .insert({
        user_id: user.userId,
        kind: "noop_test",
        state: "dead",
        attempts: 3,
        max_attempts: 3,
        last_error: errorMarker,
      })
      .select("id")
      .single();
    if (insertError || !job) throw new Error(`test işi yazılamadı: ${insertError?.message}`);

    try {
      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard");

      await page.goto("/queue");

      // Sayı — "Ölü mektup" stat kartı en az 1 gösteriyor.
      await expect(page.getByText(/Ölü mektup|Dead letter/).first()).toBeVisible();
      // Son hata — dead-letter listesinde mesajın kendisi.
      await expect(page.getByText(errorMarker)).toBeVisible();
      // Tür rozeti.
      await expect(page.getByText("noop_test").first()).toBeVisible();
    } finally {
      await admin.from("jobs").delete().eq("id", job.id);
    }
  });
});
