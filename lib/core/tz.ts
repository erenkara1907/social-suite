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
