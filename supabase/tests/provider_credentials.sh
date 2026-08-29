#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  provider_credentials VAULT DOĞRULAMASI — BIRLESIM_PLANI §12 adım 13 FAZ B
#
#  BEŞ İDDİA:
#    1. Anahtar DB'de düz metin durmuyor — Vault'ta yaşıyor, tabloda yalnızca
#       vault_secret_id + maskeli önizleme var.
#    2. Kullanıcının KENDİ oturumuyla (anon key) `provider_credentials`'a
#       doğrudan `select` → 0 satır (RLS açık + sıfır politika, ADIM_27'nin
#       deseni — sahibi bile okuyamıyor).
#    3. Service-role ile aynı sorgu → satır GERÇEKTEN var, 1+ satır döner.
#    4. Başka markanın anahtarını yazmaya çalışmak → HTTP 403 (owns_brand).
#    5. Silme hem provider_credentials satırını hem vault.secrets satırını
#       götürüyor — yetim vault kaydı kalmıyor.
#
#  enqueue_job.sh'ın canlı-Supabase deseni izleniyor, ama bu test GERÇEK
#  HTTP + GERÇEK GoTrue oturumu kullanıyor (yalnızca simüle edilen
#  request.jwt.claim.sub değil) — çünkü 2. iddia PostgREST'in anon-key +
#  kullanıcı JWT'siyle NASIL davrandığını kanıtlamalı, psql'in superuser
#  bağlantısı bunu göstermez (RLS'i hiç görmez).
#
#  Yan etki: İKİ geçici test kullanıcısı + BİR geçici marka açar, test
#  sonunda SİLER (auth.users DELETE → brands/provider_credentials cascade
#  ile gider). Gerçek kullanıcı/marka verisine DOKUNMAZ.
#
#  KULLANIM: supabase/tests/provider_credentials.sh   (.env.local okur)
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
TAG="pc_test_$(date +%s)_$$"
FAKE_VALUE="faz-b-test-cred-1234abcd-${TAG}"

fail=0
USER_A_ID="" USER_B_ID="" BRAND_ID=""

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

echo "── kurulum: iki geçici test kullanıcısı + bir marka ────────────────────"
PASS_A="$(uuidgen)"
PASS_B="$(uuidgen)"
EMAIL_A="${TAG}-a@ornekmarka.com"
EMAIL_B="${TAG}-b@ornekmarka.com"
USER_A_ID="$(create_user "$EMAIL_A" "$PASS_A")"
USER_B_ID="$(create_user "$EMAIL_B" "$PASS_B")"
[[ "$USER_A_ID" != "null" && -n "$USER_A_ID" ]] || { echo "HATA: kullanıcı A oluşturulamadı" >&2; exit 1; }
[[ "$USER_B_ID" != "null" && -n "$USER_B_ID" ]] || { echo "HATA: kullanıcı B oluşturulamadı" >&2; exit 1; }
echo "user_a: $USER_A_ID · user_b: $USER_B_ID"

BRAND_ID="$("${PSQL[@]}" -c "insert into public.brands (owner_id, name) values ('${USER_A_ID}', '${TAG}') returning id;")"
echo "brand (A'nın): $BRAND_ID"

JWT_A="$(sign_in "$EMAIL_A" "$PASS_A")"
JWT_B="$(sign_in "$EMAIL_B" "$PASS_B")"
[[ "$JWT_A" != "null" && -n "$JWT_A" ]] || { echo "HATA: A girişi başarısız" >&2; exit 1; }
[[ "$JWT_B" != "null" && -n "$JWT_B" ]] || { echo "HATA: B girişi başarısız" >&2; exit 1; }

echo
echo "── iddia 1+2: A kendi oturumuyla anahtar kaydediyor, DB'de düz metin YOK ──"
SET_BODY="$(jq -n --arg b "$BRAND_ID" --arg v "$FAKE_VALUE" \
  '{p_brand_id:$b, p_provider:"anthropic", p_secret:$v, p_label:"test"}')"
SET_RESP="$(curl -s -X POST "$API/rest/v1/rpc/set_provider_credential" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" \
  -d "$SET_BODY")"
echo "set_provider_credential yanıtı: $SET_RESP"

if echo "$SET_RESP" | grep -qF "$FAKE_VALUE"; then
  echo "FAIL — RPC yanıtı RAW anahtarı içeriyor!"
  fail=1
else
  echo "PASS — RPC yanıtında raw anahtar YOK"
fi

MASKED_HINT="$(echo "$SET_RESP" | jq -r '.[0].masked_hint // empty')"
echo "masked_hint: $MASKED_HINT"
if [[ -n "$MASKED_HINT" && "$MASKED_HINT" != "$FAKE_VALUE" ]]; then
  echo "PASS — maskeli önizleme dolu ve raw değere eşit değil"
else
  echo "FAIL — masked_hint boş ya da raw değere eşit"
  fail=1
fi

echo
echo "── iddia 1 (devamı): satırın TÜM sütunları grep edildi — raw anahtar YOK ──"
ROW_TEXT="$("${PSQL[@]}" -c "select row(pc.*)::text from public.provider_credentials pc where brand_id='${BRAND_ID}' and provider='anthropic';")"
if echo "$ROW_TEXT" | grep -qF "$FAKE_VALUE"; then
  echo "FAIL — provider_credentials satırı düz metin anahtar içeriyor!"
  fail=1
else
  echo "PASS — provider_credentials satırında düz metin anahtar YOK (yalnızca vault_secret_id + masked_hint)"
fi

