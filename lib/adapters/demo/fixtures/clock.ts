/**
 * Fixture'ların zaman çapası.
 *
 * ⚠ Bu dosyada TİP TANIMI YOK — yalnızca iki saf fonksiyon.
 *
 * **Neden mutlak tarih yazmıyoruz.** Üç kaynak projenin demo verisi de sabit
 * tarihler taşıyordu (siraya: "Haziran 2026", 42 hücre elle yazılmış). Sabit
 * tarih iki şeyi bozar: takvim bir ay sonra boş görünür, ve "bugün" hücresi
 * hiç işaretlenmez. Satılabilir bir demoda bu, ürünün bozuk olduğunu anlatır.
 *
 * **Neden `Date.now()` de yazmıyoruz.** Modül düzeyinde okunan bir saat, SSR
 * ile istemci render'ı arasında farklı değer üretir ve hydration uyuşmazlığı
 * doğurur. `now` her zaman DIŞARIDAN gelir; fixture aynı `now` için hep aynı
 * satırları döndürür — yani test edilebilir.
 */

/**
 * `DEFAULT_TZ` (Europe/Istanbul) UTC+03, yaz saati uygulaması 2016'da kaldırıldı
 * — tek sabit ofset. Fixture'lar "yerel 18:00" derken bunu kastediyor.
 */
export const DEMO_TZ_OFFSET_HOURS = 3;

/**
 * `now`'un gününe `dayOffset` ekleyip yerel `HH:MM`'e sabitlenmiş UTC anı.
 * Negatif offset geçmiş, pozitif gelecek.
 */
export function at(now: Date, dayOffset: number, localTime: string): string {
  const [hour, minute] = localTime.split(":").map(Number);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour - DEMO_TZ_OFFSET_HOURS, minute, 0, 0);
  return d.toISOString();
}

/** Tarih kısmı — `created_at` gibi saati önemsiz alanlar için. */
export function day(now: Date, dayOffset: number): string {
  return at(now, dayOffset, "09:00");
}
