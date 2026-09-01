/**
 * Tekrar önleme + devam zinciri — yapılandırılabilir sabitler.
 * BIRLESIM_PLANI §4c / §12 adım 15 — Akış E.
 *
 * ⚠ KALİBRE EDİLMEDİ. Hepsi başlangıç değeri; ilk ~200 gerçek içerikten
 * sonra ölçülüp güncellenmeli (bkz. `docs/ADIM_15_RAPOR.md`). Tek değiştirme
 * noktası burası — kod başka hiçbir yerde eşik sayısı hardcode ETMEZ.
 */

export interface DedupeConfig {
  /** Kosinüs benzerliği bu değerin ÜSTÜNDEYSE tekrar — üretme. */
  duplicateThreshold: number;
  /** Bu değerin altı "yeni"; bu değer ile `duplicateThreshold` arası "devam adayı" bandı. */
  continuationThreshold: number;
  /** Komşu bu kadar gün önce yayınlanmamışsa devam önerilmez (çok taze). */
  minDaysSincePublish: number;
  /** `content_items.chain_position` CHECK'iyle aynı tavan (00_schema.sql) —
   *  burada da tutuluyor ki motor DB'nin reddedeceği bir INSERT'i denemeden
   *  önce kendi kararını versin. */
  maxChainDepth: number;
  /** ⚠ FAZ B4 — bir `plan_generate` çalışmasında Kontrol 3c'nin (LLM'e
   *  "devam mı?" sorma) en fazla kaç kez çağrılacağı. Her çağrı gerçek bir
   *  Anthropic isteği; bir plan onlarca "yakın" aday üretebilir, tavan
   *  olmazsa tek bir plan üretimi onlarca ek çağrıya çıkar. Aşılınca kalan
   *  adaylar LLM'e sorulmadan `duplicate` sayılır (muhafazakâr taraf). */
  maxContinuationChecksPerRun: number;
}

/** `content_items.embedding vector(1024)` sözleşmesiyle BİREBİR (D3,
 *  `00_schema.sql`). Sağlayıcı ne olursa olsun bu sayı sabit. */
export const EMBEDDING_DIMENSIONS = 1024;

export const DEFAULT_DEDUPE_CONFIG: DedupeConfig = {
  duplicateThreshold: 0.92,
  continuationThreshold: 0.82,
  minDaysSincePublish: 3,
  maxChainDepth: 12,
  maxContinuationChecksPerRun: 5,
};
