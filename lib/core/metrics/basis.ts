/**
 * Etkileşim oranı taban güvenliği — §12 adım 18 Düzeltme 1.
 *
 * Kural: farklı `engagement_rate_basis`'e sahip satırlar KARŞILAŞTIRILAMAZ,
 * ORTALAMASI ALINAMAZ, AYNI SIRALAMAYA GİRMEZ. `MetricRow.engagement_rate`
 * yalnızca bir SAYI — TypeScript'in kendisi "bu iki sayıyı toplama, farklı
 * ölçeklerdeler" diye bir kısıt koyamaz (branded/nominal sayı tipleri bu
 * kod tabanının geri kalanını gereksiz yere karmaşıklaştırırdı — YAGNI).
 * Bu yüzden kural BURADA, çalışma zamanı fonksiyonları + testleriyle
 * uygulanıyor: `engagement_rate`'e dokunan her yer (`lib/core/derive/
 * analytics.ts`, `lib/core/insights/build-feedback.ts`) bu modülden geçmek
 * ZORUNDA — doğrudan `.reduce`/`.sort` ile `engagement_rate` toplamak/
 * sıralamak kod incelemesinde reddedilecek bir desen.
 *
 * Bugün tek platform (bluesky, taban hep `followers`/`unavailable`) olduğu
 * için bu fonksiyonlar pratikte tek grup üretir — görünmez ama TEST EDİLİR
 * (bkz. `basis.test.ts`, sentetik çok-tabanlı girdilerle). Instagram (adım
 * 17b) `reach` tabanını gerçek veriyle devreye sokacak.
 */
import type { EngagementRateBasis } from "@/lib/core/types";

export interface BasisTagged {
  engagement_rate_basis: EngagementRateBasis;
}

/**
 * `unavailable` taban HİÇ hesaplanamamış demek — `0` GERÇEK bir değer değil,
 * "ölçülemedi". Sıralama/geri besleme/ortalama bu satırları hiç GÖRMEMELİ;
 * onları başka bir tabanın gerçek sıfırlarıyla karıştırmak yanlış sinyal
 * üretir ("bu içerik hiç etkileşim almadı" ile "bu içerik ÖLÇÜLEMEDİ" aynı
 * şey değil).
 */
export function withMeasurableEngagement<T extends BasisTagged>(rows: T[]): T[] {
  return rows.filter((r) => r.engagement_rate_basis !== "unavailable");
}

/**
 * Kalan (ölçülebilir) satırları AYNI taban içinde gruplar. Dönen her grup
 * TEK bir `engagement_rate_basis` taşır — karşılaştırma/ortalama/sıralama
 * yalnızca bir grubun İÇİNDE yapılmalı, gruplar ARASINDA asla.
 */
export function groupByEngagementBasis<T extends BasisTagged>(rows: T[]): Map<EngagementRateBasis, T[]> {
  const groups = new Map<EngagementRateBasis, T[]>();
  for (const row of withMeasurableEngagement(rows)) {
    const list = groups.get(row.engagement_rate_basis);
    if (list) list.push(row);
    else groups.set(row.engagement_rate_basis, [row]);
  }
  return groups;
}

/**
 * En çok satırı olan (bugün: neredeyse her zaman TEK) grup — "bu markanın
 * baskın ölçüm tabanı hangisi" sorusuna cevap. Birden fazla platform aynı
 * anda yayın yapıyorsa (adım 17b sonrası) bu, en kalabalık tabanı seçer;
 * diğer taban(lar)ın satırları bu seçimden DIŞARIDA kalır — sessizce
 * karıştırılmazlar, çağıran onları AYRI ele almak isterse `groupByEngagementBasis`'i
 * doğrudan kullanmalı.
 */
export function dominantEngagementGroup<T extends BasisTagged>(rows: T[]): { basis: EngagementRateBasis; rows: T[] } | null {
  const groups = groupByEngagementBasis(rows);
  let best: { basis: EngagementRateBasis; rows: T[] } | null = null;
  for (const [basis, group] of groups) {
    if (!best || group.length > best.rows.length) best = { basis, rows: group };
  }
  return best;
}
