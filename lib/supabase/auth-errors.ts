import type { ui as dict } from "@/lib/i18n/dict";

type UiStrings = (typeof dict)["tr"];

/**
 * Supabase auth hataları İngilizce döner. Kullanıcının gerçekten
 * karşılaşabileceği olanları iki dilli sözlüğe eşler; eşleşmeyen her şey
 * `errGeneric`'e düşer.
 *
 * siraya/lib/supabase/auth-errors.ts'ten birebir (§7.4 auth-screen kararının
 * eki). Ham Supabase metnini ekrana basmak, iç durumu sızdırmanın kolay yolu.
 */
const MATCHERS: { test: RegExp; key: keyof UiStrings }[] = [
  { test: /invalid login credentials/i, key: "errInvalidCredentials" },
  { test: /already registered|already been registered|user already exists/i, key: "errEmailTaken" },
  { test: /password should be at least|weak.?password/i, key: "errWeakPassword" },
  { test: /email not confirmed/i, key: "errEmailNotConfirmed" },
  { test: /provider is not enabled|unsupported provider/i, key: "errProviderDisabled" },
];

export function authErrorKey(message: string | undefined): keyof UiStrings {
  if (!message) return "errGeneric";
  return MATCHERS.find((m) => m.test.test(message))?.key ?? "errGeneric";
}
