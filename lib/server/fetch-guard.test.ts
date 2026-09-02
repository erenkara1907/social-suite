// @vitest-environment node
//
// `jsdom` (vitest.config.mts'in genel varsayılanı) `fetch`/`ReadableStream`
// gibi globalleri kendi polyfill'leriyle örtüyor; bu dosya gerçek `undici`
// bağlantıları ve gerçek DNS çözümlemesi kullanıyor — `handlers.dedupe.live.
// test.ts` ile AYNI gerekçeyle `node` ortamına geçiyor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Response as UndiciResponse, type BodyInit as UndiciBodyInit } from "undici";
import {
  FetchGuardError,
  guardedFetch,
  isPublicIp,
  resolveVendorAllowlist,
  type GuardedTransport,
} from "@/lib/server/fetch-guard";

/**
 * SSRF savunması testleri — BIRLESIM_PLANI §12 adım 19 FAZ A DOĞRULAMA.
 *
 * Aşağıdaki sekiz madde görevde birebir istendi ve hepsi burada GERÇEKTEN
 * denendi — hangisinin gerçek ağ/DNS kullandığı, hangisinin (yalnızca gerçek
 * bir vendor'ın altyapısını gerektirdiği için) enjekte edilmiş bir taşıma
 * katmanıyla simüle edildiği her `it()` başlığında ve içindeki yorumda açık:
 *
 *   1. http://169.254.169.254/latest/meta-data/  → reddedildi
 *   2. http://localhost:3000/ ve http://127.0.0.1/ → reddedildi
 *   3. http://[::1]/                              → reddedildi
 *   4. file:///etc/passwd                         → reddedildi
 *   5. Allowlist dışı geçerli https URL           → reddedildi
 *   6. Allowlist içi URL                          → başarılı (GERÇEK ağ)
 *   7. Allowlist içinden dışına yönlendirme       → reddedildi (simüle taşıma)
 *   8. Boyut sınırını aşan yanıt                  → kesildi (GERÇEK ağ + simüle)
 *
 * 6 ve 8'in "gerçek ağ" kısmı `RUN_FETCH_GUARD_LIVE_TEST=1` ile kapılı —
 * gerçek Supabase Storage'a karşı çalışır (proje zaten public `media`
 * bucket'ı kuruyor, `00_schema.sql` §8). Diğer altısı hiçbir bayrağa
 * ihtiyaç duymadan HER ZAMAN koşar: hiçbiri gerçek bir vendor'a bağımlı
 * değil (ya saf mantık ya da yerel DNS çözümlemesi).
 */

describe("isPublicIp — özel/yerel/ayrılmış aralık sınıflandırması", () => {
  it.each([
    ["169.254.169.254", false], // bulut metadata — link-local
    ["169.254.1.1", false],
    ["127.0.0.1", false],
    ["10.0.0.1", false],
    ["172.16.0.5", false],
    ["192.168.1.1", false],
    ["100.64.0.1", false], // CGNAT
    ["0.0.0.0", false],
    ["224.0.0.1", false], // multicast
    ["255.255.255.255", false],
    ["::1", false],
    ["fe80::1", false],
    ["fc00::1", false],
    ["::ffff:169.254.169.254", false], // IPv4-mapped IPv6 — çıplak IPv4 kuralına düşmeli
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["2606:4700:4700::1111", true],
  ])("%s → public=%s", (address, expected) => {
    expect(isPublicIp(address)).toBe(expected);
  });

  it("geçersiz bir string IP değildir — güvenli SAYILMAZ", () => {
    expect(isPublicIp("not-an-ip")).toBe(false);
  });
});

