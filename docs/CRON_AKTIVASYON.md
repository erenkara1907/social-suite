# Cron aktivasyonu — çalıştırma rehberi

BIRLESIM_PLANI §12 adım 12 FAZ D. **Bu belge yalnızca dokümantasyondur —
hiçbir komut bu oturumda ÇALIŞTIRILMADI.** Cron job'lar hâlâ pasif
(`active=false`, 5/5 — doğrulama aşağıda).

---

## Bugünkü durum

```
$ psql "$SUPABASE_DB_URL" -c "select jobname, active from cron.job where jobname like 'sm-%' order by jobname;"
sm-metrics       | f
sm-publish       | f
sm-reaper        | f
sm-token-refresh | f
sm-worker        | f
```

5 job da `cron.schedule()` ile kuruldu (`00_schema.sql` §10) ama
`supabase/apply.sh`'ın varsayılanı (`CRON_ACTIVE=false`) yüzünden hepsi
`cron.alter_job(..., active := false)` ile kapatıldı. Gerekçe
(`supabase/README.md`): `NEXT_PUBLIC_APP_URL` bugün `http://localhost:3000`
— Supabase bulutu buraya erişemez, aktif bir job her tetiklenmede
`cron.job_run_details`'i bağlantı hatasıyla doldurur.

## Hangi job hangi sıklıkta neyi çağırıyor

| Job | Sıklık | Hedef | Rota var mı? (bugün) |
|---|---|---|---|
| `sm-worker` | `* * * * *` (dakikada bir) | `/api/cron/worker` | ✅ **var** (adım 12b) |
| `sm-publish` | `*/5 * * * *` (5 dakikada bir) | `/api/cron/publish` | ❌ yok (adım 17) |
| `sm-metrics` | `17 * * * *` (saat başı, :17) | `/api/cron/metrics` | ❌ yok (adım 18) |
| `sm-token-refresh` | `30 3 * * *` (günde bir, 03:30) | `/api/cron/tokens` | ❌ yok (adım 16/17) |
| `sm-reaper` | `*/10 * * * *` (10 dakikada bir) | `/api/cron/reaper` | ❌ yok (adım 17) |

**⚠ Beşi aynı anda aktive edilmemeli.** Bugün yalnızca `/api/cron/worker`
gerçek bir rota. Diğer dördü aktive edilirse hedefleri 404 döner ve
`cron.job_run_details` gürültüyle dolar — Faz C'nin "bir şey bozulduğunda
haberim olsun" görünürlüğünü anlamsızlaştırır (gerçek bir hatayı beklenen
404 gürültüsünden ayırt etmek zorlaşır). Her job'ı **kendi hedef rotası
yazıldığı adımda** tek tek aktive et (`cron.alter_job(<jobid>, active := true)`),
hepsini birden `CRON_ACTIVE=true` ile açma.

## `sm-worker`'ın 1 dakikalık sıklığı doğru mu?

**Evet — worker'ın kendi süre bütçesi tasarımı bunu zaten varsayıyor.**

`lib/server/jobs/worker.ts`:
- `TIME_BUDGET_MS = 45000` — 60 saniyelik cron aralığının **altında**,
  ~15 saniyelik güvenli pay bırakıyor. Normal koşulda bir çalışma bir
  sonraki tetiklemeyle asla ÇAKIŞMAZ.
- Çakışsa bile zararı yok: `claim_jobs()`'un `for update skip locked`'ı
  (adım 2, eşzamanlılık testiyle kanıtlı) iki çalışmanın aynı satırı almasını
  engelliyor — bkz. bu adımın Faz B doğrulaması ("2 eşzamanlı worker, 20 iş
  → 10/10 bölündü, `attempts>1` sıfır satır").
- İş süreleri arasındaki fark (`JOB_RETRY_POLICY`, `lib/core/jobs/types.ts`)
  worker'ın DAVRANIŞINI değil, İÇERİĞİNİ etkiliyor: hızlı işler (`media_poll`
  ~3sn, `embed_backfill` ~4sn) bir çalışmada onlarca kez işlenebilir; yavaş
  görünen `ugc_pipeline` (~180sn) aslında vendor render'ı BAŞLATIP hemen
  döner (dispatch deseni, §4d) — gerçek bekleme ayrı `media_poll` işlerinde,
  kısa tekrar tetiklemeler hâlinde yaşar. Yani hiçbir iş tipi worker'ı
  dakikalarca bloke etmek ZORUNDA değil; `PER_JOB_TIMEOUT_MS=20000` bunu
  zaten garanti ediyor.

**Sonuç:** 1 dakika kalsın. Daha sık (örn. 30sn) pg_net/PostgREST'e gereksiz
yük bindirir; daha seyrek (örn. 5dk) kullanıcının "onayla" sonrası ilk
işleyişinin görünür şekilde gecikmesine yol açar. Trafik gerçek verilerle
ölçülünce (adım 14+) gözden geçirilmeli — bugün kalibre edilmemiş bir
varsayım (§8.5'in genel uyarısı).

## Aktivasyon komutu (ADIM 17'DE, çalıştırılmadı)

`sm-worker`'ın hedefi zaten var — istenirse **yalnızca bu job** erken
aktive edilebilir (diğer dördü kendi rotaları yazılmadan AÇILMAMALI):

```bash
# 1. Gerçek domain .env.local'a yazılmalı (localhost Supabase bulutundan erişilemez)
#    NEXT_PUBLIC_APP_URL=https://<gerçek-domain>

# 2a. Yalnızca sm-worker (bu adımda hedefi var olan tek job):
psql "$SUPABASE_DB_URL" -c "
  select cron.alter_job(jobid, active := true)
    from cron.job where jobname = 'sm-worker';"

# 2b. Adım 17'de hepsi birden (tüm hedef rotalar yazıldıktan SONRA):
CRON_ACTIVE=true supabase/apply.sh
```

`apply.sh --verify` (veya `supabase/verify.sql`'in 5. bölümü) her ikisinden
sonra da durumu doğrulamak için kullanılabilir.
