import { requireBrand } from "@/lib/server/auth";
import { brandCompletionPercent } from "@/lib/core/brand/types";
import { SettingsBrandForm } from "@/components/app/settings-brand-form";

export const metadata = { title: "Ayarlar" };

/**
 * `/settings` — BIRLESIM_PLANI §12 adım 9 FAZ B.
 *
 * ⭐ B1 — YALNIZCA marka profili bölümü. Entegrasyon rozetleri ve API
 * anahtarı girişi 11b / adım 13'ün işi, buraya dokunulmadı.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 */
export default async function Page() {
  const { brand } = await requireBrand();
  const completion = brandCompletionPercent(brand);

  return <SettingsBrandForm brand={brand} completion={completion} />;
}
