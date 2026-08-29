#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  enqueue_job() HIZ SINIRI DOĞRULAMASI — BIRLESIM_PLANI §12 adım 13 FAZ D
#
#  ÜÇ İDDİA:
#    1. Limit dolunca kuyruğa ekleme reddedilir — anlaşılır bir mesajla
#       (RLIM1, "hiz siniri asildi", limit/pencere değerleriyle).
#    2. Sayaç doğru: limit=2 → 1. ve 2. çağrı geçer, 3. reddedilir.
#    3. Pencere dolunca sıfırlanır — kısa bir pencere bekleyip 4. çağrı
#       tekrar geçer.
#    4. (yan kontrol) noop_test hız sınırına TABİ DEĞİL — limit aşılsa
#       bile sınırsız kuyruğa girer (yalnızca AI tetikleyen 3 tip sayılır).
#
#  enqueue_job.sh'ın canlı-Supabase + request.jwt.claim.sub simülasyon
#  deseni izleniyor. Marka bazlı özel bir limit (rate_limit_policies) bu
#  test için service-role ile yazılıyor — "müşteri bazında farklı olabilir"
#  gereksiniminin kendisi de böylece dolaylı doğrulanmış oluyor.
#
#  Yan etki: BİR geçici test markası + BİR rate_limit_policies satırı açar,
#  testin sonunda SİLER. Gerçek marka/kullanıcı verisine DOKUNMAZ.
#
#  KULLANIM: supabase/tests/rate_limit.sh   (.env.local'dan SUPABASE_DB_URL okur)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"

PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtA)
TAG="rl_test_$(date +%s)_$$"
LIMIT=2
WINDOW=20   # saniye


echo "── kurulum: gerçek kullanıcı + geçici test markası + özel limit ───────"
OWNER_UID=$("${PSQL[@]}" -c "select id from auth.users order by created_at limit 1;")
[[ -n "$OWNER_UID" ]] || { echo "HATA: auth.users boş, test için en az bir kullanıcı gerekli." >&2; exit 1; }

BRAND_ID=$("${PSQL[@]}" -c "
  insert into public.brands (owner_id, name)
  values ('${OWNER_UID}', '${TAG}')
  returning id;")
echo "brand_id: $BRAND_ID (geçici)"

"${PSQL[@]}" -c "
  insert into public.rate_limit_policies (brand_id, kind, limit_count, window_seconds)
  values ('${BRAND_ID}', 'caption_write', ${LIMIT}, ${WINDOW});" > /dev/null
echo "özel limit: caption_write için ${LIMIT}/${WINDOW}sn (varsayılan 100/saat yerine)"

cleanup() {
  "${PSQL[@]}" -c "delete from public.brands where id = '${BRAND_ID}';" > /dev/null
  echo "── temizlik: geçici marka silindi (jobs + rate_limit_policies cascade ile gitti) ──"
}
trap cleanup EXIT

fail=0

# ⚠ ÖNEMLİ — ölçüldü, ilk denemede YANLIŞ SONUÇ veren gerçek sebep:
# Supabase pooler'ı Seul bölgesinde; HER YENİ psql bağlantısı ~2sn sürüyor.
# 3 çağrı AYRI psql süreçlerinde (3× yeni bağlantı) çalıştırılınca toplam
# süre pencerenin (o an 3sn, sonra 20sn) önemli bir kısmına yayılıyor ve
# sabit pencere sınırını (epoch hizalı) atlayabiliyordu — 3. çağrı "yeni
# pencerenin ilk çağrısı" sayılıp geçiyordu. Çözüm: pencere sınırını
# atlama riskini pratikte sıfırlamak için üç çağrı da TEK psql bağlantısı
# (tek dosya, `-f`) içinde, üç ayrı ama art arda transaction olarak
# çalıştırılıyor — yalnızca tek bir bağlantı gecikmesi ödeniyor.
run_three_in_one_connection() {
  local kind="$1"
  cat > "/tmp/${TAG}_batch.sql" <<SQL
\\set ON_ERROR_STOP off
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => '${kind}');
  raise notice 'RLTEST_OK_1';
exception
  when sqlstate 'RLIM1' then
    raise notice 'RLTEST_RATE_LIMITED_1 message=%', sqlerrm;
end
\$do\$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => '${kind}');
  raise notice 'RLTEST_OK_2';
