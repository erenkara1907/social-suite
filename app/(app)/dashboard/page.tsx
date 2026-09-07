import { port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildQueue } from "@/lib/core/derive/calendar";
import { anyPlatformProvidesReach, buildMonthlyReach } from "@/lib/core/derive/analytics";
import { zonedParts } from "@/lib/core/tz";
import type { DKpi } from "@/lib/core/types";
import { ui } from "@/lib/i18n/dict";
import { DashboardView } from "@/components/app/dashboard-view";

/** `L` çiftini iki dilin sözlüğünden aynı anahtarla kurar — KPI etiketi bu
 *  sayfada iki kez (burada + dict.ts'te) yazılmasın diye. */
function label(key: keyof typeof ui.tr) {
  return { tr: ui.tr[key], en: ui.en[key] };
}

export const metadata = { title: "Takvim" };

const UPCOMING_LIMIT = 5;
const ACTIVITY_LIMIT = 8;
/** Metrik penceresi — cari ayın tamamını her zaman kapsasın diye 45 gün. */
const METRIC_WINDOW_DAYS = 45;

function sameMonth(iso: string, now: { year: number; month: number }, tz: string): boolean {
  const p = zonedParts(iso, tz);
  return p.year === now.year && p.month === now.month;
}

/**
 * `/dashboard` — BIRLESIM_PLANI §12 adım 8d (FAZ D).
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⚠ ADIM_012'nin tuzağı: siraya'nın "Otomatik kaydırma" KPI'sı canlıda hep
 * 0'dı çünkü onu yazan kod yoktu. Buradaki dört KPI'nın her biri
 * `docs/ADIM_8_RAPOR.md`'deki tabloda hangi canlı adımın dolduracağıyla
 * eşleşiyor — bir KPI'nın canlıda hangi kodun besleyeceği belli değilse
 * konmadı.
 */
export default async function Page() {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();

  const contentPort = port("content", overrides);
  const metricsPort = port("metrics", overrides);

  const [items, activity, metrics] = await Promise.all([
    contentPort.list(),
    contentPort.listActivity(ACTIVITY_LIMIT),
    metricsPort.list(METRIC_WINDOW_DAYS),
  ]);

  const now = new Date();
  const thisMonth = zonedParts(now, brand.timezone);

  const plannedThisMonth = items.filter((item) => {
    const at = item.scheduled_at ?? item.published_at;
    return at !== null && sameMonth(at, thisMonth, brand.timezone);
  }).length;

  const needsReview = items.filter((item) => item.status === "needs_review").length;

  const publishedItemsThisMonth = items.filter(
    (item) => item.status === "published" && item.published_at && sameMonth(item.published_at, thisMonth, brand.timezone),
  );
  const publishedThisMonth = publishedItemsThisMonth.length;

  // ⭐ adım 9 A1 — ham satırları toplamak yerine içerik başına en son ölçüm,
  // h6 hariç (D1). Ayrıntı: lib/core/derive/analytics.ts buildMonthlyReach.
  const reachThisMonth = buildMonthlyReach(items, metrics, now, brand.timezone);
  // ⭐ adım 18 D11 — bu ayki yayınların platformu erişim VERMİYORSA "0"
  // yerine dürüst bir metin; buildMonthlyReach'in kendisi hâlâ doğru
  // toplamı hesaplıyor, yalnızca GÖSTERİM burada karar veriyor. Bu ay HİÇ
  // yayın yoksa bu "platform ölçmüyor" değil "henüz yayın yok" demek —
  // o durumda gerçek bir "0" gösterilir, "ölçülemedi" DEĞİL.
  const reachProvidedThisMonth =
    publishedItemsThisMonth.length === 0 || anyPlatformProvidesReach(publishedItemsThisMonth);

  const kpis: DKpi[] = [
    { label: label("dashboardKpiPlanned"), value: String(plannedThisMonth), icon: "calendar-range", tone: 1 },
    { label: label("dashboardKpiReview"), value: String(needsReview), icon: "circle-alert", tone: 2 },
    { label: label("dashboardKpiPublished"), value: String(publishedThisMonth), icon: "send", tone: 3 },
    {
      label: label("dashboardKpiReach"),
      value: reachProvidedThisMonth
        ? (reachThisMonth >= 1000 ? `${(reachThisMonth / 1000).toFixed(1)}K` : String(reachThisMonth))
        : "—",
      hint: reachProvidedThisMonth ? undefined : label("dashboardKpiReachNotProvided"),
      icon: "eye",
      tone: 4,
    },
  ];

  // Yaklaşan yayınlar — yalnızca gerçekten zamanlanmış (scheduled_at dolu),
  // henüz yayınlanmamış satırlar. buildQueue() zaten soonest-first sıralıyor.
  const scheduledItems = items.filter(
    (item) => item.scheduled_at !== null && item.status !== "published" && item.status !== "archived",
  );
  const upcoming = buildQueue(scheduledItems, now, brand.timezone).slice(0, UPCOMING_LIMIT);

  return <DashboardView kpis={kpis} upcoming={upcoming} activity={activity} timezone={brand.timezone} />;
}
