import { describe, expect, it } from "vitest";
import {
  WEEKDAYS,
  buildChains,
  buildChannels,
  buildMonthCells,
  buildQueue,
  buildWeek,
} from "@/lib/core/derive/calendar";
import type { ChannelRow, ContentItemRow } from "@/lib/core/types";

/**
 * A2 — davranış ÖNCE ölçüldü (vitest + console.log ile gerçek çıktı
 * gözlendi), testler ölçülen gerçek değerlere göre yazıldı. ADIM_34'ün
 * template.ts'te yaptığı "iki varsayım yanlış çıktı" bulgusuyla aynı yöntem.
 *
 * "2026-08-24" (Istanbul) bir PAZARTESİ — `lib/core/plan/template.test.ts`
 * ile aynı çapa, iki test dosyası aynı takvimi anlatıyor.
 */
const TZ = "Europe/Istanbul";
const MONDAY_NOON = new Date("2026-08-24T09:00:00Z"); // Istanbul 12:00, Pazartesi

const BASE: Omit<ContentItemRow, "id" | "platform" | "kind" | "title" | "status"> = {
  brand_id: "b1", plan_id: null, channel_id: null, media_type: "IMAGE",
  day_offset: null, time_of_day: null, scheduled_at: null, published_at: null,
  is_best_time: false, hook: "", body: "", hashtags: "", media_url: null,
  external_post_id: null, parent_id: null, root_id: null, chain_position: 1,
  continuation_note: "", content_fingerprint: null, topic_key: null,
};

function item(
  over: Partial<ContentItemRow> & Pick<ContentItemRow, "id" | "platform" | "kind" | "title" | "status">,
): ContentItemRow {
  return { ...BASE, ...over };
}

describe("WEEKDAYS", () => {
  it("Pazartesi'den başlayan yedi kısaltma taşır, iki dilde", () => {
    expect(WEEKDAYS.tr).toHaveLength(7);
    expect(WEEKDAYS.en).toHaveLength(7);
    expect(WEEKDAYS.tr[0]).toBe("Pzt");
    expect(WEEKDAYS.en[6]).toBe("Sun");
  });
});

