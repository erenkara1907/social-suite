import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODE, MODES, modeCookieName, modeEnvVar,
  resolveAllModes, resolveMode,
} from "@/lib/adapters/mode";
import { PORT_NAMES } from "@/lib/adapters/ports";

/**
 * Testler `process.env`'i doğrudan yazıp geri alıyor. `vi.stubEnv` bu dosyada
 * kullanılmıyor çünkü `MODE_<PORT>` adları DİNAMİK — asıl doğrulanmak istenen
 * şey `modeEnvVar()`'ın ürettiği adın gerçekten okunduğu.
 */
const TOUCHED = ["APP_MODE", ...PORT_NAMES.map(modeEnvVar)];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllEnvs();
});

describe("modeEnvVar / modeCookieName", () => {
  it("port adından env adını türetir", () => {
    expect(modeEnvVar("planner")).toBe("MODE_PLANNER");
    expect(modeEnvVar("publisher")).toBe("MODE_PUBLISHER");
  });

  it("çerez adı §1.9'un sm: ön ekini taşır", () => {
    expect(modeCookieName("planner")).toBe("sm:mode:planner");
  });

  it("on iki portun hepsi benzersiz bir env adı üretir", () => {
    const names = PORT_NAMES.map(modeEnvVar);
    expect(new Set(names).size).toBe(PORT_NAMES.length);
  });
});

describe("⭐ 4. seviye — varsayılan", () => {
  it("hiçbir bayrak yokken 'demo' döner", () => {
    expect(resolveMode("planner")).toBe("demo");
  });

  it("varsayılan on iki portun hepsi için 'demo'", () => {
    for (const name of PORT_NAMES) expect(resolveMode(name)).toBe(DEFAULT_MODE);
  });

  it("⭐ varsayılan asla 'live' DEĞİL — bilinmeyen durumda para harcanmaz", () => {
    expect(DEFAULT_MODE).toBe("demo");
  });
});

describe("3. seviye — APP_MODE", () => {
  it("APP_MODE=live her portu canlıya alır", () => {
    process.env.APP_MODE = "live";
    for (const name of PORT_NAMES) expect(resolveMode(name)).toBe("live");
  });

  it("APP_MODE=demo açıkça demo demek", () => {
    process.env.APP_MODE = "demo";
    expect(resolveMode("content")).toBe("demo");
  });

  it("büyük/küçük harf ve boşluk toleranslı", () => {
    for (const raw of ["LIVE", " live ", "Live"]) {
      process.env.APP_MODE = raw;
      expect(resolveMode("content")).toBe("live");
    }
  });
});

describe("2. seviye — port başına override", () => {
  it("MODE_PLANNER=live yalnızca planner'ı canlıya alır", () => {
    process.env.MODE_PLANNER = "live";
    expect(resolveMode("planner")).toBe("live");
    expect(resolveMode("video")).toBe("demo");
  });

  it("⭐ port bayrağı APP_MODE'u EZER — her iki yönde de", () => {
    process.env.APP_MODE = "demo";
    process.env.MODE_PUBLISHER = "live";
    expect(resolveMode("publisher")).toBe("live");

    process.env.APP_MODE = "live";
    process.env.MODE_VIDEO = "demo";
    expect(resolveMode("video")).toBe("demo");
  });

  it("⭐ §12'nin FAZ 2 senaryosu: yayın canlı, video demo", () => {
    // "Yayın hattı test edilirken pahalı video üretimi kapalı kalsın." (§9.1)
    process.env.MODE_PUBLISHER = "live";
    process.env.MODE_VIDEO = "demo";
    expect(resolveMode("publisher")).toBe("live");
    expect(resolveMode("video")).toBe("demo");
    expect(resolveMode("metrics")).toBe("demo");
  });
});

