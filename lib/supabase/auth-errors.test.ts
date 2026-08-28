import { describe, expect, it } from "vitest";
import { authErrorKey } from "@/lib/supabase/auth-errors";
import { ui } from "@/lib/i18n/dict";

/**
 * Supabase'in ham İngilizce hata metnini ekrana basmak iç durumu sızdırır
 * (hangi kontrolün patladığı, kullanıcının var olup olmadığı). Bu eşleme o
 * metinleri iki dilli, sabit bir kümeye indiriyor.
 */
describe("authErrorKey", () => {
  const CASES: [string, string][] = [
    ["Invalid login credentials", "errInvalidCredentials"],
    ["User already registered", "errEmailTaken"],
    ["A user with this email address has already been registered", "errEmailTaken"],
    ["Password should be at least 6 characters", "errWeakPassword"],
    ["Weak password: too short", "errWeakPassword"],
    ["Email not confirmed", "errEmailNotConfirmed"],
    ["Provider is not enabled", "errProviderDisabled"],
  ];

  it.each(CASES)("%s → %s", (message, key) => {
    expect(authErrorKey(message)).toBe(key);
  });

  it("büyük/küçük harften bağımsız eşler", () => {
    expect(authErrorKey("INVALID LOGIN CREDENTIALS")).toBe("errInvalidCredentials");
  });

  it("tanınmayan mesaj errGeneric'e düşer — ham metin ASLA sızmaz", () => {
    expect(authErrorKey("Database connection pool exhausted at 10.0.3.14")).toBe("errGeneric");
  });

  it("boş ve undefined de errGeneric", () => {
    expect(authErrorKey(undefined)).toBe("errGeneric");
    expect(authErrorKey("")).toBe("errGeneric");
  });

  it("⭐ döndürülen her anahtar İKİ dilde de tanımlı", () => {
    // Eşleme var ama çeviri yoksa ekranda `undefined` yazardı.
    const keys = new Set([...CASES.map(([, k]) => k), "errGeneric"]);
    for (const key of keys) {
      expect(ui.tr[key as keyof typeof ui.tr], `tr.${key}`).toBeTruthy();
      expect(ui.en[key as keyof typeof ui.en], `en.${key}`).toBeTruthy();
    }
  });
});
