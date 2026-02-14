#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-summary}"
ARG2="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ARTIFACT_DIR="$ROOT_DIR/artifacts/streak-fixtures"
BACKUP_DIR="$ARTIFACT_DIR/backups"

URL=""
SERVICE_KEY=""

log_error() {
  local ref="$1"
  local msg="$2"
  echo "ERROR [$ref] $msg" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "STREAK-CMD-001" "Perintah '$cmd' tidak tersedia"
    exit 1
  fi
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "STREAK-ENV-001" "File .env.local tidak ditemukan di $ENV_FILE"
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" >/dev/null 2>&1 || true
  set +a

  URL="${VITE_SUPABASE_URL:-}"
  SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

  if [[ -z "$URL" ]]; then
    log_error "STREAK-ENV-002" "VITE_SUPABASE_URL belum diisi di .env.local"
    exit 1
  fi

  if [[ -z "$SERVICE_KEY" ]]; then
    log_error "STREAK-ENV-003" "SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local"
    exit 1
  fi
}

api_get() {
  local path="$1"
  curl -sfS "$URL/rest/v1/$path" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY"
}

api_delete() {
  local path="$1"
  curl -sfS "$URL/rest/v1/$path" \
    -X DELETE \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Prefer: return=minimal" >/dev/null
}

api_upsert_json() {
  local path="$1"
  local payload="$2"
  curl -sfS "$URL/rest/v1/$path" \
    -X POST \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    -d "$payload"
}

portable_date_minus_days() {
  local days="$1"
  date -v-"$days"d +%F 2>/dev/null || date -d "-$days days" +%F
}

portable_date_plus_days() {
  local days="$1"
  date -v+"$days"d +%F 2>/dev/null || date -d "+$days days" +%F
}

get_threshold() {
  local threshold_json threshold
  threshold_json="$(api_get "system_settings?key=eq.streak_threshold&select=value&limit=1")"
  threshold="$(
    echo "$threshold_json" | jq -r '
      if length == 0 then 30
      else (.[0].value.value // .[0].value // 30)
      end
      | tonumber? // 30
    '
  )"
  if [[ "$threshold" -lt 1 ]]; then
    threshold=30
  fi
  echo "$threshold"
}