VAULT_SECRET_ID="$("${PSQL[@]}" -c "select vault_secret_id from public.provider_credentials where brand_id='${BRAND_ID}' and provider='anthropic';")"
echo "vault_secret_id: $VAULT_SECRET_ID"
[[ "$VAULT_SECRET_ID" != "" ]] || { echo "FAIL — vault_secret_id boş"; fail=1; }

DECRYPTED="$("${PSQL[@]}" -c "select decrypted_secret from vault.decrypted_secrets where id='${VAULT_SECRET_ID}';")"
if [[ "$DECRYPTED" == "$FAKE_VALUE" ]]; then
  echo "PASS — Vault'ta gerçekten şifreli saklanan değer decrypt edildiğinde raw anahtarla eşleşiyor (round-trip)"
else
  echo "FAIL — vault.decrypted_secrets beklenen anahtarı döndürmedi"
  fail=1
fi

echo
echo "── iddia 2: A kendi oturumuyla TABLOYU DOĞRUDAN sorguluyor → 0 satır ──"
DIRECT_A="$(curl -s "$API/rest/v1/provider_credentials?select=*&brand_id=eq.${BRAND_ID}" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_A")"
echo "A'nın doğrudan select'i: $DIRECT_A"
DIRECT_A_COUNT="$(echo "$DIRECT_A" | jq 'length')"
if [[ "$DIRECT_A_COUNT" -eq 0 ]]; then
  echo "PASS — sahibi bile provider_credentials'ı doğrudan okuyamıyor (RLS açık, politika sıfır)"
else
  echo "FAIL — beklenen 0 satır, gelen: $DIRECT_A_COUNT"
  fail=1
fi

echo
echo "── iddia 3: service-role ile AYNI sorgu → satır GERÇEKTEN var ─────────"
DIRECT_SERVICE="$(curl -s "$API/rest/v1/provider_credentials?select=id,provider,masked_hint,vault_secret_id&brand_id=eq.${BRAND_ID}" \
  -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE")"
echo "service-role select'i: $DIRECT_SERVICE"
DIRECT_SERVICE_COUNT="$(echo "$DIRECT_SERVICE" | jq 'length')"
if [[ "$DIRECT_SERVICE_COUNT" -ge 1 ]] && ! echo "$DIRECT_SERVICE" | grep -qF "$FAKE_VALUE"; then
  echo "PASS — service-role satırı görüyor (ADIM_27'nin deseni), ama yine de raw anahtar dönmüyor (kolon yok)"
else
  echo "FAIL — service-role beklenen satırı görmedi"
  fail=1
fi

echo
echo "── list_provider_credentials RPC — yalnızca maskeli alanlar ───────────"
LIST_RESP="$(curl -s -X POST "$API/rest/v1/rpc/list_provider_credentials" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" \
  -d "{\"p_brand_id\":\"${BRAND_ID}\"}")"
echo "list_provider_credentials: $LIST_RESP"
if echo "$LIST_RESP" | jq -e 'any(.[]; has("vault_secret_id"))' > /dev/null 2>&1; then
  echo "FAIL — list_provider_credentials vault_secret_id sızdırıyor!"
  fail=1
else
  echo "PASS — vault_secret_id yok, yalnızca masked_hint + gizli olmayan alanlar"
fi

echo
echo "── iddia 4: B, A'nın markasına anahtar yazmaya çalışıyor → 403 ────────"
FORBIDDEN_VALUE="unauthorized-write-attempt"
FORBIDDEN_BODY="$(jq -n --arg b "$BRAND_ID" --arg v "$FORBIDDEN_VALUE" \
  '{p_brand_id:$b, p_provider:"kie", p_secret:$v}')"
FORBIDDEN_STATUS="$(curl -s -o /tmp/${TAG}_forbidden.json -w "%{http_code}" -X POST "$API/rest/v1/rpc/set_provider_credential" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_B" -H "Content-Type: application/json" \
  -d "$FORBIDDEN_BODY")"
echo "HTTP $FORBIDDEN_STATUS — $(cat /tmp/${TAG}_forbidden.json)"
rm -f "/tmp/${TAG}_forbidden.json"
if [[ "$FORBIDDEN_STATUS" == "403" ]]; then
  echo "PASS — owns_brand() reddetti, HTTP 403"
else
  echo "FAIL — beklenen 403, gelen: $FORBIDDEN_STATUS"
  fail=1
fi

echo
echo "── iddia 5: silme → hem provider_credentials hem vault.secrets gidiyor ──"
DELETE_RESP="$(curl -s -X POST "$API/rest/v1/rpc/delete_provider_credential" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_A" -H "Content-Type: application/json" \
  -d "{\"p_brand_id\":\"${BRAND_ID}\",\"p_provider\":\"anthropic\"}")"
echo "delete_provider_credential: $DELETE_RESP"

ROW_LEFT="$("${PSQL[@]}" -c "select count(*) from public.provider_credentials where brand_id='${BRAND_ID}' and provider='anthropic';")"
VAULT_LEFT="$("${PSQL[@]}" -c "select count(*) from vault.secrets where id='${VAULT_SECRET_ID}';")"
echo "provider_credentials kalan satır: $ROW_LEFT · vault.secrets kalan satır: $VAULT_LEFT"
if [[ "$ROW_LEFT" -eq 0 && "$VAULT_LEFT" -eq 0 ]]; then
  echo "PASS — ikisi de gitti, yetim vault kaydı yok"
else
  echo "FAIL — bir şey arkada kaldı"
  fail=1
fi

echo
if [[ "$fail" -eq 0 ]]; then
  echo "PASS — provider_credentials Vault akışının beş iddiası da doğrulandı"
else
  echo "FAIL"
  exit 1
fi
