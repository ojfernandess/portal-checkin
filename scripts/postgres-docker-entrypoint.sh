#!/bin/sh
# Wrap the official Postgres entrypoint and keep the DB role password in sync with
# POSTGRES_PASSWORD on every start (env changes do not update an existing data volume).
set -eu

POSTGRES_USER="${POSTGRES_USER:-welcome}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-welcome}"
POSTGRES_DB="${POSTGRES_DB:-welcome_inn}"

rm -f /tmp/postgres-password-synced

# Official image CMD is typically ["postgres"]; keep args as-is.
docker-entrypoint.sh "$@" &
PG_PID=$!

echo "[postgres-sync] waiting for database…"
i=0
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
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
# Local socket is trust — no password. :'pass' quotes safely for special characters.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v pass="$POSTGRES_PASSWORD" \
  -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD :'pass';" \
  || {
    echo "[postgres-sync] ALTER USER failed"
    kill "$PG_PID" 2>/dev/null || true
    exit 1
  }

touch /tmp/postgres-password-synced
echo "[postgres-sync] password synced for user ${POSTGRES_USER}"
wait "$PG_PID"
