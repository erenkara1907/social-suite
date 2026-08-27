/**
 * Aktivite akışı — `/dashboard`'ın sağ sütunu.
 *
 * ← siraya `lib/demo/data.ts:269` `activity` + threadly `:157` + sahne `:161`.
 *   Üç projede de aynı isim, üç farklı şekil vardı (`who`/`action` çevrilebilir
 *   metin, `at` serbest string). Burada tek `activity` TABLOSUNUN şekli:
 *   `action` on iki değerli CHECK listesinden, `created_at` ISO an.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK. Görünen metin `action` değerinden türetilecek
 * (i18n sözlüğü) — kaynaktaki gibi satıra gömülmüyor. Gömülü metin, dili
 * değiştirdiğinde geçmişin yarısının çevrilmemesi demekti.
 *
 * ⭐ §4c'nin kanıtı bu dosyada: `duplicate_blocked` satırı. Tekrar motoru
 * (adım 15) çalıştığında yazacağı kayıt bu; demo verisi ürünün bu özelliğini
 * ANLATMAK zorunda, yoksa "aynı içerik tekrar üretilmez" sözü ekranda hiçbir
 * yerde görünmez. Eşleşen içerik `content.ts`'teki `...022` — `archived`
 * durumda duran, silinmeyen satır.
 */
import type { ActivityRow } from "@/lib/core/types";
import { at } from "@/lib/adapters/demo/fixtures/clock";

/** Otomatik işlemlerde aktör ürün adı (`app.config.ts` → `BRAND_NAME`). */
const SYSTEM_ACTOR = "Social Suite";
const HUMAN_ACTOR = "Mira";

export function demoActivity(now: Date): ActivityRow[] {
  return [
    {
      id: "f0000000-0000-4000-8000-000000000001",
      actor: SYSTEM_ACTOR,
      action: "plan_generated",
      target: "Eylül ritmi · 30 gün · 24 gönderi",
      created_at: at(now, -2, "10:04"),
    },
    /* ⭐ §4c — tekrar engellendi. Motor, "Kavurma tarihi neden önemli"
       fikrini 21 gün önceki gönderiyle 0.94 benzer buldu ve üretmedi. */
    {
      id: "f0000000-0000-4000-8000-000000000002",
      actor: SYSTEM_ACTOR,
      action: "duplicate_blocked",
      target: "Kavurma tarihi neden önemli · benzerlik 0.94",
      created_at: at(now, -2, "10:04"),
    },
    /* Aynı üretimde bir fikir de "devam" olarak yeniden çerçevelendi —
       §4c'nin 0.82-0.92 aralığının kararı. Zincirin 3. halkası böyle doğdu. */
    {
      id: "f0000000-0000-4000-8000-000000000003",
      actor: SYSTEM_ACTOR,
      action: "continuation_created",
      target: "Ekipman rehberi 3: terazi ve zaman · zincir 3/12",
      created_at: at(now, -2, "10:05"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000004",
      actor: SYSTEM_ACTOR,
      action: "caption_written",
      target: "Aeropress'te ters yöntem · instagram",
      created_at: at(now, -2, "10:12"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000005",
      actor: HUMAN_ACTOR,
      action: "approved",
      target: "Aeropress'te ters yöntem · instagram",
      created_at: at(now, -1, "09:20"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000006",
      actor: SYSTEM_ACTOR,
      action: "shifted_to_best_time",
      target: "instagram · 17:00 → 18:00",
      created_at: at(now, -1, "09:21"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000007",
      actor: HUMAN_ACTOR,
      action: "queued",
      target: "Ekipman rehberi 3 · instagram · 18:00",
      created_at: at(now, -1, "09:24"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000008",
      actor: SYSTEM_ACTOR,
      action: "failed",
      target: "Hafta sonu dükkân saatleri · x · 13:00",
      created_at: at(now, -1, "13:02"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000009",
      actor: HUMAN_ACTOR,
      action: "ugc_requested",
      target: "Bir günde kaç kilo kavuruyoruz · tiktok",
      created_at: at(now, 0, "09:44"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000010",
      actor: SYSTEM_ACTOR,
      action: "metrics_collected",
      target: "8 içerik · d1",
      created_at: at(now, 0, "06:00"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000011",
      actor: SYSTEM_ACTOR,
      action: "ugc_ready",
      target: "V60 ile 4 dakikada demleme · 21 sn",
      created_at: at(now, -13, "10:11"),
    },
    {
      id: "f0000000-0000-4000-8000-000000000012",
      actor: SYSTEM_ACTOR,
      action: "published",
      target: "Soğuk demleme şişeleri raflarda · instagram · 17:00",
      created_at: at(now, -3, "17:00"),
    },
  ];
}
