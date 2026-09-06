/**
 * Bağlı kanallar — `/channels` (11b), `/dashboard` kanal rozetleri.
 *
 * ← siraya `lib/demo/data.ts:208` `channels`. Uyarlama: satırlar artık
 *   `channels` TABLOSUNUN şekli (`ChannelRow`), siraya'nın hazır görünüm
 *   nesnesi değil. Görünüm (`followers: "12.4K"`, `scheduled: 7`)
 *   `buildChannels()` tarafından türetiliyor — demo ile canlı aynı
 *   fonksiyondan geçsin diye.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK.
 *
 * Altı platformun altısı da var (§1.2 / D8 / 17a FAZ 0.2). `is_connected`
 * yalnızca instagram'da true — bu, demonun satış hikâyesi (adım 11
 * KAPANIŞI'nda seçildi), `PUBLISHABLE_PLATFORMS`'un BUGÜNKÜ içeriğinden
 * BAĞIMSIZ bir eksen. Gerçekten bağlanabilen/yayınlanabilen platform artık
 * `bluesky` (§12 adım 17a) — demo bunu ayrıca bir "bağlı" satırla
 * göstermiyor, çünkü demo modda zaten sıfır dış istek/bağlama var (§9).
 */
import type { ChannelRow } from "@/lib/core/types";

export const DEMO_CHANNEL_IDS = {
  instagram: "c0000000-0000-4000-8000-000000000001",
  x: "c0000000-0000-4000-8000-000000000002",
  linkedin: "c0000000-0000-4000-8000-000000000003",
  tiktok: "c0000000-0000-4000-8000-000000000004",
  youtube: "c0000000-0000-4000-8000-000000000005",
  bluesky: "c0000000-0000-4000-8000-000000000006",
} as const;

export const DEMO_CHANNELS: ChannelRow[] = [
  {
    id: DEMO_CHANNEL_IDS.instagram,
    platform: "instagram",
    handle: "@demlemekahve",
    followers: 12_400,
    growth: 4.8,
    engagement: 5.2,
    is_connected: true,
    // Bağlı olduğu için §12 adım 18'in metrik toplayıcısı bunu düzenli
    // doldurur varsayımıyla makul bir demo zamanı — gerçek bir tarih değil.
    last_synced_at: "2026-09-04T07:15:00.000Z",
  },
  {
    id: DEMO_CHANNEL_IDS.linkedin,
    platform: "linkedin",
    handle: "Demleme Kahve",
    followers: 3_180,
    growth: 2.1,
    engagement: 3.4,
    is_connected: false,
    last_synced_at: null,
  },
  {
    id: DEMO_CHANNEL_IDS.x,
    platform: "x",
    handle: "@demlemekahve",
    followers: 2_050,
    growth: -0.6,
    engagement: 1.9,
    is_connected: false,
    last_synced_at: null,
  },
  {
    id: DEMO_CHANNEL_IDS.tiktok,
    platform: "tiktok",
    handle: "@demlemekahve",
    followers: 8_720,
    growth: 11.3,
    engagement: 7.6,
    is_connected: false,
    last_synced_at: null,
  },
  {
    id: DEMO_CHANNEL_IDS.youtube,
    platform: "youtube",
    handle: "Demleme Kahve",
    followers: 940,
    growth: 6.2,
    engagement: 2.8,
    is_connected: false,
    last_synced_at: null,
  },
  {
    // 17a FAZ 0.2 — gerçekten bağlanabilen/yayınlanabilen platform bu, ama
    // demo modda GERÇEK bir bağlama olmadığı için (§9: sıfır dış istek)
    // is_connected burada da false — diğer bağlı-olmayan kartlarla aynı.
    id: DEMO_CHANNEL_IDS.bluesky,
    platform: "bluesky",
    handle: "@demlemekahve.bsky.social",
    followers: 1_260,
    growth: 3.4,
    engagement: 4.1,
    is_connected: false,
    last_synced_at: null,
  },
];
