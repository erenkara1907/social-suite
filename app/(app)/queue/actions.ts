"use server";

import { revalidatePath } from "next/cache";
import { port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { requireBrand } from "@/lib/server/auth";
import { canPublish } from "@/lib/core/publishing";
import { zonedTimeToUtc } from "@/lib/core/tz";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import type { Platform } from "@/lib/core/types";

/**
 * `/queue`'nun onay/yeniden zamanlama/iptal düğmeleri — §12 adım 17a FAZ D
 * (adım 8'de bilerek disabled bırakılmıştı).
 *
 * ⚠ "use server" dosyaları yalnızca ASYNC FONKSİYON export edebilir (adım
 * 20.5 FAZ C1 dersi — başlangıç state sabitleri BURADA DEĞİL,
 * `queue-view.tsx`'te).
 */
export interface QueueActionState {
  status: "idle" | "done" | "error";
  contentItemId: string | null;
  errorCode: ApiErrorCode | null;
}

/**
 * Onay — `needs_review`/`draft`/`failed` → `scheduled`. İki koşul BİRLİKTE
 * sağlanmalı, yoksa "zamanlayıcının tutamayacağı bir söz" verilmiş olur
 * (`PublisherPort`'un yorumu):
 *   1. Platform bugün gerçekten yayınlanabilir (`canPublish`).
 *   2. Markanın o platform için BAĞLI bir kanalı var.
 *
 * ⭐ Gerçek bir üretim boşluğunu kapatıyor: `content_items.channel_id`
 * oluşturulduğunda HER ZAMAN `null` (`lib/core/plan/calendar.ts`) — hiçbir
 * yol onu daha önce doldurmuyordu. Onay, bunun atandığı ANDIR.
 */
export async function approveAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const contentItemId = String(formData.get("contentItemId") ?? "").trim();
  if (!contentItemId) return { status: "error", contentItemId: null, errorCode: "invalid_input" };

  const overrides = await requestModeOverrides();
  const contentPort = port("content", overrides);

  const item = await contentPort.get(contentItemId);
  if (!item) return { status: "error", contentItemId, errorCode: "not_found" };

  if (!canPublish(item.platform as Platform)) {
    return { status: "error", contentItemId, errorCode: "publish_failed" };
  }

  const channelPort = port("channel", overrides);
  const channels = await channelPort.list();
  const channel = channels.find((c) => c.platform === item.platform && c.is_connected);
  if (!channel) return { status: "error", contentItemId, errorCode: "not_configured" };

  const result = await contentPort.update(contentItemId, { status: "scheduled", channel_id: channel.id });
  if (!result.ok) return { status: "error", contentItemId, errorCode: result.error.code };

  revalidatePath("/queue");
  return { status: "done", contentItemId, errorCode: null };
}

/** `<input type="datetime-local">`'ın YYYY-MM-DDTHH:mm biçimini ayrıştırır —
 *  saat dilimi TAŞIMAZ (HTML spesifikasyonu), bu yüzden ayrı parçalara
 *  bölünüp markanın kendi saat dilimiyle `zonedTimeToUtc()`'e verilir. */
function parseDatetimeLocal(value: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi) };
}

/**
 * Yeniden zamanlama — yeni bir `scheduled_at`. `failed` durumundaki bir
 * satır için bu aynı zamanda kurtarma yoludur: yeni tarih girilince
 * `scheduled`'a döner (yeniden deneme, `handlePublish`'in idempotent
 * `putRecord`'u sayesinde güvenli — bkz. `lib/server/publish/
 * publish-item.ts`).
 *
 * ⚠ CANLI BULGU (17a FAZ D, e2e testiyle yakalandı) — form girdisi
 * (`datetime-local`) saat dilimi TAŞIMAZ; `new Date(str)` bunu SUNUCU
 * SÜRECİNİN ÖRTÜK saat dilimiyle yorumlar — yerelde (Europe/Istanbul)
 * doğru çalışır ama üretimde (Vercel, örtük UTC) SESSİZCE 3 saat kayar.
 * Bunun yerine markanın KENDİ saat dilimi (`zonedTimeToUtc`,
 * `lib/core/plan/calendar.ts`'in aynı sorunu çözdüğü fonksiyon) kullanılır.
 */
export async function rescheduleAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const contentItemId = String(formData.get("contentItemId") ?? "").trim();
  const scheduledAtLocal = String(formData.get("scheduledAt") ?? "").trim();
  if (!contentItemId || !scheduledAtLocal) {
    return { status: "error", contentItemId: contentItemId || null, errorCode: "invalid_input" };
  }

  const parts = parseDatetimeLocal(scheduledAtLocal);
  if (!parts) return { status: "error", contentItemId, errorCode: "invalid_input" };

  const { brand } = await requireBrand();
  const utc = zonedTimeToUtc(parts.year, parts.month, parts.day, parts.hour, parts.minute, brand.timezone);
  if (Number.isNaN(utc.getTime())) return { status: "error", contentItemId, errorCode: "invalid_input" };

  const overrides = await requestModeOverrides();
  const contentPort = port("content", overrides);
  const item = await contentPort.get(contentItemId);
  if (!item) return { status: "error", contentItemId, errorCode: "not_found" };

  const result = await contentPort.update(contentItemId, {
    scheduled_at: utc.toISOString(),
    status: item.status === "failed" ? "scheduled" : item.status,
  });
  if (!result.ok) return { status: "error", contentItemId, errorCode: result.error.code };

  revalidatePath("/queue");
  return { status: "done", contentItemId, errorCode: null };
}

/** İptal — §4a: silme YOK, `archived`'e geçer (tekrar önleme motoru
 *  fingerprint/embedding'ini korumak için okumaya devam eder). */
export async function cancelAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const contentItemId = String(formData.get("contentItemId") ?? "").trim();
  if (!contentItemId) return { status: "error", contentItemId: null, errorCode: "invalid_input" };

  const overrides = await requestModeOverrides();
  const contentPort = port("content", overrides);
  const result = await contentPort.archive(contentItemId);
  if (!result.ok) return { status: "error", contentItemId, errorCode: result.error.code };

  revalidatePath("/queue");
  return { status: "done", contentItemId, errorCode: null };
}
