#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  KİMLİK BİLGİSİ DOĞRULAMA RPC'LERİ — BIRLESIM_PLANI §12 adım 20.5 FAZ B
#
#  BEŞ İDDİA (`provider_credentials.sh`'ın gerçek-HTTP-oturumu deseni):
#    1. `record_provider_verification(ok=true)` → `last_verified_at` DOLAR,
#       `last_error` NULL olur.
#    2. `record_provider_verification(ok=false, error)` → `last_error`
#       yazılır AMA `last_verified_at` ÖNCEKİ (başarılı) değerini KORUR.
#    3. Başka markanın sahibi bu markanın doğrulamasını YAZAMAZ → HTTP 403.
#    4. `check_credential_verify_rate_limit` bir eşiği (10/saat) aşınca
#       reddeder — düğmeye basıp durmak sonsuz değil.
#    5. Rate limit kapanınca (başka bir brand/bucket) yeniden geçer —
#       kapsamın MARKA BAŞINA olduğunu, global olmadığını kanıtlar.
#
#  Yan etki: İKİ geçici test kullanıcısı + İKİ geçici marka açar, test
#  sonunda SİLER (auth.users DELETE → brands/provider_credentials cascade).
#
#  KULLANIM: supabase/tests/credential_verify.sh   (.env.local okur)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || { echo "HATA: $ENV_FILE yok." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_DB_URL:?HATA: SUPABASE_DB_URL boş (.env.local)}"
: "${NEXT_PUBLIC_SUPABASE_URL:?HATA: NEXT_PUBLIC_SUPABASE_URL boş}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?HATA: NEXT_PUBLIC_SUPABASE_ANON_KEY boş}"
: "${SUPABASE_SERVICE_ROLE_KEY:?HATA: SUPABASE_SERVICE_ROLE_KEY boş}"
command -v jq >/dev/null || { echo "HATA: jq gerekli." >&2; exit 1; }

PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtA)
API="$NEXT_PUBLIC_SUPABASE_URL"
ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
SERVICE="$SUPABASE_SERVICE_ROLE_KEY"
TAG="cv_test_$(date +%s)_$$"

fail=0
USER_A_ID="" USER_B_ID="" BRAND_A_ID="" BRAND_B_ID=""

cleanup() {
  echo "── temizlik ─────────────────────────────────────────────────────────"
  [[ -n "$USER_A_ID" ]] && curl -s -o /dev/null -X DELETE "$API/auth/v1/admin/users/$USER_A_ID" \
    -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  [[ -n "$USER_B_ID" ]] && curl -s -o /dev/null -X DELETE "$API/auth/v1/admin/users/$USER_B_ID" \
    -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE"
  echo "iki test kullanıcısı silindi (brands/provider_credentials cascade ile gitti)"
}
trap cleanup EXIT

create_user() {
  local email="$1" password="$2"
  curl -s -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"email_confirm\":true}" \
    | jq -r '.id'
}

sign_in() {
  local email="$1" password="$2"
  curl -s -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    | jq -r '.access_token'
}

echo "── kurulum: iki geçici test kullanıcısı + iki marka + bir kie satırı ──"
PASS_A="$(uuidgen)"; PASS_B="$(uuidgen)"
EMAIL_A="${TAG}-a@ornekmarka.com"; EMAIL_B="${TAG}-b@ornekmarka.com"
USER_A_ID="$(create_user "$EMAIL_A" "$PASS_A")"
USER_B_ID="$(create_user "$EMAIL_B" "$PASS_B")"
[[ "$USER_A_ID" != "null" && -n "$USER_A_ID" ]] || { echo "HATA: kullanıcı A oluşturulamadı" >&2; exit 1; }
[[ "$USER_B_ID" != "null" && -n "$USER_B_ID" ]] || { echo "HATA: kullanıcı B oluşturulamadı" >&2; exit 1; }
echo "user_a: $USER_A_ID · user_b: $USER_B_ID"

BRAND_A_ID="$("${PSQL[@]}" -c "insert into public.brands (owner_id, name) values ('${USER_A_ID}', '${TAG}-a') returning id;")"
BRAND_B_ID="$("${PSQL[@]}" -c "insert into public.brands (owner_id, name) values ('${USER_B_ID}', '${TAG}-b') returning id;")"
echo "brand_a: $BRAND_A_ID · brand_b: $BRAND_B_ID"

# record_provider_verification'ın UPDATE'inin bir şey değiştirdiğini görmek
# için bir provider_credentials satırı gerekiyor (service-role, doğrudan —
# gerçek anahtar YOK, yalnızca satırın VARLIĞI test için yeterli).
"${PSQL[@]}" -c "insert into public.provider_credentials (brand_id, user_id, provider, masked_hint) values ('${BRAND_A_ID}', '${USER_A_ID}', 'kie', 'xxx');" > /dev/null

JWT_A="$(sign_in "$EMAIL_A" "$PASS_A")"
JWT_B="$(sign_in "$EMAIL_B" "$PASS_B")"
[[ "$JWT_A" != "null" && -n "$JWT_A" ]] || { echo "HATA: A girişi başarısız" >&2; exit 1; }
[[ "$JWT_B" != "null" && -n "$JWT_B" ]] || { echo "HATA: B girişi başarısız" >&2; exit 1; }

