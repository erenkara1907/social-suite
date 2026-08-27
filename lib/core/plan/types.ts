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

/* ── Tanınmayan değerlerin sayılabilir hâli (B3) ──────────────────────────── */

/**
 * ⚠ UYARLAMA — kaynak `row.channel as Channel` diyordu (kör cast). Kanal
 * değerleri PascalCase'ten küçük harfe geçtiği için, göç etmemiş bir satır
 * ("Instagram") tipe uyuyormuş gibi görünüp aşağıda sessizce patlardı.
 * Artık küçük harfe normalize edilip listeye karşı doğrulanıyor; tanınmayan
 * değer varsayılana düşüyor (satır atılmıyor — plan görünür kalmalı).
 *
 * ⭐ Varsayılana düşmek KAYIPLI bir işlem: bozuk bir göç her satırı sessizce
 * `instagram` yapar ve kimse görmez. Bu yüzden dönüştürücü artık ne düştüğünü
 * de döndürüyor. Modül SAF kalıyor — burada `console.warn` yok, log yok;
 * çağıran (adım 14'ün rotası) sayıyı okuyup kendi kararını verir.
 */

/** Varsayılanlar tek yerde — dönüştürücü de test de buradan okur. */
export const DEFAULT_PLAN_CHANNEL: PlanChannel = "instagram";
export const DEFAULT_PLAN_KIND: PostKind = "text";
export const DEFAULT_PLAN_POST_STATUS: PlanPostStatus = "idea";

export const PLAN_POST_FALLBACK_FIELDS = ["channel", "kind", "status"] as const;
export type PlanPostFallbackField = (typeof PLAN_POST_FALLBACK_FIELDS)[number];

/** Tanınmayan bir değerin varsayılana düştüğü tek olay. */
export interface PlanPostFallback {
  field: PlanPostFallbackField;
  /** Satırda ne yazıyordu — bir göç betiği tam olarak bunu arar. */
  received: string;
  /** Onun yerine ne kullanıldı. */
  used: string;
}

/** Dönüştürücünün tam çıktısı. `fallbacks.length === 0` ⇒ satır temiz. */
export interface PlanPostRead {
  post: PlanPost;
  fallbacks: readonly PlanPostFallback[];
}

/** Bir alanın okunmuş hâli. `ok: false` ⇒ değer tanınmadı, varsayılan kullanıldı. */
interface FieldRead<T> {
  value: T;
  ok: boolean;
}

/** Normalize etmek (`"Instagram"` → `"instagram"`) BAŞARIDIR, fallback değil. */
function readChannel(value: string): FieldRead<PlanChannel> {
  const lower = value.trim().toLowerCase();
  return (PLAN_CHANNELS as readonly string[]).includes(lower)
    ? { value: lower as PlanChannel, ok: true }
    : { value: DEFAULT_PLAN_CHANNEL, ok: false };
}

function readKind(value: string): FieldRead<PostKind> {
  return (POST_KINDS as readonly string[]).includes(value)
    ? { value: value as PostKind, ok: true }
    : { value: DEFAULT_PLAN_KIND, ok: false };
}

function readPlanPostStatus(value: string): FieldRead<PlanPostStatus> {
  return PLAN_POST_STATUSES.includes(value as PlanPostStatus)
    ? { value: value as PlanPostStatus, ok: true }
    : { value: DEFAULT_PLAN_POST_STATUS, ok: false };
}

function fallbackOf<T extends string>(
  field: PlanPostFallbackField,
  received: string,
  read: FieldRead<T>,
): PlanPostFallback | null {
  return read.ok ? null : { field, received, used: read.value };
}

/**
 * Tek satır. Dönen nesne HEM modeli HEM de düşen alanları taşır — sessiz yol
 * yok, çağıran fallback'leri görmezden gelmeyi bilerek seçmek zorunda.
 */
export function toPlanPost(row: PlanPostRow): PlanPostRead {
  const channel = readChannel(row.channel);
  const kind = readKind(row.kind);
  const status = readPlanPostStatus(row.status);

  const fallbacks = [
    fallbackOf("channel", row.channel, channel),
    fallbackOf("kind", row.kind, kind),
    fallbackOf("status", row.status, status),
  ].filter((f): f is PlanPostFallback => f !== null);

  return {
    post: {
      id: row.id,
      dayOffset: row.day_offset,
      timeOfDay: row.time_of_day,
      channel: channel.value,
      kind: kind.value,
      title: row.title,
      hook: row.hook,
      body: row.body,
      hashtags: row.hashtags,
      status: status.value,
    },
    fallbacks,
  };
}

/**
 * Satır kümesi — bir planın tamamı tek çağrıda. `fallbacks.length` doğrudan
 * "bu planda kaç alan tanınmadı" sayısıdır; adım 14'ün rotası bunu loglayacak.
 */
export function toPlanPosts(rows: readonly PlanPostRow[]): {
  posts: readonly PlanPost[];
  fallbacks: readonly PlanPostFallback[];
} {
  const reads = rows.map(toPlanPost);
  return {
    posts: reads.map((r) => r.post),
    fallbacks: reads.flatMap((r) => r.fallbacks),
  };
}