describe("guardedFetch — şema ve host allowlist (ağ YOK — reddin hepsi bağlanmadan önce)", () => {
  it("1) http://169.254.169.254/... → reddedildi (http, https değil)", async () => {
    await expect(
      guardedFetch("http://169.254.169.254/latest/meta-data/", { maxBytes: 1024 }),
    ).rejects.toMatchObject({ reason: "scheme" } satisfies Partial<FetchGuardError>);
  });

  it("1b) https://169.254.169.254/... allowlist'e 'host' olarak eklense BİLE → private_ip", async () => {
    // Allowlist katmanını bilerek atlatıyoruz: burada sınanan İKİNCİ savunma
    // katmanı — IP kontrolü. "Bu host adı allowlist'te" tek başına yeterli
    // OLMAMALI; gerçek koruma çözümlenen IP'nin özel olmamasından geliyor.
    await expect(
      guardedFetch("https://169.254.169.254/latest/meta-data/", {
        maxBytes: 1024,
        allowlist: ["169.254.169.254"],
      }),
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("2) http://localhost:3000/ → reddedildi (http)", async () => {
    await expect(guardedFetch("http://localhost:3000/", { maxBytes: 1024 })).rejects.toMatchObject({
      reason: "scheme",
    });
  });

  it("2b) https://localhost/ allowlist'te olsa BİLE → private_ip (gerçek DNS: localhost → 127.0.0.1)", async () => {
    await expect(
      guardedFetch("https://localhost/", { maxBytes: 1024, allowlist: ["localhost"] }),
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("2c) http://127.0.0.1/ → reddedildi (http)", async () => {
    await expect(guardedFetch("http://127.0.0.1/", { maxBytes: 1024 })).rejects.toMatchObject({
      reason: "scheme",
    });
  });

  it("2d) https://127.0.0.1/ allowlist'te olsa BİLE → private_ip", async () => {
    await expect(
      guardedFetch("https://127.0.0.1/", { maxBytes: 1024, allowlist: ["127.0.0.1"] }),
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("3) http://[::1]/ → reddedildi (http)", async () => {
    await expect(guardedFetch("http://[::1]/", { maxBytes: 1024 })).rejects.toMatchObject({
      reason: "scheme",
    });
  });

  it("3b) https://[::1]/ allowlist'te olsa BİLE → private_ip (köşeli parantez soyulup çözülüyor)", async () => {
    await expect(
      guardedFetch("https://[::1]/", { maxBytes: 1024, allowlist: ["::1"] }),
    ).rejects.toMatchObject({ reason: "private_ip" });
  });

  it("4) file:///etc/passwd → reddedildi", async () => {
    await expect(guardedFetch("file:///etc/passwd", { maxBytes: 1024 })).rejects.toMatchObject({
      reason: "scheme",
    });
  });

  it("5) allowlist dışı geçerli bir https URL → reddedildi", async () => {
    await expect(
      guardedFetch("https://example.com/some/file.mp4", {
        maxBytes: 1024,
        allowlist: ["kieai.redpandaai.co"],
      }),
    ).rejects.toMatchObject({ reason: "host_not_allowed" });
  });

  it("resolveVendorAllowlist() §10 varsayılanını taşıyor + Supabase Storage host'unu otomatik ekliyor", () => {
    const list = resolveVendorAllowlist();
    expect(list).toEqual(expect.arrayContaining(["kieai.redpandaai.co", "*.fal.media", "api.elevenlabs.io"]));
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      expect(list).toContain(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
    }
  });
});

describe("guardedFetch — 7) allowlist içinden dışına yönlendirme → reddedildi (simüle taşıma)", () => {
  // Gerçek bir vendor'ı bizim seçtiğimiz bir hedefe yönlendirmeye ZORLAYAMAYIZ
  // (onların altyapısına sahip değiliz) — bu yüzden yalnızca AĞ UCU enjekte
  // edilir (`transport`). allowlist kontrolü, DNS-pin, IP kontrolü hepsi
  // GERÇEK kod yolundan geçiyor; her hop için YENİDEN çalışıyorlar.
  const redirectingTransport: GuardedTransport = async (url) => {
    if (url.hostname === "kieai.redpandaai.co") {
      return new UndiciResponse(null, { status: 302, headers: { location: "https://evil.example/payload" } });
    }
    throw new Error(`beklenmeyen istek: ${url}`);
  };

  it("izinli host → izinsiz Location: ikinci hop assertAllowedHost'ta yakalanır", async () => {
    await expect(
      guardedFetch("https://kieai.redpandaai.co/api/file-base64-upload", {
        maxBytes: 1024,
        transport: redirectingTransport,
        lookup: async () => [{ address: "8.8.8.8", family: 4 }], // gerçek DNS'e GİTMİYORUZ, transport zaten sahte
      }),
    ).rejects.toMatchObject({ reason: "host_not_allowed" });
  });

  it("azami sıçrama sayısı aşılırsa too_many_redirects", async () => {
    let hops = 0;
    const loopingTransport: GuardedTransport = async () => {
      hops += 1;
      return new UndiciResponse(null, {
        status: 302,
        headers: { location: "https://kieai.redpandaai.co/next" },
      });
    };
    await expect(
      guardedFetch("https://kieai.redpandaai.co/start", {
        maxBytes: 1024,
        maxRedirects: 3,
        transport: loopingTransport,
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "too_many_redirects" });
    expect(hops).toBe(3);
  });
});

describe("guardedFetch — 8) boyut sınırı (simüle taşıma — akış SAYACININ kendisi, header'a bağlı değil)", () => {
  it("Content-Length YOKKEN bile akış sınırı aşılırsa kesilir", async () => {
    const bigChunk = new Uint8Array(1000).fill(65);
    const streamingTransport: GuardedTransport = async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bigChunk);
          controller.enqueue(bigChunk);
          controller.close();
        },
      });
      // Content-Length BİLİNÇLİ OLARAK yok — yalnızca akış sayacı test ediliyor.
      return new UndiciResponse(body as unknown as UndiciBodyInit, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    };

    const result = await guardedFetch("https://kieai.redpandaai.co/big.mp4", {
      maxBytes: 1500, // iki 1000 baytlık parçadan sonra aşılır
      transport: streamingTransport,
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    });

    const reader = result.stream.getReader();
    await expect(
      (async () => {
        while (true) {
          const { done } = await reader.read();
          if (done) return;
        }
      })(),
    ).rejects.toMatchObject({ reason: "too_large" });
  });

  it("bildirilen Content-Length sınırı aşarsa gövde hiç okunmadan reddedilir", async () => {
    const declaredTooLarge: GuardedTransport = async () =>
      new UndiciResponse(new Uint8Array(10) as unknown as UndiciBodyInit, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "999999999" },
      });

    await expect(
      guardedFetch("https://kieai.redpandaai.co/huge.mp4", {
        maxBytes: 100 * 1024 * 1024,
        transport: declaredTooLarge,
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "too_large" });
  });
});

describe("guardedFetch — içerik tipi doğrulaması", () => {
  it("beklenmeyen Content-Type reddedilir", async () => {
    const wrongType: GuardedTransport = async () =>
      new UndiciResponse(new Uint8Array(4) as unknown as UndiciBodyInit, {
        status: 200,
        headers: { "content-type": "text/html" },
      });

    await expect(
      guardedFetch("https://kieai.redpandaai.co/not-a-video.html", {
        maxBytes: 1024,
        expectedContentTypePrefixes: ["video/"],
        transport: wrongType,
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "content_type_mismatch" });
  });
});

/**
 * 6) Allowlist içi bir URL → başarılı — ve 8'in ikinci ayağı, GERÇEK ağa
 * karşı: gerçek Supabase Storage'dan (`media` bucket, public) küçük bir test
 * nesnesi indirilir. `RUN_FETCH_GUARD_LIVE_TEST=1` olmadan ATLANIR — CI'da
 * veya hızlı koşularda ağ bağımlılığı istenmez.
 *
 *   set -a; source .env.local; set +a
 *   RUN_FETCH_GUARD_LIVE_TEST=1 npx vitest run lib/server/fetch-guard.test.ts
 */
const RUN_LIVE = process.env.RUN_FETCH_GUARD_LIVE_TEST === "1";

describe.skipIf(!RUN_LIVE)("guardedFetch — gerçek Supabase Storage'a karşı (canlı)", () => {
  let publicUrl: string;
  let storagePath: string;

  beforeAll(async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    storagePath = `ssrf-guard-tests/${crypto.randomUUID()}.txt`;
    const body = new TextEncoder().encode("fetch-guard canlı test — adım 19 FAZ A");
    const { error } = await admin.storage.from("media").upload(storagePath, body, {
      contentType: "text/plain",
      upsert: false,
    });
    if (error) throw new Error(`test nesnesi yüklenemedi: ${error.message}`);
    const { data } = admin.storage.from("media").getPublicUrl(storagePath);
    publicUrl = data.publicUrl;
    console.log("[fetch-guard live] test nesnesi:", publicUrl);
  }, 30_000);

  afterAll(async () => {
    if (!storagePath) return;
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.storage.from("media").remove([storagePath]);
  });

  it("6) allowlist içi (Supabase Storage host'u) URL → başarılı, bayt-bayt doğru", async () => {
    const result = await guardedFetch(publicUrl, { maxBytes: 1024 });
    expect(result.contentType).toContain("text/plain");

    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    expect(new TextDecoder().decode(merged)).toBe("fetch-guard canlı test — adım 19 FAZ A");
  }, 30_000);

  it("8) gerçek yanıt maxBytes'ı aşarsa (Content-Length fast-path) kesilir", async () => {
    await expect(guardedFetch(publicUrl, { maxBytes: 5 })).rejects.toMatchObject({ reason: "too_large" });
  }, 30_000);
});
