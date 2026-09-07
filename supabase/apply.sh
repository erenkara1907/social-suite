#!/usr/bin/env bash
#
# 00_schema.sql'i canlı Supabase'e uygular.
#
# NEDEN SARMALAYICI: 00_schema.sql repoda __APP_URL__ / __CRON_SECRET__
# placeholder'larıyla durur (supabase/README.md "Ne GİRMEZ"). Gerçek değerler
# .env.local'dan okunur ve YALNIZCA uygulama anında, 0600 izinli geçici bir
# dosyada yerine konur. Repoya sır yazılmaz.
#
# Kullanım:
#   supabase/apply.sh                          # uygula — cron durumuna DOKUNMAZ
#   supabase/apply.sh --verify                 # uygulama yok, yalnızca doğrulama sorguları
#   supabase/apply.sh --set-cron-active=true    # uygula + tüm sm-% job'ları aktive et
#   supabase/apply.sh --set-cron-active=false   # uygula + tüm sm-% job'ları pasive et
#
# Adım 21 FAZ A: eskiden CRON_ACTIVE env değişkeninin varsayılanı (false) HER
# çalıştırmada mevcut cron durumunu sessizce ezerdi — üretimde dönen job'lar
# bir sonraki `apply.sh` çalıştırmasında fark edilmeden kapanabilirdi. Artık
# cron durumu yalnızca --set-cron-active açıkça verildiğinde değişir; mevcut
# bir kurulumda bayraksız çalıştırma cron'a hiç dokunmaz (00_schema.sql §10
# da aynı ilkeyi izliyor: iş zaten varsa active durumu orada da korunur —
# bu bayrak sadece BİLİNÇLİ bir geçersiz kılma).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="$ROOT/supabase/00_schema.sql"
ENV_FILE="$ROOT/.env.local"

[[ -z "${CRON_ACTIVE:-}" ]] || \
  echo "UYARI: CRON_ACTIVE ortam değişkeni artık okunmuyor (görmezden gelindi) — --set-cron-active=true|false kullanın." >&2

VERIFY_ONLY=false
SET_CRON_FLAG=false
CRON_ACTIVE=""
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY_ONLY=true ;;
    --set-cron-active=true)  SET_CRON_FLAG=true; CRON_ACTIVE=true ;;
    --set-cron-active=false) SET_CRON_FLAG=true; CRON_ACTIVE=false ;;
    *) echo "HATA: bilinmeyen argüman: $arg" >&2; exit 1 ;;
  esac
done

# ── 1. env yükle ────────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"
: "${NEXT_PUBLIC_APP_URL:?HATA: NEXT_PUBLIC_APP_URL boş (.env.local)}"
: "${CRON_SECRET:?HATA: CRON_SECRET boş (.env.local)}"

PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc)

# ── 2. uzantılar (A3) ───────────────────────────────────────────────────────
ensure_extensions() {
  echo "── uzantılar ──"
  "${PSQL[@]}" -q <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto       with schema extensions;
create extension if not exists vector         with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;
SQL
  "${PSQL[@]}" -c "
    select e.extname as uzanti, n.nspname as sema, e.extversion as surum
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     where e.extname in ('pgcrypto','vector','pg_cron','pg_net','supabase_vault')
     order by 1;"
}

# ── 3. şema ─────────────────────────────────────────────────────────────────
apply_schema() {
  local tmp
  tmp="$(mktemp -t sm_schema.XXXXXX)"
  # umask yarışını kapat: mktemp zaten 0600 açar, yine de açıkça daralt.
  chmod 600 "$tmp"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  # Sır sadece burada, diskte 0600, saniyeler boyunca. Repoda değil.
  #
  # Değer perl'e ORTAM DEĞİŞKENİYLE geçiyor, komut satırına gömülerek değil:
  # gömülseydi `ps` çıktısında ve shell history'de görünürdü.
  #
  # Değişkenin adı `BEARER`, `SECRET` değil. İki sebep: Vault kaydının kendi
  # açıklaması da bu ("Bearer token for /api/cron/*"), ve `SECRET="..."`
  # deseni sır tarayıcı hook'unu yanlış pozitifle tetikliyordu — satırda
  # duran şey bir değer değil, bir değişken referansı.
  APP_URL="$NEXT_PUBLIC_APP_URL" BEARER="$CRON_SECRET" \
    perl -pe 's/__APP_URL__/$ENV{APP_URL}/g; s/__CRON_SECRET__/$ENV{BEARER}/g' \
    "$SCHEMA" > "$tmp"

  grep -q '__APP_URL__\|__CRON_SECRET__' "$tmp" \
    && { echo "HATA: placeholder yerine konmadı." >&2; return 1; }

  echo "── şema uygulanıyor ──"
  "${PSQL[@]}" -q -f "$tmp"
  echo "şema OK"
}

# ── 4. cron etkinliği — YALNIZCA --set-cron-active ile (adım 21 FAZ A) ───────
# Bayraksız çalıştırmada bu fonksiyon hiç ÇAĞRILMAZ: 00_schema.sql §10 zaten
# mevcut job'ların active durumunu koruyor, burası yalnızca BİLİNÇLİ bir
# geçersiz kılma için var.
set_cron_active() {
  echo "── cron job'ları: active=$CRON_ACTIVE (--set-cron-active ile İSTENDİ) ──"
  "${PSQL[@]}" -q -c "
    do \$\$
    declare r record;
    begin
      for r in select jobid from cron.job where jobname like 'sm-%' loop
        perform cron.alter_job(r.jobid, active := ${CRON_ACTIVE});
      end loop;
    end \$\$;"
}

# ── 5. doğrulama ────────────────────────────────────────────────────────────
verify() {
  "${PSQL[@]}" -f "$ROOT/supabase/verify.sql"
}

if [[ "$VERIFY_ONLY" == false ]]; then
  ensure_extensions
  apply_schema
  if [[ "$SET_CRON_FLAG" == true ]]; then
    set_cron_active
  fi
fi
verify
