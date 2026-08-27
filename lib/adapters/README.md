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

## Dosyalar (adım 5'te kuruldu)

| Dosya | Ne |
|---|---|
| `ports.ts` | 12 arayüz + `PortMap`. **Alan tipi tanımlanmaz**, `lib/core/`'dan import edilir |
| `mode.ts` | `resolveMode(port, overrides)` — dört seviyeli bayrak çözümü |
| `index.ts` | `port(name)` fabrikası + `isDemo()` / `anyDemo()` |
| `demo/*.ts` · `live/*.ts` | Port başına birer implementasyon (adım 5'te iskelet) |

## Kapı — `process.env` denetimi

`lib/adapters/` içinde env okumasına izin verilen **tek yer** `mode.ts`'in
bayrak zinciridir. Live implementasyonlar müşteri anahtarını `provider_
credentials`'tan **parametre olarak** alır (§8.6), env'den değil.

```bash
find lib/adapters -name '*.ts' ! -name '*.test.ts' -print0 \
  | xargs -0 grep -hoE "process\.env\.[A-Z_]+|process\.env\[[^]]+\]" | sort -u
```

Beklenen çıktı — **tam olarak bu üç satır**, fazlası regresyondur:

```
process.env.APP_MODE
process.env.NODE_ENV
process.env[modeEnvVar(port)]
```

`NODE_ENV` bir yapılandırma değil, **ölü kod eleme kapısı**: geliştirme
çerezi ezmesi (§9.1 seviye 1) üretim bundle'ına girmesin diye (§11 S6).
Testler kapsam dışı — bayrak zincirini doğrulamanın yolu env'i yazmaktan
geçiyor.
