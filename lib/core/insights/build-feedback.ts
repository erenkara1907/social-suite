/**
 * Metrik → plan geri besleme — §12 adım 18 FAZ C, BIRLESIM_PLANI §8.3/Akış D.
 *
 * ⚠ Bu dosya KONU (topic/title/hook METNİ) TAŞIMAZ — yalnızca YAKLAŞIM
 * (format, saat, açılış BİÇİMİ) çıkarır. Gerekçe: adım 15'in tekrar önleme
 * motoru "bu konu daha önce üretildi mi" diye soruyor; geri besleme "bu konu
 * iyi gitti, aynısını yaz" derse iki motor birbirini kesebilir (dedupe
 * reddeder, geri besleme aynı şeyi tekrar öner → sonsuz reddetme ya da
 * "devam" olarak yanlış çerçevelenme). Bu dosyanın döndürdüğü hiçbir alan
 * `content_fingerprint`/`embedding`'in girdisi olan `title`/`hook` METNİNİ
 * içermez — yalnızca yapısal gözlemler (`FeedbackNote`, `PostKind`, saat
 * penceresi) taşır. `build-feedback.test.ts`'in "dedupe ile çakışmaz" testi
 * bunu doğrudan kanıtlar.
 *
 * ⭐ Basis-güvenliği (§18 D11) — `lib/core/metrics/basis.ts` üzerinden:
 * farklı `engagement_rate_basis`'e sahip satırlar asla aynı sıralamaya
 * girmez. Bugün tek platform (bluesky) canlı olduğu için pratikte hep tek
 * grup işleniyor, ama fonksiyon bunu HER ZAMAN uyguluyor.
 */
import type { ContentItemRow, EngagementRateBasis, L, MetricRow, PostKind } from "@/lib/core/types";
import { KIND_LABEL } from "@/lib/core/types";
import { countGraphemes } from "@/lib/core/publishing";
import { DEFAULT_TZ, zonedParts } from "@/lib/core/tz";
import { dominantEngagementGroup } from "@/lib/core/metrics/basis";

/**
 * ⚠ KALİBRE EDİLMEMİŞ — makul bir başlangıç eşiği, §4c'nin 0.92/0.82 eşikleri
 * ile aynı statüde. Üç gönderiden "en iyi saat" çıkarmak uydurmadır (görev
 * metninin kendi uyarısı); 5, "en az bir tam hafta örnekleme" sezgisiyle
 * seçildi — ilk ~50-100 gerçek ölçümden sonra gözden geçirilmeli.
 */
export const FEEDBACK_MIN_MEASURED = 5;

/**
 * ⭐ adım 18 FAZ C — "Pencere: METRIC_WINDOW_DAYS 45 olarak konmuştu,
 * kalibre edilmedi. Değerlendir." talimatının değerlendirmesi: DEĞİŞTİRİLMEDİ,
 * `/analytics`'in adım 8'de seçtiği 45 günle AYNI değer bilinçli olarak
 * korundu — `brand_latest_metrics(p_days)` zaten ikisinin de TEK okuma
 * kaynağı (D1), iki farklı pencere kullanmak "aynı satırlara bakıyoruz"
 * garantisini kırardı. Gerekçe aynı: 30 günlük toplama penceresi (§4f) +
 * birkaç günlük tampon. ⚠ Kalibre edilmedi, §4c'nin eşikleriyle aynı statüde.
 */
export const FEEDBACK_WINDOW_DAYS = 45;

/** Üst-performans dilimi — plan metninin kendi ifadesi: "üstteki %20 içeriği seç". */
const TOP_SHARE = 0.2;

/** Bir yapısal sinyalin "gerçek" sayılması için top/rest arasındaki en az fark. */
const HOOK_LENGTH_SIGNAL_RATIO = 0.75; // top ortalaması rest'in en az %25 altında
const QUESTION_HOOK_SIGNAL_DELTA = 0.25; // en az 25 puan fark
const KIND_DOMINANCE_MIN_SHARE = 0.5; // top grubun en az yarısı aynı kind

const HOUR_WINDOWS: readonly [number, number, string][] = [
  [6, 9, "06:00–09:00"], [9, 12, "09:00–12:00"], [12, 15, "12:00–15:00"],
  [15, 18, "15:00–18:00"], [18, 21, "18:00–21:00"], [21, 24, "21:00–24:00"],
];

function windowLabel(hour: number): string {
  const w = HOUR_WINDOWS.find(([start, end]) => hour >= start && hour < end);
  return w ? w[2] : HOUR_WINDOWS[0][2]; // 06'dan önce → ilk pencereye katla (heatmap'le tutarlı)
}

export interface FeedbackNote {
  /** Yaklaşım notu — KONU değil, üretim BİÇİMİ. */
  text: L;
}

export interface FeedbackSignal {
  measuredCount: number;
  topCount: number;
  basis: EngagementRateBasis;
  notes: FeedbackNote[];
}

interface Candidate {
  item: ContentItemRow;
  metric: MetricRow;
  engagement_rate_basis: EngagementRateBasis;
}

/**
 * @param items Markanın YAYINLANMIŞ içerikleri.
 * @param metrics `MetricsPort.latest()` sonucu — D1: h6 hariç, içerik başına
 *   en son mevcut ölçüm.
 * @returns Yeterli veri yoksa `null` — "yeterli veri yok" demenin karşılığı,
 *   boş bir sinyal İCAT EDİLMEZ.
 */
