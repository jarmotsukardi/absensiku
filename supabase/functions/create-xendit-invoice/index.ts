import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateInvoiceRequest {
  tenant_id: string;
  package_id?: string;
  employee_count: number;
  duration_months: number;
  marketing_staff_id?: string;
  description?: string;
  employee_id?: string;
  billing_scope?: "centralized" | "individual";
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: unknown;
}

interface SubscriptionPriceRow {
  price_per_employee: number | null;
}

interface ActiveInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_url: string | null;
  status: string;
  gross_amount: number;
  due_date: string;
  payment_method_type: string | null;
  metadata?: Record<string, unknown> | null;
}

interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
}

const parseNumericSetting = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if ("value" in value) return parseNumericSetting(value.value, fallback);
    if ("amount" in value) return parseNumericSetting(value.amount, fallback);
  }
  return fallback;
};

const parseBooleanSetting = (raw: unknown, fallback: boolean): boolean => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if ("value" in value) return parseBooleanSetting(value.value, fallback);
    if ("enabled" in value) return parseBooleanSetting(value.enabled, fallback);
  }
  return fallback;
};

const parseTextSetting = (raw: unknown): string | null => {
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    const candidate = value.secret_key;
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  }
  return null;
};

const BILLING_DURATION_OPTIONS = [1, 3, 6, 12] as const;
const INDIVIDUAL_MIN_DURATION_SETTING_KEY = "individual_min_duration_months";
const INDIVIDUAL_MIN_DURATION_DEFAULT = 6;
const CENTRALIZED_MIN_DURATION_SETTING_KEYS = {
  pemerintah_daerah: "centralized_min_duration_pemerintah_daerah_months",
  instansi_pemerintah: "centralized_min_duration_instansi_pemerintah_months",
  perusahaan: "centralized_min_duration_perusahaan_months",
  sekolah: "centralized_min_duration_sekolah_months",
} as const;
const CENTRALIZED_MIN_DURATION_DEFAULTS = {
  pemerintah_daerah: 12,
  instansi_pemerintah: 1,
  perusahaan: 1,
  sekolah: 6,
} as const;

const normalizeOrganizationType = (
  raw: unknown,
): keyof typeof CENTRALIZED_MIN_DURATION_SETTING_KEYS => {
  if (raw === "pemerintah_daerah") return "pemerintah_daerah";
  if (raw === "instansi_pemerintah") return "instansi_pemerintah";
  if (raw === "sekolah") return "sekolah";
  return "perusahaan";
};

const normalizeDurationOption = (raw: unknown, fallback: number): number => {
  const parsed = Math.floor(parseNumericSetting(raw, fallback));
  if (BILLING_DURATION_OPTIONS.includes(parsed as (typeof BILLING_DURATION_OPTIONS)[number])) {
    return parsed;
  }
  return fallback;
};

const parseBillingScopeFromMetadata = (raw: unknown): "individual" | "centralized" => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "centralized";
  const metadata = raw as Record<string, unknown>;
  return metadata.billing_scope === "individual" ? "individual" : "centralized";
};

const parseEmployeeIdFromMetadata = (raw: unknown): string | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const metadata = raw as Record<string, unknown>;
  return typeof metadata.employee_id === "string" && metadata.employee_id.trim().length > 0
    ? metadata.employee_id.trim()
    : null;
};

