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
}

interface BillingSettingRow {
  setting_key: string;
  setting_value: { value?: number; amount?: number } | null;
}

interface SubscriptionPriceRow {
  price_per_employee: number | null;
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
    const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");

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

    // Rate limit: max 10 invoices per hour per tenant
    const { tenant_id: reqTenantId } = body;
    if (reqTenantId) {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", reqTenantId)
        .gte("created_at", oneHourAgo);

      if (count !== null && count >= 10) {
        return new Response(
          JSON.stringify(withTrace({ error: "Terlalu banyak invoice dibuat. Coba lagi nanti." }, traceId)),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const { tenant_id, package_id, employee_count, duration_months, marketing_staff_id, description } = body;

    if (!tenant_id || !employee_count || !duration_months) {
      return new Response(
        JSON.stringify(withTrace({ error: "Missing required fields" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, code, email, billing_mode")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify(withTrace({ error: "Tenant not found" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get billing settings
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("setting_key, setting_value");

    const settingsRows = (billingSettings ?? []) as BillingSettingRow[];
    const getSettingValue = (key: string, defaultValue: number) => {
      const setting = settingsRows.find((s) => s.setting_key === key);
      return setting?.setting_value?.value ?? setting?.setting_value?.amount ?? defaultValue;
    };

    const pricePerEmployee = getSettingValue("price_per_employee", 15000);
    const vatPercentage = getSettingValue("vat_percentage", 11);

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
    const effectiveHeadcount = Math.max(activeEmployeeCount, employee_count);
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
              requested_employee_count: employee_count,
            },
            traceId,
          ),
        ),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!xenditSecretKey) {
      return new Response(
        JSON.stringify(withTrace({ error: "Xendit API key not configured" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Calculate amounts
    const subtotal = employee_count * effectivePricePerEmployee * duration_months;
    const discountAmount = subtotal * (discountPercentage / 100);
    const amountAfterDiscount = subtotal - discountAmount;
    const vatAmount = amountAfterDiscount * (vatPercentage / 100);
    const grossAmount = amountAfterDiscount + vatAmount;

    // Estimate Xendit fee (VA: Rp 4,000, QR: 0.7%, Cards: 2.9%)
    const xenditFee = Math.round(grossAmount * 0.01 + 4000); // Simplified estimation
    const netAmount = grossAmount - xenditFee - vatAmount;

    // Generate invoice number
    const { data: invoiceNumber } = await supabase.rpc("generate_invoice_number");

    // Create external_id for Xendit
    const externalId = `${invoiceNumber}-${Date.now()}`;

    // Calculate due date (3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

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
        payer_email: tenant.email,
        description: description || `Langganan ${packageData?.name || "Custom"} - ${duration_months} bulan untuk ${employee_count} pegawai`,
        invoice_duration: 259200, // 3 days in seconds
        customer: {
          given_names: tenant.name,
          email: tenant.email,
        },
        success_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=success`,
        failure_redirect_url: `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl}/org?payment=failed`,
        currency: "IDR",
        items: [
          {
            name: `Langganan ${packageData?.name || "Custom"} (${duration_months} bulan)`,
            quantity: employee_count,
            price: effectivePricePerEmployee * duration_months * (1 - discountPercentage / 100),
          },
        ],
        fees: [
          {
            type: "PPN",
            value: vatAmount,
          },
        ],
      }),
    });

    if (!xenditResponse.ok) {
      const xenditError = await xenditResponse.text();
      logTraceError(traceId, "Xendit error", xenditError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to create Xendit invoice", details: xenditError }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xenditInvoice = await xenditResponse.json();

    // Save invoice to database
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        tenant_id,
        invoice_number: invoiceNumber,
        external_id: externalId,
        package_id: package_id || null,
        package_name: packageData?.name || "Custom",
        package_duration_months: duration_months,
        package_discount_percentage: discountPercentage,
        employee_count,
        price_per_employee: effectivePricePerEmployee,
        subtotal,
        discount_amount: discountAmount,
        vat_percentage: vatPercentage,
        vat_amount: vatAmount,
        gross_amount: grossAmount,
        xendit_fee: xenditFee,
        net_amount: netAmount,
        status: "PENDING",
        payment_method_type: "XENDIT",
        invoice_url: xenditInvoice.invoice_url,
        issue_date: new Date().toISOString(),
        due_date: dueDate.toISOString(),
        marketing_staff_id: marketing_staff_id || null,
        notes: description || null,
      })
      .select()
      .single();

    if (invoiceError) {
      logTraceError(traceId, "Database error", invoiceError);
      return new Response(
        JSON.stringify(withTrace({ error: "Failed to save invoice", details: invoiceError.message }, traceId)),
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
          invoice_number: invoiceNumber,
          invoice_url: xenditInvoice.invoice_url,
          gross_amount: grossAmount,
          due_date: dueDate.toISOString(),
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
