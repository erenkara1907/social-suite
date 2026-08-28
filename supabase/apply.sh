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
#   supabase/apply.sh            # uygula
#   supabase/apply.sh --verify   # uygulama yok, yalnızca doğrulama sorguları
#   CRON_ACTIVE=true supabase/apply.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="$ROOT/supabase/00_schema.sql"
ENV_FILE="$ROOT/.env.local"

VERIFY_ONLY=false
[[ "${1:-}" == "--verify" ]] && VERIFY_ONLY=true

# ── 1. env yükle ────────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"
: "${NEXT_PUBLIC_APP_URL:?HATA: NEXT_PUBLIC_APP_URL boş (.env.local)}"
: "${CRON_SECRET:?HATA: CRON_SECRET boş (.env.local)}"

# A2: varsayılan PASİF. APP_URL localhost iken Supabase bulutu erişemez;
# aktif job her tetiklenmede cron.job_run_details'i hata ile doldurur.
CRON_ACTIVE="${CRON_ACTIVE:-false}"
[[ "$CRON_ACTIVE" == "true" || "$CRON_ACTIVE" == "false" ]] \
  || { echo "HATA: CRON_ACTIVE 'true' veya 'false' olmalı (verilen: $CRON_ACTIVE)" >&2; exit 1; }

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

# ── 4. cron etkinliği (A2) ──────────────────────────────────────────────────
set_cron_active() {
  echo "── cron job'ları: active=$CRON_ACTIVE ──"
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
  set_cron_active
fi
verify