const ACTIVE_INVOICE_STATUSES = [
  "PENDING",
  "AWAITING_VERIFICATION",
  "AWAITING_VERIFICATION_FULL",
  "PENDING_VERIFICATION_PARTIAL",
  "PARTIALLY_PAID",
  "REJECTED_NEEDS_REVISION",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("create-xendit-invoice");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xenditSecretKeyFromEnv = Deno.env.get("XENDIT_SECRET_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify(withTrace({ error: "Invalid token" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateInvoiceRequest = await req.json();

    const requestedBillingScope = (body.billing_scope || "").trim().toLowerCase();
    const requestedEmployeeId = (body.employee_id || "").trim();

    // Rate limit: max 10 invoices per hour per tenant / employee scope
    const { tenant_id: reqTenantId } = body;
    if (reqTenantId) {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      let rateLimitQuery = supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", reqTenantId)
        .gte("created_at", oneHourAgo);

      if (requestedEmployeeId) {
        rateLimitQuery = rateLimitQuery.contains("metadata", {
          billing_scope: "individual",
          employee_id: requestedEmployeeId,
        });
      }

      const { count } = await rateLimitQuery;
      if (count !== null && count >= 10) {
        return new Response(
          JSON.stringify(withTrace({ error: "Terlalu banyak invoice dibuat. Coba lagi nanti." }, traceId)),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const { tenant_id, package_id, employee_count, duration_months, marketing_staff_id, description } = body;
    const rawEmployeeCount = Number(employee_count);
    const rawDurationMonths = Number(duration_months);
    const requestedEmployeeCount = Number.isFinite(rawEmployeeCount)
      ? Math.floor(rawEmployeeCount)
      : NaN;
    const requestedDurationMonths = Number.isFinite(rawDurationMonths)
      ? Math.floor(rawDurationMonths)
      : NaN;

    if (
      !tenant_id ||
      !Number.isFinite(requestedEmployeeCount) ||
      !Number.isFinite(requestedDurationMonths) ||
      requestedEmployeeCount < 1 ||
      requestedDurationMonths < 1
    ) {
      return new Response(
        JSON.stringify(withTrace({ error: "Missing required fields" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, code, email, billing_mode, organization_type")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify(withTrace({ error: "Tenant not found" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantIsIndividual = tenant.billing_mode === "individual";
    if (!tenantIsIndividual && requestedBillingScope === "individual") {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: "Tenant ini menggunakan billing terpusat. Scope individual tidak diizinkan.",
              billing_mode: tenant.billing_mode ?? "centralized",
            },
            traceId,
          ),
        ),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolvedBillingScope: "individual" | "centralized" = tenantIsIndividual ? "individual" : "centralized";
    const isIndividualScope = resolvedBillingScope === "individual";

    let scopedEmployee: EmployeeRow | null = null;
    if (isIndividualScope) {
      if (!requestedEmployeeId) {
        return new Response(
          JSON.stringify(withTrace({ error: "employee_id wajib untuk billing individual" }, traceId)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const [{ data: employee, error: employeeError }, { data: actorRoles, error: roleError }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, tenant_id, user_id, name, email")
          .eq("id", requestedEmployeeId)
          .eq("tenant_id", tenant_id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role, tenant_id")
          .eq("user_id", authData.user.id),
      ]);

      if (employeeError || !employee) {
        return new Response(
          JSON.stringify(withTrace({ error: "Data pegawai untuk billing individual tidak ditemukan" }, traceId)),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (roleError) {
        logTraceError(traceId, "Failed to resolve actor roles for individual billing", roleError);
      }

      const roleRows = (actorRoles || []) as Array<{ role: string; tenant_id: string | null }>;
      const actorIsSuperAdmin = roleRows.some((row) => row.role === "super_admin");
      const actorIsTenantAdmin = roleRows.some(
        (row) => row.role === "admin_instansi" && row.tenant_id === tenant_id,
      );
      const actorOwnsEmployee = employee.user_id === authData.user.id;

      if (!actorIsSuperAdmin && !actorIsTenantAdmin && !actorOwnsEmployee) {
        return new Response(
          JSON.stringify(withTrace({ error: "Forbidden employee scope access" }, traceId)),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      scopedEmployee = employee as EmployeeRow;
    }

    const { data: activeInvoiceRows } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_url, status, gross_amount, due_date, payment_method_type, metadata")
      .eq("tenant_id", tenant_id)
      .in("status", [...ACTIVE_INVOICE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(100);

    const existingActive = ((activeInvoiceRows || []) as ActiveInvoiceRow[]).find((row) => {
      const scope = parseBillingScopeFromMetadata(row.metadata);
      if (isIndividualScope) {
        return scope === "individual" && parseEmployeeIdFromMetadata(row.metadata) === requestedEmployeeId;
      }
      return scope !== "individual";
    }) || null;

    if (existingActive) {
      if (existingActive.status === "PENDING" || existingActive.status === "AWAITING_VERIFICATION") {
        return new Response(
          JSON.stringify({
            success: true,
            reused: true,
            invoice: {
              id: existingActive.id,
              invoice_number: existingActive.invoice_number,
              invoice_url: existingActive.invoice_url,
              gross_amount: existingActive.gross_amount,
              due_date: existingActive.due_date,
              payment_method_type: existingActive.payment_method_type,
            },
            fallback_payment_method:
              existingActive.payment_method_type === "MANUAL_TRANSFER" ? "MANUAL_TRANSFER" : null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: false,
              error: `Masih ada invoice aktif (${existingActive.invoice_number}) yang harus diselesaikan terlebih dahulu.`,
              active_invoice: {
                id: existingActive.id,
                invoice_number: existingActive.invoice_number,
                status: existingActive.status,
                payment_method_type: existingActive.payment_method_type,
                due_date: existingActive.due_date,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get billing settings
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("setting_key, setting_value");

    const settingsRows = (billingSettings ?? []) as BillingSettingRow[];
    const getSettingValue = (key: string): unknown => {
      const setting = settingsRows.find((s) => s.setting_key === key);
      return setting?.setting_value ?? null;
    };

    const xenditEnabled = parseBooleanSetting(getSettingValue("xendit_enabled"), false);
    const xenditSecretKeyFromSettings = parseTextSetting(getSettingValue("xendit_config"));
    const xenditSecretKey = (xenditSecretKeyFromEnv || xenditSecretKeyFromSettings || "").trim();
    const useManualTransferFallback = !xenditEnabled || !xenditSecretKey;
    const manualFallbackCode = !xenditEnabled ? "XENDIT_DISABLED" : "XENDIT_KEY_MISSING";
    const manualFallbackMessage = !xenditEnabled
      ? "Pembayaran online Xendit sedang nonaktif. Invoice dialihkan ke transfer manual."
      : "Konfigurasi Xendit belum lengkap. Invoice dialihkan ke transfer manual.";

    const minimumDurationMonths = (() => {
      if (isIndividualScope) {
        return normalizeDurationOption(
          getSettingValue(INDIVIDUAL_MIN_DURATION_SETTING_KEY),
          INDIVIDUAL_MIN_DURATION_DEFAULT,
        );
      }
      const orgType = normalizeOrganizationType(tenant.organization_type);
      const settingKey = CENTRALIZED_MIN_DURATION_SETTING_KEYS[orgType];
      const fallback = CENTRALIZED_MIN_DURATION_DEFAULTS[orgType];
      return normalizeDurationOption(getSettingValue(settingKey), fallback);
    })();

    if (requestedDurationMonths < minimumDurationMonths) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: `Durasi minimum pembayaran untuk tenant ini adalah ${minimumDurationMonths} bulan.`,
              minimum_duration_months: minimumDurationMonths,
              requested_duration_months: requestedDurationMonths,
              billing_mode: tenant.billing_mode ?? "centralized",
              organization_type: tenant.organization_type ?? "perusahaan",
            },
            traceId,
          ),
        ),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pricePerEmployee = parseNumericSetting(getSettingValue("price_per_employee"), 15000);
    const ppnPercentage = parseNumericSetting(getSettingValue("vat_percentage"), 11);
    const pphPercentage = parseNumericSetting(getSettingValue("pph_percentage"), 2);
    const internalTaxPercentage = ppnPercentage + pphPercentage;

    const [
      subPriceResult,
      b2bThresholdResult,
      activeEmployeeCountResult,
    ] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("price_per_employee")
        .eq("tenant_id", tenant_id)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", "b2b_negotiation_threshold")
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("is_active", true),
    ]);

    const { data: subPriceRow, error: subPriceError } = subPriceResult;
    if (subPriceError) {
      logTraceError(traceId, "Failed to load subscription negotiated price", subPriceError);
    }
    const negotiatedPrice = (subPriceRow as SubscriptionPriceRow | null)?.price_per_employee;
    const hasNegotiatedPrice =
      typeof negotiatedPrice === "number" && Number.isFinite(negotiatedPrice) && negotiatedPrice > 0;
    const isCentralizedBilling = tenant.billing_mode !== "individual";

    const thresholdRaw = b2bThresholdResult.data?.value;
    const b2bThreshold = Math.max(1, Math.floor(parseNumericSetting(thresholdRaw, 2000)));
    const activeEmployeeCount = Math.max(0, activeEmployeeCountResult.count ?? 0);
    const effectiveHeadcount = Math.max(activeEmployeeCount, requestedEmployeeCount);
    const isB2BHeadcount = effectiveHeadcount >= b2bThreshold;
    const isB2BManualOnly = isCentralizedBilling && (hasNegotiatedPrice || isB2BHeadcount);

    if (isB2BManualOnly) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: "Skema B2B wajib pembayaran manual transfer",
              reason: hasNegotiatedPrice ? "NEGOTIATED_PRICE" : "HEADCOUNT_THRESHOLD",
              billing_mode: tenant.billing_mode ?? "centralized",
              b2b_threshold: b2bThreshold,
              active_employee_count: activeEmployeeCount,
              requested_employee_count: requestedEmployeeCount,
            },
            traceId,
          ),
        ),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const effectivePricePerEmployee =
      hasNegotiatedPrice
        ? negotiatedPrice
        : pricePerEmployee;

    // Get package if provided
    let packageData = null;
    let discountPercentage = 0;

    if (package_id) {
      const { data: pkg } = await supabase
        .from("subscription_packages")
        .select("*")
        .eq("id", package_id)
        .single();

      if (pkg) {
        packageData = pkg;
        discountPercentage = pkg.discount_percentage || 0;
      }
    }

    const billedEmployeeCount = isIndividualScope ? 1 : requestedEmployeeCount;

    // Calculate amounts
    const subtotal = billedEmployeeCount * effectivePricePerEmployee * requestedDurationMonths;
    const discountAmount = subtotal * (discountPercentage / 100);
    const amountAfterDiscount = subtotal - discountAmount;
    const ppnAmount = amountAfterDiscount * (ppnPercentage / 100);
    const pphAmount = amountAfterDiscount * (pphPercentage / 100);
    const vatAmount = ppnAmount + pphAmount;
    const grossAmount = amountAfterDiscount + vatAmount;

    // Estimate Xendit fee (VA: Rp 4,000, QR: 0.7%, Cards: 2.9%)
    const xenditFee = Math.round(grossAmount * 0.01 + 4000); // Simplified estimation
    const netAmount = grossAmount - xenditFee - vatAmount;

    // Generate invoice number
    const { data: invoiceNumber } = await supabase.rpc("generate_invoice_number");
    const resolvedInvoiceNumber = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
    if (!resolvedInvoiceNumber) {
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to generate invoice number" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create external_id for Xendit
    const externalId = `${resolvedInvoiceNumber}-${Date.now()}`;

    // Calculate due date (3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateIso = dueDate.toISOString().slice(0, 10);

    // Reserve invoice row first to prevent duplicate active invoice creation race
    const { data: reservedInvoice, error: reserveError } = await supabase
      .from("invoices")
      .insert({
        tenant_id,
        invoice_number: resolvedInvoiceNumber,
        external_id: useManualTransferFallback ? null : externalId,
        package_id: package_id || null,
        package_name: packageData?.name || "Custom",
        package_duration_months: requestedDurationMonths,
        package_discount_percentage: discountPercentage,
        employee_count: billedEmployeeCount,
        price_per_employee: effectivePricePerEmployee,
        subtotal,
        discount_amount: discountAmount,
        vat_percentage: internalTaxPercentage,
        vat_amount: vatAmount,
        ppn_percentage: ppnPercentage,
        pph_percentage: pphPercentage,
        ppn_amount: ppnAmount,
        pph_amount: pphAmount,
        gross_amount: grossAmount,
        xendit_fee: useManualTransferFallback ? 0 : xenditFee,
        net_amount: useManualTransferFallback ? grossAmount : netAmount,
        status: "PENDING",
        payment_method_type: useManualTransferFallback ? "MANUAL_TRANSFER" : "XENDIT",
        due_date: dueDateIso,
        marketing_staff_id: marketing_staff_id || null,
        notes: description || null,
        metadata: isIndividualScope
          ? {
              billing_scope: "individual",
              employee_id: requestedEmployeeId,
              employee_user_id: scopedEmployee?.user_id || null,
              ...(useManualTransferFallback
                ? {
                    fallback_payment_method: "MANUAL_TRANSFER",
                    fallback_reason: manualFallbackCode,
                  }
                : {}),
            }
          : {
              billing_scope: "centralized",
              ...(useManualTransferFallback
                ? {
                    fallback_payment_method: "MANUAL_TRANSFER",
                    fallback_reason: manualFallbackCode,
                  }
                : {}),
            },
      })
      .select("id, invoice_number, gross_amount, due_date, payment_method_type, invoice_url")
      .single();

    if (reserveError) {
      const isUniqueActiveViolation =
        reserveError.code === "23505" ||
        (reserveError.message ?? "").includes("idx_invoices_one_active_per_tenant_unique");

      if (isUniqueActiveViolation) {
        const { data: latestActiveRows } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_url, status, gross_amount, due_date, payment_method_type, metadata")
          .eq("tenant_id", tenant_id)
          .in("status", [...ACTIVE_INVOICE_STATUSES])
          .order("created_at", { ascending: false })
          .limit(100);

        const reusedInvoice = ((latestActiveRows || []) as ActiveInvoiceRow[]).find((row) => {
          const scope = parseBillingScopeFromMetadata(row.metadata);
          if (isIndividualScope) {
            return scope === "individual" && parseEmployeeIdFromMetadata(row.metadata) === requestedEmployeeId;
          }
          return scope !== "individual";
        }) || null;
        if (reusedInvoice?.status === "PENDING" || reusedInvoice?.status === "AWAITING_VERIFICATION") {
          return new Response(
            JSON.stringify({
              success: true,
              reused: true,
              invoice: {
                id: reusedInvoice.id,
                invoice_number: reusedInvoice.invoice_number,
                invoice_url: reusedInvoice.invoice_url,
                gross_amount: reusedInvoice.gross_amount,
                due_date: reusedInvoice.due_date,
                payment_method_type: reusedInvoice.payment_method_type,
              },
              fallback_payment_method:
                reusedInvoice.payment_method_type === "MANUAL_TRANSFER" ? "MANUAL_TRANSFER" : null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify(
            withTrace(
              {
                success: false,
                error: "Invoice aktif sudah tersedia. Selesaikan invoice aktif terlebih dahulu.",
                active_invoice: reusedInvoice
                  ? {
                      id: reusedInvoice.id,
                      invoice_number: reusedInvoice.invoice_number,
                      status: reusedInvoice.status,
                      payment_method_type: reusedInvoice.payment_method_type,
                      due_date: reusedInvoice.due_date,
                    }
                  : null,
              },
              traceId,
            ),
          ),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      logTraceError(traceId, "Database reserve error", reserveError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to reserve invoice", details: reserveError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (useManualTransferFallback) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: true,
              reused: false,
              fallback_payment_method: "MANUAL_TRANSFER",
              fallback_code: manualFallbackCode,
              message: manualFallbackMessage,
              invoice: {
                id: reservedInvoice.id,
                invoice_number: reservedInvoice.invoice_number,
                invoice_url: reservedInvoice.invoice_url,
                gross_amount: reservedInvoice.gross_amount,
                due_date: reservedInvoice.due_date,
                payment_method_type: reservedInvoice.payment_method_type,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create Xendit invoice
    const xenditResponse = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(xenditSecretKey + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: grossAmount,
        payer_email: scopedEmployee?.email || authData.user.email || tenant.email,
        description:
          description ||
          `Langganan ${packageData?.name || "Custom"} - ${requestedDurationMonths} bulan untuk ${billedEmployeeCount} pegawai`,
        invoice_duration: 259200, // 3 days in seconds
        customer: {
          given_names: scopedEmployee?.name || tenant.name,
          email: scopedEmployee?.email || authData.user.email || tenant.email,
        },
        success_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=success`,
        failure_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=failed`,
        currency: "IDR",
        items: [
          {
            name: `Langganan ${packageData?.name || "Custom"} (${requestedDurationMonths} bulan)`,
            quantity: 1,
            price: grossAmount,
          },
        ],
      }),
    });

    if (!xenditResponse.ok) {
      const xenditError = await xenditResponse.text();
      logTraceError(traceId, "Xendit error", xenditError);
      await supabase
        .from("invoices")
        .update({
          status: "CANCELLED",
          notes: `${description || ""}\n[AUTO] Xendit invoice creation failed`,
        })
        .eq("id", reservedInvoice.id);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to create Xendit invoice", details: xenditError }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xenditInvoice = await xenditResponse.json();

    // Attach external checkout URL to reserved invoice
    const { data: invoice, error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        invoice_url: xenditInvoice.invoice_url,
      })
      .eq("id", reservedInvoice.id)
      .select("id, invoice_number, gross_amount, due_date")
      .single();

    if (invoiceUpdateError) {
      logTraceError(traceId, "Database update error", invoiceUpdateError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to finalize invoice", details: invoiceUpdateError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the payment attempt
    await supabase.from("payment_logs").insert({
      invoice_id: invoice.id,
      event_type: "INVOICE_CREATED",
      payload: {
        xendit_id: xenditInvoice.id,
        external_id: externalId,
        amount: grossAmount,
        invoice_url: xenditInvoice.invoice_url,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_url: xenditInvoice.invoice_url,
          gross_amount: invoice.gross_amount,
          due_date: invoice.due_date,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Unhandled error", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error", details: errorMessage }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
