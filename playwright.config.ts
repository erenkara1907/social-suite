import { defineConfig, devices } from "@playwright/test";

/**
 * BIRLESIM_PLANI §12 adım 9 A3 — Claude-in-Chrome köprüsü iki oturumdur
 * (ADIM_27, ADIM_8) ağ kontrolü yapamıyordu; bu, gerçek bir tarayıcı ve
 * çalışma zamanı `fetch` denetimi sağlayan ilk araç.
 *
 * `.env.local` Next'in kendisi tarafından otomatik yüklenir ama Playwright'ın
 * config/setup/teardown süreci Next dışında çalışıyor — burada elle
 * yükleniyor. Aynı Node süreci `globalSetup`/`globalTeardown`'ı da çalıştırdığı
 * için (Playwright ayrı bir alt süreç açmıyor) bir kez yüklemek yeterli.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI'da .env.local yok — gerçek ortam değişkenleri zaten set edilmiş olmalı.
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tek paylaşılan test hesabı — paralel koşu yarış durumu yaratır
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Ayrı bir port (3100) — geliştiricinin `next dev` (3000) süreciyle çakışmasın.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { APP_MODE: "demo" },
  },
});
