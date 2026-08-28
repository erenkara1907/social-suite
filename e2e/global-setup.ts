import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * A3 — ADIM_8'in "geçici oluştur, hemen sil" test hesabı deseni.
 *
 * ⚠ Bu dosya `lib/supabase/admin.ts`'in üç izinli kullanım yerinden biri
 * DEĞİL — o dosyanın kapsamı uygulamanın ÇALIŞMA ZAMANI kod yolları
 * (cron, OAuth callback, kimlik bilgisi okuma). Burası test altyapısı: gerçek
 * bir kullanıcı + marka satırı, yalnızca e2e koşusu boyunca var olacak
 * şekilde, service-role ile önceden kuruluyor ki test giriş yaptığında
 * doğrudan `/dashboard`'a düşsün (`/onboarding`'e değil).
 */
export const STATE_FILE = path.join(__dirname, ".e2e-user.json");

export interface E2eUser {
  userId: string;
  email: string;
  password: string;
}

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "e2e kurulumu başarısız: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local'da dolu olmalı.",
    );
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const email = `e2e-smoke-${Date.now()}@ornekmarka.test`;
  // Sabit bir dize DEĞİL — her koşuda rastgele üretilir, hesap zaten
  // koşu sonunda silinir (bkz. global-teardown.ts).
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`e2e test kullanıcısı oluşturulamadı: ${error?.message ?? "bilinmeyen hata"}`);
  }

  // requireBrand() /dashboard'a düşmek için bir marka satırı ister — B4
  // (onboarding trigger'ı yalnızca profiles yaratıyor, brands değil).
  const { error: brandError } = await admin
    .from("brands")
    .insert({ owner_id: data.user.id, name: "E2E Kahve Durağı" });

  if (brandError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`e2e test markası oluşturulamadı: ${brandError.message}`);
  }

  const state: E2eUser = { userId: data.user.id, email, password };
  if (!existsSync(__dirname)) mkdirSync(__dirname, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
}
