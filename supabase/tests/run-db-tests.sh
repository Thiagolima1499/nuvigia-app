#!/usr/bin/env bash
# Roda as migrações e os testes de RLS num Postgres local descartável.
# Requer os binários do PostgreSQL (initdb, pg_ctl, psql). Uso: supabase/tests/run-db-tests.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA" 2>/dev/null || true
  RUN_AS=(su postgres -c)
fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { run "$PGBIN/pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DATA -U postgres -A trust" >/dev/null
run "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log -w start" >/dev/null
PSQL=(psql -X -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$HERE/_stub_supabase.sql" >/dev/null
for f in "$HERE"/../migrations/*.sql; do
  echo "migração: $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$HERE/rls_test.sql" 2>&1 >/dev/null | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /'
test "${PIPESTATUS[0]}" -eq 0
test "${PIPESTATUS[0]}" -eq 0 && echo "Todos os testes de banco passaram."
