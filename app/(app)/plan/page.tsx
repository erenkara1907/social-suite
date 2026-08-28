import { isDemo, port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { buildChains, buildMonthCells, buildWeek } from "@/lib/core/derive/calendar";
import { skeletonToContentItems } from "@/lib/core/plan/calendar";
import { brandCompletionPercent } from "@/lib/core/brand/types";
import type { PlanHorizon } from "@/lib/core/plan/types";
import { PlanView } from "@/components/app/plan-view";

export const metadata = { title: "Plan" };

const DEFAULT_HORIZON: PlanHorizon = 7;

function parseHorizon(raw: string | undefined): PlanHorizon {
  return raw === "30" ? 30 : DEFAULT_HORIZON;
}

/**
 * `/plan` — BIRLESIM_PLANI §12 adım 9 FAZ C. Ürünün beyni: MVP madde 1
 * (ufuk seçimi), 2 (UGC seçimi) ve 5 (devam zinciri) burada görünür.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 *
 * ⭐ C5 — sayfa yüklenirken `PlannerPort.generate()` ÇAĞRILIYOR (demo modda
 * `demoPlanSkeleton`, sıfır ağ isteği, `buildSlots()`'un gerçek çıktısı).
 * Bu SAHTE ÜRETİM değil — `/queue`/`/dashboard`'ın demo verisini gösterme
 * biçiminin aynısı. Devre dışı bırakılan şey `PlanView`'daki "yeni tema ile
 * yeniden üret" DÜĞMESİ — o, gerçek AI çağrısı gerektiren adım 14'ün işi.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string }>;
}) {
  const { brand } = await requireBrand();
  const overrides = await requestModeOverrides();
  const horizonDays = parseHorizon((await searchParams).horizon);

  const plannerPort = port("planner", overrides);
  const contentPort = port("content", overrides);

  const now = new Date();
  const [skeletonResult, items] = await Promise.all([
    plannerPort.generate({
      theme: brand.description || brand.name,
      horizonDays,
      lang: "tr",
      mode: "weekly",
      start: now,
      brand,
    }),
    contentPort.list(),
  ]);

  // ⭐ §9.1 "sessiz düşme" değil — üretim gerçekten başarısızsa boş bir plan
  // gösterilir, sahte bir tane DEĞİL. Demo modda bu dal pratikte hiç girilmez.
  const skeleton = skeletonResult.ok ? skeletonResult.data : { title: "", posts: [] };

  const planItems = skeletonToContentItems(skeleton.posts, now, brand.id, brand.timezone);
  const week = horizonDays === 7 ? buildWeek(planItems, now, brand.timezone) : null;
  const month = horizonDays === 30 ? buildMonthCells(planItems, now, brand.timezone) : null;

  // C4 — mevcut GERÇEK içeriklerin zincirleri, referans olarak.
  const chains = buildChains(items);

  const completion = brandCompletionPercent(brand);
  const generateDisabled = isDemo("planner", overrides);

  return (
    <PlanView
      horizonDays={horizonDays}
      planTitle={skeleton.title}
      planItems={planItems}
      week={week}
      month={month}
      chains={chains}
      completion={completion}
      generateDisabled={generateDisabled}
      defaultTheme={brand.description || brand.name}
    />
  );
}
