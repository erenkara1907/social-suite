import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * BIRLESIM_PLANI §12 adım 3 — test altyapısı.
 *
 * Neden jsdom: `lib/core/` saf TS ve `node` ortamında da koşardı, ama aynı
 * yapılandırma §7.3'ün bileşen testlerini de taşıyacak (@testing-library/react
 * zaten kurulu). İki ayrı ortam yapılandırması tutmak yerine tek jsdom.
 *
 * Kapsam yalnızca `lib/**` — `app/` (rotalar, sayfalar) ve `components/`
 * kapsam hedefine dahil DEĞİL; onların testi §12 adım 8+ ile geliyor ve şimdi
 * dahil edilirlerse hedef yapay olarak düşük görünür.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**"],
      // Tip-yalnızca dosyalar ve README'ler kapsam paydasını kirletir.
      exclude: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "lib/**/README.md", "lib/**/.gitkeep"],
    },
  },
});
