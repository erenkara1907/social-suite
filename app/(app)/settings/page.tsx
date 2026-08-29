import { requireBrand } from "@/lib/server/auth";
import { brandCompletionPercent } from "@/lib/core/brand/types";
import { SettingsBrandForm } from "@/components/app/settings-brand-form";
import { SettingsIntegrationsForm } from "@/components/app/settings-integrations-form";
import { listCredentialStatuses } from "@/app/(app)/settings/integrations-data";

export const metadata = { title: "Ayarlar" };

/**
 * `/settings` — BIRLESIM_PLANI §12 adım 9 FAZ B + adım 13 FAZ C.
 *
 * Marka profili adım 9'da yazıldı; entegrasyon bölümü (durum rozetleri +
 * API anahtarı girişi) burada, adım 13'te tamamlanıyor.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⚠ `SettingsBrandForm` kendi `max-w-2xl` sarmalayıcısını zaten taşıyor
 * (adım 9) — burada ikinci bir dış sarmalayıcıYLA iç içe koymamak için
 * `SettingsIntegrationsForm` kendi genişliğini kendi taşıyor, ikisi kardeş.
 */
export default async function Page() {
  const { brand } = await requireBrand();
  const completion = brandCompletionPercent(brand);
  const credentialStatuses = await listCredentialStatuses(brand.id);

  return (
    <div className="space-y-4">
      <SettingsBrandForm brand={brand} completion={completion} />
      <div className="max-w-2xl">
        <SettingsIntegrationsForm statuses={credentialStatuses} />
      </div>
    </div>
  );
}
