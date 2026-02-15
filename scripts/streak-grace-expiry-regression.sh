#!/usr/bin/env bash
set -euo pipefail

TRACE_ID="STREAK-GRACE-EXP-$(date +%Y%m%d%H%M%S)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
TMP_DIR=""
KEEP_DATA="false"
SELECTED_TENANT_ID=""

SUPABASE_URL=""
SERVICE_KEY=""
BILLING_NOTIFIER_SECRET=""
API_BASE=""

TENANT_ID=""
TENANT_NAME=""
INVOICE_ID=""

STREAK_BACKUP_FILE=""
SUBSCRIPTIONS_BACKUP_FILE=""

NOTIFIER_TESTED="false"
NOTIFIER_TRACE_ID=""
NOTIFIER_EMAIL_REASON=""
NOTIFIER_WHATSAPP_REASON=""

ASSERT_INVOICE_STILL_UNPAID="false"
ASSERT_SUBSCRIPTION_EXPIRED="false"
ASSERT_NOTIFIER_REASON="false"
CURRENT_STEP="startup"

show_help() {
  cat <<EOF
Usage:
  bash scripts/streak-grace-expiry-regression.sh [options]

Options:
  --tenant-id=<uuid>     Gunakan tenant tertentu.
  --keep-data            Jangan cleanup otomatis.
  --help                 Tampilkan bantuan.

Default:
  - Simulasi tenant tidak bayar hingga grace period berakhir.
  - Verifikasi sinkron status subscription menjadi expired.
  - Jika BILLING_NOTIFIER_SECRET tersedia, verifikasi reason reminder dari notifier.
EOF
}

log_error() {
  local ref="$1"
  local msg="$2"
  echo "ERROR [$ref] $msg" >&2
}

on_error() {
  log_error "$TRACE_ID-RUN-001" "Gagal pada step: $CURRENT_STEP"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "$TRACE_ID-CMD-001" "Perintah '$cmd' tidak tersedia."
    exit 1
  fi
}

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --keep-data)
        KEEP_DATA="true"
        ;;
      --tenant-id=*)
        SELECTED_TENANT_ID="${arg#*=}"
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        log_error "$TRACE_ID-ARGS-001" "Argumen tidak dikenal: $arg"
        show_help
        exit 1
        ;;
    esac
  done
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "$TRACE_ID-ENV-001" "File .env.local tidak ditemukan: $ENV_FILE"
    exit 1
  fi

  SUPABASE_URL="$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/\r$//')"
  SERVICE_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/\r$//')"
  BILLING_NOTIFIER_SECRET="$(grep '^BILLING_NOTIFIER_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/\r$//' || true)"

  if [[ -z "$SUPABASE_URL" ]]; then
    log_error "$TRACE_ID-ENV-002" "VITE_SUPABASE_URL belum diisi di .env.local"
    exit 1
  fi
  if [[ -z "$SERVICE_KEY" ]]; then
    log_error "$TRACE_ID-ENV-003" "SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local"
    exit 1
  fi

  API_BASE="$SUPABASE_URL/rest/v1"
}

api_get() {
  local path="$1"
  curl -sfS "$API_BASE/$path" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY"
}

api_post() {
  local path="$1"
  local payload="$2"
  local prefer="${3:-return=representation}"
  curl -sfS "$API_BASE/$path" \
    -X POST \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: $prefer" \
    -d "$payload"
}

api_patch() {
  local path="$1"
  local payload="$2"
  curl -sfS "$API_BASE/$path" \
    -X PATCH \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$payload" >/dev/null
}

api_delete() {
  local path="$1"
  curl -sfS "$API_BASE/$path" \
    -X DELETE \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Prefer: return=minimal" >/dev/null
}

portable_date_plus_days() {
  local days="$1"
  if [[ "$days" =~ ^- ]]; then
    date -v"${days}"d +%F 2>/dev/null || date -d "$days days" +%F
  else
    date -v+"$days"d +%F 2>/dev/null || date -d "+$days days" +%F
  fi
}

