# `supabase/`

BIRLESIM_PLANI §5 · uygulanacağı adım: **§12 adım 2**

## Ne girer
- `00_schema.sql` — birleşik şemanın **tamamı**, tek dosya, idempotent

## Ne GİRMEZ
- Numaralı migration zinciri (`0001_`, `0002_`…). Üç projenin ayrı zincirleri
  birleştirildi; ürün henüz canlıya çıkmadığı için tek dosya doğru biçim.
  İlk canlı dağıtımdan **sonra** eklenen her değişiklik migration olur.
- Gerçek sır. Dosya `__APP_URL__` ve `__CRON_SECRET__` placeholder'ları
  taşır; gerçek değerler Vault'a ve env'e girer, dosyaya **girmez** (§10/13).

## Uygulama
Dosya baştan sona **iki kez** çalıştırıldığında hata vermemeli
(`create ... if not exists`, `drop policy if exists`). Bu, kısmi bir
uygulamadan sonra baştan çalıştırmayı güvenli kılar.

## `apply.sh` — sırrı repoya yazmadan uygulama

```
supabase/apply.sh            # uzantılar + şema + cron etkinliği + doğrulama
supabase/apply.sh --verify   # yalnızca doğrulama sorguları (verify.sql)
```

`.env.local`'dan `SUPABASE_DB_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`
okunur. `__APP_URL__` / `__CRON_SECRET__` yalnızca **uygulama anında**, 0600
izinli geçici bir dosyada yerine konur; dosya psql bittiğinde silinir.
`00_schema.sql` placeholder'lı hâliyle repoda kalır — `grep __CRON_SECRET__`
her zaman eşleşmelidir.

## ⚠ Cron job'ları PASİF kuruluyor (`CRON_ACTIVE=false`)

`cron_fire()` `NEXT_PUBLIC_APP_URL || path` adresine `pg_net` ile istek atar.
Bu adres geliştirmede `http://localhost:3000` — **Supabase bulutundan
erişilemez**. Aktif bırakılırsa beş job (`sm-worker` dakikada bir) her
tetiklenmede bağlantı hatası üretir ve `cron.job_run_details` dolar.

Bu yüzden `apply.sh` job'ları `cron.schedule` ile **oluşturur**, sonra
`cron.alter_job(..., active := false)` ile **kapatır**. Varsayılan
`CRON_ACTIVE=false`.

Aktifleştirme **§12 adım 17**'de (LIVE #3 — yayın), gerçek domain hazır olunca:

```
NEXT_PUBLIC_APP_URL=https://<gerçek-domain>   # .env.local
CRON_ACTIVE=true supabase/apply.sh
```

`cron_fire()` `create or replace` olduğu için yeniden uygulama URL'i tazeler.
