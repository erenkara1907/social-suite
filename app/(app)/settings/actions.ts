"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBrand } from "@/lib/server/auth";
import { BRAND_FIELDS, parseBrand, validateLinks } from "@/lib/core/brand/types";
import { isValidTimeZone } from "@/lib/core/tz";

/**
 * BIRLESIM_PLANI §12 adım 9 B3 — marka profili formunun tek yazma noktası.
 *
 * ⭐ B2 — `port("brand")`'e HİÇ girmiyor, `onboarding/actions.ts`'in
 * `createBrandAction`'ıyla aynı desende oturum sahibinin kendi
 * `createClient()`'ıyla (RLS altında, service-role DEĞİL) doğrudan `brands`
 * tablosuna yazıyor. Gerekçe `docs/BIRLESIM_PLANI.md` §9.1'de.
 */
export interface SettingsState {
  errorKey:
    | "errBrandNameRequired"
    | "errBrandFieldTooLong"
    | "errBrandLinksInvalid"
    | "errBrandTimezoneInvalid"
    | "errBrandSaveFailed"
    | null;
  /** Değişince istemci "kaydedildi" mesajını gösterir — her başarılı kayıtta yeni bir değer. */
  savedAt: number | null;
}

export async function saveBrandAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { brand: owned } = await requireBrand();

  // ⭐ B3 — `parseBrand` zaten test edilmiş (types.test.ts): kırpma, sekiz
  // alanın uzunluk sınırı, bilinmeyen anahtarları düşürme, ad zorunluluğu.
  // Dönen `Brand`, `toPromptBlock`'un okuduğu TAM AYNI şekil — form ile
  // prompt bloğu arasında ayrı bir dönüştürücü yok, kayıp da yok.
  const raw = Object.fromEntries(BRAND_FIELDS.map((field) => [field, formData.get(field)]));
  const brand = parseBrand(raw);
  if (!brand) {
    const nameGiven = String(formData.get("name") ?? "").trim().length > 0;
    return { errorKey: nameGiven ? "errBrandFieldTooLong" : "errBrandNameRequired", savedAt: null };
  }
  if (!validateLinks(brand.links)) return { errorKey: "errBrandLinksInvalid", savedAt: null };

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    return { errorKey: "errBrandTimezoneInvalid", savedAt: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("brands")
    .update({ ...brand, timezone })
    .eq("id", owned.id);

  if (error) return { errorKey: "errBrandSaveFailed", savedAt: null };

  // requireBrand()'in cache()'i yalnızca TEK istek içinde yaşıyor — bir
  // SONRAKİ istekte zaten taze sorgu çalışır. revalidatePath burada Next'in
  // Router Cache'indeki (istemci tarafı, soft-navigation) eski RSC
  // payload'ını da geçersiz kılmak için: layout brand.name/timezone'ı
  // taşıyor, /plan B4'ün tamamlanma uyarısını okuyacak.
  revalidatePath("/settings");
  revalidatePath("/plan");
  revalidatePath("/", "layout");

  return { errorKey: null, savedAt: Date.now() };
}
