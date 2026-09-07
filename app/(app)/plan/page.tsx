import { isDemo, port } from "@/lib/adapters";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { getJobsSummary } from "@/lib/server/jobs/status";
import { buildChains, buildMonthCells, buildWeek } from "@/lib/core/derive/calendar";
import { skeletonToContentItems } from "@/lib/core/plan/calendar";
import { brandCompletionPercent } from "@/lib/core/brand/types";
import { buildFeedbackSignal, FEEDBACK_WINDOW_DAYS, toFeedbackPromptBlock } from "@/lib/core/insights/build-feedback";
import type { PlanHorizon } from "@/lib/core/plan/types";
import type { PostStatus } from "@/lib/core/types";
import { PlanView } from "@/components/app/plan-view";

export const metadata = { title: "Plan" };

const DEFAULT_HORIZON: PlanHorizon = 7;

/**
 * ⭐ BIRLESIM_PLANI §12 adım 20.5 FAZ C1 düzeltmesi — bulunan gerçek hata:
 * `UgcSelectionCard` önceden `planItems`'i (aşağıdaki `plannerPort.
 * generate()` önizlemesi — KALICILAŞMAYAN, sentetik `"skeleton-N"` id'li
 * satırlar) besliyordu. Canlı modda bu kutulardan biri seçilip "İste"
 * tıklanınca `requestUgcAction` → `activity.content_item_id` (gerçek uuid
 * FK) sütununa sentetik bir string yazmaya çalışıyor ve Postgres ANINDA
 * "invalid input syntax for type uuid" ile reddediyordu — /plan'daki UGC
 * isteği canlı modda HİÇBİR ZAMAN çalışmamış (canlı `psql` ile doğrulandı,
 * bu oturumda). Doğru kaynak GERÇEK, kalıcı satırlar (`contentPort.list()`,
 * zaten aşağıda yükleniyor) — yayına henüz gitmemiş (`idea`/`draft`/
 * `needs_review`) ve DAHA ÖNCE istenmemiş olanlar.
 */
const UGC_CANDIDATE_STATUSES: PostStatus[] = ["idea", "draft", "needs_review"];

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
 * biçiminin aynısı. Canlı modda bu artık GERÇEK bir Anthropic çağrısı
 * (`livePlanner.generate()`, adım 14 FAZ C) — kalıcılaşmayan bir ÖNİZLEME;
 * kalıcı üretim (content_items'a yazma) `PlanView`'daki "Planı üret"
 * düğmesinin kuyruğa eklediği `plan_generate` işi (adım 14 FAZ D). Bilinçli
 * maliyet notu: sayfayı her ziyaret bu yüzden gerçek bir çağrı yapar —
 * ayrıntı `lib/adapters/live/planner.ts` ve adım 14 raporunda.
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
  const metricsPort = port("metrics", overrides);

  const now = new Date();
  // ⭐ adım 18 FAZ C — sinyal, `plannerPort.generate()`'in bir GİRDİSİ
  // olduğu için önce (paralel) toplanır; `insightBlock` hazır olmadan
  // önizleme çağrısı yapılamaz — C5'in "her ziyaret gerçek çağrı" maliyet
  // notu bu yüzden bir round-trip daha uzuyor, kabul edilebilir bir bedel.
  const [items, latestMetrics, jobsSummary, ugcRequestedIds] = await Promise.all([
    contentPort.list(),
    metricsPort.latest(FEEDBACK_WINDOW_DAYS),
    getJobsSummary(),
    contentPort.listUgcRequested(),
  ]);

  const feedbackSignal = buildFeedbackSignal(items, latestMetrics, brand.timezone);
  const insightBlock = toFeedbackPromptBlock(feedbackSignal);

  const skeletonResult = await plannerPort.generate({
    theme: brand.description || brand.name,
    horizonDays,
    // ⭐ adım 10 A1 — İÇERİK dili, brand.contentLanguage'dan. Arayüzün
    // (localStorage `sm:lang`) SSR'ın bilemediği tercihi DEĞİL, markanın
    // kendi alanı — bkz. docs/BIRLESIM_PLANI.md §9.1.
    lang: brand.contentLanguage,
    mode: "weekly",
    start: now,
    brand,
    // ⭐ adım 14 FAZ C — canlı modda anahtar çözümü için gerekli
    // (livePlanner.generate()). Demo modda okunmaz.
    brandId: brand.id,
    insightBlock,
  });

  // ⭐ §9.1 "sessiz düşme" değil — üretim gerçekten başarısızsa boş bir plan
  // gösterilir, sahte bir tane DEĞİL. Demo modda bu dal pratikte hiç girilmez.
  const skeleton = skeletonResult.ok ? skeletonResult.data : { title: "", posts: [] };

  const planItems = skeletonToContentItems(skeleton.posts, now, brand.id, brand.timezone);
  const week = horizonDays === 7 ? buildWeek(planItems, now, brand.timezone) : null;
  const month = horizonDays === 30 ? buildMonthCells(planItems, now, brand.timezone) : null;

  // C4 — mevcut GERÇEK içeriklerin zincirleri, referans olarak.
  const chains = buildChains(items);

  // ⭐ FAZ C1 düzeltmesi — UGC isteği GERÇEK satırlar üzerinden: yayına
  // henüz gitmemiş VE daha önce istenmemiş olanlar.
  const requestedSet = new Set(ugcRequestedIds);
  const ugcCandidates = items.filter(
    (item) => UGC_CANDIDATE_STATUSES.includes(item.status) && !requestedSet.has(item.id),
  );

  const completion = brandCompletionPercent(brand);
  const generateDisabled = isDemo("planner", overrides);
  // ⭐ adım 20 FAZ C1 — "UGC video iste" düğmesi video portu demo modda ise
  // kapalı (requestUgcAction'ın kendi kontrolüyle aynı ikinci katman).
  const ugcDemoMode = isDemo("video", overrides);

  return (
    <PlanView
      horizonDays={horizonDays}
      planTitle={skeleton.title}
      planItems={planItems}
      ugcCandidates={ugcCandidates}
      week={week}
      month={month}
      chains={chains}
      completion={completion}
      generateDisabled={generateDisabled}
      ugcDemoMode={ugcDemoMode}
      defaultTheme={brand.description || brand.name}
      contentLanguage={brand.contentLanguage}
      jobsSummary={jobsSummary}
      feedbackSignal={feedbackSignal}
    />
  );
}
