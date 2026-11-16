#!/usr/bin/env bash
# Cloud sessions only (run by .claude/hooks/cloud-setup.mjs): starts a local Postgres so the server
# tests (`cd server && npm test`) and the browser tests (`npm run test:e2e`) run in a Project thread
# instead of waiting for CI. A throwaway database inside the session container; never a real one.
# Never blocks a session: if Postgres isn't installed here, it says so and exits 0.
set -u

URL="postgres://postgres:test@localhost:5432/postgres"

if ! command -v pg_lsclusters >/dev/null 2>&1; then
  echo "Postgres is not installed in this container; the server and browser tests run in CI."
  exit 0
fi

if ! pg_isready -q -h localhost -p 5432 2>/dev/null; then
  service postgresql start >/dev/null 2>&1 || pg_ctlcluster "$(pg_lsclusters -h | awk 'NR==1{print $1" "$2}')" start >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pg_isready -q -h localhost -p 5432 2>/dev/null && break; sleep 1; done
fi

if ! pg_isready -q -h localhost -p 5432 2>/dev/null; then
  echo "Postgres did not start; the server and browser tests run in CI."
  exit 0
fi

# The tests connect with a password; set it once (as the postgres user when we are root).
if [ "$(id -u)" = 0 ]; then
  su postgres -c "psql -qc \"ALTER USER postgres PASSWORD 'test'\"" >/dev/null 2>&1 || true
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATABASE_URL=$URL"
    echo "export TEST_DATABASE_URL=$URL"
  } >> "$CLAUDE_ENV_FILE"
fi
echo "Postgres is running at $URL"
