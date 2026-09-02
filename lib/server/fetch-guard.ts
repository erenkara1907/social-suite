import "server-only";

import dns from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * SSRF savunması — BIRLESIM_PLANI §10 Bulgu 1 · §12 adım 19 FAZ A.
 *
 * §4g'nin köprüsü (`lib/server/storage.ts`) vendor'ın GEÇİCİ URL'ini sunucu
 * tarafında indiriyor. Kısıt olmazsa saldırgan `169.254.169.254` (bulut
 * metadata), `localhost`, özel ağ adresleri ya da `file://` ile sunucunun
 * İÇİNE erişebilir — bu sunucu Supabase service-role anahtarını ve
 * müşterilerin sağlayıcı anahtarlarını taşıyor.
 *
 * Bu dosya, dış bir URL'i sunucu tarafında indirmenin **TEK YOLU**. Başka
 * hiçbir yerde ham `fetch(userUrl)` OLMAMALI (bkz. FAZ D grep).
 *
 * ⭐ DNS rebinding — kontrol edilen IP ile bağlanılan IP AYNI olmalı. Alan
 * adı çözülür, IP allowlist'e karşı doğrulanır, sonra bağlantı O IP'YE PIN
 * edilir (`undici` `Agent`'ın `connect.lookup`'ı) — "önce çöz sonra fetch
 * çağır" arasındaki boşluk (ikinci bir DNS sorgusu farklı bir IP dönebilir)
 * burada YOK, tek çözümleme sonucu doğrudan bağlantıya taşınıyor.
 *
 * ⚠ Bu modül `undici`'nin KENDİ `fetch`'ini kullanır, Node'un global
 * `fetch`'ini DEĞİL. Node'un global `fetch`'i dahili (farklı sürüm) bir
 * undici kopyası — npm `undici` paketinden üretilen bir `Agent`'ı ona vermek
 * "invalid onRequestStart method" ile patlıyor (deneyle doğrulandı, adım 19
 * FAZ A). İkisini karıştırmamak için bu dosyanın dışına `Agent`/`Dispatcher`
 * sızdırılmaz.
 */

export type FetchGuardReason =
  | "scheme"
  | "host_not_allowed"
  | "dns_failed"
  | "private_ip"
  | "too_many_redirects"
  | "redirect_without_location"
  | "content_type_mismatch"
  | "too_large"
  | "timeout"
  | "upstream_error";

/** `undici`'nin kendi `Response` tipi — global DOM `Response` ile yapısal
 *  olarak UYUMSUZ (`Headers.entries()` iterator'ları farklı), o yüzden bu
 *  dosya içinde global `Response` yerine hep bu takma ad kullanılır
 *  (deneyle doğrulandı, `tsc --noEmit`). */
type UndiciResponse = Awaited<ReturnType<typeof undiciFetch>>;

export class FetchGuardError extends Error {
  readonly reason: FetchGuardReason;

  constructor(message: string, reason: FetchGuardReason) {
    super(message);
    this.name = "FetchGuardError";
    this.reason = reason;
  }
}

/** §10: "izinli: kieai.redpandaai.co · *.fal.media · api.elevenlabs.io".
 *  Koda GÖMÜLMEZ — yalnızca env boşsa devreye giren varsayılan. */
const DEFAULT_VENDOR_ALLOWLIST = ["kieai.redpandaai.co", "*.fal.media", "api.elevenlabs.io"];

/** Supabase Storage host'u listeye MANUEL eklenmez — `NEXT_PUBLIC_SUPABASE_URL`'den
 *  türetilir. Böylece "koda gömme" kuralı bu host için de geçerli kalır. */
function supabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Allowlist'i çözer — `MEDIA_VENDOR_ALLOWLIST` (virgülle ayrık) varsa onu
 *  kullanır, yoksa §10 varsayılanına düşer; Supabase Storage her durumda eklenir. */
export function resolveVendorAllowlist(): string[] {
  const fromEnv = process.env.MEDIA_VENDOR_ALLOWLIST;
  const base = fromEnv
    ? fromEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_VENDOR_ALLOWLIST];
  const supabaseHost = supabaseStorageHost();
  if (supabaseHost && !base.includes(supabaseHost)) base.push(supabaseHost);
  return base;
}