get_streak_threshold() {
  local raw
  raw="$(api_get "system_settings?key=eq.streak_threshold&select=value&limit=1" | jq -r 'if length == 0 then 30 else (.[0].value.value // .[0].value // 30) end | tonumber? // 30')"
  if [[ "$raw" -lt 1 ]]; then
    raw=30
  fi
  echo "$raw"
}

candidate_has_open_invoice() {
  local tenant_id="$1"
  local open_count
  open_count="$(api_get "invoices?tenant_id=eq.$tenant_id&status=in.(PENDING,AWAITING_VERIFICATION)&select=id" | jq 'length')"
  [[ "$open_count" -gt 0 ]]
}

pick_tenant() {
  if [[ -n "$SELECTED_TENANT_ID" ]]; then
    local selected_json
    selected_json="$(api_get "tenants?id=eq.$SELECTED_TENANT_ID&select=id,name,email,phone,whatsapp,pic_whatsapp&limit=1")"
    if [[ "$(echo "$selected_json" | jq 'length')" -eq 0 ]]; then
      log_error "$TRACE_ID-TENANT-001" "Tenant tidak ditemukan: $SELECTED_TENANT_ID"
      exit 1
    fi
    if candidate_has_open_invoice "$SELECTED_TENANT_ID"; then
      log_error "$TRACE_ID-TENANT-002" "Tenant pilihan masih memiliki invoice terbuka."
      exit 1
    fi
    local sub_count
    sub_count="$(api_get "subscriptions?tenant_id=eq.$SELECTED_TENANT_ID&status=neq.cancelled&select=id" | jq 'length')"
    if [[ "$sub_count" -eq 0 ]]; then
      log_error "$TRACE_ID-TENANT-003" "Tenant pilihan belum memiliki subscription aktif/non-cancelled."
      exit 1
    fi
    if [[ -n "$BILLING_NOTIFIER_SECRET" ]]; then
      local has_email has_wa
      has_email="$(echo "$selected_json" | jq -r '((.[0].email // "") | length) > 0')"
      has_wa="$(echo "$selected_json" | jq -r '(((.[0].pic_whatsapp // .[0].whatsapp // .[0].phone // "") | length) > 0)')"
      if [[ "$has_email" != "true" || "$has_wa" != "true" ]]; then
        log_error "$TRACE_ID-TENANT-006" "Tenant pilihan belum punya email/WhatsApp, tidak cocok untuk uji notifier."
        exit 1
      fi
    fi
    TENANT_ID="$SELECTED_TENANT_ID"
    TENANT_NAME="$(echo "$selected_json" | jq -r '.[0].name // "-"')"
    return
  fi

  local candidates_json count i candidate_id candidate_name
  candidates_json="$(api_get "subscriptions?select=tenant_id,status,tenants(name,email,phone,whatsapp,pic_whatsapp)&status=neq.cancelled&order=updated_at.desc&limit=200" | jq -c 'unique_by(.tenant_id)')"
  count="$(echo "$candidates_json" | jq 'length')"

  if [[ "$count" -eq 0 ]]; then
    log_error "$TRACE_ID-TENANT-004" "Tidak ada tenant dengan subscription non-cancelled."
    exit 1
  fi

  i=0
  while [[ "$i" -lt "$count" ]]; do
    candidate_id="$(echo "$candidates_json" | jq -r ".[$i].tenant_id // empty")"
    candidate_name="$(echo "$candidates_json" | jq -r ".[$i].tenants.name // \"-\"")"
    if [[ -z "$candidate_id" ]]; then
      i=$((i + 1))
      continue
    fi
    if ! candidate_has_open_invoice "$candidate_id"; then
      if [[ -n "$BILLING_NOTIFIER_SECRET" ]]; then
        local has_email has_wa
        has_email="$(echo "$candidates_json" | jq -r "((.[$i].tenants.email // \"\") | length) > 0")"
        has_wa="$(echo "$candidates_json" | jq -r "((.[$i].tenants.pic_whatsapp // .[$i].tenants.whatsapp // .[$i].tenants.phone // \"\") | length) > 0")"
        if [[ "$has_email" != "true" || "$has_wa" != "true" ]]; then
          i=$((i + 1))
          continue
        fi
      fi
      TENANT_ID="$candidate_id"
      TENANT_NAME="$candidate_name"
      return
    fi
    i=$((i + 1))
  done

  log_error "$TRACE_ID-TENANT-005" "Tidak ada tenant kandidat yang bebas invoice terbuka."
  exit 1
}

backup_rows() {
  STREAK_BACKUP_FILE="$TMP_DIR/streak_backup.json"
  SUBSCRIPTIONS_BACKUP_FILE="$TMP_DIR/subscriptions_backup.json"

  api_get "stability_streaks?tenant_id=eq.$TENANT_ID&select=*" > "$STREAK_BACKUP_FILE"
  api_get "subscriptions?tenant_id=eq.$TENANT_ID&select=*&order=created_at.asc" > "$SUBSCRIPTIONS_BACKUP_FILE"
}

seed_grace_expired_case() {
  local threshold yesterday today now_utc streak_payload
  threshold="$(get_streak_threshold)"
  yesterday="$(portable_date_plus_days -2)"
  today="$(date +%F)"
  now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  streak_payload="$(jq -n \
    --arg tenant_id "$TENANT_ID" \
    --arg today "$today" \
    --arg yesterday "$yesterday" \
    --arg now_utc "$now_utc" \
    --argjson threshold "$threshold" \
    '{
      tenant_id: $tenant_id,
      streak_count: $threshold,
      last_activity_date: $today,
      streak_started_at: $today,
      reached_target: true,
      reached_target_at: $now_utc,
      grace_period_end: $yesterday,
      status: "grace_period",
      updated_at: $now_utc
    }')"

  api_post "stability_streaks?on_conflict=tenant_id" "[$streak_payload]" "resolution=merge-duplicates,return=minimal" >/dev/null
  api_patch "subscriptions?tenant_id=eq.$TENANT_ID&status=neq.cancelled" \
    "{\"status\":\"active\",\"grace_period_end\":\"$yesterday\",\"updated_at\":\"$now_utc\"}"
}

create_pending_invoice() {
  INVOICE_ID="$(api_post "rpc/create_pending_streak_invoice" "{\"p_tenant_id\":\"$TENANT_ID\",\"p_grace_days\":1}" "return=representation" | jq -r '.')"
  if [[ -z "$INVOICE_ID" || "$INVOICE_ID" == "null" ]]; then
    log_error "$TRACE_ID-INVOICE-001" "Gagal membuat pending invoice."
    exit 1
  fi

  local yesterday now_utc
  yesterday="$(portable_date_plus_days -2)"
  now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  api_patch "invoices?id=eq.$INVOICE_ID" \
    "{\"status\":\"PENDING\",\"due_date\":\"$yesterday\",\"updated_at\":\"$now_utc\"}"
}

run_notifier_dry_run() {
  if [[ -z "$BILLING_NOTIFIER_SECRET" ]]; then
    NOTIFIER_TESTED="false"
    return
  fi

  local payload response
  payload="$(jq -n --arg tenant_id "$TENANT_ID" '{dry_run: true, tenant_id: $tenant_id, limit: 10}')"
  response="$(curl -sfS "$SUPABASE_URL/functions/v1/billing-grace-notifier" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: $BILLING_NOTIFIER_SECRET" \
    -d "$payload")"

  NOTIFIER_TESTED="true"
  NOTIFIER_TRACE_ID="$(echo "$response" | jq -r '.trace_id // empty')"
  NOTIFIER_EMAIL_REASON="$(echo "$response" | jq -r '.details[0].channels.email.notification_reason // empty')"
  NOTIFIER_WHATSAPP_REASON="$(echo "$response" | jq -r '.details[0].channels.whatsapp.notification_reason // empty')"
}

run_sync_and_assert() {
  local sync_result invoice_status latest_sub_status

  sync_result="$(api_post "rpc/sync_streak_subscription_status" "{\"p_tenant_id\":\"$TENANT_ID\"}" "return=representation")"
  if [[ -z "$sync_result" ]]; then
    log_error "$TRACE_ID-SYNC-001" "Gagal menjalankan sync_streak_subscription_status."
    exit 1
  fi

  invoice_status="$(api_get "invoices?id=eq.$INVOICE_ID&select=status&limit=1" | jq -r '.[0].status // empty')"
  latest_sub_status="$(api_get "subscriptions?tenant_id=eq.$TENANT_ID&status=neq.cancelled&select=status&order=updated_at.desc&limit=1" | jq -r '.[0].status // empty')"

  if [[ "$invoice_status" == "PENDING" || "$invoice_status" == "AWAITING_VERIFICATION" ]]; then
    ASSERT_INVOICE_STILL_UNPAID="true"
  fi
  if [[ "$latest_sub_status" == "expired" ]]; then
    ASSERT_SUBSCRIPTION_EXPIRED="true"
  fi

  if [[ "$NOTIFIER_TESTED" == "true" ]]; then
    if [[ "$NOTIFIER_EMAIL_REASON" == "GRACE_PERIOD_EXPIRED" && "$NOTIFIER_WHATSAPP_REASON" == "GRACE_PERIOD_EXPIRED" ]]; then
      ASSERT_NOTIFIER_REASON="true"
    fi
  else
    ASSERT_NOTIFIER_REASON="skipped"
  fi

  if [[ "$ASSERT_INVOICE_STILL_UNPAID" != "true" || "$ASSERT_SUBSCRIPTION_EXPIRED" != "true" ]]; then
    log_error "$TRACE_ID-ASSERT-DETAIL" "sync_result=$sync_result invoice_status=$invoice_status subscription_status=$latest_sub_status tenant_id=$TENANT_ID invoice_id=$INVOICE_ID"
    log_error "$TRACE_ID-ASSERT-001" "Assertion utama gagal (invoice unpaid / subscription expired)."
    exit 1
  fi

  if [[ "$NOTIFIER_TESTED" == "true" && "$ASSERT_NOTIFIER_REASON" != "true" ]]; then
    log_error "$TRACE_ID-ASSERT-002" "Notifier reason bukan GRACE_PERIOD_EXPIRED."
    exit 1
  fi
}

restore_rows() {
  local streak_count subs_count

  api_delete "stability_streaks?tenant_id=eq.$TENANT_ID" >/dev/null 2>&1 || true
  streak_count="$(jq 'length' "$STREAK_BACKUP_FILE")"
  if [[ "$streak_count" -gt 0 ]]; then
    api_post "stability_streaks?on_conflict=tenant_id" "$(cat "$STREAK_BACKUP_FILE")" "resolution=merge-duplicates,return=minimal" >/dev/null 2>&1 || true
  fi

  api_delete "subscriptions?tenant_id=eq.$TENANT_ID" >/dev/null 2>&1 || true
  subs_count="$(jq 'length' "$SUBSCRIPTIONS_BACKUP_FILE")"
  if [[ "$subs_count" -gt 0 ]]; then
    api_post "subscriptions?on_conflict=id" "$(cat "$SUBSCRIPTIONS_BACKUP_FILE")" "resolution=merge-duplicates,return=minimal" >/dev/null 2>&1 || true
  fi
}

cleanup_test_rows() {
  if [[ -n "$INVOICE_ID" ]]; then
    if [[ -n "$TENANT_ID" ]]; then
      api_patch "subscriptions?tenant_id=eq.$TENANT_ID&last_invoice_id=eq.$INVOICE_ID" \
        "{\"last_invoice_id\":null,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >/dev/null 2>&1 || true
    fi
    api_delete "billing_notification_logs?invoice_id=eq.$INVOICE_ID" >/dev/null 2>&1 || true
    api_delete "financial_ledger?invoice_id=eq.$INVOICE_ID" >/dev/null 2>&1 || true
    api_delete "manual_payments?invoice_number=ilike.*$INVOICE_ID*" >/dev/null 2>&1 || true
    api_delete "invoices?id=eq.$INVOICE_ID" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  set +e
  if [[ "$KEEP_DATA" != "true" ]]; then
    cleanup_test_rows
    if [[ -n "$TENANT_ID" && -n "$STREAK_BACKUP_FILE" && -f "$STREAK_BACKUP_FILE" && -n "$SUBSCRIPTIONS_BACKUP_FILE" && -f "$SUBSCRIPTIONS_BACKUP_FILE" ]]; then
      restore_rows
    fi
  fi
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR" >/dev/null 2>&1
  fi
}

print_result() {
  jq -n \
    --arg trace_id "$TRACE_ID" \
    --arg tenant_id "$TENANT_ID" \
    --arg tenant_name "$TENANT_NAME" \
    --arg invoice_id "$INVOICE_ID" \
    --arg notifier_tested "$NOTIFIER_TESTED" \
    --arg notifier_trace_id "$NOTIFIER_TRACE_ID" \
    --arg notifier_email_reason "$NOTIFIER_EMAIL_REASON" \
    --arg notifier_whatsapp_reason "$NOTIFIER_WHATSAPP_REASON" \
    --arg assert_invoice_unpaid "$ASSERT_INVOICE_STILL_UNPAID" \
    --arg assert_subscription_expired "$ASSERT_SUBSCRIPTION_EXPIRED" \
    --arg assert_notifier_reason "$ASSERT_NOTIFIER_REASON" \
    --arg keep_data "$KEEP_DATA" \
    '{
      trace_id: $trace_id,
      test_scope: "grace_period_unpaid_until_expired",
      tenant: { id: $tenant_id, name: $tenant_name },
      artifacts: {
        invoice_id: $invoice_id
      },
      notifier: {
        tested: ($notifier_tested == "true"),
        trace_id: $notifier_trace_id,
        email_reason: $notifier_email_reason,
        whatsapp_reason: $notifier_whatsapp_reason
      },
      assertions: {
        invoice_still_unpaid: ($assert_invoice_unpaid == "true"),
        subscription_expired_after_sync: ($assert_subscription_expired == "true"),
        notifier_reason_expired: (
          if $assert_notifier_reason == "skipped" then "skipped"
          else ($assert_notifier_reason == "true")
          end
        )
      },
      mode: {
        keep_data: ($keep_data == "true")
      }
    }'
}

main() {
  trap on_error ERR
  require_cmd curl
  require_cmd jq

  CURRENT_STEP="parse_args"
  parse_args "$@"
  CURRENT_STEP="load_env"
  load_env

  CURRENT_STEP="mktemp"
  TMP_DIR="$(mktemp -d)"
  trap cleanup EXIT

  CURRENT_STEP="pick_tenant"
  pick_tenant
  CURRENT_STEP="backup_rows"
  backup_rows
  CURRENT_STEP="seed_grace_expired_case"
  seed_grace_expired_case
  CURRENT_STEP="create_pending_invoice"
  create_pending_invoice
  CURRENT_STEP="run_notifier_dry_run"
  run_notifier_dry_run
  CURRENT_STEP="run_sync_and_assert"
  run_sync_and_assert
  CURRENT_STEP="print_result"
  print_result
}

main "$@"
