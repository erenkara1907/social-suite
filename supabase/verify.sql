-- FAZ A doğrulama sorguları (BIRLESIM_PLANI §12 adım 2 kabul kriteri).
-- supabase/apply.sh --verify ile çalışır. Sır içermez, repoda durur.

\echo '════ 1. TABLOLAR (beklenen: 14) ════'
select table_name,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.table_name) as politika_sayisi,
       c.relrowsecurity as rls_acik
  from information_schema.tables t
  join pg_class c  on c.relname = t.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
 order by table_name;

\echo ''
\echo '════ 2. TABLO SAYISI ════'
select count(*) as tablo_sayisi,
       case when count(*) = 14 then 'OK' else 'BEKLENEN 14' end as sonuc
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';

\echo ''
\echo '════ 3. public POLİTİKALARI (beklenen: 12) ════'
select tablename, policyname, cmd, roles
  from pg_policies where schemaname = 'public'
 order by tablename, policyname;

\echo ''
\echo '════ 4. SIFIR POLİTİKALI TABLOLAR — RLS açık olmalı, politika 0 ════'
select c.relname as tablo,
       c.relrowsecurity as rls_acik,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename = c.relname) as politika_sayisi,
       case when c.relrowsecurity
             and (select count(*) from pg_policies p
                   where p.schemaname='public' and p.tablename = c.relname) = 0
            then 'OK — yalnızca service-role okur'
            else 'HATA' end as sonuc
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('channel_credentials','provider_credentials','rate_limit_counters')
 order by c.relname;

\echo ''
\echo '════ 5. CRON JOB''LARI (adım 21 FAZ A: apply.sh --set-cron-active DIŞINDA bu durum DEĞİŞMEMELİ) ════'
select jobid, jobname, schedule, active
  from cron.job where jobname like 'sm-%' order by jobname;

select count(*) as sm_job_sayisi,
       count(*) filter (where active) as aktif_sayisi,
       case when count(*) = 5 then 'OK — 5 job var (aktiflik CRON_AKTIVASYON.md''e göre kasıtlı)'
            else 'HATA — beklenen 5' end as sonuc
  from cron.job where jobname like 'sm-%';

\echo ''
\echo '════ 5b. CRON KALP ATIŞLARI (adım 21 FAZ A: son tetiklenme yaşı) ════'
select jobname, fired_at, now() - fired_at as yas
  from public.cron_heartbeats order by jobname;

\echo ''
\echo '════ 6. VAULT (çoğalma kontrolü: sm_cron_secret tam 1 satır) ════'
select name, count(*) as kayit_sayisi,
       case when count(*) = 1 then 'OK' else 'HATA — çoğaldı' end as sonuc
  from vault.secrets where name = 'sm_cron_secret' group by name;

\echo ''
\echo '════ 7. STORAGE BUCKET (çoğalma kontrolü: media tam 1) ════'
select id, public,
       (select count(*) from storage.buckets b2 where b2.id = 'media') as kayit_sayisi
  from storage.buckets where id = 'media';

select count(*) as media_bucket_politikasi
  from pg_policies where schemaname='storage' and tablename='objects'
   and policyname in ('own media upload','own media update','own media delete','public media read');

\echo ''
\echo '════ 8. FONKSİYONLAR ════'
select p.proname, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('owns_brand','cron_fire','claim_jobs','enqueue_job','rate_limit_hit',
                     'find_similar_content','handle_new_user','brand_latest_metrics')
 order by p.proname;

\echo ''
\echo '════ 9. jobs.kind CHECK — noop_test dahil mi (§12 adım 12) ════'
select conname, pg_get_constraintdef(oid) as tanim
  from pg_constraint
 where conrelid = 'public.jobs'::regclass and conname = 'jobs_kind_check';
