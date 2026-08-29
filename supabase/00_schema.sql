-- ─────────────────────────────────────────────────────────────────────────────
--  BİRLEŞİK ŞEMA — AI Social Media Management (sahne + siraya + threadly)
--
--  Taslak. Supabase → SQL Editor'e tek parça yapıştırılacak şekilde yazıldı;
--  her ifade idempotent (yeniden çalıştırılabilir).
--
--  Türetildiği kaynaklar:
--    siraya/supabase/schema.sql         → profiles, channels, activity, metrikler, RLS deseni
--    siraya/supabase/003-instagram.sql  → channel_credentials (RLS açık + sıfır politika), media bucket
--    threadly/.../0001_plans.sql        → plans, plan_posts
--    threadly/.../0002_brands.sql       → brands
--    sahne/lib/server/personas.ts       → personas (JSON registry yerine tablo)
--    sahne/lib/server/kie.ts            → media_jobs (vendor task id + kredi maliyeti)
--
--  TASARIM KARARLARI (gerekçeleri BIRLESIM_PLANI.md §4'te):
--   1. Enum yok. Postgres enum yerine text + CHECK (threadly deseni). Gerekçe:
--      platform ve durum listesi bu üründe sık değişecek; CHECK tek migration'da
--      transaction içinde drop+add edilir, enum edilemez.
--   2. Sahiplik brand_id üzerinden. Her içerik satırı bir markaya bağlı; RLS
--      owns_brand() üzerinden çalışır. Organizasyon katmanı geldiğinde sadece
--      brands.owner_id → org üyeliği değişir, çocuk tablolara dokunulmaz.
--   3. posts + plan_posts TEK tabloda: content_items. Fikirden yayına tek kimlik.
--   4. Yayın durumu (status) ile medya üretim durumu (media_jobs.state) ayrı.
--   5. parent_id INSERT'ten sonra değiştirilemez → döngü yapısal olarak imkânsız.
--
--  REVİZYON 1 (BIRLESIM_PLANI REVİZYON KAYDI, 2026-08-27):
--   D1. content_metrics geri beslemesi 'final'e bağlı DEĞİL — içerik başına
--       EN SON mevcut ölçüm okunur, 'h6' hariç. §6'ya feedback indeksi ve
--       brand_latest_metrics() yardımcısı eklendi. UNIQUE final indeksi korundu.
--   D2. provider_credentials Instagram uygulama kimliğini de taşır:
--       provider listesine 'instagram' eklendi, gizli olmayan yapılandırma için
--       config jsonb açıldı, vault_secret_id nullable oldu.
--   D3. content_items.embedding vector(1024) SABİT — sağlayıcıya bağlı değil.
--       EmbeddingPort implementasyonu tam 1024 boyut döndürmek zorunda.
--
--  İDEMPOTENS
--  Dosya baştan sona İKİ KEZ çalıştırıldığında hata vermez. Bunun için:
--    · create table / index if not exists      → yeni kurulum
--    · alter table ... add column if not exists → mevcut kurulumu yakınsatır
--    · CHECK kısıtları drop + add ile tazelenir → liste değişikliği uygulanır
--    · drop policy if exists → create policy    → politika yeniden yazılır
--    · drop trigger if exists → create trigger  → tetikleyici yeniden yazılır
--  "create table if not exists" TEK BAŞINA yeterli DEĞİLDİR: tablo eski
--  şekliyle zaten varsa yeni kolonu eklemez. Bu yüzden §1'de ve §6'da açık
--  yakınsama blokları var.
-- ─────────────────────────────────────────────────────────────────────────────

/* ── Uzantılar ───────────────────────────────────────────────────────────── */
create extension if not exists pgcrypto;      -- gen_random_uuid
create extension if not exists vector;        -- anlamsal tekrar kontrolü (§4c)
create extension if not exists pg_cron;       -- zamanlayıcı (siraya/004-cron.sql)
create extension if not exists pg_net;        -- cron → HTTP


-- ═════════════════════════════════════════════════════════════════════════════
--  1. KİMLİK VE SAHİPLİK
-- ═════════════════════════════════════════════════════════════════════════════

/* ── profiles — siraya/schema.sql:24-29 ──────────────────────────────────── */
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  timezone     text not null default 'Europe/Istanbul',
  locale       text not null default 'tr' check (locale in ('tr', 'en')),
  created_at   timestamptz not null default now()
);

-- siraya/schema.sql:32-53 — e-posta kaydı display_name, OAuth full_name/name gönderir.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ── touch_updated_at — siraya/schema.sql:105-108 ────────────────────────── */
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;


