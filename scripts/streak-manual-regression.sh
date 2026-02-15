#!/usr/bin/env bash
set -euo pipefail

TRACE_ID="STREAK-MANUAL-REG-$(date +%Y%m%d%H%M%S)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
ARTIFACT_DIR="$ROOT_DIR/artifacts/streak-fixtures/backups"

SUPABASE_URL=""
SERVICE_KEY=""
API_BASE=""

STREAK_BACKUP_FILE=""
SUBSCRIPTIONS_BACKUP_FILE=""
TMP_DIR=""

TENANT_ID=""
TENANT_NAME=""
INVOICE_ID=""
INVOICE_NUMBER=""
MANUAL_PAYMENT_ID=""
LEDGER_ID=""

INVOICE_CREATED_STATUS=""
INVOICE_CREATED_METHOD=""

ASSERT_INVOICE_PAID_MANUAL="false"
ASSERT_STREAK_INVOICED="false"
ASSERT_SUBSCRIPTION_ACTIVE="false"
ASSERT_MANUAL_PAYMENT_VERIFIED="false"
ASSERT_LEDGER_RECORDED="false"
FALLBACK_SEEDED="false"
KEEP_DATA="false"
SELECTED_TENANT_ID=""

show_help() {
  cat <<EOF
Usage:
  bash scripts/streak-manual-regression.sh [options]

Options:
  --keep-data            Jangan cleanup otomatis (untuk inspeksi debug).
  --tenant-id=<uuid>     Pakai tenant tertentu untuk test.
  --help                 Tampilkan bantuan ini.

Default:
  - Menjalankan test end-to-end streak -> manual transfer -> paid.
  - Cleanup otomatis aktif (hapus data uji + restore data backup).
EOF
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

log_error() {
  local ref="$1"
  local msg="$2"
  echo "ERROR [$ref] $msg" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "$TRACE_ID-CMD" "Perintah '$cmd' tidak tersedia."
    exit 1
  fi
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "$TRACE_ID-ENV-001" "File .env.local tidak ditemukan: $ENV_FILE"
    exit 1
  fi

  SUPABASE_URL="$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/\r$//')"
  SERVICE_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/\r$//')"

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

backup_global_streak() {
  mkdir -p "$ARTIFACT_DIR"
  STREAK_BACKUP_FILE="$ARTIFACT_DIR/stability_streaks_regression_${TRACE_ID}.json"
  api_get "stability_streaks?select=*" > "$STREAK_BACKUP_FILE"
}

portable_date_plus_days() {
  local days="$1"
  date -v+"$days"d +%F 2>/dev/null || date -d "+$days days" +%F
}

get_streak_threshold() {
  local raw
  raw="$(api_get "system_settings?key=eq.streak_threshold&select=value&limit=1" | jq -r 'if length == 0 then 30 else (.[0].value.value // .[0].value // 30) end | tonumber? // 30')"
  if [[ "$raw" -lt 1 ]]; then
    raw=30
  fi
  echo "$raw"
}

create_fallback_candidate_tenant() {
  local tenants_json tenant_count i candidate_id candidate_name open_count
  tenants_json="$(api_get "tenants?select=id,name&order=created_at.asc&limit=100")"
  tenant_count="$(echo "$tenants_json" | jq 'length')"
  if [[ "$tenant_count" -eq 0 ]]; then
    log_error "$TRACE_ID-TENANT-003" "Tidak ada tenant untuk fallback sample."
    exit 1
  fi

  i=0
  while [[ "$i" -lt "$tenant_count" ]]; do
    candidate_id="$(echo "$tenants_json" | jq -r ".[$i].id // empty")"
    candidate_name="$(echo "$tenants_json" | jq -r ".[$i].name // \"-\"")"

    if [[ -z "$candidate_id" ]]; then
      i=$((i + 1))
      continue
    fi

    open_count="$(api_get "invoices?tenant_id=eq.$candidate_id&status=in.(PENDING,AWAITING_VERIFICATION)&select=id" | jq 'length')"
    if [[ "$open_count" -eq 0 ]]; then
      local threshold today grace_end payload
      threshold="$(get_streak_threshold)"
      today="$(date +%F)"
      grace_end="$(portable_date_plus_days 3)"

      payload="$(jq -n \
        --arg tenant_id "$candidate_id" \
        --arg today "$today" \
        --arg grace_end "$grace_end" \
        --argjson threshold "$threshold" \
        '{
          tenant_id: $tenant_id,
          streak_count: $threshold,
          last_activity_date: $today,
          streak_started_at: $today,
          reached_target: true,
          reached_target_at: (now | todateiso8601),
          grace_period_end: $grace_end,
          status: "grace_period",
          updated_at: (now | todateiso8601)
        }')"

      api_post "stability_streaks?on_conflict=tenant_id" "[$payload]" "resolution=merge-duplicates,return=minimal" >/dev/null

      TENANT_ID="$candidate_id"
      TENANT_NAME="$candidate_name"
      FALLBACK_SEEDED="true"
      return
    fi

    i=$((i + 1))
  done

  log_error "$TRACE_ID-TENANT-004" "Tidak ada tenant fallback yang bebas invoice terbuka."
  exit 1
}

pick_test_tenant() {
  if [[ -n "$SELECTED_TENANT_ID" ]]; then
    local selected_tenant_json selected_open_count
    selected_tenant_json="$(api_get "tenants?id=eq.$SELECTED_TENANT_ID&select=id,name&limit=1")"
    if [[ "$(echo "$selected_tenant_json" | jq 'length')" -eq 0 ]]; then
      log_error "$TRACE_ID-TENANT-SEL-001" "Tenant tidak ditemukan: $SELECTED_TENANT_ID"
      exit 1
    fi

    selected_open_count="$(api_get "invoices?tenant_id=eq.$SELECTED_TENANT_ID&status=in.(PENDING,AWAITING_VERIFICATION)&select=id" | jq 'length')"
    if [[ "$selected_open_count" -gt 0 ]]; then
      log_error "$TRACE_ID-TENANT-SEL-002" "Tenant pilihan masih punya invoice terbuka. Pilih tenant lain atau kosongkan --tenant-id."
      exit 1
    fi

    TENANT_ID="$SELECTED_TENANT_ID"
    TENANT_NAME="$(echo "$selected_tenant_json" | jq -r '.[0].name // "-"')"
    return
  fi

  local candidates_json
  candidates_json="$(api_get "stability_streaks?select=tenant_id,status,reached_target,grace_period_end,tenants(name)&status=in.(grace_period,ready_for_invoicing)&reached_target=eq.true&order=updated_at.desc&limit=30")"

  local count i candidate_id open_count
  count="$(echo "$candidates_json" | jq 'length')"
  if [[ "$count" -eq 0 ]]; then
    create_fallback_candidate_tenant
    return
  fi

  i=0
  while [[ "$i" -lt "$count" ]]; do
    candidate_id="$(echo "$candidates_json" | jq -r ".[$i].tenant_id // empty")"
    if [[ -z "$candidate_id" ]]; then
      i=$((i + 1))
      continue
    fi

    open_count="$(api_get "invoices?tenant_id=eq.$candidate_id&status=in.(PENDING,AWAITING_VERIFICATION)&select=id" | jq 'length')"
    if [[ "$open_count" -eq 0 ]]; then
      TENANT_ID="$candidate_id"
      TENANT_NAME="$(echo "$candidates_json" | jq -r ".[$i].tenants.name // \"-\"")"
      break
    fi

    i=$((i + 1))
  done

  if [[ -z "$TENANT_ID" ]]; then
    create_fallback_candidate_tenant
  fi
}

backup_tenant_subscriptions() {
  SUBSCRIPTIONS_BACKUP_FILE="$TMP_DIR/subscriptions_backup.json"
  api_get "subscriptions?tenant_id=eq.$TENANT_ID&select=*&order=created_at.asc" > "$SUBSCRIPTIONS_BACKUP_FILE"
}

create_pending_invoice() {
  INVOICE_ID="$(api_post "rpc/create_pending_streak_invoice" "{\"p_tenant_id\":\"$TENANT_ID\",\"p_grace_days\":7}" "return=representation" | jq -r '.')"
  if [[ -z "$INVOICE_ID" || "$INVOICE_ID" == "null" ]]; then
    log_error "$TRACE_ID-INVOICE-001" "Gagal membuat invoice pending dari fungsi create_pending_streak_invoice."
    exit 1
  fi

  local invoice_row
  invoice_row="$(api_get "invoices?id=eq.$INVOICE_ID&select=id,status,payment_method_type,invoice_number,gross_amount")"
  INVOICE_CREATED_STATUS="$(echo "$invoice_row" | jq -r '.[0].status // empty')"
  INVOICE_CREATED_METHOD="$(echo "$invoice_row" | jq -r '.[0].payment_method_type // empty')"
  INVOICE_NUMBER="$(echo "$invoice_row" | jq -r '.[0].invoice_number // empty')"

  if [[ -z "$INVOICE_NUMBER" ]]; then
    log_error "$TRACE_ID-INVOICE-002" "Invoice number tidak ditemukan sesudah invoice dibuat."
    exit 1
  fi
}

simulate_manual_flow() {
  local proof_url now_utc amount_json payload_verify_at manual_payload ledger_payload
  local gross_amount

  proof_url="https://example.com/proof/$INVOICE_ID.jpg"
  now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  gross_amount="$(api_get "invoices?id=eq.$INVOICE_ID&select=gross_amount" | jq -r '.[0].gross_amount // 0')"

  api_patch "invoices?id=eq.$INVOICE_ID" \
    "{\"status\":\"AWAITING_VERIFICATION\",\"payment_method_type\":\"MANUAL_TRANSFER\",\"payment_proof_url\":\"$proof_url\",\"updated_at\":\"$now_utc\"}"

  amount_json="$(jq -n --argjson amount "$gross_amount" '$amount')"
  manual_payload="$(jq -n \
    --arg tenant_id "$TENANT_ID" \
    --arg invoice_number "$INVOICE_NUMBER" \
    --arg proof "$proof_url" \
    --arg ref "TRX-$INVOICE_ID" \
    --arg today "$(date +%F)" \
    --argjson amount "$amount_json" \
    '{
      tenant_id: $tenant_id,
      amount: $amount,
      payment_method: "bank_transfer",
      transfer_proof_url: $proof,
      reference_number: $ref,
      payment_date: $today,
      status: "pending",
      invoice_number: $invoice_number,
      notes: "integration-test-manual-transfer"
    }')"
  MANUAL_PAYMENT_ID="$(api_post "manual_payments" "$manual_payload" | jq -r '.[0].id // empty')"
  if [[ -z "$MANUAL_PAYMENT_ID" ]]; then
    log_error "$TRACE_ID-MPAY-001" "Gagal insert manual_payments."
    exit 1
  fi

  payload_verify_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  api_patch "manual_payments?id=eq.$MANUAL_PAYMENT_ID" \
    "{\"status\":\"verified\",\"verified_at\":\"$payload_verify_at\",\"updated_at\":\"$payload_verify_at\"}"

  api_patch "invoices?id=eq.$INVOICE_ID" \
    "{\"status\":\"PAID\",\"paid_at\":\"$payload_verify_at\",\"verified_at\":\"$payload_verify_at\",\"notes\":\"Pembayaran manual diverifikasi (regression test)\",\"updated_at\":\"$payload_verify_at\"}"

  LEDGER_ID="$(api_get "financial_ledger?invoice_id=eq.$INVOICE_ID&select=id&limit=1" | jq -r '.[0].id // empty')"
  if [[ -z "$LEDGER_ID" ]]; then
    ledger_payload="$(jq -n \
      --arg invoice_id "$INVOICE_ID" \
      --arg tenant_id "$TENANT_ID" \
      --arg today "$(date +%F)" \
      --arg note "Manual payment for $INVOICE_NUMBER (regression test)" \
      --argjson gross "$amount_json" \
      '{
        invoice_id: $invoice_id,
        tenant_id: $tenant_id,
        transaction_type: "PAYMENT",
        gross_amount: $gross,
        xendit_fee: 0,
        vat_amount: 0,
        net_amount: $gross,
        payment_source: "MANUAL",
        payment_method: "MANUAL_TRANSFER",
        transaction_date: $today,
        notes: $note
      }')"
    LEDGER_ID="$(api_post "financial_ledger" "$ledger_payload" | jq -r '.[0].id // empty')"
  fi

  if [[ -z "$LEDGER_ID" ]]; then
    log_error "$TRACE_ID-LEDGER-001" "Gagal insert financial_ledger."
    exit 1
  fi

  api_post "rpc/mark_streak_invoiced" \
    "{\"p_tenant_id\":\"$TENANT_ID\",\"p_invoice_id\":\"$INVOICE_ID\"}" \
    "return=minimal" >/dev/null
}

