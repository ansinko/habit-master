#!/usr/bin/env bash
# Smoke test. Spúšťaj proti lokálnemu `vercel dev` (preview URL má zapnutú
# Deployment Protection, tam sa netestuje):
#   vercel dev
#   BASE=http://localhost:3000 TOKEN=<clerk session token> ./scripts/smoke.sh
# TOKEN sa získa v prehliadači: await window.Clerk.session.getToken()
#
# Bez človeka (CI, agenti): scripts/dev-token.mjs vyrobí/nájde testovacieho
# Clerk používateľa (smoke-test@example.com) cez Backend API a vypíše na
# stdout čerstvý session token — funguje len proti development Clerk
# inštancii (sk_test_), na produkčnom kľúči sa odmietne spustiť:
#   BASE=http://localhost:3000 TOKEN=$(node scripts/dev-token.mjs) ./scripts/smoke.sh
set -uo pipefail

BASE="${BASE:?nastav BASE}"
TOKEN="${TOKEN:-}"
fails=0

check() { # check <popis> <ocakavany kod> <skutocny kod>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1 — cakal $2, dostal $3"
    fails=$((fails + 1))
  fi
}

code() { # code <metoda> <cesta> [tokenom?] [telo]
  local method="$1" path="$2" auth="$3" body="${4:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$BASE$path")
  [ "$auth" = "auth" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  curl "${args[@]}"
}

echo "== auth =="
check "GET /api/state bez tokenu → 401" 401 "$(code GET /api/state noauth)"

echo "== zalozenie behu =="
check "POST /api/runs bez tokenu → 401" 401 "$(code POST /api/runs noauth '{"habitName":"beh"}')"
if [ -n "$TOKEN" ]; then
  check "POST /api/runs s tokenom → 201" 201 "$(code POST /api/runs auth '{"habitName":"smoke habit"}')"
  check "POST /api/runs bez habitName → 400" 400 "$(code POST /api/runs auth '{}')"
fi

echo "== premenovanie behu =="
if [ -n "$TOKEN" ]; then
  RUN_ID=$(curl -s -X POST "$BASE/api/runs" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"habitName":"smoke premenovanie"}' \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  check "PATCH /api/runs/:id → 200" 200 \
    "$(code PATCH "/api/runs/$RUN_ID" auth '{"habitName":"smoke premenovany"}')"
  check "PATCH bez habitName → 400" 400 "$(code PATCH "/api/runs/$RUN_ID" auth '{}')"
  check "PATCH cudzi run_id → 404" 404 \
    "$(code PATCH "/api/runs/00000000-0000-0000-0000-000000000000" auth '{"habitName":"x"}')"
fi

echo "== oznacovanie dni =="
if [ -n "$TOKEN" ]; then
  RUN_ID=$(curl -s -X POST "$BASE/api/runs" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"habitName":"smoke dni"}' \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  TODAY=$(date +%F)
  check "oznacenie dna → 200" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"'"$TODAY"'","done":true}')"
  check "opakovane oznacenie → 200 (idempotencia)" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"'"$TODAY"'","done":true}')"
  check "odznacenie → 200" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"'"$TODAY"'","done":false}')"
  check "datum v buducnosti → 400" 400 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"2099-01-01","done":true}')"
  check "datum mimo okna behu → 400" 400 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"2020-01-01","done":true}')"
  check "cudzi run_id → 404" 404 \
    "$(code POST "/api/runs/00000000-0000-0000-0000-000000000000/days" auth '{"date":"'"$TODAY"'","done":true}')"
fi

echo "== historia =="
check "GET /api/runs bez tokenu → 401" 401 "$(code GET /api/runs noauth)"
if [ -n "$TOKEN" ]; then
  check "GET /api/runs s tokenom → 200" 200 "$(code GET /api/runs auth)"
  body=$(curl -s "$BASE/api/runs" -H "Authorization: Bearer $TOKEN")
  case "$body" in
    *'"days_done"'*) echo "  ok   historia obsahuje days_done" ;;
    *) echo "  FAIL historia neobsahuje days_done: $body"; fails=$((fails + 1)) ;;
  esac
fi

echo
if [ "$fails" -gt 0 ]; then echo "$fails zlyhani"; exit 1; fi
echo "vsetko ok"