/* ── brands — threadly/0002_brands.sql:12-27 ─────────────────────────────────
   DEĞİŞİKLİK: user_id UNIQUE kısıtı KALDIRILDI (§4e). Bir hesap birden çok
   markayı yönetebilir. org_id şimdilik boş duruyor; organizasyon katmanı
   geldiğinde owns_brand() gövdesi değişir, bu tablo ve çocukları değişmez. */
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  org_id      uuid,                                   -- FAZ 3 rezervi, bugün null
  name        text not null,
  industry    text not null default '',
  description text not null default '',
  products    text not null default '',
  audience    text not null default '',
  voice       text not null default '',
  keywords    text not null default '',
  links       text not null default '',
  -- threadly/lib/brand/types.ts:127 toPromptBlock() bu 8 alanı okur.
  timezone    text not null default 'Europe/Istanbul',
  -- adım 10 A1 — İÇERİK dili, ARAYÜZ dili değil. Müşteri İngilizce arayüzle
  -- Türkçe içerik üretebilir; bu yüzden localStorage'daki `sm:lang` tercihi
  -- (istemci, SSR'ın bilemediği) değil, markanın kendi özelliği bu kolon
  -- karar veriyor. `toPromptBlock` bunu istem bloğuna taşıyor; adım 14'ün
  -- PlannerPort/CopyPort.live'ı bunu okuyacak.
  content_language text not null default 'tr',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

/* Yakınsama — brands tablosu eski şekliyle zaten varsa (create table if not
   exists onu olduğu gibi bırakır) content_language'i ekler ve CHECK'ini
   tazeler. provider_credentials'taki D2 deseninin aynısı (yukarıda). */
alter table public.brands
  add column if not exists content_language text not null default 'tr';

alter table public.brands
  drop constraint if exists brands_content_language_check;
alter table public.brands
  add constraint brands_content_language_check check (content_language in ('tr', 'en'));

create index if not exists brands_owner_idx on public.brands (owner_id, created_at desc);

drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();

/* ── owns_brand — TÜM RLS politikalarının tek dayanağı ────────────────────────
   SECURITY DEFINER: brands üzerindeki RLS'i atlar, böylece çocuk tabloların
   politikaları özyinelemeli RLS'e girmez. Organizasyon katmanı bu fonksiyonun
   GÖVDESİNİ değiştirerek eklenir — politikalar olduğu gibi kalır. */
create or replace function public.owns_brand(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.brands b
    where b.id = target and b.owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_brand(uuid) from public;
grant execute on function public.owns_brand(uuid) to authenticated;


/* ── provider_credentials — MÜŞTERİNİN KENDİ SAĞLAYICI KİMLİKLERİ ────────────
   Ürün tanımı: "Müşteri kendi API anahtarlarını girer, maliyeti kendi öder."

   GİZLİ değer BURADA DEĞİL, Supabase Vault'ta durur; tablo yalnızca
   vault_secret_id taşır. İki kat koruma.

   ⭐ D2 — Instagram uygulama kimliği de bu tabloda.
   Önceki tasarım INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET'ı global env sayıyordu.
   Bu, App Review çıktığında ya da bir müşteri kendi Meta uygulamasını
   getirdiğinde şema migration'ı gerektirirdi. Artık marka bazlı okunur; env
   YALNIZCA fallback (markanın satırı yoksa).

   İki alanlı olmasının sebebi: bir sağlayıcı kimliğinin bazı parçaları gizli
   DEĞİLDİR. Instagram'ın app id'si açık bir client id; app secret'ı gizli.
     config          → gizli OLMAYAN yapılandırma (app_id, redirect_uri, api_version)
     vault_secret_id → gizli değer (app_secret / api key)
   Bu yüzden vault_secret_id NULLABLE: yalnızca yapılandırma taşıyan bir
   sağlayıcı satırı gizli değer olmadan var olabilir.

   Marka başına birden çok sağlayıcı desteklenir: unique (brand_id, provider).
   Yani bir marka aynı anda anthropic + kie + fal + instagram satırı taşır.

   RLS AÇIK + SIFIR POLİTİKA (siraya/003-instagram.sql:37 deseni): hiçbir
   tarayıcı oturumu bu tabloyu okuyamaz, yalnızca service-role erişir. */
create table if not exists public.provider_credentials (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  provider        text not null,                  -- CHECK aşağıda, tazelenebilir
  vault_secret_id uuid,                           -- vault.secrets.id · gizli değer (D2: nullable)
  config          jsonb not null default '{}'::jsonb,  -- D2: gizli OLMAYAN yapılandırma
  label           text not null default '',       -- "Ana hesap" gibi kullanıcı etiketi
  last_verified_at timestamptz,
  last_error      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (brand_id, provider)
);

/* Yakınsama — tablo eski şekliyle zaten varsa (create table if not exists onu
   olduğu gibi bırakır) D2'nin kolonlarını ekler ve kısıtlarını tazeler. */
alter table public.provider_credentials
  add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.provider_credentials
  alter column vault_secret_id drop not null;

-- CHECK listesi tazelenir: 'instagram' D2 ile eklendi. Enum yerine CHECK
-- seçilmesinin (§1.2) somut kazancı tam olarak bu iki satır.
alter table public.provider_credentials
  drop constraint if exists provider_credentials_provider_check;
alter table public.provider_credentials
  add constraint provider_credentials_provider_check check (provider in (
    'anthropic', 'kie', 'elevenlabs', 'fal', 'openai', 'voyage', 'instagram'
  ));

create index if not exists provider_credentials_brand_idx
  on public.provider_credentials (brand_id) where is_active;

-- §12 adım 13 FAZ B — ekranda gösterilecek maskeli önizleme ("sk-...4a2f").
-- Yazma anında hesaplanır, GİZLİ DEĞİL (Vault'taki değere geri dönüşü yok) —
-- bu yüzden ayrı bir kolon: masked_hint'i okumak asla decrypt gerektirmez.
alter table public.provider_credentials
  add column if not exists masked_hint text not null default '';

drop trigger if exists provider_credentials_touch on public.provider_credentials;
create trigger provider_credentials_touch before update on public.provider_credentials
  for each row execute function public.touch_updated_at();

alter table public.provider_credentials enable row level security;
-- Politika YOK. Bilinçli. Dört SECURITY DEFINER fonksiyonu bu tabloya
-- tarayıcının TEK erişim yolu (aşağıda, §12 adım 13 FAZ B):
--   set_provider_credential / delete_provider_credential / list_provider_credentials
--     → auth.uid() + owns_brand() ile doğrulanır, `authenticated`'a GRANT edilir
--       (enqueue_job'un deseni). İkisi de RAW gizli değeri asla DÖNDÜRMEZ.
--   get_provider_secret
--     → yalnızca service-role çağırabilir (authenticated'dan REVOKE), RAW
--       gizli değeri döndüren TEK fonksiyon — adım 14+'in sağlayıcı
--       çağrılarından önce anahtarı çözmek için (lib/server/credentials.ts).

/* ── Vault yazma/okuma — §12 adım 13 FAZ B ───────────────────────────────────
   Vault fonksiyonları (`vault.create_secret` vb.) PostgREST'in dışa açtığı
   şemalarda DEĞİL (yalnızca `public`) — bu yüzden tarayıcı/servis-rolü onları
   doğrudan `.rpc()` ile çağıramaz. Aşağıdaki `public.*` sarmalayıcılar hem bu
   köprüyü kurar hem de RAW gizli değerin hangi fonksiyondan çıkabileceğini
   TEK noktaya indirger (yalnızca `get_provider_secret`). */

-- Yazma — kullanıcının KENDİ oturumuyla çağrılır (enqueue_job deseni).
-- p_secret boş/null verilirse yalnızca config/label güncellenir, gizli
-- değere DOKUNULMAZ (örn. yalnızca etiketi değiştirmek için).
create or replace function public.set_provider_credential(
  p_brand_id uuid,
  p_provider text,
  p_secret   text default null,
  p_config   jsonb default null,
  p_label    text default null
) returns table (
  id uuid, provider text, masked_hint text, label text,
  is_active boolean, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_existing public.provider_credentials;
  v_secret_id uuid;
  v_masked   text;
begin
  if p_brand_id is null or not public.owns_brand(p_brand_id) then
    raise exception 'set_provider_credential: marka sahibi değil' using errcode = '42501';
  end if;
  if p_provider not in ('anthropic', 'kie', 'elevenlabs', 'fal', 'openai', 'voyage', 'instagram') then
    raise exception 'set_provider_credential: bilinmeyen sağlayıcı: %', p_provider using errcode = '23514';
  end if;

  -- ⚠ Fonksiyonun RETURNS TABLE'ı "provider" adında bir OUT parametresi
  -- (dolayısıyla örtük bir plpgsql değişkeni) tanımlıyor — bare "provider"
  -- burada tablo sütunuyla ÇAKIŞIR (42702). Bu yüzden sorgu takma adla
  -- (pc.) yazıldı; fonksiyonun geri kalanında OUT parametreler yalnızca
  -- son `return query`'de (zaten takma adlı) kullanılıyor.
  select pc.* into v_existing from public.provider_credentials pc
   where pc.brand_id = p_brand_id and pc.provider = p_provider;

  if p_secret is not null and length(p_secret) > 0 then
    v_masked := case
      when length(p_secret) <= 4 then repeat('•', length(p_secret))
      else left(p_secret, 3) || '…' || right(p_secret, 4)
    end;

    if v_existing.vault_secret_id is not null then
      perform vault.update_secret(v_existing.vault_secret_id, p_secret);
      v_secret_id := v_existing.vault_secret_id;
    else
      v_secret_id := vault.create_secret(
        p_secret,
        'pc_' || p_brand_id::text || '_' || p_provider,
        'provider_credentials: ' || p_provider || ' / brand ' || p_brand_id::text
      );
    end if;
  else
    -- Gizli değer verilmedi: mevcut vault_secret_id/masked_hint korunur.
    v_secret_id := v_existing.vault_secret_id;
    v_masked := coalesce(v_existing.masked_hint, '');
  end if;

  insert into public.provider_credentials as pc
    (brand_id, user_id, provider, vault_secret_id, masked_hint, config, label)
  values
    (p_brand_id, auth.uid(), p_provider, v_secret_id, v_masked,
     coalesce(p_config, v_existing.config, '{}'::jsonb),
     coalesce(p_label, v_existing.label, ''))
  -- ⚠ `on conflict (brand_id, provider)` YAZILAMAZ — sütun listesi biçimi
  -- de "provider" OUT parametresiyle aynı 42702 çakışmasına düşüyor
  -- (canlıda ölçüldü). Kısıt ADI takma ad gerektirmez, çakışmaz.
  on conflict on constraint provider_credentials_brand_id_provider_key do update set
    vault_secret_id = excluded.vault_secret_id,
    masked_hint      = excluded.masked_hint,
    config            = excluded.config,
    label             = excluded.label;

  return query
    select pc.id, pc.provider, pc.masked_hint, pc.label, pc.is_active, pc.updated_at
      from public.provider_credentials pc
     where pc.brand_id = p_brand_id and pc.provider = p_provider;
end $$;

revoke all on function public.set_provider_credential(uuid, text, text, jsonb, text) from public;
grant execute on function public.set_provider_credential(uuid, text, text, jsonb, text) to authenticated;

-- Silme — vault satırı da gider, provider_credentials satırı yetim vault
-- kaydı BIRAKMAZ.
create or replace function public.delete_provider_credential(
  p_brand_id uuid, p_provider text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
  v_deleted   boolean;
begin
  if p_brand_id is null or not public.owns_brand(p_brand_id) then
    raise exception 'delete_provider_credential: marka sahibi değil' using errcode = '42501';
  end if;

  select vault_secret_id into v_secret_id from public.provider_credentials
   where brand_id = p_brand_id and provider = p_provider;

  delete from public.provider_credentials
   where brand_id = p_brand_id and provider = p_provider;
  v_deleted := found;

  if v_deleted and v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return v_deleted;
end $$;

revoke all on function public.delete_provider_credential(uuid, text) from public;
grant execute on function public.delete_provider_credential(uuid, text) to authenticated;

-- Listeleme — /settings ekranı bunu çağırır. RAW gizli değer YOK, yalnızca
-- masked_hint ve gizli OLMAYAN alanlar.
create or replace function public.list_provider_credentials(p_brand_id uuid)
returns table (
  provider text, masked_hint text, label text, config jsonb,
  is_active boolean, last_verified_at timestamptz, last_error text, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if p_brand_id is null or not public.owns_brand(p_brand_id) then
    raise exception 'list_provider_credentials: marka sahibi değil' using errcode = '42501';
  end if;

  return query
    select pc.provider, pc.masked_hint, pc.label, pc.config,
           pc.is_active, pc.last_verified_at, pc.last_error, pc.updated_at
      from public.provider_credentials pc
     where pc.brand_id = p_brand_id;
end $$;

revoke all on function public.list_provider_credentials(uuid) from public;
grant execute on function public.list_provider_credentials(uuid) to authenticated;

-- Çözme — adım 14+'in sağlayıcı çağrılarından ÖNCE RAW anahtarı okur. Yalnızca
-- service-role (authenticated'dan REVOKE) — lib/server/credentials.ts'in TEK
-- çağırdığı fonksiyon. owns_brand() kontrolü YOK: çağıran zaten sunucu
-- kodudur (auth.uid() burada set değil, service-role bypass eder) — claim_jobs/
-- rate_limit_hit ile aynı "sistem içi, RLS'in dışında" sınıf.
create or replace function public.get_provider_secret(p_brand_id uuid, p_provider text)
returns table (secret text, config jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
  v_config    jsonb;
begin
  select vault_secret_id, config into v_secret_id, v_config
    from public.provider_credentials
   where brand_id = p_brand_id and provider = p_provider and is_active;

  if v_secret_id is null then
    return query select null::text, coalesce(v_config, '{}'::jsonb);
    return;
  end if;

  return query
    select ds.decrypted_secret, coalesce(v_config, '{}'::jsonb)
      from vault.decrypted_secrets ds
     where ds.id = v_secret_id;
end $$;

revoke all on function public.get_provider_secret(uuid, text) from public, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
--  2. KANALLAR VE TOKEN'LAR
-- ═════════════════════════════════════════════════════════════════════════════

/* ── channels — siraya/schema.sql:69-80 + 003-instagram.sql:40-41 ────────────
   DEĞİŞİKLİK: user_id yerine brand_id + user_id (RLS ve depolama yolu için). */
create table if not exists public.channels (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands on delete cascade,
  user_id             uuid not null references auth.users on delete cascade,
  platform            text not null check (platform in
                        ('instagram', 'x', 'linkedin', 'tiktok', 'youtube')),
  handle              text not null,
  external_account_id text,                       -- Instagram user id
  username            text,
  followers           integer not null default 0,
  growth              numeric(6,2) not null default 0,   -- % / 30 gün
  engagement          numeric(6,2) not null default 0,   -- ortalama %
  is_connected        boolean not null default false,
  last_synced_at      timestamptz,                -- metrik toplayıcı doldurur
  created_at          timestamptz not null default now(),
  unique (brand_id, platform, handle)             -- callback upsert bu kısıta dayanır
);

create index if not exists channels_brand_idx on public.channels (brand_id);

/* ── channel_credentials — siraya/003-instagram.sql:15-25 (birebir) ───────── */
create table if not exists public.channel_credentials (
  channel_id          uuid primary key references public.channels on delete cascade,
  user_id             uuid not null references auth.users on delete cascade,
  provider            text not null default 'instagram',
  external_account_id text not null,
  access_token        text not null,              -- uzun ömürlü, 60 gün
  refresh_token       text,                       -- IG kullanmaz; LinkedIn/TikTok kullanır
  token_expires_at    timestamptz,
  last_refreshed_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists channel_credentials_user_idx
  on public.channel_credentials (user_id);
-- Bağımsız token tazeleme job'ı "yakında ne ölüyor?" diye sorar (siraya §12 eksiği).
create index if not exists channel_credentials_expiry_idx
  on public.channel_credentials (token_expires_at);

drop trigger if exists channel_credentials_touch on public.channel_credentials;
create trigger channel_credentials_touch before update on public.channel_credentials
  for each row execute function public.touch_updated_at();

alter table public.channel_credentials enable row level security;
-- Politika YOK — siraya/003-instagram.sql:37. Bilinçli.


-- ═════════════════════════════════════════════════════════════════════════════
--  3. PERSONALAR VE MEDYA
-- ═════════════════════════════════════════════════════════════════════════════

/* ── personas — sahne/lib/server/personas.ts:28-38 (JSON registry yerine) ──── */
create table if not exists public.personas (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null default '',
  prompt          text not null,                  -- kareyi üreten sahne prompt'u
  image_asset_id  uuid,                           -- → media_assets (FK aşağıda)
  source_task_id  text,                           -- Nano Banana task id, izlenebilirlik
  default_voice_id text,                          -- ElevenLabs voice id
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists personas_brand_idx
  on public.personas (brand_id) where not is_archived;

/* ── media_assets — KALICI depolanmış çıktı ──────────────────────────────────
   Sahne bugün Kie'nin GEÇİCİ URL'ini kullanıyor (KESIF_SAHNE §4 "Önemli mimari
   not"). Bu tablo o köprünün kalıcı ucu: dosya Supabase Storage'a indirilir,
   public URL burada tutulur, yayıncı bunu media_url olarak okur. */
create table if not exists public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  kind          text not null check (kind in ('image', 'video', 'audio')),
  -- media/<user_id>/<brand_id>/<kind>/<id>.<ext> — siraya'nın klasör politikası
  -- (003-instagram.sql:57) ilk segmente bakar, o yüzden user_id başta kalmalı.
  storage_path  text not null unique,
  public_url    text not null,
  mime_type     text not null default '',
  bytes         bigint not null default 0,
  width         integer,
  height        integer,
  duration_ms   integer,                          -- video/ses
  source_vendor text check (source_vendor in ('kie', 'fal', 'elevenlabs', 'upload')),
  source_url    text,                             -- indirildiği geçici vendor URL'i
  created_at    timestamptz not null default now()
);

create index if not exists media_assets_brand_idx
  on public.media_assets (brand_id, created_at desc);

alter table public.personas
  drop constraint if exists personas_image_asset_fk;
alter table public.personas
  add constraint personas_image_asset_fk
  foreign key (image_asset_id) references public.media_assets (id) on delete set null;


-- ═════════════════════════════════════════════════════════════════════════════
--  4. PLANLAR VE İÇERİK — ürünün merkezi
-- ═════════════════════════════════════════════════════════════════════════════

/* ── plans — threadly/0001_plans.sql:9-23 + brand_id ─────────────────────── */
create table if not exists public.plans (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  title        text not null,
  theme        text not null,
  horizon_days int  not null check (horizon_days in (7, 30)),
  lang         text not null check (lang in ('tr', 'en')),
  start_date   date not null default current_date,
  mode         text not null default 'weekly' check (mode in ('weekly', 'auto')),
  -- Metrik geri beslemesi: bu plan hangi analiz penceresinden üretildi (§4f, Akış D)
  insight_snapshot jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists plans_brand_created_idx
  on public.plans (brand_id, created_at desc);


/* ─────────────────────────────────────────────────────────────────────────────
   content_items — threadly.plan_posts + siraya.posts TEK TABLODA

   Birleşik durum makinesi (§4a):

     idea ──► draft ──► needs_review ──► scheduled ──► publishing ──► published
       │        │            │               │              │             │
       │        │            └── (revizyon) ─┘              ▼             ▼
       │        │                                        failed      archived
       └────────┴──────────────► archived (üretilmedi, ama tekrar hafızasında kalır)

   - idea         : AI iskeleti üretti, gövde yok            (threadly)
   - draft        : caption yazıldı                          (her ikisi)
   - needs_review : kullanıcı onayı bekliyor                 (siraya)
   - scheduled    : onaylı + scheduled_at dolu + platform yayınlanabilir
   - publishing   : cron satırı KİLİTLEDİ — çifte yayın kalkanı (siraya §14 eksiği)
   - published    : yayında                                  (her ikisi)
   - failed       : yayın denendi, hata var                  (siraya)
   - archived     : üretilmeyecek; tekrar kontrolü için saklanır (YENİ)
   ───────────────────────────────────────────────────────────────────────── */
create table if not exists public.content_items (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  plan_id      uuid references public.plans on delete set null,
  channel_id   uuid references public.channels on delete set null,

  /* ── ne, nerede, ne zaman ─────────────────────────────────────────────── */
  platform     text not null check (platform in
                 ('instagram', 'x', 'linkedin', 'tiktok', 'youtube')),
  -- DİKKAT: threadly 'X' | 'LinkedIn' | 'Instagram' (PascalCase) kullanıyordu.
  -- Burada küçük harf kanonik; görünen etiketler TS tarafında (channelMeta).
  kind         text not null default 'text' check (kind in
                 ('text', 'thread', 'carousel', 'image', 'video', 'story', 'reels')),
  -- Instagram Graph'ın beklediği değer; siraya/003-instagram.sql:45 media_type
  media_type   text not null default 'IMAGE' check (media_type in
                 ('IMAGE', 'VIDEO', 'REELS', 'STORIES', 'CAROUSEL')),

  /* ── plan koordinatları (threadly/0001_plans.sql:29-31) ───────────────── */
  day_offset   int check (day_offset >= 0),
  time_of_day  text,                              -- "09:00" — plan ızgarası
  scheduled_at timestamptz,                       -- gerçek yayın anı (UTC)
  published_at timestamptz,
  is_best_time boolean not null default false,

  /* ── metin (threadly + siraya birleşimi) ──────────────────────────────── */
  title        text not null,
  hook         text not null default '',
  body         text not null default '',
  hashtags     text not null default '',

  /* ── medya ────────────────────────────────────────────────────────────── */
  primary_media_id uuid references public.media_assets on delete set null,
  media_url    text,                              -- yayın anında dondurulan public URL

  /* ── durum ────────────────────────────────────────────────────────────── */
  status       text not null default 'idea' check (status in
                 ('idea', 'draft', 'needs_review', 'scheduled',
                  'publishing', 'published', 'failed', 'archived')),
  external_post_id text,                          -- platformun kendi id'si
  failure_error    text,
  attempt_count    int not null default 0,
  last_attempt_at  timestamptz,
  locked_at        timestamptz,                   -- 'publishing' kilidinin zamanı
  locked_by        text,                          -- cron çalışma kimliği

  /* ── DEVAM ZİNCİRİ (§4b) ──────────────────────────────────────────────────
     parent_id INSERT'ten sonra DEĞİŞTİRİLEMEZ (trigger aşağıda). Yeni satır
     yalnızca var olan bir satırı gösterebildiği için graf yapısal olarak
     döngüsüzdür — ayrıca bir döngü tarayıcısına gerek yoktur.
     root_id denormalize: tüm zincir tek indeksli sorguda gelir, recursive CTE yok. */
  parent_id      uuid references public.content_items (id) on delete set null,
  root_id        uuid,
  chain_position int not null default 1 check (chain_position between 1 and 12),
  continuation_note text not null default '',     -- "A'nın X özelliğine atıf yapar"

  /* ── TEKRAR ÖNLEME (§4c) ──────────────────────────────────────────────────
     fingerprint: normalize edilmiş (küçük harf, noktalama/emoji/hashtag atılmış)
       title + hook üzerinden sha256. Birebir tekrarın ucuz kalkanı.
     embedding : anlamsal benzerlik.

     ⭐ D3 — vector(1024) SABİT. Sağlayıcıya bağlı DEĞİL.
     Önceki tasarım kolon tipini sağlayıcı seçimine bağlıyordu ("OpenAI
     seçilirse 1536 olur"). Bağımlılığın yönü çevrildi: KOLON SÖZLEŞMEDİR,
     SAĞLAYICI ONA UYAR. EmbeddingPort implementasyonu — Voyage, OpenAI ya da
     başkası — tam 1024 boyut döndürmek zorundadır; daha yüksek boyut üreten
     bir model çıktısını API parametresiyle 1024'e indirir.
     Adapter dönen uzunluğu çalışma zamanında doğrular ve 1024 değilse hata
     fırlatır — yanlış boyutlu vektör DB'ye ulaşmadan durur.
     Sağlayıcı değişimi artık şema değişimi değil, yalnızca backfill'dir. */
  content_fingerprint text,
  embedding           vector(1024),
  topic_key           text,                       -- "ürün-A" gibi kaba konu etiketi

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

/* ── content_items indeksleri ────────────────────────────────────────────── */

-- Zamanlayıcının tek sorgusu: "vadesi gelen ne var?" (siraya/schema.sql:103)
create index if not exists content_due_idx
  on public.content_items (scheduled_at)
  where status = 'scheduled';

-- Takılı kalmış kilitleri süpüren job
create index if not exists content_locked_idx
  on public.content_items (locked_at)
  where status = 'publishing';

create index if not exists content_brand_sched_idx
  on public.content_items (brand_id, scheduled_at desc);

create index if not exists content_plan_day_idx
  on public.content_items (plan_id, day_offset, time_of_day);

-- Devam zinciri: tek zıplamada tüm zincir
create index if not exists content_root_idx
  on public.content_items (root_id, chain_position);

-- Tekrar kontrolü, ucuz kat: birebir parmak izi.
-- UNIQUE DEĞİL — bilinçli. Plan üretimi 30 satırı tek transaction'da yazar;
-- tek çakışma tüm planı düşürürdü. Motor bu indeksi sorgular, DB reddetmez.
create index if not exists content_fingerprint_idx
  on public.content_items (brand_id, content_fingerprint)
  where content_fingerprint is not null;

-- Tekrar kontrolü, pahalı kat: anlamsal komşuluk (HNSW, kosinüs)
create index if not exists content_embedding_idx
  on public.content_items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

drop trigger if exists content_items_touch on public.content_items;
create trigger content_items_touch before update on public.content_items
  for each row execute function public.touch_updated_at();

/* ── Zincir bütünlüğü ────────────────────────────────────────────────────────
   INSERT : root_id ve chain_position ebeveynden türetilir.
   UPDATE : parent_id / root_id değiştirilemez → döngü imkânsız. */
create or replace function public.content_chain_guard()
returns trigger language plpgsql as $$
declare
  parent_root  uuid;
  parent_pos   int;
  parent_brand uuid;
begin
  if tg_op = 'UPDATE' then
    if new.parent_id is distinct from old.parent_id then
      raise exception 'parent_id degistirilemez (devam zinciri kilitli): %', old.id;
    end if;
    if new.root_id is distinct from old.root_id then
      raise exception 'root_id degistirilemez: %', old.id;
    end if;
    return new;
  end if;

  if new.parent_id is null then
    new.root_id := new.id;
    new.chain_position := 1;
    return new;
  end if;

  select root_id, chain_position, brand_id
    into parent_root, parent_pos, parent_brand
    from public.content_items where id = new.parent_id;

  if parent_root is null then
    raise exception 'parent_id bulunamadi: %', new.parent_id;
  end if;
  if parent_brand <> new.brand_id then
    raise exception 'devam zinciri marka sinirini asamaz';
  end if;
  if parent_pos >= 12 then
    raise exception 'zincir derinligi sinirina ulasildi (12)';
  end if;

  new.root_id := parent_root;
  new.chain_position := parent_pos + 1;
  return new;
end $$;

drop trigger if exists content_chain_guard_trg on public.content_items;
create trigger content_chain_guard_trg
  before insert or update on public.content_items
  for each row execute function public.content_chain_guard();


/* ── media_jobs — sahne'nin üretim işleri ────────────────────────────────────
   sahne/lib/server/kie.ts (taskId), fal.ts (requestId). Bugün bu kimlikler
   yalnızca tarayıcı localStorage'ında yaşıyor (KESIF_SAHNE §12) — sekme
   kapanınca ödenmiş render kayboluyor. Sunucuda tutulunca kaybolmaz. */
create table if not exists public.media_jobs (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  content_item_id uuid references public.content_items on delete cascade,
  persona_id      uuid references public.personas on delete set null,

  vendor          text not null check (vendor in ('kie', 'fal', 'elevenlabs')),
  -- kie: omnihuman | nano-banana | kling · fal: sync-lipsync · 11labs: tts
  vendor_model    text not null,
  vendor_task_id  text,                           -- kie taskId / fal requestId
  step            text not null check (step in
                    ('persona_image', 'persona_video', 'voice', 'lipsync', 'post_image')),

  state           text not null default 'queued' check (state in
                    ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input           jsonb not null default '{}'::jsonb,
  output_url      text,                           -- vendor'ın GEÇİCİ URL'i
  result_asset_id uuid references public.media_assets on delete set null,
  error           text,

  -- sahne/lib/server/kie.ts:17,137,154 — playground'da elle ölçülmüş sabitler
  credits_estimated integer not null default 0,
  credits_charged   integer,

  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vendor, vendor_task_id)
);

create index if not exists media_jobs_open_idx
  on public.media_jobs (state, created_at)
  where state in ('queued', 'running');

create index if not exists media_jobs_content_idx
  on public.media_jobs (content_item_id, created_at desc);

drop trigger if exists media_jobs_touch on public.media_jobs;
create trigger media_jobs_touch before update on public.media_jobs
  for each row execute function public.touch_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
--  5. İŞ KUYRUĞU — üç projede de yok (BIRLESIM_PLANI §8.5)
-- ═════════════════════════════════════════════════════════════════════════════

/* threadly /api/plan 300sn senkron çalışıyor (sekme kapanırsa iş kayıp),
   sahne client setInterval ile pollluyor, siraya cron'unda kilit yok.
   Üçünün de çözümü aynı: dayanıklı kuyruk. */
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references public.brands on delete cascade,
  user_id       uuid references auth.users on delete cascade,
  kind          text not null check (kind in (
                  'plan_generate', 'caption_write', 'ugc_pipeline',
                  'media_poll', 'publish', 'metrics_collect',
                  'token_refresh', 'embed_backfill',
                  -- 'noop_test' — §12 adım 12 (FAZ B4): worker döngüsünü dış
                  -- çağrı yapmadan kanıtlamak için. Gerçek iş yapmaz.
                  'noop_test'
                )),
  payload       jsonb not null default '{}'::jsonb,
  -- ⚠ §12 adım 13 FAZ A2 — 'failed' CHECK'te DURUYOR ama worker
  -- (lib/server/jobs/worker.ts) onu hiç ÜRETMİYOR: geçici hata doğrudan
  -- 'queued'e (backoff ile) döner, kalıcı/tükenmiş hata doğrudan 'dead'e
  -- gider. Bilinçli: 'failed' ileride bir handler'ın "bu deneme başarısız
  -- ama henüz karar verilmedi" gibi AYRI bir ara anlam için ayırdığı bir
  -- yer tutucu. Şimdi çıkarmak (CHECK'i daraltmak) hiçbir davranışı
  -- değiştirmez ama geri dönüşü olan bir kapıyı kapatır — tutuldu.
  state         text not null default 'queued' check (state in
                  ('queued', 'running', 'succeeded', 'failed', 'dead')),
  priority      int not null default 100,         -- küçük = önce
  run_after     timestamptz not null default now(),
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  -- Aynı işin iki kez kuyruğa girmesini engeller: "publish:<content_id>" gibi.
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Yakınsama — tablo eski şekliyle zaten varsa (adım 2'de kurulmuş, 'noop_test'
-- yokken) CHECK listesini tazeler. §12 adım 12 A1, D2'nin deseni.
alter table public.jobs
  drop constraint if exists jobs_kind_check;
alter table public.jobs
  add constraint jobs_kind_check check (kind in (
    'plan_generate', 'caption_write', 'ugc_pipeline',
    'media_poll', 'publish', 'metrics_collect',
    'token_refresh', 'embed_backfill', 'noop_test'
  ));

create unique index if not exists jobs_dedupe_idx
  on public.jobs (dedupe_key)
  where dedupe_key is not null and state in ('queued', 'running');

create index if not exists jobs_pickup_idx
  on public.jobs (state, run_after, priority)
  where state = 'queued';

-- Takılı iş süpürücüsü (§12 adım 13 FAZ A) — sm-worker'ın kendi kapanışı
-- 'running'i normal akışta hiç bırakmaz (requeueUnprocessed / processJob her
-- zaman bir durum geçişiyle biter); bu yalnızca SÜREÇ TAMAMEN çökerse (Vercel
-- fonksiyon sonlandırması, OOM) askıda kalan satırları bulmak için.
create index if not exists jobs_stuck_idx
  on public.jobs (state, locked_at)
  where state = 'running';

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

/* İş alma — FOR UPDATE SKIP LOCKED. İki worker aynı satırı asla almaz. */
create or replace function public.claim_jobs(worker text, batch int default 5)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.jobs j
     set state = 'running', locked_at = now(), locked_by = worker,
         attempts = j.attempts + 1
   where j.id in (
     select id from public.jobs
      where state = 'queued' and run_after <= now()
      order by priority, run_after
      limit batch
      for update skip locked
   )
  returning j.*;
end $$;

revoke all on function public.claim_jobs(text, int) from public, authenticated;

/* İşe ekleme — §12 adım 12 A2. Kullanıcının KENDİ oturumuyla çağrılır (anon
   key + cookie, service-role DEĞİL — lib/server/README.md "üç yer" kuralı
   enqueue'yi kapsamıyor). SECURITY DEFINER olmasının tek sebebi: 'own jobs
   read' politikası yalnızca SELECT açıyor, `jobs` üzerinde authenticated'a
   hiç INSERT izni yok ("kuyruğa yalnızca sunucu ekler" — §5 yorumu). Bu
   fonksiyon o "sunucu" kapısı: sahiplik owns_brand() ile DOĞRULANIR, sonra
   DEFINER yetkisiyle satır yazılır.

   İdempotency: `p_dedupe_key` verilmişse ve aynı anahtarla queued/running bir
   satır zaten varsa, yeni satır AÇILMAZ — var olan döner. `jobs_dedupe_idx`
   (yukarıda) bunu eşzamanlı çağrılarda da garanti eder; `unique_violation`
   yakalanıp aynı şekilde var olan satıra düşülür. */
create or replace function public.enqueue_job(
  p_brand_id     uuid,
  p_kind         text,
  p_payload      jsonb default '{}'::jsonb,
  p_priority     int default 100,
  p_run_after    timestamptz default now(),
  p_max_attempts int default 5,
  p_dedupe_key   text default null
)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_user_id  uuid := auth.uid();
  v_existing public.jobs;
  v_new      public.jobs;
begin
  if v_user_id is null then
    raise exception 'enqueue_job: oturum yok' using errcode = '28000';
  end if;

  if p_brand_id is null or not public.owns_brand(p_brand_id) then
    raise exception 'enqueue_job: marka sahibi değil' using errcode = '42501';
  end if;

  if p_dedupe_key is not null then
    select * into v_existing from public.jobs
     where dedupe_key = p_dedupe_key and state in ('queued', 'running')
     limit 1;
    if found then
      return v_existing;
    end if;
  end if;

  insert into public.jobs (
    brand_id, user_id, kind, payload, priority, run_after, max_attempts, dedupe_key
  ) values (
    p_brand_id, v_user_id, p_kind, p_payload, p_priority, p_run_after, p_max_attempts, p_dedupe_key
  )
  returning * into v_new;

  return v_new;
exception
  when unique_violation then
    -- Yarış: iki eşzamanlı çağrı aynı dedupe_key'i aynı anda denedi.
    -- jobs_dedupe_idx bunu DB seviyesinde engelledi; kaybeden var olanı okur.
    select * into v_existing from public.jobs
     where dedupe_key = p_dedupe_key and state in ('queued', 'running')
     limit 1;
    if found then
      return v_existing;
    end if;
    raise;
end $$;

revoke all on function public.enqueue_job(uuid, text, jsonb, int, timestamptz, int, text) from public;
grant execute on function public.enqueue_job(uuid, text, jsonb, int, timestamptz, int, text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
--  6. METRİKLER VE AKTİVİTE
-- ═════════════════════════════════════════════════════════════════════════════

/* ── content_metrics — siraya/schema.sql:116-126, genişletilmiş ──────────────
   siraya'da bu tabloya INSERT eden kod HİÇ YOK (KESIF_SIRAYA §13) — analitik
   ekranı canlı kullanıcıda hep boş. Toplayıcı job'ın yazacağı şema budur.
   Append-only anlık görüntüler: trend ancak böyle çıkar. */
create table if not exists public.content_metrics (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items on delete cascade,
  brand_id        uuid not null references public.brands on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,

  reach           integer not null default 0,
  impressions     integer not null default 0,
  likes           integer not null default 0,
  comments        integer not null default 0,
  shares          integer not null default 0,
  saves           integer not null default 0,
  video_views     integer not null default 0,
  profile_visits  integer not null default 0,
  engagement_rate numeric(6,2) not null default 0,

  -- Platformun ham yanıtı. Alan adları platformdan platforma değişiyor;
  -- kolon eklemeden önce burada birikmesi doğru olanı görmemizi sağlar.
  raw             jsonb not null default '{}'::jsonb,

  /* ⭐ D1 — tier'in anlamı
     'h6'    : ilk 48 saat, 6 saatte bir. Henüz oturmamış, GÜRÜLTÜLÜ ölçüm.
     'd1'    : 2-30 gün, günde bir.
     'final' : 30. gün. Anlamı "ARTIK TOPLAMA YAPILMAZ" — bu içerik için
               toplayıcı bir daha çalışmaz.

     'final' "okunabilir tek satır" DEMEK DEĞİLDİR. 10 gün önce yayınlanmış
     bir içeriğin 'final' satırı YOKTUR ve olmayacaktır; ama en son 'd1'
     ölçümü vardır ve okunabilir. Geri besleme (§8.3, Akış D) bu yüzden
     'final'e değil, içerik başına EN SON MEVCUT ölçüme bakar. */
  tier            text not null default 'h6' check (tier in ('h6', 'd1', 'final')),
  collected_at    timestamptz not null default now()
);

-- İçerik başına "en son ölçüm" sorgusunun taradığı indeks:
--   distinct on (content_item_id) ... order by content_item_id, collected_at desc
create index if not exists content_metrics_item_idx
  on public.content_metrics (content_item_id, collected_at desc);

create index if not exists content_metrics_brand_time_idx
  on public.content_metrics (brand_id, collected_at desc);

/* ⭐ D1 — geri besleme indeksi.
   'h6' satırları HARİÇ: ilk 48 saatteki ölçüm henüz oturmamıştır; bir içeriğin
   6 saatlik erişimiyle 20 günlük erişimini aynı torbaya koymak sıralamayı
   bozar. Kısmi indeks olduğu için geri besleme sorgusu h6 satırlarına hiç
   dokunmaz. */
create index if not exists content_metrics_feedback_idx
  on public.content_metrics (brand_id, content_item_id, collected_at desc)
  where tier <> 'h6';

/* Bir içeriğin EN FAZLA BİR 'final' satırı olabilir. D1 bu kısıtı KORUR.
   Dikkat: kısıt 'final' satırlarının tekliğini garantiler — geri beslemenin
   YALNIZCA onları okuduğu anlamına GELMEZ (yukarıdaki tier yorumu). */
create unique index if not exists content_metrics_final_idx
  on public.content_metrics (content_item_id) where tier = 'final';

/* ── brand_latest_metrics — ⭐ D1'in okuma kuralı, tek yerde ─────────────────
   §8.3 ve Akış D'nin okuduğu şey budur: son N günde yayınlanmış içeriklerin
   İÇERİK BAŞINA EN SON ölçümü, 'h6' hariç, tier güvenilirlik ağırlığıyla.

   Ağırlık: final 1.0 > d1 0.7. Olgunlaşmış ölçüm, taze ölçümden daha çok söz
   sahibi olmalı. ⚠ Ağırlık değeri KALİBRE EDİLMELİ — §4c eşikleriyle aynı
   statüde, ölçülmüş değil makul bir başlangıç.

   Fonksiyon olarak yazıldı çünkü kural TEK OLMALI: analitik ekranı, plan geri
   beslemesi ve ileride bir rapor aynı satır kümesini görmeli. */
create or replace function public.brand_latest_metrics(
  p_brand_id uuid,
  p_days int default 35
) returns table (
  content_item_id uuid,
  tier            text,
  collected_at    timestamptz,
  reach           integer,
  likes           integer,
  comments        integer,
  saves           integer,
  shares          integer,
  engagement_rate numeric,
  tier_weight     real
) language sql stable security definer set search_path = public as $$
  select distinct on (m.content_item_id)
         m.content_item_id,
         m.tier,
         m.collected_at,
         m.reach, m.likes, m.comments, m.saves, m.shares,
         m.engagement_rate,
         case m.tier when 'final' then 1.0::real else 0.7::real end as tier_weight
    from public.content_metrics m
   where m.brand_id = p_brand_id
     and m.tier <> 'h6'
     and m.collected_at >= now() - make_interval(days => p_days)
   order by m.content_item_id, m.collected_at desc;
$$;

revoke all on function public.brand_latest_metrics(uuid, int) from public;
grant execute on function public.brand_latest_metrics(uuid, int) to authenticated;


/* ── activity — siraya/schema.sql:131-139, eylem listesi genişletildi ────── */
create table if not exists public.activity (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  actor           text not null,                  -- otomatik işlemlerde ürün adı
  action          text not null check (action in (
                    'queued', 'approved', 'published', 'failed',
                    'shifted_to_best_time', 'plan_generated', 'caption_written',
                    'ugc_requested', 'ugc_ready', 'duplicate_blocked',
                    'continuation_created', 'metrics_collected'
                  )),
  target          text not null default '',       -- 'Instagram · 18:00'
  content_item_id uuid references public.content_items on delete set null,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists activity_brand_idx
  on public.activity (brand_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════════════
--  7. HIZ SINIRI — BIRLESIM_PLANI §8.7
-- ═════════════════════════════════════════════════════════════════════════════

/* Müşteri kendi anahtarını kullanıyor; auth'suz açık endpoint müşterinin
   faturasını şişirir. Sayaç Postgres'te: ayrı bir Redis bağımlılığı
   getirmemek için (yığında zaten Supabase var). */
create table if not exists public.rate_limit_counters (
  bucket      text not null,                      -- "caption:<user_id>"
  window_start timestamptz not null,
  hits        int not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limit_gc_idx
  on public.rate_limit_counters (window_start);

create or replace function public.rate_limit_hit(
  p_bucket text, p_limit int, p_window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(
       floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
     );
  n int;
begin
  insert into public.rate_limit_counters (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = rate_limit_counters.hits + 1
  returning hits into n;
  return n <= p_limit;                            -- false = sinir asildi
end $$;

revoke all on function public.rate_limit_hit(text, int, int) from public, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
--  8. DEPOLAMA — siraya/003-instagram.sql:48-71
-- ═════════════════════════════════════════════════════════════════════════════

/* TEK public bucket. Instagram medyayı yayın anında kendisi çekiyor, o yüzden
   okuma auth'un arkasında olamaz. Yazma ilk klasör segmentine (user_id) bağlı. */
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "own media upload" on storage.objects;
create policy "own media upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own media update" on storage.objects;
create policy "own media update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own media delete" on storage.objects;
create policy "own media delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "public media read" on storage.objects;
create policy "public media read" on storage.objects
  for select to public
  using (bucket_id = 'media');


-- ═════════════════════════════════════════════════════════════════════════════
--  9. ROW LEVEL SECURITY
--
--  Desen: siraya/schema.sql:150-168 + threadly/0001_plans.sql:58-70.
--  Fark: sahiplik artık user_id değil, owns_brand(brand_id). Organizasyon
--  katmanı geldiğinde SADECE owns_brand() gövdesi değişir.
--
--  İki tablo bilinçli olarak POLİTİKASIZ (siraya/003-instagram.sql:37 deseni):
--  channel_credentials ve provider_credentials. RLS açık + sıfır politika =
--  hiçbir tarayıcı oturumu token/anahtar okuyamaz; yalnızca service-role.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.profiles        enable row level security;
alter table public.brands          enable row level security;
alter table public.channels        enable row level security;
alter table public.personas        enable row level security;
alter table public.media_assets    enable row level security;
alter table public.plans           enable row level security;
alter table public.content_items   enable row level security;
alter table public.media_jobs      enable row level security;
alter table public.content_metrics enable row level security;
alter table public.activity        enable row level security;
alter table public.jobs            enable row level security;
alter table public.rate_limit_counters enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own brands" on public.brands;
create policy "own brands" on public.brands
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "brand channels" on public.channels;
create policy "brand channels" on public.channels
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "brand personas" on public.personas;
create policy "brand personas" on public.personas
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "brand media" on public.media_assets;
create policy "brand media" on public.media_assets
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "brand plans" on public.plans;
create policy "brand plans" on public.plans
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "brand content" on public.content_items;
create policy "brand content" on public.content_items
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

drop policy if exists "brand media jobs" on public.media_jobs;
create policy "brand media jobs" on public.media_jobs
  for all using (public.owns_brand(brand_id)) with check (public.owns_brand(brand_id));

-- Metrikler okunur; yazan taraf service-role toplayıcı job'dır.
drop policy if exists "brand metrics read" on public.content_metrics;
create policy "brand metrics read" on public.content_metrics
  for select using (public.owns_brand(brand_id));

drop policy if exists "brand activity read" on public.activity;
create policy "brand activity read" on public.activity
  for select using (public.owns_brand(brand_id));

drop policy if exists "brand activity write" on public.activity;
create policy "brand activity write" on public.activity
  for insert with check (public.owns_brand(brand_id));

-- Kuyruk: kullanıcı kendi işinin DURUMUNU görebilmeli (ilerleme çubuğu),
-- ama sıraya elle iş yazamamalı — kuyruğa yalnızca sunucu ekler.
drop policy if exists "own jobs read" on public.jobs;
create policy "own jobs read" on public.jobs
  for select using (auth.uid() = user_id);

-- rate_limit_counters: RLS açık, politika yok. Yalnızca SECURITY DEFINER
-- fonksiyon üzerinden yazılır/okunur.


-- ═════════════════════════════════════════════════════════════════════════════
--  10. ZAMANLAYICI — siraya/supabase/004-cron.sql deseni
--
--  Vercel Hobby cron'u günde bir kez (004-cron.sql:4-6), yayın kuyruğu bunu
--  kullanamaz. Zamanlamayı Postgres yapar, pg_net endpoint'i çağırır.
--  Secret Vault'ta; bu dosya commit edilebilir.
--
--  ⚠ Job adları pg_cron'da GLOBAL. Üç projenin de aynı veritabanına bakması
--  ihtimaline karşı hepsi 'sm-' ön ekiyle adlandırıldı.
--  ⚠ __APP_URL__ ve __CRON_SECRET__ çalıştırmadan önce değiştirilmeli.
-- ═════════════════════════════════════════════════════════════════════════════

select vault.create_secret('__CRON_SECRET__', 'sm_cron_secret', 'Bearer token for /api/cron/*')
where not exists (select 1 from vault.secrets where name = 'sm_cron_secret');

/* Tek bir tetikleyici yardımcı: her job aynı şekilde çağırır. */
create or replace function public.cron_fire(path text, timeout_ms int default 55000)
returns bigint language sql security definer set search_path = public as $$
  select net.http_get(
    url     := '__APP_URL__' || path,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                     where name = 'sm_cron_secret')
    ),
    -- pg_net 60sn'de bağlantıyı kapatır (KESIF_SIRAYA §12). Uzun iş bu yüzden
    -- endpoint'in içinde değil, jobs tablosunda yaşar: endpoint sadece tetikler.
    timeout_milliseconds := timeout_ms
  );
$$;

do $$
declare j text;
begin
  foreach j in array array[
    'sm-worker', 'sm-publish', 'sm-metrics', 'sm-token-refresh', 'sm-reaper'
  ] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

-- Kuyruk işçisi: her dakika, jobs tablosundan iş alır.
select cron.schedule('sm-worker',        '* * * * *',    $$ select public.cron_fire('/api/cron/worker'); $$);
-- Yayın: 5 dakikada bir vadesi geleni kuyruğa koyar (siraya ritmi).
select cron.schedule('sm-publish',       '*/5 * * * *',  $$ select public.cron_fire('/api/cron/publish'); $$);
-- Metrik toplama: saat başı; hangi içeriğin sırası geldiğini endpoint seçer.
select cron.schedule('sm-metrics',       '17 * * * *',   $$ select public.cron_fire('/api/cron/metrics'); $$);
-- Token tazeleme: günde bir. Hiç yayın yapmayan kanalın token'ı 60 günde ölüyordu.
select cron.schedule('sm-token-refresh', '30 3 * * *',   $$ select public.cron_fire('/api/cron/tokens'); $$);
-- Kilit süpürücü: 15 dakikadan uzun 'publishing'de kalanı geri alır.
select cron.schedule('sm-reaper',        '*/10 * * * *', $$ select public.cron_fire('/api/cron/reaper'); $$);

-- Kontrol:
--   select jobname, schedule, active from cron.job where jobname like 'sm-%';
--   select * from cron.job_run_details order by start_time desc limit 10;


-- ═════════════════════════════════════════════════════════════════════════════
--  11. TEKRAR KONTROLÜ YARDIMCISI — BIRLESIM_PLANI §6 Akış E
--
--  Eşik değerleri BAŞLANGIÇ değeridir, ölçülmüş değil. İlk 200 içerikten sonra
--  kalibre edilmeli. ⚠ DOĞRULANMALI.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.find_similar_content(
  p_brand_id uuid,
  p_embedding vector(1024),
  p_threshold real default 0.82,
  p_limit int default 5
) returns table (
  id uuid, title text, hook text, status text,
  published_at timestamptz, similarity real
)
-- ⚠ search_path'te `extensions` ŞART — diğer altı fonksiyondan farkı bu.
-- Supabase `vector` uzantısını `extensions` şemasına kuruyor ve `<=>` bir
-- INFIX OPERATÖR: `extensions.<=>` diye yazılamaz, yalnızca search_path'ten
-- çözülür. `set search_path = public` ile canlıda şu hatayı veriyordu:
--   ERROR: operator does not exist: extensions.vector <=> extensions.vector
-- (Adım 2 canlı uygulaması, 2026-08-28. Lokal testte yakalanmamıştı; orada
--  vector `public`'e kuruluydu.)
-- `public` başta kalıyor ve liste hâlâ kapalı — `extensions` Supabase'in
-- yönettiği bir şema olduğu için SECURITY DEFINER daraltmasını gevşetmiyor.
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.title, c.hook, c.status, c.published_at,
         (1 - (c.embedding <=> p_embedding))::real as similarity
    from public.content_items c
   where c.brand_id = p_brand_id
     and c.embedding is not null
     and c.status <> 'archived'
     and (1 - (c.embedding <=> p_embedding)) >= p_threshold
   order by c.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.find_similar_content(uuid, vector, real, int) from public;
grant execute on function public.find_similar_content(uuid, vector, real, int) to authenticated;