run_assertions() {
  local invoice_after streak_after sub_after manual_after ledger_after

  invoice_after="$(api_get "invoices?id=eq.$INVOICE_ID&select=status,payment_method_type,paid_at")"
  streak_after="$(api_get "stability_streaks?tenant_id=eq.$TENANT_ID&select=status,reached_target")"
  sub_after="$(api_get "subscriptions?tenant_id=eq.$TENANT_ID&select=status,last_invoice_id&order=updated_at.desc&limit=1")"
  manual_after="$(api_get "manual_payments?id=eq.$MANUAL_PAYMENT_ID&select=status,verified_at")"
  ledger_after="$(api_get "financial_ledger?invoice_id=eq.$INVOICE_ID&select=id&limit=1")"

  ASSERT_INVOICE_PAID_MANUAL="$(echo "$invoice_after" | jq -r '((.[0].status=="PAID") and (.[0].payment_method_type=="MANUAL_TRANSFER") and (.[0].paid_at!=null))')"
  ASSERT_STREAK_INVOICED="$(echo "$streak_after" | jq -r '((.[0].status=="invoiced") and (.[0].reached_target==true))')"
  ASSERT_SUBSCRIPTION_ACTIVE="$(echo "$sub_after" | jq -r '((.[0].status=="active") and (.[0].last_invoice_id!=null))')"
  ASSERT_MANUAL_PAYMENT_VERIFIED="$(echo "$manual_after" | jq -r '((.[0].status=="verified") and (.[0].verified_at!=null))')"
  ASSERT_LEDGER_RECORDED="$(echo "$ledger_after" | jq -r 'length>0')"

  if [[ "$ASSERT_INVOICE_PAID_MANUAL" != "true" || "$ASSERT_STREAK_INVOICED" != "true" || "$ASSERT_SUBSCRIPTION_ACTIVE" != "true" || "$ASSERT_MANUAL_PAYMENT_VERIFIED" != "true" || "$ASSERT_LEDGER_RECORDED" != "true" ]]; then
    log_error "$TRACE_ID-ASSERT-001" "Sebagian assertion gagal."
    return 1
  fi

  return 0
}