describe("buildMonthCells", () => {
  it("her zaman 42 hücre üretir", () => {
    expect(buildMonthCells([], MONDAY_NOON, TZ).cells).toHaveLength(42);
  });

  it("boş kuyrukta hiçbir hücrede gönderi yok", () => {
    const { cells } = buildMonthCells([], MONDAY_NOON, TZ);
    for (const cell of cells) expect(cell.posts).toEqual([]);
  });

  it("⭐ ölçülen ızgara — Ağustos 2026 5 (Cumartesi) ile başlar, ayın 1'i hücre 5'te", () => {
    // Ölçüldü: monthShape(2026,8).firstWeekday = 5. cells[5] Ağustos'un 1'i olmalı.
    const { cells } = buildMonthCells([], MONDAY_NOON, TZ);
    expect(cells[5]).toMatchObject({ d: 1, mo: true });
    expect(cells[4]).toMatchObject({ mo: false });
  });

  it("⭐ önceki/sonraki ayın gün numaraları taşar, ay bayrağı false", () => {
    // Ölçüldü: cells[0] = Temmuz'un 27'si, cells[41] = Eylül'ün 6'sı.
    const { cells } = buildMonthCells([], MONDAY_NOON, TZ);
    expect(cells[0]).toMatchObject({ d: 27, mo: false });
    expect(cells[41]).toMatchObject({ d: 6, mo: false });
  });

  it("bugünün hücresini işaretler, başka hiçbirini işaretlemez", () => {
    const { cells } = buildMonthCells([], MONDAY_NOON, TZ);
    const todayCells = cells.filter((c) => c.today);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]).toMatchObject({ d: 24, mo: true });
  });

  it("etiket ay adı ve yılı taşır, iki dilde", () => {
    const { label } = buildMonthCells([], MONDAY_NOON, TZ);
    expect(label).toEqual({ tr: "Ağustos 2026", en: "August 2026" });
  });

  it("bir gönderiyi doğru güne ve saate yerleştirir", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "a", scheduled_at: "2026-08-24T09:00:00Z" }),
    ];
    const { cells } = buildMonthCells(posts, MONDAY_NOON, TZ);
    const todayCell = cells.find((c) => c.today)!;
    expect(todayCell.posts).toEqual([{ platform: "instagram", time: "12:00", status: "scheduled" }]);
  });

  it("aynı günün gönderilerini saate göre sıralar", () => {
    const posts = [
      item({ id: "1", platform: "x", kind: "text", status: "scheduled", title: "geç", scheduled_at: "2026-08-24T18:00:00Z" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "scheduled", title: "erken", scheduled_at: "2026-08-24T06:00:00Z" }),
    ];
    const { cells } = buildMonthCells(posts, MONDAY_NOON, TZ);
    const todayCell = cells.find((c) => c.today)!;
    expect(todayCell.posts.map((p) => p.time)).toEqual(["09:00", "21:00"]);
  });

  it("ne scheduled_at ne published_at olan satırları atlar", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "idea", title: "fikir" })];
    const { cells } = buildMonthCells(posts, MONDAY_NOON, TZ);
    for (const cell of cells) expect(cell.posts).toEqual([]);
  });

  it("published_at doluysa onu kullanır, scheduled_at'i değil", () => {
    const posts = [
      item({
        id: "1", platform: "instagram", kind: "image", status: "published", title: "a",
        scheduled_at: "2026-08-01T09:00:00Z", published_at: "2026-08-24T09:00:00Z",
      }),
    ];
    const { cells } = buildMonthCells(posts, MONDAY_NOON, TZ);
    expect(cells.find((c) => c.today)!.posts).toHaveLength(1);
  });

  it("ay sınırını doğru geçer — Aralık'tan Ocak'a", () => {
    const decNow = new Date("2026-12-15T09:00:00Z");
    const { label, cells } = buildMonthCells([], decNow, TZ);
    expect(label).toEqual({ tr: "Aralık 2026", en: "December 2026" });
    expect(cells).toHaveLength(42);
  });
});

describe("buildWeek", () => {
  it("Pazartesi–Pazar aralığını, girilen haftanın kendisini döndürür", () => {
    const week = buildWeek([], MONDAY_NOON, TZ);
    expect(week.days.tr.map((d) => d.num)).toEqual([24, 25, 26, 27, 28, 29, 30]);
    expect(week.label).toEqual({ tr: "24 – 30 Ağustos", en: "Aug 24 – 30" });
  });

  it("boş kuyrukta hiç gönderi ve varsayılan saat satırları döner", () => {
    const week = buildWeek([], MONDAY_NOON, TZ);
    expect(week.weekPosts).toEqual([]);
    expect(week.weekHours).toEqual(["08:00", "10:00", "12:00", "14:00", "17:00", "19:00"]);
  });

  it("bir gönderiyi doğru gün indeksine ve saat satırına yerleştirir", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "A", scheduled_at: "2026-08-24T09:00:00Z" }),
      item({ id: "2", platform: "x", kind: "text", status: "scheduled", title: "B", scheduled_at: "2026-08-30T18:00:00Z" }),
    ];
    const week = buildWeek(posts, MONDAY_NOON, TZ);
    expect(week.weekPosts).toEqual([
      { id: "1", day: 0, hour: "12:00", platform: "instagram", title: { tr: "A", en: "A" }, status: "scheduled" },
      { id: "2", day: 6, hour: "21:00", platform: "x", title: { tr: "B", en: "B" }, status: "scheduled" },
    ]);
    // Gerçek gönderi varken varsayılan saat satırları KULLANILMAZ.
    expect(week.weekHours).toEqual(["12:00", "21:00"]);
  });

  it("bu haftanın dışına düşen bir gönderiyi atlar", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "gelecek hafta", scheduled_at: "2026-09-05T09:00:00Z" }),
    ];
    const week = buildWeek(posts, MONDAY_NOON, TZ);
    expect(week.weekPosts).toEqual([]);
  });

  it("ay sınırını aşan hafta etiketinde her iki ayı da gösterir", () => {
    // 2026-08-31 Pazartesi — hafta Eylül'ün 6'sına kadar sürüyor.
    const week = buildWeek([], new Date("2026-08-31T09:00:00Z"), TZ);
    expect(week.label.en).toBe("Aug 31 – Sep 6");
  });
});

