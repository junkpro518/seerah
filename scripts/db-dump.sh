#!/usr/bin/env bash
# M0 / T035 — database backup (decision 43).
# Dumps schema + data (+ roles) with a UTC timestamp into backups/ (git-ignored).
# Default target is the LINKED Supabase project; pass --local for the local stack.
#
# Usage:
#   ./scripts/db-dump.sh            # dump the linked (cloud) project
#   ./scripts/db-dump.sh --local    # dump the local dev stack
#   BACKUP_DIR=/mnt/nas/seerah ./scripts/db-dump.sh   # write elsewhere (e.g. NAS)
#
# NEVER run `supabase db reset` against the remote. Migrations are the source of
# truth; schema changes go through a new migration + `supabase db push`.

set -euo pipefail

TS="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$OUT_DIR"

TARGET=()
LABEL="LINKED (remote) project"
if [[ "${1:-}" == "--local" ]]; then
  TARGET=(--local)
  LABEL="LOCAL stack"
fi

echo "Backing up ${LABEL} -> ${OUT_DIR} (timestamp ${TS})"

SCHEMA_FILE="${OUT_DIR}/${TS}_schema.sql"
DATA_FILE="${OUT_DIR}/${TS}_data.sql"
ROLES_FILE="${OUT_DIR}/${TS}_roles.sql"

supabase db dump "${TARGET[@]}" -f "$SCHEMA_FILE"
supabase db dump "${TARGET[@]}" --data-only -f "$DATA_FILE"
supabase db dump "${TARGET[@]}" --role-only -f "$ROLES_FILE"

echo "Backup complete:"
echo "  schema: $SCHEMA_FILE"
echo "  data:   $DATA_FILE"
echo "  roles:  $ROLES_FILE"