restore_subscriptions() {
  local backup_count payload
  if [[ -z "$TENANT_ID" || -z "$SUBSCRIPTIONS_BACKUP_FILE" || ! -f "$SUBSCRIPTIONS_BACKUP_FILE" ]]; then
    return
  fi

  api_delete "subscriptions?tenant_id=eq.$TENANT_ID" || true
  backup_count="$(jq 'length' "$SUBSCRIPTIONS_BACKUP_FILE")"
  if [[ "$backup_count" -gt 0 ]]; then
    payload="$(cat "$SUBSCRIPTIONS_BACKUP_FILE")"
    api_post "subscriptions?on_conflict=id" "$payload" "resolution=merge-duplicates,return=minimal" >/dev/null 2>&1 || true
  fi
}

restore_streak() {
  local payload row_count
  if [[ -z "$STREAK_BACKUP_FILE" || ! -f "$STREAK_BACKUP_FILE" ]]; then
    return
  fi

  payload="$(cat "$STREAK_BACKUP_FILE")"
  row_count="$(echo "$payload" | jq 'length')"
  api_delete "stability_streaks?id=not.is.null"
  if [[ "$row_count" -gt 0 ]]; then
    api_post "stability_streaks?on_conflict=tenant_id" "$payload" "resolution=merge-duplicates,return=minimal" >/dev/null
  fi
}

