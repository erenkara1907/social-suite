/**
 * ImagePort — DEMO implementasyon.
 *
 * Demo kaynağı: statik placeholder. ⚠ Ağ yok — `public/demo/` altındaki yerel
 * yol döndürülüyor, uzak bir URL değil. Canlı karşılığı fal flux (§12 adım 19-20).
 */
import type { ImagePort } from "@/lib/adapters/ports";

const DEMO_IMAGE_URL = "/demo/generated/placeholder-1024.png";
const DEMO_IMAGE_SIZE = 1024;

export const demoImage: ImagePort = {
  async generate() {
    return {
      ok: true,
      data: { url: DEMO_IMAGE_URL, width: DEMO_IMAGE_SIZE, height: DEMO_IMAGE_SIZE },
    };
  },
};
