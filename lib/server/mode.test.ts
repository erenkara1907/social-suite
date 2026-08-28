import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADIM_56 RAPORU §2'nin açık maddesi: çerez okuma katmanı. `resolveMode`
 * saf kalsın diye çerezi kendisi okumuyor; okuma burada.
 *
 * `next/headers` mock'lanıyor çünkü `cookies()` yalnızca gerçek bir istek
 * bağlamında çalışır. Test edilen şey Next değil, ÇEVİRİ: çerez deposundan
 * `ModeOverrides` şekline geçiş.
 */
const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { requestModeOverrides } = await import("@/lib/server/mode");
const { PORT_NAMES } = await import("@/lib/adapters/ports");
const { modeCookieName } = await import("@/lib/adapters/mode");

describe("requestModeOverrides", () => {
  beforeEach(() => store.clear());

  it("çerez yokken her port için null döner — hiçbir port eksik kalmaz", async () => {
    const overrides = await requestModeOverrides();
    expect(Object.keys(overrides.cookies ?? {}).sort()).toEqual([...PORT_NAMES].sort());
    for (const port of PORT_NAMES) {
      expect(overrides.cookies?.[port]).toBeNull();
    }
  });

  it("`sm:mode:<port>` adını doğru okur", async () => {
    store.set(modeCookieName("planner"), "live");
    const overrides = await requestModeOverrides();
    expect(overrides.cookies?.planner).toBe("live");
  });

  it("⭐ bir portun çerezi DİĞER portlara sızmaz", async () => {
    // Tek `cookie` alanı olsaydı, bir portu canlıya almak için var olan
    // kaçamak on iki portu birden canlıya alırdı (mode.ts'in ModeOverrides
    // yorumu bunu açıkça yazıyor).
    store.set(modeCookieName("publisher"), "live");
    const overrides = await requestModeOverrides();
    expect(overrides.cookies?.publisher).toBe("live");
    expect(overrides.cookies?.video).toBeNull();
    expect(overrides.cookies?.content).toBeNull();
  });

  it("çerezin değerini YORUMLAMAZ — geçersiz değeri olduğu gibi taşır", async () => {
    // Geçerlilik kararı resolveMode'un; bu katman yalnızca taşıyıcı.
    store.set(modeCookieName("copy"), "prod");
    const overrides = await requestModeOverrides();
    expect(overrides.cookies?.copy).toBe("prod");
  });
});
