# `lib/adapters/` — DEMO | LIVE ikiliği

BIRLESIM_PLANI §9.1 · doldurulacağı adım: **§12 adım 5 (iskelet), 6 (fixtures)**

## Ne girer
- `ports.ts` — 12 arayüzün tek gerçek kaynağı (Content, Planner, Copy, Image,
  Video, Voice, Publisher, Metrics, Channel, Brand, Storage, Dedupe)
- `index.ts` — fabrika + `resolveMode()` bayrak çözümü
- `demo/` — her port için demo implementasyonu + `demo/fixtures/`
- `live/` — her port için gerçek implementasyon

## Ne GİRMEZ
- **Tip tanımı `fixtures/` içine girmez.** Tipler `lib/core/types.ts`'te yaşar.
  siraya'da 13 dosya tiplerini `lib/demo/data.ts`'ten import ettiği için demo
  verisi silinemez hâle gelmişti (§9.2) — o hata tekrarlanmayacak.
- `NEXT_PUBLIC_*` ile mod bayrağı. Bayrak **sunucuda** çözülür ve view
  payload'ında `isDemo: true` olarak istemciye **veri gibi** iner. threadly'nin
  `hasSupabase` sabiti tam bu tuzağa düşmüştü.

## Kural
Varsayılan mod **`demo`**. Bilinmeyen durumda sahte veri göstermek, gerçek para
harcamaktan iyidir. Bayrak port başına çözülür — `MODE_PUBLISHER=live` iken
`MODE_VIDEO=demo` çalışabilmeli.