print_summary() {
  local threshold rows
  threshold="$(get_threshold)"
  rows="$(api_get "stability_streaks?select=id,tenant_id,streak_count,status,reached_target,grace_period_end,last_activity_date,tenants(name)&order=streak_count.desc")"

  echo "$rows" | jq --argjson th "$threshold" '
    def parse_date($d): ($d + "T00:00:00Z" | fromdateiso8601);
    def today: (now | strftime("%Y-%m-%d") + "T00:00:00Z" | fromdateiso8601);
    def is_grace_expired: (.grace_period_end != null and (parse_date(.grace_period_end) < today));
    def is_suspended: ((.reached_target == true) and (.status != "invoiced") and is_grace_expired);
    def is_near: ((.reached_target == true) and (.status != "invoiced") and (is_grace_expired | not));
    def is_active: ((.status == "tracking") and (.reached_target != true));
    {
      threshold: $th,
      total: length,
      active: (map(select(is_active)) | length),
      near: (map(select(is_near)) | length),
      suspended: (map(select(is_suspended)) | length),
      sample_active: (map(select(is_active))[:5] | map({tenant: (.tenants.name // "-"), streak_count, status, reached_target, grace_period_end})),
      sample_near: (map(select(is_near))[:5] | map({tenant: (.tenants.name // "-"), streak_count, status, reached_target, grace_period_end})),
      sample_suspended: (map(select(is_suspended))[:5] | map({tenant: (.tenants.name // "-"), streak_count, status, reached_target, grace_period_end}))
    }
  '
}

seed_sample() {
  mkdir -p "$BACKUP_DIR"

  local backup_file
  backup_file="$BACKUP_DIR/stability_streaks_$(date +%Y%m%d_%H%M%S).json"
  api_get "stability_streaks?select=*" > "$backup_file"

  local tenants_json tenant_count
  tenants_json="$(api_get "tenants?select=id,name,code&order=created_at.asc&limit=3")"
  tenant_count="$(echo "$tenants_json" | jq 'length')"
  if [[ "$tenant_count" -lt 3 ]]; then
    log_error "STREAK-SEED-001" "Minimal butuh 3 tenant, saat ini: $tenant_count"
    exit 1
  fi

  local t1_id t1_name t2_id t2_name t3_id t3_name
  t1_id="$(echo "$tenants_json" | jq -r '.[0].id')"
  t1_name="$(echo "$tenants_json" | jq -r '.[0].name')"
  t2_id="$(echo "$tenants_json" | jq -r '.[1].id')"
  t2_name="$(echo "$tenants_json" | jq -r '.[1].name')"
  t3_id="$(echo "$tenants_json" | jq -r '.[2].id')"
  t3_name="$(echo "$tenants_json" | jq -r '.[2].name')"

  local threshold active_streak near_streak susp_streak
  threshold="$(get_threshold)"
  if [[ "$threshold" -gt 5 ]]; then
    active_streak=$((threshold - 5))
  else
    active_streak=5
  fi
  near_streak="$threshold"
  susp_streak=$((threshold + 3))

  local today past_7 past_2 future_3
  today="$(date +%F)"
  past_7="$(portable_date_minus_days 7)"
  past_2="$(portable_date_minus_days 2)"
  future_3="$(portable_date_plus_days 3)"

  local payload
  payload="$(jq -n \
    --arg t1 "$t1_id" --arg t2 "$t2_id" --arg t3 "$t3_id" \
    --arg today "$today" --arg past7 "$past_7" --arg past2 "$past_2" --arg future3 "$future_3" \
    --argjson active "$active_streak" --argjson near "$near_streak" --argjson susp "$susp_streak" \
    '[
      {
        tenant_id: $t1,
        streak_count: $active,
        last_activity_date: $today,
        streak_started_at: $past7,
        reached_target: false,
        reached_target_at: null,
        grace_period_end: null,
        status: "tracking",
        updated_at: (now | todateiso8601)
      },
      {
        tenant_id: $t2,
        streak_count: $near,
        last_activity_date: $today,
        streak_started_at: $past7,
        reached_target: true,
        reached_target_at: (now | todateiso8601),
        grace_period_end: $future3,
        status: "grace_period",
        updated_at: (now | todateiso8601)
      },
      {
        tenant_id: $t3,
        streak_count: $susp,
        last_activity_date: $past2,
        streak_started_at: $past7,
        reached_target: true,
        reached_target_at: (now | todateiso8601),
        grace_period_end: $past2,
        status: "grace_period",
        updated_at: (now | todateiso8601)
      }
    ]')"

  api_upsert_json "stability_streaks?on_conflict=tenant_id" "$payload" >/dev/null

  echo "Sample streak berhasil di-seed."
  echo "Backup sebelum seed: $backup_file"
  echo "Tenant sample:"
  echo "- ACTIVE: $t1_name"
  echo "- NEAR: $t2_name"
  echo "- SUSPENDED: $t3_name"
  echo
  print_summary
}

restore_from_backup() {
  local backup_file="$ARG2"
  if [[ -z "$backup_file" ]]; then
    log_error "STREAK-RESTORE-001" "Path backup wajib diisi. Contoh: scripts/streak-monitoring-fixture.sh restore artifacts/streak-fixtures/backups/FILE.json"
    exit 1
  fi

  if [[ ! -f "$backup_file" ]]; then
    log_error "STREAK-RESTORE-002" "File backup tidak ditemukan: $backup_file"
    exit 1
  fi

  if ! jq empty "$backup_file" >/dev/null 2>&1; then
    log_error "STREAK-RESTORE-003" "File backup bukan JSON valid: $backup_file"
    exit 1
  fi

  local row_count
  row_count="$(jq 'length' "$backup_file")"

  api_delete "stability_streaks?id=not.is.null"

  if [[ "$row_count" -gt 0 ]]; then
    local payload
    payload="$(cat "$backup_file")"
    api_upsert_json "stability_streaks?on_conflict=tenant_id" "$payload" >/dev/null
  fi

  echo "Restore selesai dari: $backup_file"
  echo
  print_summary
}

show_help() {
  cat <<EOF
Usage:
  scripts/streak-monitoring-fixture.sh summary
  scripts/streak-monitoring-fixture.sh seed-sample
  scripts/streak-monitoring-fixture.sh restore <backup-file>

Keterangan:
  - summary: tampilkan ringkasan active/near/suspended sesuai logika /admin/streak-monitoring
  - seed-sample: isi 3 tenant sample (active, near, suspended) dan backup data lama ke artifacts/streak-fixtures/backups
  - restore: kembalikan data stability_streaks dari file backup JSON
EOF
}

main() {
  require_cmd curl
  require_cmd jq
  load_env

  case "$ACTION" in
    summary)
      print_summary
      ;;
    seed-sample)
      seed_sample
      ;;
    restore)
      restore_from_backup
      ;;
    help|-h|--help)
      show_help
      ;;
    *)
      log_error "STREAK-ACTION-001" "Aksi tidak dikenal: $ACTION"
      show_help
      exit 1
      ;;
  esac
}

main
