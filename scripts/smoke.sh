#!/usr/bin/env bash
# Smoke test. Spúšťaj proti lokálnemu `vercel dev` (preview URL má zapnutú
# Deployment Protection, tam sa netestuje):
#   vercel dev
#   BASE=http://localhost:3000 TOKEN=<clerk session token> ./scripts/smoke.sh
# TOKEN sa získa v prehliadači: await window.Clerk.session.getToken()
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

echo
if [ "$fails" -gt 0 ]; then echo "$fails zlyhani"; exit 1; fi
echo "vsetko ok"
