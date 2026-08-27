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
