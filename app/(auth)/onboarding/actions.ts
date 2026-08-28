"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/server/auth";
import { MAX_LENGTH } from "@/lib/core/brand/types";

export interface OnboardingState {
  /** `ui` sözlüğünün anahtarı — çeviri istemcide yapılır. */
  errorKey: "errBrandNameRequired" | "errBrandCreate" | null;
}

/**
 * İlk markayı oluşturur — B4'ün `/onboarding` çözümünün tek yazma noktası.
 *
 * ⭐ Kullanıcı oturumuyla yazıyor, service-role ile DEĞİL. `brands`
 * politikası `with check (auth.uid() = owner_id)` diyor; service-role
 * kullansaydık bu kontrol hiç çalışmaz ve RLS'in doğru kurulup kurulmadığını
 * öğrenemezdik.
 */
export async function createBrandAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";

  if (!name) return { errorKey: "errBrandNameRequired" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("brands")
    .insert({ owner_id: user.id, name: name.slice(0, MAX_LENGTH.name) });

  if (error) return { errorKey: "errBrandCreate" };

  redirect("/dashboard");
}
