#!/bin/sh
# Keep the DB role password in sync with POSTGRES_PASSWORD on every start.
# (Official image only applies POSTGRES_PASSWORD when the data volume is first created.)
set -eu

POSTGRES_USER="${POSTGRES_USER:-welcome}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-welcome}"
POSTGRES_DB="${POSTGRES_DB:-welcome_inn}"

rm -f /tmp/postgres-password-synced

docker-entrypoint.sh "$@" &
PG_PID=$!

echo "[postgres-sync] waiting for database…"
i=0
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "[postgres-sync] timeout waiting for postgres"
    kill "$PG_PID" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$PG_PID" 2>/dev/null; then
    wait "$PG_PID" || true
    exit 1
  fi
  sleep 1
done

echo "[postgres-sync] syncing role password from POSTGRES_PASSWORD…"
# Dollar-quote so passwords with quotes/special chars still work.
TAG="pw$(date +%s)"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD \$${TAG}\$${POSTGRES_PASSWORD}\$${TAG}\$;" \
  || {
    echo "[postgres-sync] ALTER USER failed — check POSTGRES_USER / local socket auth"
    kill "$PG_PID" 2>/dev/null || true
    exit 1
  }

touch /tmp/postgres-password-synced
echo "[postgres-sync] password synced for user ${POSTGRES_USER}"
wait "$PG_PID"
