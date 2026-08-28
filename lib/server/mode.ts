import "server-only";

import { cookies } from "next/headers";
import { PORT_NAMES, type PortName } from "@/lib/adapters/ports";
import { modeCookieName, type ModeOverrides } from "@/lib/adapters/mode";

/**
 * İstek çerezlerini `ModeOverrides`'a çeviren ince katman.
 *
 * ADIM_56 RAPORU §2 bunu açık madde olarak bırakmıştı: `resolveMode` saf
 * kalsın diye çerezi KENDİSİ okumuyor (`next/headers`'ın `cookies()`'i
 * asenkron ve yalnızca istek bağlamında çalışır — onu `mode.ts`'e almak
 * fonksiyonu hem Next'e bağlar hem test edilemez yapardı). Okuma burada,
 * karar orada.
 *
 * ⚠ Üretimde `readDevCookie` zaten `null` döner (§11 S6 — ölü kod eleme
 * kapısı). Bu fonksiyon üretimde de çalışır ama çıktısı yok sayılır.
 */
export async function requestModeOverrides(): Promise<ModeOverrides> {
  // ⭐ adım 8 · A3 — §11 S6 bundle doğrulaması bunu yakaladı: `resolveMode`
  // içindeki `readDevCookie` üretimde KARARI etkisiz kılıyordu ama bu
  // fonksiyon MEKANİZMAYI (çerez adını kurup okumayı) ortam fark etmeden
  // çalıştırıyordu — `modeCookieName()`'ın döndürdüğü `sm:mode:` dize
  // literali üretim bundle'ına sızıyordu. Kapı burada da tekrarlanır: kararı
  // değil, kod yolunun kendisini üretimde hiç ÇALIŞTIRMAZ — `cookies()` ve
  // `modeCookieName()` üretimde hiç çağrılmaz, dolayısıyla ikisinin de
  // kalıntısı ölü kod elemesiyle bundle'dan düşer.
  if (process.env.NODE_ENV === "production") return {};

  const store = await cookies();

  const entries = PORT_NAMES.map(
    (port): [PortName, string | null] => [port, store.get(modeCookieName(port))?.value ?? null],
  );

  return { cookies: Object.fromEntries(entries) as ModeOverrides["cookies"] };
}
