# `lib/providers/` — dış servis istemcileri

BIRLESIM_PLANI §3 · doldurulacağı adım: **§12 adım 14, 16, 19, 20**

## Ne girer
Tek sorumluluk: **HTTP**. `kie.ts` · `elevenlabs.ts` · `fal.ts` ·
`anthropic.ts` · `instagram/` (config, oauth, publish, tokens) · `embedding.ts`

## Ne GİRMEZ
- **`process.env` ile anahtar okuma.** Her istemci `apiKey`'i **parametre**
  olarak alır (§8.6). sahne'nin `kie.ts:51`'i env okuyordu — taşınırken
  düzeltilecek. Bu, D2 gereği Instagram app id/secret için de geçerli:
  `config.ts` `process.env` okumaz, `resolveInstagramConfig(brandId)`'den gelen
  nesneyi alır (env yalnızca fallback, ve o fallback `lib/server/`'da okunur).
- Import-time singleton. `fal.config()` modül yüklenirken çağrılıyordu; istek
  başına client'a çevrilecek.
- İş kararı. "Bu içerik tekrar mı?" sorusu `lib/core/dedupe/`'un işi.

## Kural
Bir provider dosyası, hangi markanın adına çağrı yaptığını **bilmez**. Ona
anahtar verilir, o çağrıyı yapar, sonucu döndürür.