record() {
  local jwt="$1" brand="$2" provider="$3" ok="$4" error="$5"
  curl -s -o /tmp/${TAG}_record.json -w "%{http_code}" -X POST "$API/rest/v1/rpc/record_provider_verification" \
    -H "apikey: $ANON" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" \
    -d "$(jq -n --arg b "$brand" --arg p "$provider" --argjson o "$ok" --arg e "$error" \
          '{p_brand_id:$b, p_provider:$p, p_ok:$o, p_error:$e}')"
}

echo
echo "── iddia 1: ok=true → last_verified_at DOLAR, last_error NULL ─────────"
STATUS="$(record "$JWT_A" "$BRAND_A_ID" "kie" true "")"
echo "HTTP $STATUS — $(cat /tmp/${TAG}_record.json)"
ROW1="$("${PSQL[@]}" -c "select last_verified_at is not null, last_error is null from public.provider_credentials where brand_id='${BRAND_A_ID}' and provider='kie';")"
echo "last_verified_at doldu mu | last_error null mu → $ROW1"
if [[ "$STATUS" == "204" && "$ROW1" == "t|t" ]]; then
  echo "PASS"
else
  echo "FAIL"; fail=1
fi

FIRST_VERIFIED_AT="$("${PSQL[@]}" -c "select last_verified_at from public.provider_credentials where brand_id='${BRAND_A_ID}' and provider='kie';")"
sleep 1

echo
echo "── iddia 2: ok=false → last_error yazılır, last_verified_at KORUNUR ───"
STATUS="$(record "$JWT_A" "$BRAND_A_ID" "kie" false "test-hatasi-9x")"
echo "HTTP $STATUS — $(cat /tmp/${TAG}_record.json)"
ROW2="$("${PSQL[@]}" -c "select last_error, last_verified_at from public.provider_credentials where brand_id='${BRAND_A_ID}' and provider='kie';")"
echo "last_error | last_verified_at → $ROW2"
LAST_ERROR="$(echo "$ROW2" | cut -d'|' -f1)"
SECOND_VERIFIED_AT="$(echo "$ROW2" | cut -d'|' -f2)"
if [[ "$STATUS" == "204" && "$LAST_ERROR" == "test-hatasi-9x" && "$SECOND_VERIFIED_AT" == "$FIRST_VERIFIED_AT" ]]; then
  echo "PASS — last_verified_at DEĞİŞMEDİ ($FIRST_VERIFIED_AT), yalnızca last_error yazıldı"
else
  echo "FAIL — last_verified_at değişti veya last_error yanlış"
  fail=1
fi

echo
echo "── iddia 3: B, A'nın markasının doğrulamasını yazmaya çalışıyor → 403 ──"
STATUS="$(record "$JWT_B" "$BRAND_A_ID" "kie" true "")"
echo "HTTP $STATUS — $(cat /tmp/${TAG}_record.json)"
if [[ "$STATUS" == "403" ]]; then
  echo "PASS — owns_brand() reddetti"
else
  echo "FAIL — beklenen 403, gelen: $STATUS"
  fail=1
fi

echo
echo "── iddia 4: hız sınırı — 10 istekten sonra 11. reddedilir ─────────────"
rl_hit() {
  curl -s -X POST "$API/rest/v1/rpc/check_credential_verify_rate_limit" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT_B" -H "Content-Type: application/json" \
    -d "{\"p_brand_id\":\"${BRAND_B_ID}\"}"
}
ok_count=0
for i in $(seq 1 10); do
  resp="$(rl_hit)"
  [[ "$resp" == "true" ]] && ok_count=$((ok_count + 1))
done
resp11="$(rl_hit)"
echo "ilk 10 çağrıdan GEÇEN: $ok_count · 11. çağrı: $resp11"
if [[ "$ok_count" -eq 10 && "$resp11" == "false" ]]; then
  echo "PASS — 10/saat sınırı doğru uygulanıyor"
else
  echo "FAIL — beklenen 10 geçiş + 11.'de false, gelinen: $ok_count geçiş, 11.=$resp11"
  fail=1
fi

echo
echo "── iddia 5: FARKLI markanın (A) sayacı B'den ETKİLENMEMİŞ — hâlâ geçer ─"
rl_hit_a() {
  curl -s -X POST "$API/rest/v1/rpc/check_credential_verify_rate_limit" \
    -H "apikey: $ANON" -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" \
    -d "{\"p_brand_id\":\"${BRAND_A_ID}\"}"
}
RESP_A="$(rl_hit_a)"
echo "A'nın markası için çağrı: $RESP_A"
if [[ "$RESP_A" == "true" ]]; then
  echo "PASS — bucket marka başına, B'nin sınırı A'yı etkilemedi"
else
  echo "FAIL — beklenen true, gelen: $RESP_A"
  fail=1
fi

rm -f "/tmp/${TAG}_record.json"

echo
if [[ "$fail" -eq 0 ]]; then
  echo "PASS — kimlik bilgisi doğrulama RPC'lerinin beş iddiası da doğrulandı"
else
  echo "FAIL"
  exit 1
fi
