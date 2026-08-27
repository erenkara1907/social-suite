# `lib/server/` — Next/Supabase'e bağlı sunucu yardımcıları

BIRLESIM_PLANI §3 · doldurulacağı adım: **§12 adım 7, 12, 13, 19**

## Ne girer
`supabase/` (client, server, admin, config) · `auth.ts`
(`requireUser`/`requireBrand`) · `credentials.ts` (Vault'tan müşteri anahtarı) ·
`rate-limit.ts` · `queue.ts` · `storage.ts` (§4g köprüsü) · `actions/`

## Ne GİRMEZ
- Saf iş mantığı — o `lib/core/`'a ait
- React bileşeni

## Kural — service-role disiplini
Service-role RLS'i baypas eder. threadly'nin uyarısı aynen geçerli:
*"tek bir kaçak varsa her şey açılır."* Service-role **yalnızca üç yerde**
kullanılır ve kod incelemesinde bu denetlenir:

1. cron job'ları
2. OAuth callback'i (token yazımı)
3. `provider_credentials` / `channel_credentials` okuması

Diğer her sorgu anon key + kullanıcı cookie'si ile gider, yani RLS'ten geçer.

## `process.env` burada SERBEST
`lib/core/` ve `lib/providers/` env okuyamaz; **bu katman okuyabilir** ve
okumalıdır. Env'den gelen değerleri (Supabase URL/anahtarları, `CRON_SECRET`,
Instagram fallback kimlikleri) alıp aşağıdaki katmanlara **parametre** olarak
geçirmek tam olarak bu klasörün işidir.
