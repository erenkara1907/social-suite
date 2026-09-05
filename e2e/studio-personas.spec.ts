import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * BIRLESIM_PLANI §12 adım 11b FAZ D — `createPersonaAction`in "Oluştur"
 * düğmesi hiçbir e2e testinde GERÇEKTEN tıklanmamıştı (FAZ 0.2 envanteri):
 * `plan-studio-bridge.spec.ts` personayı service-role ile doğrudan ekliyor,
 * formu hiç kullanmıyor. C1'in bulduğu hata sınıfının (bir "use server"
 * dosyası ilk gerçek tıklamada çökme) burada olup olmadığını yalnızca bu
 * test kanıtlar.
 *
 * ⭐ `sm:mode:video` çerezi ile yalnızca `video` portu canlıya çekiliyor —
 * `createPersonaAction` gerçek bir `personas` satırı + `media_jobs` (step:
 * persona_image, state: queued) yer tutucusu yazar ama HİÇBİR vendor
 * çağrısı yapmaz (worker/cron bu testte hiç tetiklenmiyor) — sıfır maliyet.
 *
 *   npm run test:e2e -- studio-personas
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

test.describe("studio/personas — gerçek 'Oluştur' tıklaması", () => {
  test("form gönderilir, gerçek persona satırı + persona_image işi yazılır", async ({ page }) => {
    const admin = adminClient();
    const user: E2eUser = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const stamp = Date.now();
    const personaName = `E2E Tıklama Personası ${stamp}`;

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");
    await page.context().addCookies([{ name: "sm:mode:video", value: "live", url: page.url() }]);

    let personaId: string | null = null;

    try {
      await page.goto("/studio/personas");
      // Demo modda `disabled` olan düğme canlı modda AÇIK — form gizli,
      // açmak için önce tıklamak gerekiyor.
      await page.getByRole("button", { name: "Yeni persona" }).click();

      await page.locator("#persona-name").fill(personaName);
      // Prompt alanı `DEFAULT_PERSONA_PROMPT_TR` ile ÖN DOLU — dokunmadan
      // gönderiyoruz, gerçek kullanım senaryosunun aynısı.
      // ⚠ Toggle düğmesi ve formun submit düğmesi AYNI etikete sahip
      // ("Yeni persona") — submit, DOM'da SONRAKİ (form açıldıktan sonra
      // render edilen) "Yeni persona" düğmesi.
      await page.getByRole("button", { name: "Yeni persona" }).last().click();

      // Form kapanır (`onCreated`) VE yeni kart listede görünür.
      await expect(page.getByText(personaName)).toBeVisible();

      const { data: persona, error: personaError } = await admin
        .from("personas").select("id,name,prompt").eq("name", personaName)
        .single<{ id: string; name: string; prompt: string }>();
      if (personaError || !persona) throw new Error(`persona yazılmadı: ${personaError?.message}`);
      personaId = persona.id;
      expect(persona.prompt.length).toBeGreaterThan(0);

      const { data: job, error: jobError } = await admin
        .from("media_jobs").select("id,step,state,persona_id").eq("persona_id", personaId)
        .single<{ id: string; step: string; state: string; persona_id: string }>();
      if (jobError || !job) throw new Error(`persona_image işi yazılmadı: ${jobError?.message}`);
      expect(job.step).toBe("persona_image");
      // Worker/cron tetiklenmedi — hâlâ kuyrukta, hiçbir vendor çağrılmadı.
      expect(job.state).toBe("queued");
    } finally {
      if (personaId) {
        await admin.from("media_jobs").delete().eq("persona_id", personaId);
        await admin.from("personas").delete().eq("id", personaId);
      }
    }
  });
});
