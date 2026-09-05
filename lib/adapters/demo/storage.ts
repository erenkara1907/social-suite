/**
 * StoragePort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/media.ts` → `demoMediaAssets()`.
 *
 * ⚠ HİÇBİR ŞEY İNDİRİLMİYOR. `persistFromUrl` gelen URL'e dokunmuyor; §10
 * bulgu 1'in SSRF yüzeyi demo tarafta hiç açılmıyor. Allowlist canlı
 * implementasyonun işi (§12 adım 19).
 */
import type { StoragePort } from "@/lib/adapters/ports";
import type { MediaAssetRow } from "@/lib/core/types";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { demoMediaAssets } from "@/lib/adapters/demo/fixtures/media";

const DEMO_PLACEHOLDER_URL = "/demo/generated/placeholder-1024.png";

function stub(kind: MediaAssetRow["kind"], vendor: MediaAssetRow["source_vendor"], bytes: number): MediaAssetRow {
  const now = new Date().toISOString();
  return {
    id: `demo-asset-${now}`,
    brand_id: DEMO_BRAND_ID,
    kind,
    storage_path: `${DEMO_BRAND_ID}/demo/${now}`,
    public_url: DEMO_PLACEHOLDER_URL,
    mime_type: "",
    bytes,
    width: null,
    height: null,
    duration_ms: null,
    source_vendor: vendor,
    created_at: now,
  };
}

export const demoStorage: StoragePort = {
  async persistFromUrl(input) {
    return { ok: true, data: stub(input.kind, input.vendor, 0) };
  },
  async persistBytes(input) {
    return { ok: true, data: { ...stub(input.kind, input.vendor, input.bytes.byteLength), mime_type: input.mimeType } };
  },
  async list(kind) {
    const assets = demoMediaAssets(new Date());
    return kind ? assets.filter((a) => a.kind === kind) : assets;
  },
  // §12 adım 20 FAZ C1'in `markUgcRequested`'ıyla aynı gerekçe: demo modda
  // KALICI DEĞİL — fixture salt okunur, sunucu tarafı mutasyon istekler
  // arası sızardı. `/library`'nin silme düğmesi demo modda zaten `disabled`
  // (ikinci katman savunması); bu yalnızca tip sözleşmesini doldurur.
  async remove() {
    return { ok: true, data: undefined };
  },
};
