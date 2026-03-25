#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = process.cwd();
const ENV_FILE_CANDIDATES = [".env.online", ".env.local", ".env"];
const TRACE_ID = `MANUAL-CONTRACT-SMOKE-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const parseEnvContent = (content) => {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] || "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) env[key] = value;
  }
  return env;
};

const readEnvMap = async () => {
  const result = {};
  for (const filename of ENV_FILE_CANDIDATES) {
    try {
      const content = await fs.readFile(path.join(ROOT_DIR, filename), "utf8");
      Object.assign(result, parseEnvContent(content));
    } catch {
      // optional
    }
  }
  return result;
};

const pickEnv = (envMap, keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim() || envMap[key]?.trim();
    if (value) return value;
  }
  return "";
};

const readJson = async (relativePath) => {
  const content = await fs.readFile(path.join(ROOT_DIR, relativePath), "utf8");
  return JSON.parse(content);
};

const toYmd = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const addMonthsYmd = (baseDate, months) => {
  const date = new Date(baseDate);
  date.setMonth(date.getMonth() + months);
  return toYmd(date);
};

const pickContractCount = (activeEmployeeCount, explicitValue) => {
  if (Number.isFinite(explicitValue) && explicitValue > 0) {
    return Math.max(1, Math.floor(explicitValue));
  }
  if (activeEmployeeCount >= 995) {
    return Math.max(1, activeEmployeeCount - 1);
  }
  return Math.max(1, activeEmployeeCount + 6);
};

const parseArgs = (argv) => {
  const options = {
    tenantId: "",
    contractCount: NaN,
    keepData: false,
  };
  for (const arg of argv) {
    if (arg === "--keep-data") {
      options.keepData = true;
      continue;
    }
    if (arg.startsWith("--tenant-id=")) {
      options.tenantId = arg.slice("--tenant-id=".length).trim();
      continue;
    }
    if (arg.startsWith("--contract-count=")) {
      options.contractCount = Number(arg.slice("--contract-count=".length));
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/manual-contract-activation-smoke.mjs [options]

Options:
  --tenant-id=<uuid>        Tenant target. Default: org_admin_centralized.tenant_id
  --contract-count=<n>      Jumlah seat kontrak uji. Default: pegawai aktif + 6
  --keep-data               Jangan cleanup otomatis.
`);
      process.exit(0);
    }
    throw new Error(`Argumen tidak dikenal: ${arg}`);
  }
  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const envMap = await readEnvMap();
  const supabaseUrl = pickEnv(envMap, ["VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const supabaseAnonKey = pickEnv(envMap, [
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const serviceRoleKey = pickEnv(envMap, ["SUPABASE_SERVICE_ROLE_KEY"]);

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Env Supabase belum lengkap. Butuh URL + anon/publishable key + service role key.");
  }

  const accounts = await readJson("ops/test-accounts.local.json");
  const superadmin = accounts.superadmin;
  const defaultTenantId = accounts.org_admin_centralized?.tenant_id || "";
  const targetTenantId = options.tenantId || defaultTenantId;

  if (!superadmin?.email || !superadmin?.password) {
    throw new Error("Kredensial superadmin belum tersedia di ops/test-accounts.local.json.");
  }
  if (!targetTenantId) {
    throw new Error("Tenant target belum tersedia. Isi --tenant-id atau lengkapi org_admin_centralized.tenant_id.");
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cleanupState = {
    invoiceIds: [],
    invoiceNumbers: [],
    manualPaymentIds: [],
    notificationIds: [],
    backupSubscriptions: [],
  };

  try {
    const { error: signInError } = await sessionClient.auth.signInWithPassword({
      email: superadmin.email,
      password: superadmin.password,
    });
    if (signInError) {
      throw new Error(`Login superadmin gagal: ${signInError.message}`);
    }

    const { data: tenantRow, error: tenantError } = await serviceClient
      .from("tenants")
      .select("id, name, billing_mode")
      .eq("id", targetTenantId)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenantRow) throw new Error(`Tenant tidak ditemukan: ${targetTenantId}`);

    const { count: openInvoiceCount, error: openInvoiceError } = await serviceClient
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", targetTenantId)
      .in("status", ["PENDING", "AWAITING_VERIFICATION"]);
    if (openInvoiceError) throw openInvoiceError;
    if ((openInvoiceCount || 0) > 0) {
      throw new Error(`Tenant ${tenantRow.name} masih punya invoice aktif. Smoke dibatalkan agar aman.`);
    }

    const { count: activeEmployeeCountRaw, error: employeeCountError } = await serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", targetTenantId)
      .eq("is_active", true);
    if (employeeCountError) throw employeeCountError;
    const activeEmployeeCount = Number(activeEmployeeCountRaw || 0);

    const { data: subscriptionRows, error: subscriptionError } = await serviceClient
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", targetTenantId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (subscriptionError) throw subscriptionError;
    cleanupState.backupSubscriptions = subscriptionRows || [];
    const currentSubscription = cleanupState.backupSubscriptions[0] || null;

    const { data: packageRows, error: packageError } = await serviceClient
      .from("subscription_packages")
      .select("*")
      .eq("is_active", true)
      .eq("duration_months", 1)
      .order("sort_order", { ascending: true });
    if (packageError) throw packageError;
    const selectedPackage =
      (packageRows || []).find((row) => (row.module_scope || "attendance") === "attendance") ||
      (packageRows || [])[0];
    if (!selectedPackage) {
      throw new Error("Tidak ada package aktif durasi 1 bulan untuk smoke.");
    }

    const contractCount = pickContractCount(activeEmployeeCount, options.contractCount);
    if (contractCount === activeEmployeeCount) {
      throw new Error("Seat kontrak uji sama dengan pegawai aktif, sehingga smoke tidak membuktikan override headcount.");
    }

    const unitPrice = Number(selectedPackage.base_price_per_month || currentSubscription?.price_per_employee || 7500);
    const subtotal = unitPrice * contractCount * Number(selectedPackage.duration_months || 1);
    const discountAmount = 0;
    const now = new Date();
    const dueDate = toYmd(now);
    const uniqueCode = 321;
    const metadata = {
      billing_scope: "centralized",
      source: "ops.manual_contract_activation_smoke",
      billing_origin: "activation_early",
      billing_headcount_mode_after_payment: "manual_contract",
      contracted_employee_count_after_payment: contractCount,
      employee_count_source: "manual_contract",
      active_employee_count_at_invoice: activeEmployeeCount,
      tenant_id: targetTenantId,
      subscription_id: currentSubscription?.id || null,
      package_scope: selectedPackage.module_scope || "attendance",
      package_display_name: selectedPackage.name,
      package_base_price_per_employee: unitPrice,
      package_discounted_normal_price_per_employee: unitPrice,
      package_effective_price_reason: "manual_contract_smoke",
      subscription_recurring_price_per_employee: unitPrice,
      trace_id: TRACE_ID,
    };

    const { data: invoiceRpcResult, error: invoiceRpcError } = await sessionClient.rpc(
      "create_or_get_manual_invoice",
      {
        p_tenant_id: targetTenantId,
        p_subscription_id: currentSubscription?.id || null,
        p_package_id: selectedPackage.id,
        p_package_name: selectedPackage.name,
        p_package_duration_months: Number(selectedPackage.duration_months || 1),
        p_package_discount_percentage: Number(selectedPackage.discount_percentage || 0),
        p_employee_count: contractCount,
        p_price_per_employee: unitPrice,
        p_subtotal: subtotal,
        p_discount_amount: discountAmount,
        p_vat_percentage: 13,
        p_vat_amount: 0,
        p_gross_amount: subtotal + uniqueCode,
        p_xendit_fee: 0,
        p_net_amount: subtotal + uniqueCode,
        p_due_date: dueDate,
        p_unique_code: uniqueCode,
        p_notes: `Smoke manual contract ${TRACE_ID}`,
        p_metadata: metadata,
      },
    );
    if (invoiceRpcError) throw invoiceRpcError;

    const createdInvoiceId = invoiceRpcResult?.id || "";
    const createdInvoiceNumber = invoiceRpcResult?.invoice_number || "";
    if (!createdInvoiceId || !createdInvoiceNumber) {
      throw new Error("RPC create_or_get_manual_invoice tidak mengembalikan invoice baru.");
    }
    cleanupState.invoiceIds.push(createdInvoiceId);
    cleanupState.invoiceNumbers.push(createdInvoiceNumber);

    const { data: initialInvoice, error: invoiceFetchError } = await serviceClient
      .from("invoices")
      .select("*")
      .eq("id", createdInvoiceId)
      .maybeSingle();
    if (invoiceFetchError) throw invoiceFetchError;
    if (!initialInvoice) throw new Error("Invoice aktivasi awal tidak ditemukan setelah RPC.");

    const initialMetadata = initialInvoice.metadata || {};
    if (
      initialInvoice.employee_count !== contractCount ||
      initialMetadata.billing_headcount_mode_after_payment !== "manual_contract" ||
      initialMetadata.employee_count_source !== "manual_contract" ||
      initialMetadata.billing_origin !== "activation_early"
    ) {
      throw new Error("Metadata invoice aktivasi awal belum sesuai seat kontrak.");
    }

    const proofUrl = `https://example.com/proof/${TRACE_ID}.jpg`;
    const paymentDate = toYmd(now);
    const verifiedAt = new Date().toISOString();

    const { data: manualPaymentRows, error: manualPaymentInsertError } = await serviceClient
      .from("manual_payments")
      .insert({
        tenant_id: targetTenantId,
        amount: initialInvoice.gross_amount,
        payment_method: "bank_transfer",
        transfer_proof_url: proofUrl,
        reference_number: `SMOKE-${TRACE_ID}`,
        payment_date: paymentDate,
        status: "verified",
        verified_at: verifiedAt,
        invoice_number: createdInvoiceNumber,
        notes: `manual-contract-smoke|trace_id=${TRACE_ID}`,
      })
      .select("id");
    if (manualPaymentInsertError) throw manualPaymentInsertError;
    cleanupState.manualPaymentIds.push(...(manualPaymentRows || []).map((row) => row.id));

    const { error: invoicePaidError } = await serviceClient
      .from("invoices")
      .update({
        status: "PAID",
        payment_method_type: "MANUAL_TRANSFER",
        paid_at: verifiedAt,
        verified_at: verifiedAt,
        notes: `Smoke manual contract diverifikasi (${TRACE_ID})`,
        updated_at: verifiedAt,
      })
      .eq("id", createdInvoiceId);
    if (invoicePaidError) throw invoicePaidError;

    const baseStartDate =
      currentSubscription?.end_date && new Date(currentSubscription.end_date) > now
        ? new Date(currentSubscription.end_date)
        : now;
    const startDate = toYmd(baseStartDate);
    const endDate = addMonthsYmd(baseStartDate, Number(initialInvoice.package_duration_months || 1));
    const subscriptionUpdate = {
      status: "active",
      start_date: startDate,
      end_date: endDate,
      last_invoice_id: createdInvoiceId,
      grace_period_end: null,
      billing_headcount_mode: "manual_contract",
      contracted_employee_count: contractCount,
      max_employees: contractCount,
      price_per_employee:
        Number(initialMetadata.subscription_recurring_price_per_employee || initialInvoice.price_per_employee || unitPrice) ||
        unitPrice,
      updated_at: verifiedAt,
    };

    if (currentSubscription?.id) {
      const { error: subscriptionUpdateError } = await serviceClient
        .from("subscriptions")
        .update(subscriptionUpdate)
        .eq("id", currentSubscription.id);
      if (subscriptionUpdateError) throw subscriptionUpdateError;
    } else {
      const { error: subscriptionInsertError } = await serviceClient
        .from("subscriptions")
        .insert({
          tenant_id: targetTenantId,
          notes: "Jalur billing: Aktivasi awal.",
          ...subscriptionUpdate,
        });
      if (subscriptionInsertError) throw subscriptionInsertError;
    }

    const { error: ledgerInsertError } = await serviceClient.from("financial_ledger").insert({
      invoice_id: createdInvoiceId,
      tenant_id: targetTenantId,
      transaction_type: "PAYMENT",
      gross_amount: initialInvoice.gross_amount,
      xendit_fee: 0,
      vat_amount: initialInvoice.vat_amount,
      net_amount: Number(initialInvoice.gross_amount || 0) - Number(initialInvoice.vat_amount || 0),
      payment_source: "MANUAL",
      payment_method: "MANUAL_TRANSFER",
      transaction_date: paymentDate,
      notes: `Manual contract smoke for ${createdInvoiceNumber}`,
    });
    if (ledgerInsertError) throw ledgerInsertError;

    const { data: subscriptionAfterPayment, error: subscriptionAfterPaymentError } = await serviceClient
      .from("subscriptions")
      .select("id, status, billing_headcount_mode, contracted_employee_count, max_employees, last_invoice_id")
      .eq("tenant_id", targetTenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionAfterPaymentError) throw subscriptionAfterPaymentError;
    if (
      !subscriptionAfterPayment ||
      subscriptionAfterPayment.billing_headcount_mode !== "manual_contract" ||
      Number(subscriptionAfterPayment.contracted_employee_count || 0) !== contractCount ||
      subscriptionAfterPayment.last_invoice_id !== createdInvoiceId
    ) {
      throw new Error("Subscription setelah pembayaran belum tersimpan sebagai manual_contract.");
    }

    const { data: renewalInvoiceId, error: renewalRpcError } = await serviceClient.rpc(
      "create_pending_streak_invoice",
      {
        p_tenant_id: targetTenantId,
        p_grace_days: 7,
      },
    );
    if (renewalRpcError) throw renewalRpcError;
    if (!renewalInvoiceId) throw new Error("RPC create_pending_streak_invoice tidak mengembalikan invoice renewal.");
    cleanupState.invoiceIds.push(renewalInvoiceId);

    const { data: renewalInvoice, error: renewalFetchError } = await serviceClient
      .from("invoices")
      .select("*")
      .eq("id", renewalInvoiceId)
      .maybeSingle();
    if (renewalFetchError) throw renewalFetchError;
    if (!renewalInvoice) throw new Error("Invoice renewal tidak ditemukan setelah create_pending_streak_invoice.");
    cleanupState.invoiceNumbers.push(renewalInvoice.invoice_number);

    const renewalMetadata = renewalInvoice.metadata || {};
    if (
      renewalInvoice.employee_count !== contractCount ||
      renewalMetadata.employee_count_source !== "subscription_contract" ||
      Number(renewalMetadata.active_employee_count_at_invoice || 0) !== activeEmployeeCount ||
      renewalMetadata.billing_headcount_mode_after_payment !== "manual_contract"
    ) {
      throw new Error("Invoice renewal belum membaca seat kontrak seperti yang diharapkan.");
    }

    const { data: renewalNotifications, error: renewalNotificationError } = await serviceClient
      .from("notifications")
      .select("id, metadata, link")
      .eq("link", `/org/billing?menu=invoices&invoice=${renewalInvoice.invoice_number}`)
      .limit(20);
    if (renewalNotificationError) throw renewalNotificationError;
    cleanupState.notificationIds.push(
      ...(renewalNotifications || [])
        .filter((row) => row.metadata && row.metadata.invoice_id === renewalInvoiceId)
        .map((row) => row.id),
    );

    console.log(
      JSON.stringify(
        {
          trace_id: TRACE_ID,
          tenant: {
            id: targetTenantId,
            name: tenantRow.name,
            billing_mode: tenantRow.billing_mode,
          },
          checkpoints: {
            active_employee_count: activeEmployeeCount,
            contracted_employee_count: contractCount,
            initial_invoice_number: createdInvoiceNumber,
            renewal_invoice_number: renewalInvoice.invoice_number,
          },
          assertions: {
            activation_invoice_manual_contract: true,
            subscription_saved_manual_contract: true,
            renewal_uses_contracted_headcount: true,
          },
          cleanup: {
            keep_data: options.keepData,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    const { error: signOutError } = await sessionClient.auth.signOut();
    if (signOutError) {
      console.warn(`[${TRACE_ID}] signOut session warning: ${signOutError.message}`);
    }

    if (options.keepData) {
      return;
    }

    try {
      if (cleanupState.notificationIds.length > 0) {
        await serviceClient
          .from("notification_push_deliveries")
          .delete()
          .in("notification_id", cleanupState.notificationIds);
        await serviceClient.from("notifications").delete().in("id", cleanupState.notificationIds);
      }

      if (cleanupState.invoiceIds.length > 0) {
        await serviceClient
          .from("subscriptions")
          .update({ last_invoice_id: null })
          .in("last_invoice_id", cleanupState.invoiceIds);
        await serviceClient.from("billing_notification_logs").delete().in("invoice_id", cleanupState.invoiceIds);
        await serviceClient.from("payment_logs").delete().in("invoice_id", cleanupState.invoiceIds);
        await serviceClient.from("financial_ledger").delete().in("invoice_id", cleanupState.invoiceIds);
      }

      if (cleanupState.manualPaymentIds.length > 0) {
        await serviceClient.from("manual_payments").delete().in("id", cleanupState.manualPaymentIds);
      } else if (cleanupState.invoiceNumbers.length > 0) {
        await serviceClient.from("manual_payments").delete().in("invoice_number", cleanupState.invoiceNumbers);
      }

      if (cleanupState.invoiceIds.length > 0) {
        await serviceClient.from("invoices").delete().in("id", cleanupState.invoiceIds);
      }

      if (cleanupState.backupSubscriptions.length > 0) {
        const restoredTenantId = cleanupState.backupSubscriptions[0].tenant_id;
        await serviceClient.from("subscriptions").delete().eq("tenant_id", restoredTenantId);
        await serviceClient.from("subscriptions").upsert(cleanupState.backupSubscriptions, { onConflict: "id" });
      }
    } catch (cleanupError) {
      console.warn(
        `[${TRACE_ID}] cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        trace_id: TRACE_ID,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
