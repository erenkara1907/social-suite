import { describe, expect, it } from "vitest";
import {
  AUTH_ROUTES,
  PROTECTED_ROUTES,
  isAuthPath,
  isProtectedPath,
  safeNextPath,
} from "@/lib/routes";

/**
 * Guard'ın karar yüzeyi. `proxy.ts` ve `(app)/layout.tsx` bu üç fonksiyona
 * bakarak "içeri alınır mı" diyor; bir hata burada sessizce bir ekranı
 * herkese açar. Bu yüzden mantık Next'e bağlı `proxy.ts`'ten çıkarıldı ve
 * saf bırakıldı — test edilebilmesi için.
 */

describe("isProtectedPath", () => {
  it("(app) grubunun altı rotasının hepsini korur", () => {
    for (const path of ["/dashboard", "/plan", "/queue", "/studio", "/analytics", "/settings"]) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });

  it("marka yokken düşülen /onboarding'i de korur — oturum orada da şart", () => {
    expect(isProtectedPath("/onboarding")).toBe(true);
  });

  it("11b'ye ertelenen üç rotayı şimdiden korur", () => {
    // Rotalar henüz yok. Listede olmaları, eklendikleri gün guard'ın
    // unutulmasını imkânsız kılıyor.
    for (const path of ["/library", "/composer", "/channels"]) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });

  it("alt yolları da korur", () => {
    expect(isProtectedPath("/studio/personas")).toBe(true);
    expect(isProtectedPath("/settings/brand")).toBe(true);
  });

  it("kimlik akışını ve pazarlama sayfasını korumaz", () => {
    for (const path of ["/", "/login", "/signup", "/logout", "/auth/callback"]) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  it("⭐ ön ek benzerliği yetmez — /plan koruması /planlama'yı kapsamaz", () => {
    // `startsWith("/plan")` saf hâliyle /planlama'yı da yakalardı. Ters
    // yönde de tehlikeli: /settings-public gibi bir rota eklendiğinde
    // korumalı sanılırdı.
    expect(isProtectedPath("/planlama")).toBe(false);
    expect(isProtectedPath("/settings-public")).toBe(false);
    expect(isProtectedPath("/dashboardx")).toBe(false);
  });
});

describe("isAuthPath", () => {
  it("giriş ve kayıt sayfalarını tanır", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
  });

  it("çıkış ve callback AUTH_ROUTES değil — oturumlu kullanıcı oraya gidebilmeli", () => {
    // /logout AUTH_ROUTES'a girseydi, oturumu olan kullanıcı çıkış
    // yapmak istediğinde /dashboard'a geri atılırdı: çıkılamayan bir uygulama.
    expect(isAuthPath("/logout")).toBe(false);
    expect(isAuthPath("/auth/callback")).toBe(false);
  });
});

describe("safeNextPath — açık yönlendirme kapısı", () => {
  it("kendi kökümüzdeki yolu geçirir", () => {
    expect(safeNextPath("/queue")).toBe("/queue");
    expect(safeNextPath("/studio/personas")).toBe("/studio/personas");
  });

  it("⭐ protokol-göreli mutlak URL'i REDDEDER", () => {
    // "//evil.com" tarayıcıda https://evil.com'a gider ama "/" ile başlar.
    // Tek başına startsWith("/") kontrolü bu saldırıyı geçirir.
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.com/path")).toBe("/dashboard");
  });

  it("mutlak URL'i reddeder", () => {
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("http://evil.com")).toBe("/dashboard");
  });

  it("şema tabanlı saldırıyı reddeder", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("boş, null ve göreli yolu varsayılana düşürür", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("queue")).toBe("/dashboard");
  });

  it("geri dönüş yolu çağırana bırakılabilir", () => {
    expect(safeNextPath(null, "/plan")).toBe("/plan");
  });
});

describe("liste bütünlüğü", () => {
  it("korumalı ve kimlik listeleri kesişmez", () => {
    // Kesişselerdi bir yol hem 'giriş yapmadan giremezsin' hem 'giriş
    // yaptıysan giremezsin' olurdu — kapatılamayan bir yönlendirme döngüsü.
    const overlap = PROTECTED_ROUTES.filter((p) => (AUTH_ROUTES as readonly string[]).includes(p));
    expect(overlap).toEqual([]);
  });

  it("her giriş '/' ile başlar ve '/' ile bitmez", () => {
    for (const path of [...PROTECTED_ROUTES, ...AUTH_ROUTES]) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.endsWith("/")).toBe(false);
    }
  });
});
