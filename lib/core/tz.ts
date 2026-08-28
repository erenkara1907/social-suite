/**
 * ← siraya/lib/data/tz.ts
 * Uyarlama: YOK — olduğu gibi taşındı (saf TS, sıfır bağımlılık).
 *
 * The calendar is drawn in the user's timezone, not the server's. Every post
 * is stored as a UTC instant, so slotting one into a day or an hour row means
 * projecting it back into that zone first.
 */

export const DEFAULT_TZ = "Europe/Istanbul";

export interface ZonedParts {
  year: number;
  month: number;   // 1–12
  day: number;     // 1–31
  hour: number;    // 0–23
  minute: number;  // 0–59
  weekday: number; // 0 = Monday … 6 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short",
      hour12: false,
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Project a UTC instant into wall-clock parts for `timeZone`. */
export function zonedParts(instant: Date | string, timeZone = DEFAULT_TZ): ZonedParts {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  // Intl renders midnight as "24" in some locales/zones; normalise it to 0.
  const hour = Number(get("hour")) % 24;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** "18:00" for a post's slot, in the user's zone. */
export function zonedTime(instant: Date | string, timeZone = DEFAULT_TZ): string {
  const { hour, minute } = zonedParts(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Stable key for "which calendar day is this", e.g. "2026-08-21". */
export function dayKey(instant: Date | string, timeZone = DEFAULT_TZ): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days in a month, and which weekday (0 = Mon) the 1st lands on. */
export function monthShape(year: number, month: number) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekdaySunday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstWeekday = (firstWeekdaySunday + 6) % 7; // shift Sunday-first to Monday-first
  return { daysInMonth, firstWeekday };
}

/**
 * adım 9 B3 — `/settings`'in saat dilimi `<select>`'i için kısaltılmış,
 * kullanıcı dostu bir liste. Sunucu tarafı doğrulama bu listeye DEĞİL, tam
 * IANA veritabanına karşı yapılır (`isValidTimeZone`) — DB'de zaten bu
 * listenin dışında bir değer varsa (örn. göç edilmiş bir hesap) form yine
 * de kabul etsin diye.
 */
export const COMMON_TIMEZONES = [
  "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Europe/Moscow", "America/New_York", "America/Los_Angeles", "America/Chicago",
  "America/Sao_Paulo", "Asia/Dubai", "Asia/Tokyo", "Asia/Singapore",
  "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland",
  "UTC",
] as const;

/** Geçerli bir IANA saat dilimi mi — `Intl`'in kendi veritabanına sorar. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * adım 9 C2 — `zonedParts`'ın TERSİ: bir bölgedeki duvar saatini UTC ana
 * çevirir. `/plan`'ın iskelet slotları (`dayOffset` + `timeOfDay`, marka saat
 * dilimindeki yerel saat) `content_items` biçimine (UTC `scheduled_at`)
 * projelenirken gerekiyor — `calendar.ts`'in `buildWeek`/`buildMonthCells`'i
 * yeniden kullanabilsin diye.
 *
 * ⚠ Yaklaşık: yaz saati GEÇİŞ ANINDA (var olmayan veya iki kez yaşanan bir
 * yerel saat) tek bir "doğru" karşılık yoktur — iki adımlı tahmin yöntemi
 * (önce UTC=yerel varsay, gerçek ofseti ölç, düzelt) standart ve DST dışında
 * her zaman tam isabetli; DST anında birkaç dakikalık sapma olabilir. Bu,
 * bir plan ÖNİZLEMESİ için kabul edilebilir — kesin an içerik onaylanıp
 * `content_items`'a yazılırken belirlenecek.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = DEFAULT_TZ,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const got = zonedParts(guess, timeZone);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);
  return new Date(guess.getTime() + (wantedAsUtc - gotAsUtc));
}
