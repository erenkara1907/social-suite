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
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only`'nin varsayılan girişi import edildiğinde FIRLATIR —
      // paketin tüm işi bu. Next onu `react-server` koşuluyla `empty.js`'e
      // çözüyor; vitest o koşulu bilmediği için elle eşliyoruz. Aksi hâlde
      // `lib/server/*` ve `lib/supabase/admin.ts` test edilemezdi.
      // ⚠ Yalnızca test koşucusu için. Üretim derlemesinde koruma yerinde:
      // bir Client Component admin.ts'i import ederse build patlar.
      // Dosya yolu, `server-only/empty` DEĞİL: paketin `exports` alanı
      // alt yolu yalnızca `react-server` koşulunda açıyor, vitest o koşulda
      // koşmadığı için isimle çözülemiyor.
      "server-only": fileURLToPath(
        new URL("node_modules/server-only/empty.js", import.meta.url),
      ),
    },
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