export function buildFeedbackSignal(
  items: ContentItemRow[],
  metrics: MetricRow[],
  tz: string = DEFAULT_TZ,
): FeedbackSignal | null {
  const latest = new Map(metrics.map((m) => [m.content_item_id, m]));
  const candidates: Candidate[] = items
    .filter((i) => i.status === "published" && latest.has(i.id))
    .map((item) => {
      const metric = latest.get(item.id)!;
      return { item, metric, engagement_rate_basis: metric.engagement_rate_basis };
    });

  const dominant = dominantEngagementGroup(candidates);
  if (!dominant || dominant.rows.length < FEEDBACK_MIN_MEASURED) return null;

  const pool = dominant.rows;
  const sorted = [...pool].sort((a, b) => b.metric.engagement_rate - a.metric.engagement_rate);
  const topCount = Math.max(1, Math.round(sorted.length * TOP_SHARE));
  const top = sorted.slice(0, topCount);
  const rest = sorted.slice(topCount);

  const notes: FeedbackNote[] = [];

  const hookNote = hookLengthNote(top, rest);
  if (hookNote) notes.push(hookNote);

  const questionNote = questionHookNote(top, rest);
  if (questionNote) notes.push(questionNote);

  const kindNote = dominantKindNote(top, pool);
  if (kindNote) notes.push(kindNote);

  const windowNote = dominantWindowNote(top, tz);
  if (windowNote) notes.push(windowNote);

  return { measuredCount: pool.length, topCount: top.length, basis: dominant.basis, notes };
}

function avgHookLength(rows: Candidate[]): number {
  const lengths = rows.map((r) => countGraphemes(r.item.hook)).filter((n) => n > 0);
  if (lengths.length === 0) return 0;
  return lengths.reduce((a, b) => a + b, 0) / lengths.length;
}

function hookLengthNote(top: Candidate[], rest: Candidate[]): FeedbackNote | null {
  if (rest.length === 0) return null;
  const topAvg = avgHookLength(top);
  const restAvg = avgHookLength(rest);
  if (topAvg === 0 || restAvg === 0) return null;
  if (topAvg <= restAvg * HOOK_LENGTH_SIGNAL_RATIO) {
    return { text: {
      tr: "Kısa açılışlar (hook) daha çok etkileşim aldı.",
      en: "Shorter opening lines (hooks) got more engagement.",
    } };
  }
  return null;
}

function questionShare(rows: Candidate[]): number {
  if (rows.length === 0) return 0;
  const questions = rows.filter((r) => r.item.hook.trim().endsWith("?")).length;
  return questions / rows.length;
}

function questionHookNote(top: Candidate[], rest: Candidate[]): FeedbackNote | null {
  if (rest.length === 0) return null;
  const topShare = questionShare(top);
  const restShare = questionShare(rest);
  if (topShare - restShare >= QUESTION_HOOK_SIGNAL_DELTA) {
    return { text: {
      tr: "Soru soran açılışlar daha çok etkileşim aldı.",
      en: "Question-based opening lines got more engagement.",
    } };
  }
  return null;
}

function dominantKindNote(top: Candidate[], pool: Candidate[]): FeedbackNote | null {
  const counts = new Map<PostKind, number>();
  for (const row of top) counts.set(row.item.kind, (counts.get(row.item.kind) ?? 0) + 1);
  let bestKind: PostKind | null = null;
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) { bestKind = kind; bestCount = count; }
  }
  if (!bestKind || bestCount / top.length < KIND_DOMINANCE_MIN_SHARE) return null;

  // Genelde de baskınsa (havuzun kendisi zaten çoğunlukla bu formattaysa)
  // bu bir sinyal değil, sadece dağılımın yansıması — atla.
  const poolShare = pool.filter((r) => r.item.kind === bestKind).length / pool.length;
  if (poolShare >= KIND_DOMINANCE_MIN_SHARE) return null;

  const label = KIND_LABEL[bestKind];
  return { text: {
    tr: `${label.tr} formatı diğerlerinden daha çok etkileşim aldı.`,
    en: `${label.en} format got more engagement than the others.`,
  } };
}

function dominantWindowNote(top: Candidate[], tz: string): FeedbackNote | null {
  const counts = new Map<string, number>();
  for (const row of top) {
    const instant = row.item.published_at ?? row.item.scheduled_at;
    if (!instant) continue;
    const { hour } = zonedParts(instant, tz);
    const w = windowLabel(hour);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let bestWindow: string | null = null;
  let bestCount = 0;
  for (const [w, count] of counts) {
    if (count > bestCount) { bestWindow = w; bestCount = count; }
  }
  if (!bestWindow || bestCount / top.length < KIND_DOMINANCE_MIN_SHARE) return null;

  return { text: {
    tr: `${bestWindow} saat aralığında paylaşılanlar daha çok etkileşim aldı.`,
    en: `Posts shared in the ${bestWindow} window got more engagement.`,
  } };
}

/**
 * Prompt bloğu — `toPromptBlock()`'un deseni: boş alan DÜŞÜRÜLÜR
 * (`lib/core/brand/types.ts`'in aynı kuralı). Sinyal yoksa (`null`) HİÇ
 * bölüm eklenmez, boş bir başlık bile — prompt eskisi gibi çalışır.
 */
export function toFeedbackPromptBlock(signal: FeedbackSignal | null): string {
  if (!signal || signal.notes.length === 0) return "";
  return [
    "What worked in recent published content — apply the APPROACH, not the topic:",
    ...signal.notes.map((n) => `- ${n.text.en}`),
  ].join("\n");
}