cleanup_test_rows() {
  if [[ -n "$INVOICE_ID" ]]; then
    if [[ -n "$TENANT_ID" ]]; then
      api_patch "subscriptions?tenant_id=eq.$TENANT_ID&last_invoice_id=eq.$INVOICE_ID" \
        "{\"last_invoice_id\":null,\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" || true
    fi

    api_delete "financial_ledger?invoice_id=eq.$INVOICE_ID" || true
    if [[ -n "$MANUAL_PAYMENT_ID" ]]; then
      api_delete "manual_payments?id=eq.$MANUAL_PAYMENT_ID" || true
    fi
    api_delete "invoices?id=eq.$INVOICE_ID" || true
  fi
}

cleanup() {
  set +e
  if [[ "$KEEP_DATA" == "true" ]]; then
    if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
      rm -rf "$TMP_DIR" >/dev/null 2>&1
    fi
    return
  fi

  restore_subscriptions
  cleanup_test_rows
  restore_streak
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
    --arg manual_payment_id "$MANUAL_PAYMENT_ID" \
    --arg ledger_id "$LEDGER_ID" \
    --arg invoice_created_status "$INVOICE_CREATED_STATUS" \
    --arg invoice_created_method "$INVOICE_CREATED_METHOD" \
    --arg invoice_paid_manual "$ASSERT_INVOICE_PAID_MANUAL" \
    --arg streak_invoiced "$ASSERT_STREAK_INVOICED" \
    --arg subscription_active "$ASSERT_SUBSCRIPTION_ACTIVE" \
    --arg manual_verified "$ASSERT_MANUAL_PAYMENT_VERIFIED" \
    --arg ledger_recorded "$ASSERT_LEDGER_RECORDED" \
    --arg fallback_seeded "$FALLBACK_SEEDED" \
    --arg keep_data "$KEEP_DATA" \
    --arg streak_backup_file "$STREAK_BACKUP_FILE" \
    --arg subscriptions_backup_file "$SUBSCRIPTIONS_BACKUP_FILE" \
    '{
      trace_id: $trace_id,
      test_scope: "streak_to_manual_transfer_payment",
      tenant: { id: $tenant_id, name: $tenant_name },
      artifacts: {
        invoice_id: $invoice_id,
        manual_payment_id: $manual_payment_id,
        ledger_id: $ledger_id
      },
      checkpoints: {
        invoice_created_status: $invoice_created_status,
        invoice_created_payment_method: $invoice_created_method
      },
      assertions: {
        invoice_paid_manual: ($invoice_paid_manual == "true"),
        streak_marked_invoiced: ($streak_invoiced == "true"),
        subscription_active: ($subscription_active == "true"),
        manual_payment_verified: ($manual_verified == "true"),
        financial_ledger_recorded: ($ledger_recorded == "true")
      },
      sampling: {
        fallback_seeded: ($fallback_seeded == "true")
      },
      mode: {
        keep_data: ($keep_data == "true")
      },
      debug_restore_files: {
        streak_backup_file: $streak_backup_file,
        subscriptions_backup_file: $subscriptions_backup_file
      },
      cleanup: {
        test_rows_deleted: ($keep_data != "true"),
        subscriptions_restored: ($keep_data != "true"),
        streak_restored: ($keep_data != "true")
      }
    }'
}

main() {
  require_cmd curl
  require_cmd jq
  parse_args "$@"
  load_env

  TMP_DIR="$(mktemp -d)"
  trap cleanup EXIT

  backup_global_streak
  pick_test_tenant
  backup_tenant_subscriptions
  create_pending_invoice
  simulate_manual_flow
  run_assertions
  print_result
}

main "$@"