exception
  when sqlstate 'RLIM1' then
    raise notice 'RLTEST_RATE_LIMITED_2 message=%', sqlerrm;
end
\$do\$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => '${kind}');
  raise notice 'RLTEST_OK_3';
exception
  when sqlstate 'RLIM1' then
    raise notice 'RLTEST_RATE_LIMITED_3 message=%', sqlerrm;
end
\$do\$;
commit;
SQL
  "${PSQL[@]}" -f "/tmp/${TAG}_batch.sql" 2>&1
  rm -f "/tmp/${TAG}_batch.sql"
}

echo
echo "── iddia 1+2: limit=${LIMIT} → 1. ve 2. çağrı geçer, 3. reddedilir ────"
BATCH_OUT="$(run_three_in_one_connection caption_write)"
echo "$BATCH_OUT"
OUT1_LINE="$(echo "$BATCH_OUT" | grep "RLTEST_.*_1")"
OUT2_LINE="$(echo "$BATCH_OUT" | grep "RLTEST_.*_2")"
OUT3_LINE="$(echo "$BATCH_OUT" | grep "RLTEST_.*_3")"

if echo "$OUT1_LINE" | grep -q "RLTEST_OK_1" && echo "$OUT2_LINE" | grep -q "RLTEST_OK_2" && echo "$OUT3_LINE" | grep -q "RLTEST_RATE_LIMITED_3"; then
  echo "PASS — sayaç doğru: 2/2 geçti, 3. reddedildi"
else
  echo "FAIL — beklenen desen: OK, OK, RATE_LIMITED"
  fail=1
fi

if echo "$OUT3_LINE" | grep -q "hiz siniri asildi" && echo "$OUT3_LINE" | grep -q "caption_write" && echo "$OUT3_LINE" | grep -qE "${LIMIT}.*${WINDOW}"; then
  echo "PASS — mesaj anlaşılır: iş tipi + limit + pencere değerlerini içeriyor"
else
  echo "FAIL — mesaj beklenen ayrıntıları içermiyor"
  fail=1
fi

QUEUED_COUNT=$("${PSQL[@]}" -c "select count(*) from public.jobs where brand_id='${BRAND_ID}' and kind='caption_write';")
echo "DB'de kuyruğa giren caption_write sayısı: $QUEUED_COUNT (beklenen: 2)"
[[ "$QUEUED_COUNT" -eq 2 ]] || { echo "FAIL — kuyrukta yanlış sayıda satır"; fail=1; }

enqueue_single() {
  local kind="$1" tag="$2"
  cat > "/tmp/${TAG}_${tag}.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => '${kind}');
  raise notice 'RLTEST_OK';
exception
  when sqlstate 'RLIM1' then
    raise notice 'RLTEST_RATE_LIMITED message=%', sqlerrm;
end
\$do\$;
commit;
SQL
  "${PSQL[@]}" -f "/tmp/${TAG}_${tag}.sql" 2>&1
  rm -f "/tmp/${TAG}_${tag}.sql"
}

echo
echo "── iddia 3: pencere dolunca sıfırlanıyor ───────────────────────────────"
echo "${WINDOW}sn + 2 bekleniyor…"
sleep $((WINDOW + 2))
OUT4="$(enqueue_single caption_write c4)"
echo "çağrı 4 (yeni pencere): $(echo "$OUT4" | grep -o 'RLTEST_[A-Z_]*')"
if echo "$OUT4" | grep -q "RLTEST_OK"; then
  echo "PASS — yeni pencerede tekrar izin veriliyor"
else
  echo "FAIL — pencere sıfırlanmadı"
  fail=1
fi

echo
echo "── yan kontrol: noop_test hız sınırına TABİ DEĞİL ──────────────────────"
N1="$(enqueue_single noop_test n1)"
N2="$(enqueue_single noop_test n2)"
N3="$(enqueue_single noop_test n3)"
if echo "$N1$N2$N3" | grep -q "RLTEST_RATE_LIMITED"; then
  echo "FAIL — noop_test'in hız sınırına takılmaması gerekirdi"
  fail=1
else
  echo "PASS — üç noop_test çağrısı da sınırsız geçti (yalnızca 3 AI-tetikleyen tip sayılıyor)"
fi

echo
if [[ "$fail" -eq 0 ]]; then
  echo "PASS — enqueue_job() hız sınırının üç iddiası + yan kontrol doğrulandı"
else
  echo "FAIL"
  exit 1
fi
