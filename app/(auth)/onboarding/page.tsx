import { redirect } from "next/navigation";
import { requireUser, currentBrand } from "@/lib/server/auth";
import { OnboardingForm } from "./form";

export const metadata = { title: "Markanı tanıt" };

/**
 * İlk giriş — marka oluşturma (BIRLESIM_PLANI §4e + B4).
 *
 * ⚠ Bu sayfa `(app)` grubunun DIŞINDA. `(app)/layout.tsx` `requireBrand()`
 * çağırıyor; onboarding oraya konsaydı "marka yok → /onboarding →
 * requireBrand → /onboarding" sonsuz döngüsü olurdu. Guard'ı proxy.ts'in
 * PROTECTED listesinden ve buradaki `requireUser()`'dan alıyor.
 */
export default async function OnboardingPage() {
  await requireUser();

  // Markası olan buraya geri dönmemeli — geldiyse zaten işi bitmiş.
  if (await currentBrand()) redirect("/dashboard");

  return <OnboardingForm />;
}