/** `URL.hostname` bir IPv6 literal için köşeli parantezli döner (`"[::1]"`).
 *  `dns.lookup()` parantezli formu ÇÖZEMİYOR (denendi: `ENOTFOUND [::1]`) —
 *  hem allowlist eşleşmesi hem DNS çözümlemesi bu çıplak biçimi kullanmalı. */
function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function hostAllowed(hostname: string, allowlist: readonly string[]): boolean {
  const h = stripIpv6Brackets(hostname).toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    if (e.startsWith("*.")) {
      const suffix = e.slice(2);
      return h === suffix || h.endsWith(`.${suffix}`);
    }
    return h === e;
  });
}

/**
 * Özel/yerel/ayrılmış IP aralıkları — IANA özel adres kayıtları. `net.BlockList`
 * (Node çekirdeği) kullanılıyor: CIDR eşleşmesini elle yazmak yerine denenmiş,
 * IPv4-mapped IPv6'yı (`::ffff:169.254.169.254` gibi) da doğru sınıflandıran
 * çekirdek API'si (deneyle doğrulandı, adım 19 FAZ A).
 */
const PRIVATE_RANGES: ReadonlyArray<readonly [string, number, "ipv4" | "ipv6"]> = [
  ["0.0.0.0", 8, "ipv4"], // "bu ağ"
  ["10.0.0.0", 8, "ipv4"], // RFC1918
  ["100.64.0.0", 10, "ipv4"], // CGNAT
  ["127.0.0.0", 8, "ipv4"], // loopback
  ["169.254.0.0", 16, "ipv4"], // link-local — bulut metadata (169.254.169.254) BURADA
  ["172.16.0.0", 12, "ipv4"], // RFC1918
  ["192.0.0.0", 24, "ipv4"], // IETF protokol ataması
  ["192.0.2.0", 24, "ipv4"], // TEST-NET-1
  ["192.168.0.0", 16, "ipv4"], // RFC1918
  ["198.18.0.0", 15, "ipv4"], // karşılaştırma testi
  ["198.51.100.0", 24, "ipv4"], // TEST-NET-2
  ["203.0.113.0", 24, "ipv4"], // TEST-NET-3
  ["224.0.0.0", 4, "ipv4"], // multicast
  ["240.0.0.0", 4, "ipv4"], // ayrılmış + broadcast
  ["::1", 128, "ipv6"], // loopback
  ["::", 128, "ipv6"], // belirtilmemiş
  ["64:ff9b::", 96, "ipv6"], // NAT64 — gömülü IPv4'ü de kapsar
  ["fc00::", 7, "ipv6"], // unique local (ULA)
  ["fe80::", 10, "ipv6"], // link-local
  ["ff00::", 8, "ipv6"], // multicast
  ["2001:db8::", 32, "ipv6"], // dokümantasyon
];

function buildPrivateBlockList(): net.BlockList {
  const bl = new net.BlockList();
  for (const [address, prefix, family] of PRIVATE_RANGES) bl.addSubnet(address, prefix, family);
  return bl;
}

const PRIVATE_BLOCKLIST = buildPrivateBlockList();

/** `net.isIP` 4/6 döner, blocklist'e o formatta sorulur; ne biri ne diğeri
 *  ise (0) — geçerli bir IP değil, güvenli SAYILMAZ. */
export function isPublicIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  return !PRIVATE_BLOCKLIST.check(address, family === 4 ? "ipv4" : "ipv6");
}

interface LookupRecord {
  address: string;
  family: number;
}

export type DnsLookupFn = (hostname: string) => Promise<LookupRecord[]>;

/** Gerçek çözümleyici. Literal bir IP verilirse (`169.254.169.254` gibi)
 *  Node'un `dns.lookup`'ı onu OLDUĞU GİBİ döner — ayrı bir dal gerekmez. */
const realLookup: DnsLookupFn = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

/** Çözer + doğrular + PIN'ler. Dönenle bağlanılan IP aynı nesne — rebinding
 *  penceresi burada kapanıyor. */
