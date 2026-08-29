import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * BIRLESIM_PLANI §12 adım 11 FAZ A (A0) — uçtan uca kullanıcı yolculuğu.
 *
 * Diğer e2e dosyaları (smoke/plan/settings) `global-setup.ts`'in ÖNCEDEN
 * kurduğu hesabı kullanıyor. Bu dosya BİLEREK farklı: kökten (`/`) başlayıp
 * gerçek KAYIT formunu da kapsıyor, çünkü A0'ın doğrulaması tam olarak bunu
 * istiyor — "kök adrese git → /login'e düş → kayıt ol → yolculuğun geri
 * kalanı". Kendi hesabını kurar, kendi hesabını siler (A3'ün "geçici oluştur,
 * hemen sil" deseni — `global-setup.ts` yorumu).
 *
 * ⚠ Gerçek Supabase e-posta onayı açık (bkz. `docs/ADIM_27_RAPOR.md`) —
 * Playwright bir e-posta kutusuna giremez. UI'daki `signUp()` çağrısı
 * GERÇEK: "e-postanı kontrol et" ekranına düştüğü doğrulanıyor, sonra
 * `global-setup.ts` ile AYNI service-role kısayolu ile onaylanıyor. Kayıt
 * formunun kendisi taklit edilmiyor, yalnızca alamayacağımız e-posta adımı.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase env eksik — .env.local kontrol et.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** `listUsers` e-postaya göre filtrelemiyor — az sayıda test hesabı olduğu
 *  için sayfayı elle tarıyoruz. Oluşturma ile görünürlük arasında küçük bir
 *  gecikme ihtimaline karşı birkaç kez deneniyor. */
async function findUserIdByEmail(admin: ReturnType<typeof adminClient>, email: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(`listUsers başarısız: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`e2e kayıt hesabı bulunamadı: ${email}`);
}

test.describe("journey — kök adresten kayıt olup ürünün tamamını gezme", () => {
  test("/ → /login → kayıt → onboarding → dashboard/plan/studio/queue/analytics/settings", async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL eksik — .env.local kontrol et.");
    const supabaseHost = new URL(supabaseUrl).hostname;
    const admin = adminClient();

    // ⭐ ağ kontrolü — yolculuğun EN BAŞINDAN (kök adresten önce) kuruluyor,
    // smoke.spec.ts'in "giriş sonrası" kapsamından daha geniş: kayıt ekranı
    // ve onboarding da denetime giriyor.
    const foreignRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
      const host = new URL(url).hostname;
      const isOwnOrigin = host === "localhost" || host === "127.0.0.1";
      const isSupabase = host === supabaseHost;
      if (!isOwnOrigin && !isSupabase) foreignRequests.push(url);
    });

    const stamp = Date.now();
    const email = `e2e-journey-${stamp}@ornekmarka.test`;
    const password = `Journey-${stamp}!`;
    const brandName = `E2E Yolculuk Kahve ${stamp}`;
    let userId: string | null = null;

    try {
      // ── A0 — kök adres oturumsuzken /login'e düşer ──────────────────────
      await page.goto("/");
      await page.waitForURL("**/login");

      // ── Kayıt ol ─────────────────────────────────────────────────────────
      await page.goto("/signup");
      await page.locator("#name").fill("E2E Yolculuk");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /^Başla$|^Get started$/ }).click();

      // ⚠ Supabase'in dahili SMTP'si projede sıkı bir e-posta gönderim kotası
      // taşıyor (doğrulandı: `/auth/v1/signup`'a doğrudan istek
      // `over_email_send_rate_limit` / HTTP 429 döndü). Kota açıksa gerçek
      // "e-postana bak" ekranı görünür; kota doluysa form kendi
      // `errGeneric`'ini gösterir (auth-errors.ts) — bu ÇÖKME DEĞİL, kayıt
      // formunun kendisi doğru çalıştı. İki durumda da hesap `global-setup.ts`
      // ile AYNI service-role kısayoluyla kuruluyor; tek fark KİMİN oluşturduğu.
      const checkEmail = page.getByText(/E-postana bak|Check your email/i);
      const rateLimited = page.getByRole("alert").filter({ hasText: /Bir şeyler ters gitti|Something went wrong/i });
      await expect(checkEmail.or(rateLimited)).toBeVisible();

      if (await checkEmail.isVisible()) {
        userId = await findUserIdByEmail(admin, email);
        const { error: confirmError } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
        if (confirmError) throw new Error(`e2e hesabı onaylanamadı: ${confirmError.message}`);
      } else {
        console.log("[kayıt] Supabase e-posta kotası dolu — hesap service-role ile kuruldu (form denemesi gerçekti).");
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error(`e2e kayıt hesabı kurulamadı: ${error?.message ?? "bilinmeyen hata"}`);
        userId = data.user.id;
      }

      // ── Giriş yap → markası yok → /onboarding ───────────────────────────
      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/onboarding");

      // ── Onboarding — ilk marka ──────────────────────────────────────────
      await page.locator("#name").fill(brandName);
      await page.getByRole("button", { name: /^Devam et$|^Continue$/ }).click();
      await page.waitForURL("**/dashboard");

      // ── /dashboard — anlamlı içerik: bugünün/yaklaşan gönderisi görünür ──
      await expect(page.getByText("Aeropress'te ters yöntem").first()).toBeVisible();

      // ── /plan — devam eden zincir bölümü görünür (§4b) ──────────────────
      await page.goto("/plan");
      await expect(page.getByText(/Devam eden zincirler|Ongoing chains/)).toBeVisible();
      await expect(page.getByText("Ekipman rehberi").first()).toBeVisible();

      // ── /studio — çalışan üretim işi, kuyruktaki içeriğe bağlı (§4a) ────
      await page.goto("/studio");
      await expect(page.getByText("Bir günde kaç kilo kavuruyoruz").first()).toBeVisible();

      // ── /queue — zincir kartı görünür, üç halka da orada ────────────────
      await page.goto("/queue");
      await expect(page.getByText(/Devam zinciri|Continuation chain/)).toBeVisible();
      await expect(page.getByText("Ekipman rehberi 3: terazi ve zaman").first()).toBeVisible();

      // ── /analytics — en az bir "final" rozeti (30 günlük toplama bitmiş) ─
      await page.goto("/analytics");
      await expect(page.getByText(/^final$/).first()).toBeVisible();

      // ── /settings — az önce oluşturulan marka adı geri geliyor ──────────
      await page.goto("/settings");
      await expect(page.locator("#name")).toHaveValue(brandName);

      // ── Ağ raporu — tüm yolculuk boyunca yabancı köke istek yok ─────────
      console.log(
        `[ağ raporu] yolculuk boyunca yabancı köke giden 0 bekleniyor, izinli kökler: localhost, ${supabaseHost}`,
      );
      expect(foreignRequests, `Supabase/kendi kök dışına giden istekler: ${foreignRequests.join(", ")}`).toEqual([]);
    } finally {
      // ── Temizlik — test hesabı silinir (brands satırı cascade ile gider) ─
      const id = userId ?? (await findUserIdByEmail(admin, email).catch(() => null));
      if (id) await admin.auth.admin.deleteUser(id);
    }
  });
});
