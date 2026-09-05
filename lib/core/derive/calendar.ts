/**
 * ← siraya/lib/data/derive-calendar.ts
 * Uyarlama: `lib/demo/data` ve `lib/i18n/config` tip bağları KOPARILDI →
 * `lib/core/types`; siraya'nın `Channel` (bağlı hesap) tipi `ChannelAccount`
 * oldu; `PostRow` → `ContentItemRow`. Gövde mantığı aynen.
 */
import type {
  ChannelAccount, ChannelRow, ContentItemRow, L, MonthCell, MonthPost, QueueItem, WeekPost,
} from "@/lib/core/types";
import { DEFAULT_TZ, dayKey, dayKeyOf, monthShape, zonedParts, zonedTime } from "@/lib/core/tz";

const MONTHS = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const MONTHS_SHORT = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
export const WEEKDAYS = {
  tr: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

/** Fallback hour rows when the week is empty — the shape of a normal posting day. */
const DEFAULT_WEEK_HOURS = ["08:00", "10:00", "12:00", "14:00", "17:00", "19:00"];

/** Only posts that actually sit somewhere on the calendar. */
function slotted(posts: ContentItemRow[]) {
  return posts.filter((p) => p.scheduled_at || p.published_at);
}

function slotInstant(post: ContentItemRow): string {
  return (post.published_at ?? post.scheduled_at)!;
}

/* ── Month grid ──────────────────────────────────────────────────────────── */

export function buildMonthCells(posts: ContentItemRow[], now: Date, tz = DEFAULT_TZ) {
  const today = zonedParts(now, tz);
  const { daysInMonth, firstWeekday } = monthShape(today.year, today.month);

  // Bucket every post by the calendar day it lands on.
  const byDay = new Map<string, MonthPost[]>();
  for (const post of slotted(posts)) {
    const instant = slotInstant(post);
    const key = dayKey(instant, tz);
    const list = byDay.get(key) ?? [];
    list.push({ platform: post.platform, time: zonedTime(instant, tz), status: post.status });
    byDay.set(key, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));

  const prev = monthShape(today.month === 1 ? today.year - 1 : today.year, today.month === 1 ? 12 : today.month - 1);
  const cells: MonthCell[] = [];

  for (let i = 0; i < 42; i++) {
    const dayNumber = i - firstWeekday + 1;
    const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

    let year = today.year;
    let month = today.month;
    let day = dayNumber;

    if (dayNumber < 1) {
      day = prev.daysInMonth + dayNumber;
      month = today.month === 1 ? 12 : today.month - 1;
      year = today.month === 1 ? today.year - 1 : today.year;
    } else if (dayNumber > daysInMonth) {
      day = dayNumber - daysInMonth;
      month = today.month === 12 ? 1 : today.month + 1;
      year = today.month === 12 ? today.year + 1 : today.year;
    }

    cells.push({
      key: `m${i}`,
      d: day,
      mo: inMonth,
      today: inMonth && day === today.day,
      posts: byDay.get(dayKeyOf(year, month, day)) ?? [],
    });
  }

  const label: L = {
    tr: `${MONTHS.tr[today.month - 1]} ${today.year}`,
    en: `${MONTHS.en[today.month - 1]} ${today.year}`,
  };

  return { cells, label, weekdays: WEEKDAYS };
}

/* ── Week grid ───────────────────────────────────────────────────────────── */

/** The Monday..Sunday span containing `now`, as day numbers plus their keys. */
function weekDays(now: Date, tz: string) {
  const today = zonedParts(now, tz);
  const monday = new Date(Date.UTC(today.year, today.month - 1, today.day - today.weekday));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return {
      num: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      key: dayKeyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    };
  });
}

export function buildWeek(posts: ContentItemRow[], now: Date, tz = DEFAULT_TZ) {
  const days = weekDays(now, tz);
  const index = new Map(days.map((d, i) => [d.key, i]));

  const weekPosts: WeekPost[] = [];
  const hours = new Set<string>();

  for (const post of slotted(posts)) {
    const instant = slotInstant(post);
    const dayIdx = index.get(dayKey(instant, tz));
    if (dayIdx === undefined) continue;

    // Posts land on the hour row they belong to, minutes rounded down.
    const hour = `${String(zonedParts(instant, tz).hour).padStart(2, "0")}:00`;
    hours.add(hour);
    weekPosts.push({
      id: post.id,
      day: dayIdx,
      hour,
      platform: post.platform,
      title: { tr: post.title, en: post.title },
      status: post.status,
    });
  }

  const first = days[0];
  const last = days[6];
  const label: L =
    first.month === last.month
      ? { tr: `${first.num} – ${last.num} ${MONTHS.tr[first.month - 1]}`, en: `${MONTHS_SHORT.en[first.month - 1]} ${first.num} – ${last.num}` }
      : {
          tr: `${first.num} ${MONTHS_SHORT.tr[first.month - 1]} – ${last.num} ${MONTHS_SHORT.tr[last.month - 1]}`,
          en: `${MONTHS_SHORT.en[first.month - 1]} ${first.num} – ${MONTHS_SHORT.en[last.month - 1]} ${last.num}`,
        };

  const dayLabels = {
    tr: days.map((d, i) => ({ short: WEEKDAYS.tr[i], num: d.num })),
    en: days.map((d, i) => ({ short: WEEKDAYS.en[i], num: d.num })),
  };

  const weekHours = hours.size > 0 ? [...hours].sort() : DEFAULT_WEEK_HOURS;

  return { weekPosts, weekHours, label, days: dayLabels };
}