async function resolvePinnedAddress(hostnameRaw: string, lookup: DnsLookupFn): Promise<PinnedAddress> {
  const hostname = stripIpv6Brackets(hostnameRaw);
  let records: LookupRecord[];
  try {
    records = await lookup(hostname);
  } catch (err) {
    throw new FetchGuardError(`DNS çözümlenemedi: ${hostname} (${(err as Error).message})`, "dns_failed");
  }
  const safe = records.filter((r) => isPublicIp(r.address));
  if (safe.length === 0) {
    throw new FetchGuardError(`özel/yerel IP adresine izin verilmiyor: ${hostname}`, "private_ip");
  }
  const chosen = safe[0];
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

/** `undici` `Agent`'ın özel `connect.lookup`'ı — hem tekil (err, address,
 *  family) hem çoğul (`options.all` → (err, records[])) çağrı biçimini
 *  desteklemesi gerekiyor (deneyle doğrulandı, adım 19 FAZ A); Node'un iç
 *  `net.connect` yolu bağlama biçimine göre ikisini de kullanabiliyor. */
const pinnedLookup = (pinned: PinnedAddress): net.LookupFunction => (_hostname, options, callback) => {
  if (options?.all) {
    callback(null, [{ address: pinned.address, family: pinned.family }]);
  } else {
    callback(null, pinned.address, pinned.family);
  }
};

function pinnedAgent(pinned: PinnedAddress): Agent {
  return new Agent({
    connect: { lookup: pinnedLookup(pinned) },
  });
}

function assertHttps(url: URL): void {
  if (url.protocol !== "https:") {
    throw new FetchGuardError(`yalnızca https izinli, gelen: ${url.protocol}`, "scheme");
  }
}

function assertAllowedHost(url: URL, allowlist: readonly string[]): void {
  if (!hostAllowed(url.hostname, allowlist)) {
    throw new FetchGuardError(`host allowlist dışında: ${url.hostname}`, "host_not_allowed");
  }
}

/** Bir hop'un ham HTTP çağrısı — pinlenmiş `agent` ile çağrılır. Varsayılanı
 *  gerçek `undici` fetch'i; testler (yönlendirme zinciri, akış boyutu)
 *  bunu enjekte eder — allowlist/DNS-pin/IP kontrolü YİNE gerçek kod
 *  yolundan geçer, yalnızca ağ ucu değişir. */
export type GuardedTransport = (url: URL, agent: Agent, signal: AbortSignal) => Promise<UndiciResponse>;

const defaultTransport: GuardedTransport = (url, agent, signal) =>
  undiciFetch(url, {
    redirect: "manual",
    dispatcher: agent,
    signal,
    headers: { "user-agent": "social-suite-media-bridge/1" },
  } as Parameters<typeof undiciFetch>[1]);

export interface GuardedFetchOptions {
  /** Akış hâlinde uygulanan sert üst sınır — Content-Length'e güvenilmez. */
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Beklenen `Content-Type` ÖN EKLERİ (örn. `["video/"]`). Boş/verilmezse
   *  içerik tipi kontrol edilmez. */
  expectedContentTypePrefixes?: readonly string[];
  /** Testler için — üretimde her zaman `resolveVendorAllowlist()`. */
  allowlist?: readonly string[];
  /** Testler için — üretimde her zaman gerçek DNS. */
  lookup?: DnsLookupFn;
  /** Testler için — üretimde her zaman gerçek ağ (`defaultTransport`). */
  transport?: GuardedTransport;
}

export interface GuardedFetchResult {
  /** Zaten `maxBytes`'a karşı SAYILAN, aşımda hata veren akış. */
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  /** Yönlendirme takip edildiyse son URL — izlenebilirlik için. */
  finalUrl: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;

/** Bir hop'un gövdesini kullanmadan agent'ı kapatır — yönlendirme adımlarında
 *  ve reddedilen terminal yanıtlarda soket sızıntısını önler. */
async function discardAndClose(res: UndiciResponse, agent: Agent): Promise<void> {
  await res.body?.cancel().catch(() => {});
  await agent.close().catch(() => {});
}

/** `source`'u `maxBytes`'a karşı SAYAR; aşımda akışı hata ile kapatır ve
 *  agent'ı serbest bırakır. Tüm gövdeyi belleğe ALMAZ — her `pull()` yalnızca
 *  bir parçayı tutar (§12 adım 19 FAZ C: "bellekte tutmadan akış hâlinde"). */
function limitStream(source: ReadableStream<Uint8Array>, maxBytes: number, agent: Agent): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = 0;
  let agentClosed = false;
  const closeAgent = async () => {
    if (agentClosed) return;
    agentClosed = true;
    await agent.close().catch(() => {});
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        await closeAgent();
        return;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        controller.error(new FetchGuardError(`akış boyut sınırını aştı (>${maxBytes} bayt)`, "too_large"));
        await reader.cancel().catch(() => {});
        await closeAgent();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      await closeAgent();
    },
  });
}

