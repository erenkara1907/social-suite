#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  claim_jobs() EŞZAMANLILIK TESTİ
#
#  İDDİA (BIRLESIM_PLANI §8.5 · §12 adım 12'nin kabul kriteri):
#    "iki eşzamanlı worker AYNI SATIRI ALMAZ"
#
#  claim_jobs() bunu `for update skip locked` ile sağlar: bir worker'ın
#  kilitlediği satırı diğeri görmez, BEKLEMEZ — atlar. Kilit olmasaydı iki
#  worker aynı işi alır ve iş iki kez yürürdü; 'publish' işinde bu, aynı
#  gönderinin iki kez yayınlanması demek (siraya'nın §14'teki eksiği).
#
#  KULLANIM:
#    PGURI="postgresql://postgres:postgres@127.0.0.1:55432/postgres" \
#      supabase/tests/claim_jobs_concurrency.sh
#
#  Ayarlanabilir: WORKERS (6) · BATCH (20) · TOTAL (200)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

PGURI="${PGURI:?PGURI gerekli}"
WORKERS="${WORKERS:-6}"
BATCH="${BATCH:-20}"
TOTAL="${TOTAL:-200}"

# Her koşu kendi dedupe_key uzayında: jobs_dedupe_idx queued/running satırlarda
# UNIQUE, yani önceki koşunun anahtarları hâlâ meşgul olabilir. Saniye tek
# başına yetmiyor — arka arkaya iki koşu aynı saniyeye düşüp çakışıyor
# (ki bu, dedupe indeksinin doğru çalıştığının da kanıtı). PID eklendi.
TAG="cc$(date +%s)_$$"
OUT="${TMPDIR:-/tmp}/claim_test_${TAG}"
mkdir -p "$OUT"

q() { psql "$PGURI" -tAc "$1"; }

echo "── kurulum: $TOTAL is kuyruga ────────────────────────────────────────"
q "insert into public.jobs (kind, payload, dedupe_key)
   select 'caption_write', jsonb_build_object('n',g), '${TAG}:'||g
     from generate_series(1,${TOTAL}) g;" > /dev/null

# Throughput beklentisi GERCEK kuyruk derinliginden hesaplanir, TOTAL'dan degil:
# onceki kosudan artan 'queued' satirlar da alinabilir durumdadir.
queued_before=$(q "select count(*) from public.jobs where state='queued';")
echo "kuyrukta: $queued_before"

# Her worker AYRI baglantida. pg_sleep, claim pencerelerinin GERCEKTEN
# cakismasini saglar — sirayla calissalardi test hicbir sey kanitlamazdi.
cat > "$OUT/worker.sql" <<'EOF'
begin;
select pg_sleep(0.3);
select id from public.claim_jobs(:'worker', :batch);
commit;
EOF

echo "── $WORKERS worker paralel, batch=$BATCH ─────────────────────────────"
for i in $(seq 1 "$WORKERS"); do
  psql "$PGURI" -tA -v worker="w$i" -v batch="$BATCH" \
    -f "$OUT/worker.sql" > "$OUT/w$i.out" 2>&1 &
done
wait

cat "$OUT"/w*.out | grep -E '^[0-9a-f]{8}-' | sort > "$OUT/all.ids"
claimed=$(wc -l < "$OUT/all.ids" | tr -d ' ')
unique=$(sort -u "$OUT/all.ids" | wc -l | tr -d ' ')
dupes=$(sort "$OUT/all.ids" | uniq -d | wc -l | tr -d ' ')

# DB tarafi ikinci kanit: bir satir iki kez alinsaydi attempts 2 olurdu,
# cunku claim_jobs her alimda attempts'i artiriyor.
over=$(q "select count(*) from public.jobs where attempts > 1;")

capacity=$(( WORKERS * BATCH ))
expected=$(( capacity < queued_before ? capacity : queued_before ))

echo
echo "alinan toplam : $claimed   (beklenen: $expected)"
echo "benzersiz id  : $unique"
echo "CIFTE ALINAN  : $dupes"
echo "attempts>1    : $over"
echo "ciktilar      : $OUT"
echo

fail=0
[ "$claimed" -eq "$unique" ]   || { echo "FAIL: ayni satir birden cok worker'a gitti"; fail=1; }
[ "$dupes"   -eq 0 ]           || { echo "FAIL: $dupes id cift alindi"; fail=1; }
[ "$over"    -eq 0 ]           || { echo "FAIL: $over satirda attempts>1"; fail=1; }
[ "$claimed" -eq "$expected" ] || { echo "FAIL: throughput tutmadi"; fail=1; }

if [ "$fail" -eq 0 ]; then
  echo "PASS — $WORKERS eszamanli worker, sifir cakisma"
else
  echo "FAIL"
  exit 1
fi
