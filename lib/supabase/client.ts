"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./config";

/**
 * Tarayıcı istemcisi. Yalnızca giriş/çıkış/kayıt formları kullanır.
 *
 * siraya'nın sürümünden fark: yapılandırma yoksa `null` DÖNMÜYOR, patlıyor.
 * `null` dönen bir auth istemcisi, çağıranı "o zaman demo kullanıcı say"
 * yoluna itiyordu — B1 bu yolu kapattı.
 */
export function createClient() {
  assertSupabaseConfigured();
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
