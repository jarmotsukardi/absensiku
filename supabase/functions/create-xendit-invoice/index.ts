import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");

    if (!xenditSecretKey) {
      return new Response(
        JSON.stringify({ error: "Xendit API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
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
          JSON.stringify({ error: "Terlalu banyak invoice dibuat. Coba lagi nanti." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const { tenant_id, package_id, employee_count, duration_months, marketing_staff_id, description } = body;

    if (!tenant_id || !employee_count || !duration_months) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, code, email")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get billing settings
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("setting_key, setting_value");

    const getSettingValue = (key: string, defaultValue: number) => {
      const setting = billingSettings?.find((s: any) => s.setting_key === key);
      return setting?.setting_value?.value ?? setting?.setting_value?.amount ?? defaultValue;
    };

    const pricePerEmployee = getSettingValue("price_per_employee", 15000);
    const vatPercentage = getSettingValue("vat_percentage", 11);

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
    const subtotal = employee_count * pricePerEmployee * duration_months;
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
            price: pricePerEmployee * duration_months * (1 - discountPercentage / 100),
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
      console.error("Xendit error:", xenditError);
      return new Response(
        JSON.stringify({ error: "Failed to create Xendit invoice", details: xenditError }),
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
        price_per_employee: pricePerEmployee,
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
      console.error("Database error:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Failed to save invoice", details: invoiceError.message }),
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
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