/* ── Queue ───────────────────────────────────────────────────────────────── */

/** "Today 18:00" / "Thu 19:00" — relative for the next two days, weekday after. */
function whenLabel(instant: string, now: Date, tz: string): L {
  const target = zonedParts(instant, tz);
  const today = zonedParts(now, tz);
  const time = zonedTime(instant, tz);

  const dayDiff =
    Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(today.year, today.month - 1, today.day);
  const days = Math.round(dayDiff / 86400000);

  if (days === 0) return { tr: `Bugün ${time}`, en: `Today ${time}` };
  if (days === 1) return { tr: `Yarın ${time}`, en: `Tomorrow ${time}` };
  if (days > 1 && days < 7) return { tr: `${WEEKDAYS.tr[target.weekday]} ${time}`, en: `${WEEKDAYS.en[target.weekday]} ${time}` };

  return {
    tr: `${target.day} ${MONTHS_SHORT.tr[target.month - 1]} ${time}`,
    en: `${MONTHS_SHORT.en[target.month - 1]} ${target.day} ${time}`,
  };
}

/* ── Zincirler (§4b) ─────────────────────────────────────────────────────── */

/** `root_id` paylaşan, `chain_position` sırasına dizilmiş satırlar. */
export type ChainGroup = ContentItemRow[];

/**
 * ⭐ adım 9 C4 — hem `/queue` hem `/plan` aynı gruplamayı kullanıyor
 * (`/queue` zinciri OLDUĞU GİBİ gösteriyor; `/plan` "bu yeni fikir bunlardan
 * birinin devamı mı" sorusu için referans olarak gösteriyor). Tek gerçek
 * kaynak burada — iki sayfada iki farklı gruplama mantığı yazılmasın.
 */
export function buildChains(items: ContentItemRow[]): ChainGroup[] {
  const byRoot = new Map<string, ContentItemRow[]>();
  for (const item of items) {
    if (!item.root_id) continue;
    const group = byRoot.get(item.root_id) ?? [];
    group.push(item);
    byRoot.set(item.root_id, group);
  }
  return [...byRoot.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((a, b) => a.chain_position - b.chain_position));
}

/** Anything not yet published, soonest first; loose drafts sink to the bottom. */
export function buildQueue(posts: ContentItemRow[], now: Date, tz = DEFAULT_TZ): QueueItem[] {
  return posts
    .filter((p) => p.status !== "published")
    .sort((a, b) => {
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return a.scheduled_at.localeCompare(b.scheduled_at);
    })
    .map((p) => ({
      id: p.id,
      platform: p.platform,
      title: { tr: p.title, en: p.title },
      body: { tr: p.body, en: p.body },
      when: p.scheduled_at
        ? whenLabel(p.scheduled_at, now, tz)
        : { tr: "Tarihsiz taslak", en: "Unscheduled draft" },
      slot: p.scheduled_at ? zonedTime(p.scheduled_at, tz) : "—",
      status: p.status,
      best: p.is_best_time,
    }));
}

/* ── Channels ────────────────────────────────────────────────────────────── */

export function buildChannels(rows: ChannelRow[], posts: ContentItemRow[]): ChannelAccount[] {
  const queued = new Map<string, number>();
  for (const p of posts) {
    if (p.status === "published" || !p.channel_id) continue;
    queued.set(p.channel_id, (queued.get(p.channel_id) ?? 0) + 1);
  }

  return rows.map((c) => ({
    id: c.id,
    platform: c.platform,
    handle: c.handle,
    followers: c.followers >= 1000 ? `${(c.followers / 1000).toFixed(1)}K` : String(c.followers),
    followerNum: c.followers,
    growth: Number(c.growth),
    scheduled: queued.get(c.id) ?? 0,
    engagement: Number(c.engagement),
    connected: c.is_connected,
    lastSyncedAt: c.last_synced_at,
  }));
}
