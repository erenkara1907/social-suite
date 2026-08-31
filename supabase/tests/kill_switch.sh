#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  enqueue_job() ACİL FREN (AI KILL SWITCH) DOĞRULAMASI
#  BIRLESIM_PLANI §12 adım 14 FAZ A3
#
#  BEŞ İDDİA + iki yan kontrol:
#    1. Kill switch AÇIKKEN plan_generate/caption_write/ugc_pipeline reddedilir
#       — anlaşılır bir mesajla (KILL1, "ai duraklatildi", sebep dahil).
#    2. Reddedilen çağrı `jobs`'a satır YAZMAZ (rate limit ile aynı "sessizce
#       alıp sonra patlatma yok" ilkesi).
#    3. Kill switch AÇIKKEN rate limit sayacı ARTMAZ (§8.7 sırası: kill switch
#       kontrolü rate limit'ten ÖNCE çalışır — kapatınca müşterinin penceresi
#       boşa yanmamalı).
#    4. Üç AI-tetikleyen tip de (plan_generate, caption_write, ugc_pipeline)
#       kapsanıyor.
#    5. Kill switch KAPATILINCA (is_paused=false) aynı çağrı tekrar geçer.
#    (yan kontrol) noop_test kill switch'e TABİ DEĞİL.
#
#  rate_limit.sh'ın canlı-Supabase + request.jwt.claim.sub simülasyon deseni
#  izleniyor. Global `ai_kill_switch` satırı test başında/sonunda açık
#  (is_paused=false) durumuna DÖNDÜRÜLÜR — testin kendisi prod'u kilitli
#  bırakmaz.
#
#  Yan etki: BİR geçici test markası açar, testin sonunda SİLER. Global
#  `ai_kill_switch` satırını geçici olarak true yapar, sonunda false'a
#  DÖNDÜRÜR (trap ile — script ortada patlasa bile).
#
#  KULLANIM: supabase/tests/kill_switch.sh   (.env.local'dan SUPABASE_DB_URL okur)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"

PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtA)
TAG="ks_test_$(date +%s)_$$"

echo "── kurulum: gerçek kullanıcı + geçici test markası ─────────────────────"
OWNER_UID=$("${PSQL[@]}" -c "select id from auth.users order by created_at limit 1;")
[[ -n "$OWNER_UID" ]] || { echo "HATA: auth.users boş, test için en az bir kullanıcı gerekli." >&2; exit 1; }