describe("⭐ geçersiz değer — bir SEVİYE düşer, karar değil", () => {
  it("geçersiz APP_MODE varsayılana düşer, 'live'a değil", () => {
    for (const raw of ["prod", "production", "yes", "1", "", "  ", "çöp"]) {
      process.env.APP_MODE = raw;
      expect(resolveMode("planner")).toBe("demo");
    }
  });

  it("⭐ geçersiz port bayrağı ALTTAKİ seviyeye düşer — kararı yutmaz", () => {
    process.env.APP_MODE = "live";
    process.env.MODE_PLANNER = "çöp";
    // MODE_PLANNER yok sayıldı; APP_MODE hâlâ geçerli.
    expect(resolveMode("planner")).toBe("live");
  });

  it("geçersiz değer hiçbir zaman 'live' üretmez", () => {
    for (const raw of ["liv", "LIVE!", "live;", "true"]) {
      process.env.MODE_PLANNER = raw;
      expect(resolveMode("planner")).toBe("demo");
    }
  });

  it("sonuç her zaman izinli modlardan biri", () => {
    for (const raw of ["live", "demo", "çöp", ""]) {
      process.env.APP_MODE = raw;
      expect(MODES).toContain(resolveMode("content"));
    }
  });
});

describe("1. seviye — geliştirme çerezi (dev)", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

  it("çerez env'i ezer", () => {
    process.env.APP_MODE = "demo";
    expect(resolveMode("planner", { cookies: { planner: "live" } })).toBe("live");
  });

  it("çerez PORT BAŞINA — diğer portlara sızmaz", () => {
    const overrides = { cookies: { planner: "live" } };
    expect(resolveMode("planner", overrides)).toBe("live");
    expect(resolveMode("video", overrides)).toBe("demo");
  });

  it("geçersiz çerez env'e düşer", () => {
    process.env.APP_MODE = "live";
    expect(resolveMode("planner", { cookies: { planner: "çöp" } })).toBe("live");
  });

  it("null/boş çerez yok sayılır", () => {
    process.env.APP_MODE = "live";
    expect(resolveMode("planner", { cookies: { planner: null } })).toBe("live");
    expect(resolveMode("planner", { cookies: {} })).toBe("live");
  });
});

describe("⭐ §11 S6 — demo bypass üretimde derlenmez", () => {
  it("⭐ ÜRETİMDE çerez ezmesi TAMAMEN yok sayılır", () => {
    vi.stubEnv("NODE_ENV", "production");
    // Dev'de bu çağrı "live" derdi. Üretimde çerez okunmuyor bile.
    expect(resolveMode("planner", { cookies: { planner: "live" } })).toBe("demo");
  });

  it("⭐ üretimde çerez, canlı bir portu demoya da ÇEKEMEZ", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MODE_PUBLISHER = "live";
    // Kaçamağın tamamı kapalı: ne açar ne kapar.
    expect(resolveMode("publisher", { cookies: { publisher: "demo" } })).toBe("live");
  });

  it("üretimde env yolu normal çalışmaya devam eder", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_MODE = "live";
    expect(resolveMode("planner")).toBe("live");
  });

  it("dev'de aynı çağrı çerezi OKUR — kapının gerçekten NODE_ENV'e bağlı olduğunun kanıtı", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveMode("planner", { cookies: { planner: "live" } })).toBe("live");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveMode("planner", { cookies: { planner: "live" } })).toBe("demo");
  });
});

describe("resolveAllModes", () => {
  it("on iki portun hepsini döndürür", () => {
    const all = resolveAllModes();
    expect(Object.keys(all).sort()).toEqual([...PORT_NAMES].sort());
  });

  it("karışık yapılandırmayı port başına doğru yansıtır", () => {
    process.env.APP_MODE = "demo";
    process.env.MODE_PLANNER = "live";
    process.env.MODE_COPY = "live";
    const all = resolveAllModes();
    expect(all.planner).toBe("live");
    expect(all.copy).toBe("live");
    expect(all.video).toBe("demo");
    expect(Object.values(all).filter((m) => m === "live")).toHaveLength(2);
  });
});