describe("buildQueue", () => {
  it("boş girdi boş dizi verir", () => {
    expect(buildQueue([], MONDAY_NOON, TZ)).toEqual([]);
  });

  it("yayınlanmış satırları dışlar", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", published_at: "2026-08-20T09:00:00Z" })];
    expect(buildQueue(posts, MONDAY_NOON, TZ)).toEqual([]);
  });

  it("zamanlanmış satırları en yakından en uzağa sıralar", () => {
    const posts = [
      item({ id: "geç", platform: "instagram", kind: "image", status: "scheduled", title: "geç", scheduled_at: "2026-09-10T15:00:00Z" }),
      item({ id: "yakın", platform: "instagram", kind: "image", status: "scheduled", title: "yakın", scheduled_at: "2026-08-24T15:00:00Z" }),
    ];
    expect(buildQueue(posts, MONDAY_NOON, TZ).map((q) => q.id)).toEqual(["yakın", "geç"]);
  });

  it("⭐ tarihsiz taslaklar zamanlanmış olanların ALTINA batar", () => {
    const posts = [
      item({ id: "taslak", platform: "instagram", kind: "image", status: "draft", title: "taslak" }),
      item({ id: "planli", platform: "instagram", kind: "image", status: "scheduled", title: "planlı", scheduled_at: "2026-09-10T15:00:00Z" }),
    ];
    expect(buildQueue(posts, MONDAY_NOON, TZ).map((q) => q.id)).toEqual(["planli", "taslak"]);
  });

  it("tarihsiz taslak için sabit metin ve '—' slotu döner", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "draft", title: "taslak" })];
    const [q] = buildQueue(posts, MONDAY_NOON, TZ);
    expect(q.when).toEqual({ tr: "Tarihsiz taslak", en: "Unscheduled draft" });
    expect(q.slot).toBe("—");
  });

  it("⭐ 'Bugün' / 'Yarın' / hafta günü / tarih — ölçülen dört göreli biçim", () => {
    const posts = [
      item({ id: "bugun", platform: "instagram", kind: "image", status: "scheduled", title: "bugün", scheduled_at: "2026-08-24T15:00:00Z" }),
      item({ id: "yarin", platform: "instagram", kind: "image", status: "scheduled", title: "yarın", scheduled_at: "2026-08-25T15:00:00Z" }),
      item({ id: "hafta", platform: "instagram", kind: "image", status: "scheduled", title: "5 gün sonra", scheduled_at: "2026-08-29T15:00:00Z" }),
      item({ id: "uzak", platform: "instagram", kind: "image", status: "scheduled", title: "uzak", scheduled_at: "2026-09-10T15:00:00Z" }),
    ];
    const when = Object.fromEntries(buildQueue(posts, MONDAY_NOON, TZ).map((q) => [q.id, q.when]));
    expect(when.bugun).toEqual({ tr: "Bugün 18:00", en: "Today 18:00" });
    expect(when.yarin).toEqual({ tr: "Yarın 18:00", en: "Tomorrow 18:00" });
    expect(when.hafta).toEqual({ tr: "Cmt 18:00", en: "Sat 18:00" });
    expect(when.uzak).toEqual({ tr: "10 Eyl 18:00", en: "Sep 10 18:00" });
  });

  it("is_best_time'ı best alanına taşır", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "a", scheduled_at: "2026-08-24T15:00:00Z", is_best_time: true }),
    ];
    expect(buildQueue(posts, MONDAY_NOON, TZ)[0].best).toBe(true);
  });
});

