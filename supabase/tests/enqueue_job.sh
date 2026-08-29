#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  enqueue_job() DOĞRULAMASI — BIRLESIM_PLANI §12 adım 12 FAZ A doğrulama
#
#  İKİ İDDİA:
#    1. "aynı işi iki kez eklemek tek satır üretiyor" (idempotency, dedupe_key)
#    2. "başka markanın işini eklemek 403" (owns_brand reddi → SQLSTATE 42501,
#       PostgREST bunu HTTP 403'e çevirir — supabase-js .rpc() üzerinden
#       gerçek bir Server Action'ın göreceği hata budur)
#
#  claim_jobs_concurrency.sh'ın SQL-seviyeli test deseni izleniyor, ama BU
#  test canlı Supabase'e karşı çalışır (Docker değil): `enqueue_job()`
#  `owns_brand()` + gerçek `auth.users`/`brands` satırlarına muhtaç, ve bu
#  projede o veri yalnızca canlıda var (bkz. ADIM_27_RAPORU). `auth.uid()`
#  oturumu `request.jwt.claim.sub` ayarıyla SİMÜLE edilir — PostgREST'in
#  gerçek isteklerde yaptığı ayarın psql karşılığı.
#
#  Yan etki: BİR geçici test markası açar, testin sonunda SİLER (jobs
#  satırları `on delete cascade` ile birlikte gider). Gerçek marka/kullanıcı
#  verisine DOKUNMAZ.
#
#  KULLANIM: supabase/tests/enqueue_job.sh   (.env.local'dan SUPABASE_DB_URL okur)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"

PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtA)
TAG="enq_test_$(date +%s)_$$"

echo "── kurulum: gerçek kullanıcı + geçici test markası ────────────────────"
OWNER_UID=$("${PSQL[@]}" -c "select id from auth.users order by created_at limit 1;")
[[ -n "$OWNER_UID" ]] || { echo "HATA: auth.users boş, test için en az bir kullanıcı gerekli." >&2; exit 1; }
echo "owner_uid : $OWNER_UID"

BRAND_ID=$("${PSQL[@]}" -c "
  insert into public.brands (owner_id, name)
  values ('${OWNER_UID}', '${TAG}')
  returning id;")
echo "brand_id  : $BRAND_ID  (geçici — test sonunda silinecek)"

cleanup() {
  "${PSQL[@]}" -c "delete from public.brands where id = '${BRAND_ID}';" > /dev/null
  echo "── temizlik: geçici marka silindi (jobs cascade ile gitti) ────────────"
}
trap cleanup EXIT

fail=0

echo
echo "── iddia 1: aynı dedupe_key iki kez enqueue → TEK satır ───────────────"
DEDUPE_KEY="${TAG}:publish:same-content"
cat > "/tmp/${TAG}_enqueue_twice.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
select (enqueue_job(
  p_brand_id => '${BRAND_ID}', p_kind => 'noop_test', p_dedupe_key => '${DEDUPE_KEY}'
)).id;
select (enqueue_job(
  p_brand_id => '${BRAND_ID}', p_kind => 'noop_test', p_dedupe_key => '${DEDUPE_KEY}'
)).id;
commit;
SQL
TWICE_OUT=$("${PSQL[@]}" -f "/tmp/${TAG}_enqueue_twice.sql")
rm -f "/tmp/${TAG}_enqueue_twice.sql"
# bash 3.2 uyumluluğu (macOS varsayılanı) — mapfile/readarray YOK.
FIRST_ID="$(echo "$TWICE_OUT" | sed -n '1p')"
SECOND_ID="$(echo "$TWICE_OUT" | sed -n '2p')"
ROW_COUNT=$("${PSQL[@]}" -c "select count(*) from public.jobs where dedupe_key = '${DEDUPE_KEY}';")

echo "1. çağrı id  : $FIRST_ID"
echo "2. çağrı id  : $SECOND_ID"
echo "DB'de satır  : $ROW_COUNT"

if [[ "$FIRST_ID" == "$SECOND_ID" && "$ROW_COUNT" -eq 1 ]]; then
  echo "PASS — iki çağrı AYNI satırı döndürdü, DB'de tek satır var"
else
  echo "FAIL — idempotency kırıldı (id eşleşmedi veya satır sayısı != 1)"
  fail=1
fi

echo
echo "── iddia 2: başka markanın (owns_brand=false) işini eklemek → 42501 ───"
OTHER_UID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
echo "simüle edilen 'başka kullanıcı' uid: $OTHER_UID (owns_brand kesin false döner)"
cat > "/tmp/${TAG}_forbidden.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OTHER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => 'noop_test');
  raise exception 'ENQUEUE_TEST_FAIL: beklenen 42501 firlamadi, is sessizce eklendi';
exception
  when sqlstate '42501' then
    raise notice 'ENQUEUE_TEST_OK sqlstate=42501 message=%', sqlerrm;
end
\$do\$;
rollback;
SQL
FORBIDDEN_OUT=$("${PSQL[@]}" -f "/tmp/${TAG}_forbidden.sql" 2>&1 || true)
rm -f "/tmp/${TAG}_forbidden.sql"
echo "$FORBIDDEN_OUT"

if echo "$FORBIDDEN_OUT" | grep -q "ENQUEUE_TEST_OK sqlstate=42501"; then
  echo "PASS — owns_brand() reddetti, 42501 fırladı (PostgREST → HTTP 403)"
else
  echo "FAIL — beklenen 42501 gözlenmedi"
  fail=1
fi

echo
JOB_ROWS_LEFT=$("${PSQL[@]}" -c "select count(*) from public.jobs where brand_id = '${BRAND_ID}';")
echo "test markasında kalan iş sayısı (temizlikten önce): $JOB_ROWS_LEFT"

if [[ "$fail" -eq 0 ]]; then
  echo "PASS — enqueue_job() idempotency + sahiplik reddi doğrulandı"
else
  echo "FAIL"
  exit 1
fi
