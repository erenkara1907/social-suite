/**
 * BIRLESIM_PLANI §9.1 — mod bayrağının çözümü.
 *
 * ⭐ Bayrak AÇIK. Bu dosyanın var olma sebebi budur.
 *
 * siraya'da karar örtüktü: `ws ? liveDashboard(...) : demoDashboard()`
 * (`lib/data/index.ts:78`). Yani "demo mu canlı mı" sorusunun cevabı
 * *"veri var mı"*. İki şey birden kırılıyordu:
 *   1. Giriş yapmış bir kullanıcıya demo GÖSTERİLEMİYORDU — FAZ 1'in tam
 *      olarak ihtiyacı olan şey.
 *   2. Supabase kesintisinde `getWorkspace()` null dönüyor ve ekran sahte
 *      veriyi gerçekmiş gibi gösteriyordu. "Oturum yok" ile "servis yok"
 *      ayırt edilmiyordu.
 *
 * Burada hiçbir çıkarım yok: mod yalnızca AÇIKÇA yazılmış bir bayraktan gelir.
 * Bayrak yoksa cevap `demo` — bilinmeyen durumda sahte veri göstermek, gerçek
 * para harcamaktan iyidir.
 *
 * ⚠ `NEXT_PUBLIC_*` DEĞİL. `NEXT_PUBLIC_*` build zamanında inline edilir ve
 * runtime'da değiştirilemez; threadly'nin `hasSupabase` sabiti tam bu tuzağa
 * düşmüştü (17 dosya dolaylı olarak ona bağlıydı, KESIF_THREADLY §14.3).
 * Mod sunucuda çözülür ve istemciye `isDemo: true` olarak VERİ gibi iner.
 */
import { PORT_NAMES, type PortName } from "@/lib/adapters/ports";

export const MODES = ["demo", "live"] as const;
export type Mode = (typeof MODES)[number];

/** §9.1: "Varsayılan: güvenli taraf." */
export const DEFAULT_MODE: Mode = "demo";

/** Geliştirme çerezinin ön eki — §1.9'un `sm:<modül>:<anahtar>` şeması. */
export const MODE_COOKIE_PREFIX = "sm:mode:";

/** `content` → `MODE_CONTENT`. Tek üretim noktası; elle yazılmış env adı yok. */
export function modeEnvVar(port: PortName): string {
  return `MODE_${port.toUpperCase()}`;
}

export function modeCookieName(port: PortName): string {
  return `${MODE_COOKIE_PREFIX}${port}`;
}

/**
 * Çağıranın topladığı, bu fonksiyonun okuyamayacağı girdiler.
 *
 * Çerez neden parametre: `next/headers`'ın `cookies()` fonksiyonu asenkron ve
 * yalnızca istek bağlamında çalışıyor. Onu buraya almak `resolveMode`'u hem
 * asenkron hem Next'e bağımlı hem de test edilemez yapardı. Çerezi istek
 * katmanı okur, saf karar burada verilir.
 */
export interface ModeOverrides {
  /**
   * Port başına `sm:mode:<port>` çerezlerinin ham değerleri.
   * ⚠ ÜRETİMDE TAMAMEN YOK SAYILIR (aşağıya bak).
   *
   * Port başına olması şart: çerez adı da port başına (`sm:mode:planner`).
   * Tek bir `cookie` alanı, `resolveAllModes` çağrıldığında aynı değeri on iki
   * porta birden uygulardı — bir portu canlıya almak için var olan kaçamak,
   * hepsini birden canlıya alırdı.
   */
  cookies?: Readonly<Partial<Record<PortName, string | null>>>;
}

function readMode(raw: string | null | undefined): Mode | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return (MODES as readonly string[]).includes(value) ? (value as Mode) : null;
}

/**
 * ⭐ §11 S6 — demo bypass üretimde DERLENMEZ.
 *
 * Çerez ezmesi, tek bir portu elle canlıya almak için var olan bir geliştirme
 * kaçamağıdır. `NODE_ENV !== "production"` koşulu bir çalışma zamanı kontrolü
 * DEĞİL, ölü kod eleme kapısıdır: Next üretim derlemesinde `process.env.NODE_ENV`
 * literal `"production"` ile değiştirilir, koşul `false` sabitine indirgenir ve
 * gövde bundle'a hiç girmez.
 *
 * S6 bu kapıyı iki koşullu istiyor (`APP_MODE === "demo" && NODE_ENV !==
 * "production"`). Burada yalnızca ikincisi var, çünkü ilki bu fonksiyonun
 * KENDİ ÇIKTISI: çerez `live` diyorsa APP_MODE'un ne dediğinin önemi yok —
 * kaçamağın tamamı zaten üretimde kapalı.
 */
function readDevCookie(port: PortName, overrides: ModeOverrides): Mode | null {
  if (process.env.NODE_ENV === "production") return null;
  return readMode(overrides.cookies?.[port]);
}

/**
 * Port başına mod. Öncelik sırası §9.1'den, aynen:
 *
 *   1. Geliştirme çerezi  `sm:mode:<port>`   (yalnızca dev)
 *   2. Port başına env    `MODE_PLANNER=live`
 *   3. Genel env          `APP_MODE=demo`
 *   4. Varsayılan         `demo`
 *
 * ⚠ Geçersiz değer bir SEVİYEYİ düşürür, kararı değil. `APP_MODE=prod` yazan
 * biri "canlı" kastetmiş olabilir de olmayabilir de; tahmin etmek yerine o
 * seviye yok sayılır ve bir alttakine bakılır. Tahminin bedeli asimetrik:
 * yanlışlıkla demo göstermek bir hayal kırıklığı, yanlışlıkla canlıya çıkmak
 * müşterinin anahtarıyla para harcamak.
 *
 * Port başına olmasının sebebi §12'nin FAZ 2 sırası: `MODE_PUBLISHER=live`
 * iken `MODE_VIDEO=demo` çalışabilmeli — yayın hattı test edilirken pahalı
 * video üretimi kapalı kalsın.
 */
export function resolveMode(port: PortName, overrides: ModeOverrides = {}): Mode {
  return readDevCookie(port, overrides)
    ?? readMode(process.env[modeEnvVar(port)])
    ?? readMode(process.env.APP_MODE)
    ?? DEFAULT_MODE;
}

/** Her portun modu — view payload'ına `isDemo` yazan katman bunu okur. */
export function resolveAllModes(overrides: ModeOverrides = {}): Record<PortName, Mode> {
  return Object.fromEntries(
    PORT_NAMES.map((port) => [port, resolveMode(port, overrides)]),
  ) as Record<PortName, Mode>;
}
