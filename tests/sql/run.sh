#!/usr/bin/env bash
# Usage : tests/sql/run.sh  (PGHOST/PGPORT/PGUSER pointent sur un PostgreSQL de test JETABLE, jamais la production)
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
DB=cpt_test
psql -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
export PGDATABASE=$DB
$P -f tests/sql/00_stubs.sql
for f in supabase/migrations/00*.sql; do $P -f "$f" >/dev/null; done
$P -f tests/sql/05_helpers.sql
for f in tests/sql/*.test.sql; do echo "== $f"; $P -f "$f" 2>&1 | grep -E "NOTICE|ERROR|ECHEC" | sed 's/^psql:[^ ]* //' || true; done