/**
 * Dış bir URL'i SSRF korumalı indirir. https zorunlu · host allowlist ·
 * DNS-rebinding-güvenli IP pinleme · özel/yerel IP reddi · yönlendirme
 * takibi (her sıçrama tekrar doğrulanır, azami sıçrama sınırlı) · içerik
 * tipi doğrulaması · akış hâlinde boyut sınırı.
 *
 * Döndürülen `stream` TÜKETİLMELİDİR (ya sonuna kadar okunur ya `cancel()`
 * edilir) — aksi hâlde bağlantı ve zamanlayıcı açık kalır.
 */
export async function guardedFetch(inputUrl: string, opts: GuardedFetchOptions): Promise<GuardedFetchResult> {
  const allowlist = opts.allowlist ?? resolveVendorAllowlist();
  const lookup = opts.lookup ?? realLookup;
  const transport = opts.transport ?? defaultTransport;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let current: URL;
  try {
    current = new URL(inputUrl);
  } catch {
    throw new FetchGuardError(`geçersiz URL: ${inputUrl}`, "scheme");
  }

  for (let hop = 0; ; hop++) {
    assertHttps(current);
    assertAllowedHost(current, allowlist);
    const pinned = await resolvePinnedAddress(current.hostname, lookup);
    const agent = pinnedAgent(pinned);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: UndiciResponse;
    try {
      res = await transport(current, agent, controller.signal);
    } catch (err) {
      await agent.close().catch(() => {});
      if (controller.signal.aborted) {
        throw new FetchGuardError(`indirme zaman aşımına uğradı: ${current.hostname}`, "timeout");
      }
      throw new FetchGuardError(`indirme başarısız: ${(err as Error).message}`, "upstream_error");
    } finally {
      clearTimeout(timer);
    }

    // ── Yönlendirme — her sıçrama TEKRAR doğrulanır, azami sıçrama sınırlı ──
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await discardAndClose(res, agent);
      if (!location) {
        throw new FetchGuardError(`yönlendirme Location başlığı olmadan geldi: ${current.hostname}`, "redirect_without_location");
      }
      if (hop + 1 >= maxRedirects) {
        throw new FetchGuardError(`çok fazla yönlendirme (>${maxRedirects}): ${current.hostname}`, "too_many_redirects");
      }
      current = new URL(location, current);
      continue; // döngü başında YENİDEN doğrulanır — allowlist dışına kaçış burada yakalanır
    }

    if (!res.ok) {
      await discardAndClose(res, agent);
      throw new FetchGuardError(`sağlayıcı hatası: HTTP ${res.status} (${current.hostname})`, "upstream_error");
    }

    const contentType = res.headers.get("content-type") ?? "";
    const expected = opts.expectedContentTypePrefixes;
    if (expected && expected.length > 0 && !expected.some((prefix) => contentType.startsWith(prefix))) {
      await discardAndClose(res, agent);
      throw new FetchGuardError(
        `beklenmeyen içerik tipi: "${contentType || "(boş)"}" (beklenen: ${expected.join(", ")})`,
        "content_type_mismatch",
      );
    }

    const declaredLength = res.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > opts.maxBytes) {
      await discardAndClose(res, agent);
      throw new FetchGuardError(
        `bildirilen boyut sınırı aşıyor: ${declaredLength} bayt (sınır ${opts.maxBytes})`,
        "too_large",
      );
    }

    if (!res.body) {
      await agent.close().catch(() => {});
      throw new FetchGuardError(`yanıt gövdesi yok: ${current.hostname}`, "upstream_error");
    }

    return {
      stream: limitStream(res.body as unknown as ReadableStream<Uint8Array>, opts.maxBytes, agent),
      contentType,
      finalUrl: current.toString(),
    };
  }
}
