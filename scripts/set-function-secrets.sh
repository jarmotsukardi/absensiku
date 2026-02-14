#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-supabase/functions/.env.functions}"
PROJECT_REF="${2:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File tidak ditemukan: $ENV_FILE" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

# Keep only KEY=VALUE with non-empty value.
awk -F= '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  /^[A-Z0-9_]+=.+$/ {
    key=$1
    val=substr($0, length(key)+2)
    if (length(val) > 0) print $0
  }
' "$ENV_FILE" > "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Tidak ada secret bernilai di $ENV_FILE" >&2
  exit 1
fi

if [[ -n "$PROJECT_REF" ]]; then
  supabase secrets set --env-file "$TMP_FILE" --project-ref "$PROJECT_REF"
else
  supabase secrets set --env-file "$TMP_FILE"
fi

echo "Secrets bernilai berhasil diset dari $ENV_FILE"
