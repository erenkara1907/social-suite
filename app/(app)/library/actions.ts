"use server";

import { revalidatePath } from "next/cache";
import { port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";

/**
 * "Sil" düğmesi — BIRLESIM_PLANI §12 adım 11b FAZ B.
 *
 * `StoragePort.remove()` depolama nesnesi + `media_assets` satırını
 * BİRLİKTE siler (bkz. `lib/server/storage.ts` `deleteMediaAsset()`) — yetim
 * kalmaz. Demo modda ikinci katman savunması: düğme `LibraryView`'da zaten
 * `disabled` (`isDemo("storage", ...)`); `demoStorage.remove()` de kendisi
 * no-op (`lib/adapters/demo/storage.ts`) — silme para harcamıyor, yalnızca
 * demo modda kalıcı olmuyor.
 *
 * ⚠ "use server" dosyaları yalnızca ASYNC FONKSİYON export edebilir
 * (adım 20.5 FAZ C1) — başlangıç state sabiti burada değil, `LibraryView`'da.
 */
export interface DeleteMediaActionState {
  status: "idle" | "deleted" | "error";
  assetId: string | null;
}

export async function deleteMediaAssetAction(
  _prev: DeleteMediaActionState,
  formData: FormData,
): Promise<DeleteMediaActionState> {
  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { status: "error", assetId: null };

  const overrides = await requestModeOverrides();
  const storagePort = port("storage", overrides);
  const result = await storagePort.remove(assetId);
  if (!result.ok) return { status: "error", assetId };

  revalidatePath("/library");
  return { status: "deleted", assetId };
}