BRAND_ID=$("${PSQL[@]}" -c "
  insert into public.brands (owner_id, name)
  values ('${OWNER_UID}', '${TAG}')
  returning id;")
echo "brand_id: $BRAND_ID (geçici)"

cleanup() {
  "${PSQL[@]}" -c "delete from public.brands where id = '${BRAND_ID}';" > /dev/null
  "${PSQL[@]}" -c "update public.ai_kill_switch set is_paused = false, reason = '' where id = 'global';" > /dev/null
  echo "── temizlik: geçici marka silindi, kill switch false'a döndürüldü ──"
}
trap cleanup EXIT

fail=0

enqueue_single() {
  local kind="$1" tag="$2"
  cat > "/tmp/${TAG}_${tag}.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${OWNER_UID}';
do \$do\$
begin
  perform public.enqueue_job(p_brand_id => '${BRAND_ID}', p_kind => '${kind}');
  raise notice 'KSTEST_OK';
exception
  when sqlstate 'KILL1' then
    raise notice 'KSTEST_PAUSED message=%', sqlerrm;
  when sqlstate 'RLIM1' then
    raise notice 'KSTEST_RATE_LIMITED message=%', sqlerrm;
end
\$do\$;
commit;
SQL
  "${PSQL[@]}" -f "/tmp/${TAG}_${tag}.sql" 2>&1
  rm -f "/tmp/${TAG}_${tag}.sql"
}

echo
echo "── ön koşul: kill switch kapalı (false), plan_generate normalde geçer ──"
"${PSQL[@]}" -c "update public.ai_kill_switch set is_paused = false, reason = '' where id = 'global';" > /dev/null
OUT_BEFORE="$(enqueue_single plan_generate before)"
if echo "$OUT_BEFORE" | grep -q "KSTEST_OK"; then
  echo "PASS — kill switch kapalıyken plan_generate geçiyor (temel davranış bozulmadı)"
else
  echo "FAIL — kill switch kapalıyken bile plan_generate reddedildi: $OUT_BEFORE"
  fail=1
fi

# Ön koşul kontrolünün YAN ETKİLERİ (1 jobs satırı + 1 rate_limit_counters
# satırı) temizlenir ki aşağıdaki "AÇIK" iddiaları sıfırdan sayabilsin —
# aksi halde bu meşru başarı, kill switch açıkken hiçbir şey yazılmadığını
# ölçen sayımlarla karışır.
"${PSQL[@]}" -c "delete from public.jobs where brand_id = '${BRAND_ID}';" > /dev/null
"${PSQL[@]}" -c "delete from public.rate_limit_counters where bucket = 'rl:plan_generate:${BRAND_ID}';" > /dev/null

echo
echo "── iddia 1+2: kill switch AÇIK → plan_generate reddedilir, satır yazılmaz ──"
"${PSQL[@]}" -c "update public.ai_kill_switch set is_paused = true, reason = 'test: elle durduruldu' where id = 'global';" > /dev/null
OUT1="$(enqueue_single plan_generate p1)"
echo "$OUT1"
if echo "$OUT1" | grep -q "KSTEST_PAUSED" && echo "$OUT1" | grep -q "ai duraklatildi" && echo "$OUT1" | grep -q "test: elle durduruldu"; then
  echo "PASS — reddedildi, mesaj anlaşılır (sebep dahil)"
else
  echo "FAIL — beklenen: KSTEST_PAUSED + 'ai duraklatildi' + sebep metni"
  fail=1
fi

PLAN_COUNT="$("${PSQL[@]}" -c "select count(*) from public.jobs where brand_id='${BRAND_ID}' and kind='plan_generate';")"
echo "DB'de kuyruğa giren plan_generate sayısı: $PLAN_COUNT (beklenen: 0)"
[[ "$PLAN_COUNT" -eq 0 ]] || { echo "FAIL — reddedilen çağrı yine de satır yazmış"; fail=1; }

echo
echo "── iddia 3: kill switch AÇIKKEN rate limit sayacı ARTMAZ ────────────────"
COUNTER_ROWS="$("${PSQL[@]}" -c "select count(*) from public.rate_limit_counters where bucket = 'rl:plan_generate:${BRAND_ID}';")"
echo "rate_limit_counters satır sayısı (bucket=rl:plan_generate:${BRAND_ID}): $COUNTER_ROWS (beklenen: 0)"
[[ "$COUNTER_ROWS" -eq 0 ]] || { echo "FAIL — kill switch açıkken rate limit sayacı yine de artmış"; fail=1; }

echo
echo "── iddia 4: caption_write ve ugc_pipeline de kapsanıyor ─────────────────"
OUT_CW="$(enqueue_single caption_write cw)"
OUT_UGC="$(enqueue_single ugc_pipeline ugc)"
if echo "$OUT_CW" | grep -q "KSTEST_PAUSED" && echo "$OUT_UGC" | grep -q "KSTEST_PAUSED"; then
  echo "PASS — üç AI-tetikleyen tip de (plan_generate, caption_write, ugc_pipeline) durduruldu"
else
  echo "FAIL — caption_write veya ugc_pipeline durdurulmadı: cw=$OUT_CW ugc=$OUT_UGC"
  fail=1
fi

echo
echo "── yan kontrol: noop_test kill switch'e TABİ DEĞİL ──────────────────────"
OUT_NOOP="$(enqueue_single noop_test noop)"
if echo "$OUT_NOOP" | grep -q "KSTEST_OK"; then
  echo "PASS — noop_test kill switch açıkken de sınırsız geçti (yalnızca 3 AI-tetikleyen tip kapsanıyor)"
else
  echo "FAIL — noop_test'in kill switch'e takılmaması gerekirdi: $OUT_NOOP"
  fail=1
fi

echo
echo "── iddia 5: kill switch KAPATILINCA aynı çağrı tekrar geçer ─────────────"
"${PSQL[@]}" -c "update public.ai_kill_switch set is_paused = false, reason = '' where id = 'global';" > /dev/null
OUT_AFTER="$(enqueue_single plan_generate after)"
if echo "$OUT_AFTER" | grep -q "KSTEST_OK"; then
  echo "PASS — kapatılınca plan_generate tekrar geçiyor"
else
  echo "FAIL — kapatıldıktan sonra bile reddedildi: $OUT_AFTER"
  fail=1
fi

echo
if [[ "$fail" -eq 0 ]]; then
  echo "PASS — enqueue_job() acil fren mekanizmasının beş iddiası + yan kontrol doğrulandı"
else
  echo "FAIL"
  exit 1
fi
