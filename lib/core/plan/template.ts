/**
 * ← threadly/lib/plan/template.ts
 * Uyarlama: tip importları `lib/core/types`'a bağlandı; WEEKLY_TEMPLATE'in
 * kanal değerleri §1.2 gereği küçük harfe çevrildi (davranış aynı).
 *
 * The weekly posting template.
 *
 * The calendar is decided here, not by the model: Monday is a feed post,
 * Tuesday is a story, Wednesday is a reel, and so on. The model only fills in
 * what each slot says. That keeps a plan reproducible — the same brand asked
 * twice gets the same rhythm, and a plan that starts on a Wednesday still puts
 * its Monday slots on a Monday.
 */
import type { L, PlanChannel, PostKind } from "@/lib/core/types";

export interface TemplateSlot {
  channel: PlanChannel;
  kind: PostKind;
  timeOfDay: string;
}

export interface PlannedSlot extends TemplateSlot {
  /** Days from the plan's start date. */
  dayOffset: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

/** Index 0 = Monday … 6 = Sunday. Sunday is deliberately left empty. */
export const WEEKLY_TEMPLATE: readonly (readonly TemplateSlot[])[] = [
  [
    { channel: "instagram", kind: "image", timeOfDay: "09:00" },
    { channel: "linkedin", kind: "text", timeOfDay: "12:30" },
  ],
  [{ channel: "instagram", kind: "story", timeOfDay: "11:00" }],
  [{ channel: "instagram", kind: "reels", timeOfDay: "18:30" }],
  [{ channel: "linkedin", kind: "carousel", timeOfDay: "09:30" }],
  [
    { channel: "instagram", kind: "image", timeOfDay: "17:00" },
    { channel: "x", kind: "text", timeOfDay: "12:00" },
  ],
  [{ channel: "instagram", kind: "story", timeOfDay: "13:00" }],
  [],
];

export const WEEKDAY_LABEL: readonly L[] = [
  { tr: "Pazartesi", en: "Monday" },
  { tr: "Salı", en: "Tuesday" },
  { tr: "Çarşamba", en: "Wednesday" },
  { tr: "Perşembe", en: "Thursday" },
  { tr: "Cuma", en: "Friday" },
  { tr: "Cumartesi", en: "Saturday" },
  { tr: "Pazar", en: "Sunday" },
];

const DAYS_IN_WEEK = 7;
const MS_PER_DAY = 86_400_000;

/** A month of the template is ~39 slots; the cap is a runaway guard. */
export const MAX_SLOTS = 64;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses "YYYY-MM-DD" as a UTC midnight, so day arithmetic never shifts. */
export function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: Date): number {
  return (date.getUTCDay() + 6) % DAYS_IN_WEEK;
}

/** The default start date offered in the UI: the coming Monday. */
export function nextMonday(from: Date): Date {
  const ahead = (DAYS_IN_WEEK - weekdayOf(from)) % DAYS_IN_WEEK;
  return addDays(from, ahead === 0 ? DAYS_IN_WEEK : ahead);
}

/** Expands the template across the horizon, starting from `start`. */
export function buildSlots(start: Date, horizonDays: number): PlannedSlot[] {
  const slots: PlannedSlot[] = [];

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    const weekday = weekdayOf(addDays(start, dayOffset));
    for (const slot of WEEKLY_TEMPLATE[weekday]) {
      if (slots.length >= MAX_SLOTS) return slots;
      slots.push({ ...slot, dayOffset, weekday });
    }
  }

  return slots;
}