describe("buildChains — adım 9 C4", () => {
  it("boş girdide boş dizi verir", () => {
    expect(buildChains([])).toEqual([]);
  });

  it("root_id'si olmayan satırları hiçbir zincire koymaz", () => {
    const items = [item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a" })];
    expect(buildChains(items)).toEqual([]);
  });

  it("⭐ TEK halkalı bir 'zincir' zincir SAYILMAZ — en az iki halka gerekir", () => {
    const items = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", root_id: "r1", chain_position: 1 }),
    ];
    expect(buildChains(items)).toEqual([]);
  });

  it("aynı root_id'yi paylaşan satırları chain_position sırasına dizer", () => {
    const items = [
      item({ id: "3", platform: "instagram", kind: "image", status: "scheduled", title: "üçüncü", root_id: "r1", chain_position: 3 }),
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "birinci", root_id: "r1", chain_position: 1 }),
      item({ id: "2", platform: "instagram", kind: "image", status: "published", title: "ikinci", root_id: "r1", parent_id: "1", chain_position: 2 }),
    ];
    expect(buildChains(items)[0].map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("⭐ yayınlanmış halkaları da içerir — /queue'nun filtrelediği şeyi ATMAZ", () => {
    const items = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", root_id: "r1", chain_position: 1 }),
      item({ id: "2", platform: "instagram", kind: "image", status: "scheduled", title: "b", root_id: "r1", chain_position: 2 }),
    ];
    const [chain] = buildChains(items);
    expect(chain.map((i) => i.status)).toEqual(["published", "scheduled"]);
  });

  it("birden çok bağımsız zinciri ayrı gruplar olarak döner", () => {
    const items = [
      item({ id: "1", platform: "instagram", kind: "image", status: "published", title: "a", root_id: "r1", chain_position: 1 }),
      item({ id: "2", platform: "instagram", kind: "image", status: "published", title: "b", root_id: "r1", chain_position: 2 }),
      item({ id: "3", platform: "x", kind: "text", status: "published", title: "c", root_id: "r2", chain_position: 1 }),
      item({ id: "4", platform: "x", kind: "text", status: "published", title: "d", root_id: "r2", chain_position: 2 }),
    ];
    expect(buildChains(items)).toHaveLength(2);
  });
});

describe("buildChannels", () => {
  const rows: ChannelRow[] = [
    { id: "c1", platform: "instagram", handle: "@kahve", followers: 1500, growth: 1.2, engagement: 3.4, is_connected: true },
    { id: "c2", platform: "x", handle: "@kahve", followers: 400, growth: -0.5, engagement: 1.1, is_connected: false },
  ];

  it("boş kanal listesinde boş dizi verir", () => {
    expect(buildChannels([], [])).toEqual([]);
  });

  it("1000 üstü takipçiyi K biçimine çevirir, altındakini olduğu gibi bırakır", () => {
    const [ig, x] = buildChannels(rows, []);
    expect(ig.followers).toBe("1.5K");
    expect(x.followers).toBe("400");
    expect(ig.followerNum).toBe(1500);
  });

  it("kanal başına sırada bekleyen (yayınlanmamış) gönderi sayısını sayar", () => {
    const posts = [
      item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "a", channel_id: "c1" }),
      item({ id: "2", platform: "instagram", kind: "image", status: "needs_review", title: "b", channel_id: "c1" }),
      item({ id: "3", platform: "instagram", kind: "image", status: "published", title: "c", channel_id: "c1" }),
    ];
    const [ig] = buildChannels(rows, posts);
    expect(ig.scheduled).toBe(2); // yayınlanmış olan sayılmaz
  });

  it("channel_id'si olmayan satırları hiçbir kanala saymaz, patlamaz", () => {
    const posts = [item({ id: "1", platform: "instagram", kind: "image", status: "scheduled", title: "a", channel_id: null })];
    const [ig] = buildChannels(rows, posts);
    expect(ig.scheduled).toBe(0);
  });

  it("connected alanını is_connected'tan taşır", () => {
    const [ig, x] = buildChannels(rows, []);
    expect(ig.connected).toBe(true);
    expect(x.connected).toBe(false);
  });
});
