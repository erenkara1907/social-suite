/**
 * ← threadly/lib/plan/types.ts
 * Uyarlama: `Channel` → `PlanChannel` (§1.2 küçük harf); satır dönüştürücüleri
 * artık kanal/biçim/durum değerlerini KÖRÜ KÖRÜNE cast etmiyor, doğruluyor.
 *
 * Content plan shapes. The camelCase types are what the app passes around; the
 * *Row types mirror the snake_case columns in supabase/00_schema.sql.
 */
import {
  PLAN_CHANNELS, POST_KINDS,
  type Lang, type PlanChannel, type PostKind,
} from "@/lib/core/types";

export const PLAN_HORIZONS = [7, 30] as const;
export type PlanHorizon = (typeof PLAN_HORIZONS)[number];

/** 'weekly' follows the fixed weekday template; 'auto' lets the model decide. */
export const PLAN_MODES = ["weekly", "auto"] as const;
export type PlanMode = (typeof PLAN_MODES)[number];

export type PlanPostStatus = "idea" | "draft" | "scheduled" | "published";
const PLAN_POST_STATUSES: readonly PlanPostStatus[] = ["idea", "draft", "scheduled", "published"];

export interface PlanPost {
  id: string;
  dayOffset: number;
  timeOfDay: string;
  channel: PlanChannel;
  kind: PostKind;
  title: string;
  hook: string;
  body: string | null;
  hashtags: string | null;
  status: PlanPostStatus;
}

export interface Plan {
  id: string;
  title: string;
  theme: string;
  horizonDays: PlanHorizon;
  lang: Lang;
  /** "YYYY-MM-DD" — the calendar's first day, not the day it was generated. */
  startDate: string;
  mode: PlanMode;
  createdAt: string;
}

export interface PlanWithPosts {
  plan: Plan;
  posts: PlanPost[];
}

export interface CreatePlanRequest {
  theme: string;
  horizonDays: PlanHorizon;
  lang: Lang;
  startDate: string;
  mode: PlanMode;
}

export interface WritePlanPostRequest {
  postId: string;
  tone: string;
}

/* ── Row mappers ──────────────────────────────────────────────────────────── */

export interface PlanRow {
  id: string;
  title: string;
  theme: string;
  horizon_days: number;
  lang: string;
  start_date: string;
  mode: string;
  created_at: string;
}

export interface PlanPostRow {
  id: string;
  day_offset: number;
  time_of_day: string;
  channel: string;
  kind: string;
  title: string;
  hook: string;
  body: string | null;
  hashtags: string | null;
  status: string;
}

export function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    horizonDays: row.horizon_days === 30 ? 30 : 7,
    lang: row.lang === "en" ? "en" : "tr",
    startDate: row.start_date,
    mode: row.mode === "auto" ? "auto" : "weekly",
    createdAt: row.created_at,
  };
}

/**
 * ⚠ UYARLAMA — kaynak `row.channel as Channel` diyordu (kör cast). Kanal
 * değerleri PascalCase'ten küçük harfe geçtiği için, göç etmemiş bir satır
 * ("Instagram") tipe uyuyormuş gibi görünüp aşağıda sessizce patlardı.
 * Artık küçük harfe normalize edilip listeye karşı doğrulanıyor; tanınmayan
 * değer varsayılana düşüyor (satır atılmıyor — plan görünür kalmalı).
 */
function readChannel(value: string): PlanChannel {
  const lower = value.trim().toLowerCase();
  return (PLAN_CHANNELS as readonly string[]).includes(lower)
    ? (lower as PlanChannel)
    : "instagram";
}

function readKind(value: string): PostKind {
  return (POST_KINDS as readonly string[]).includes(value) ? (value as PostKind) : "text";
}

function readPlanPostStatus(value: string): PlanPostStatus {
  return PLAN_POST_STATUSES.includes(value as PlanPostStatus)
    ? (value as PlanPostStatus)
    : "idea";
}

export function toPlanPost(row: PlanPostRow): PlanPost {
  return {
    id: row.id,
    dayOffset: row.day_offset,
    timeOfDay: row.time_of_day,
    channel: readChannel(row.channel),
    kind: readKind(row.kind),
    title: row.title,
    hook: row.hook,
    body: row.body,
    hashtags: row.hashtags,
    status: readPlanPostStatus(row.status),
  };
}
