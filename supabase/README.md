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

## Cron job'ları — yeni kurulumda PASİF, mevcut kurulumda DOKUNULMAZ

`cron_fire()` `NEXT_PUBLIC_APP_URL || path` adresine `pg_net` ile istek atar.
Bu adres geliştirmede `http://localhost:3000` — **Supabase bulutundan
erişilemez**. Aktif bırakılırsa beş job (`sm-worker` dakikada bir) her
tetiklenmede bağlantı hatası üretir ve `cron.job_run_details` dolar.

⚠ **Adım 21 FAZ A ile değişti.** Eskiden `apply.sh` her çalıştırmada beş
job'ı da `cron.schedule` ile **yeniden kurar** ve `cron.alter_job(...,
active := $CRON_ACTIVE)` ile **ezerdi** — üretimde dönen bir kurulumda
sonraki bir `apply.sh` çalıştırması cron'u sessizce kapatabiliyordu
(ADIM_18 varsayım 6). Artık `00_schema.sql` mevcut bir job'ın `active`
durumunu OLDUĞU GİBİ korur; `apply.sh` cron'a **yalnızca** açık bir bayrakla
dokunur:

```
supabase/apply.sh                          # uygula — cron durumuna DOKUNMAZ
supabase/apply.sh --set-cron-active=true    # uygula + tüm sm-% job'ları aktive et
supabase/apply.sh --set-cron-active=false   # uygula + tüm sm-% job'ları pasive et
```

İlk kurulumda (job hiç yoksa) varsayılan yine PASİF — yukarıdaki gerekçe
(localhost erişilemezliği) geçerliliğini koruyor. Bayrak, mevcut BİR job'ın
durumunu BİLİNÇLİ olarak toptan değiştirmek içindir (§12 adım 17 gibi ilk
canlıya alma anlarında); günlük `apply.sh` çalıştırmaları bayraksız kalmalı.

`cron_fire()` `create or replace` olduğu için yeniden uygulama URL'i tazeler.
Her tetiklenmede `public.cron_heartbeats`'e de yazar — `/api/cron/health`
(`CRON_SECRET` gerekir) bunun yaşını okuyup cron'un sessizce durmasını
görünür kılar (`docs/CRON_AKTIVASYON.md`).
