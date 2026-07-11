#!/usr/bin/env bash
# Load the full glossary into Supabase in ONE command — no copy/paste.
#
# ── One-time setup ────────────────────────────────────────────────────────────
# 1. Install psql if you don't have it:      brew install libpq && brew link --force libpq
# 2. Get your connection string from Supabase:
#      Dashboard → Project Settings → Database → "Connection string" → URI tab.
#    It looks like:
#      postgresql://postgres:YOUR-PASSWORD@db.ivyfvwnxjkqyicbjzqoz.supabase.co:5432/postgres
# 3. Save it as an environment variable (paste your real string):
#      export SUPABASE_DB_URL="postgresql://postgres:YOUR-PASSWORD@db.ivyfvwnxjkqyicbjzqoz.supabase.co:5432/postgres"
#    (Put that line in ~/.zshrc so it's remembered, or just paste it each terminal session.)
#
# ── Each time you want the DB to match the generated files ─────────────────────
#   bash "scripts/load-db.sh"
#   Add --schema the FIRST time only, to also create the table + search functions:
#   bash "scripts/load-db.sh" --schema
#
# Safe to run as often as you like — every file is idempotent (upserts), so
# re-running never duplicates or deletes anything; it just syncs the new terms.

set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: SUPABASE_DB_URL is not set. See the setup notes at the top of this script." >&2
  exit 1
fi

if [ "${1:-}" = "--schema" ]; then
  echo "Creating schema (table + search functions)…"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/concepts.sql"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/concepts_search.sql"
fi

echo "Loading terms from seed_all.sql…"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/supabase/seed_all.sql"

COUNT=$(psql "$SUPABASE_DB_URL" -tAc "select count(*) from public.concepts;")
echo "Done. Database now has $COUNT terms."
