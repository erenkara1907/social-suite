# `lib/core/` — saf iş mantığı

BIRLESIM_PLANI §3 · doldurulacağı adım: **§12 adım 4**

## Ne girer
Next.js'e, veritabanına ve HTTP'ye **bağımsız** saf TypeScript:
`types.ts` (üç projenin tip birleşimi) · `plan/` · `ai/` · `brand/` ·
`derive/` · `tz.ts` · `publishing.ts` · `dedupe/` · `insights/`

⚠ `providers/` (kie, elevenlabs, fal) da **buranın altında** — §7.1 onları
`lib/providers/` diye adreslemişti, adım 3-4 oturumu `lib/core/providers/`
dedi ve o uygulandı. Sağlayıcılar `fetch` yapar (aşağıdaki istisna), ama
ortam değişkeni okumaz: anahtar her zaman parametredir.

## Ne GİRMEZ
- `import ... from "next/..."` — hiçbir Next API'si
- `@supabase/...` — hiçbir DB istemcisi
- `process.env` — **hiçbir env okuması.** Müşterinin anahtarı parametre olarak
  gelir; env okuyan bir dosya "müşteri kendi anahtarını girer" maddesini kırar
  (§8.6).
- `fetch` ile dış servis çağrısı — **yalnızca** `providers/` altında;
  `core`'un geri kalanı saf hesap

## Kabul kriteri (§12 adım 4 · CI'da tekrarlanabilir)

Aşağıdaki komut **sıfır satır** döndürmeli. Kapsam `*.ts`/`*.tsx` ile
sınırlı — bu README yasak listesini metin olarak sayıyor, kendisi ihlal
değil; kapsamsız grep bu dosyanın kendisini yakalar ve kapıyı kullanılamaz
hâle getirir.

```bash
grep -rn "process\.env\|next/\|@supabase/" lib/core/ --include='*.ts' --include='*.tsx'
```

## Kural
Buradaki her dosya **test edilebilir olmalı**: girdi al, çıktı ver, yan etki
yapma. Test edilemiyorsa yanlış katmandadır.
