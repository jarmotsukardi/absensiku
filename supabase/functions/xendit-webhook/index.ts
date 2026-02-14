import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-callback-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("xendit-webhook");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xenditCallbackToken = Deno.env.get("XENDIT_CALLBACK_TOKEN");

    // SECURITY: Reject if callback token is not configured
    if (!xenditCallbackToken) {
      logTraceError(traceId, "XENDIT_CALLBACK_TOKEN not configured - webhook disabled");
      return new Response(
        JSON.stringify(withTrace({ error: "Webhook not configured" }, traceId)),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate callback token from Xendit
    const callbackToken = req.headers.get("x-callback-token");
    if (!callbackToken || callbackToken !== xenditCallbackToken) {
      logTraceError(traceId, "Invalid or missing callback token");
      return new Response(
        JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = await req.json();

    // Log webhook attempt with limited payload info for auditing
    console.log("Webhook received:", JSON.stringify({ external_id: payload?.external_id, status: payload?.status }));

    const { external_id, status, paid_at, payment_method, payment_channel, id: xendit_id } = payload;

    if (!external_id) {
      return new Response(JSON.stringify(withTrace({ error: "Missing external_id" }, traceId)), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find invoice by external_id
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("external_id", external_id)
      .single();

    if (invoiceError || !invoice) {
      logTraceError(traceId, `Invoice not found: ${external_id}`);
      // Log anyway for debugging
      await supabase.from("payment_logs").insert({
        event_type: "WEBHOOK_INVOICE_NOT_FOUND",
        payload: { external_id, xendit_payload: payload },
      });
      return new Response(JSON.stringify(withTrace({ error: "Invoice not found" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check idempotency - if already paid, skip
    if (invoice.status === "PAID") {
      console.log("Invoice already paid, skipping:", invoice.invoice_number);
      return new Response(JSON.stringify({ success: true, message: "Already processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the webhook
    await supabase.from("payment_logs").insert({
      invoice_id: invoice.id,
      event_type: `XENDIT_${status}`,
      payload: {
        xendit_id,
        status,
        payment_method,
        payment_channel,
        paid_at,
        raw_payload: payload,
      },
    });

    // Map Xendit status to our status
    let newStatus = invoice.status;
    const updates: any = { updated_at: new Date().toISOString() };

    if (status === "PAID" || status === "SETTLED") {
      newStatus = "PAID";
      updates.status = "PAID";
      updates.paid_at = paid_at || new Date().toISOString();
      updates.payment_method_type = "XENDIT";
    } else if (status === "EXPIRED") {
      newStatus = "EXPIRED";
      updates.status = "EXPIRED";
    }

    // Update invoice
    const { error: updateError } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", invoice.id);

    if (updateError) {
      logTraceError(traceId, "Failed to update invoice", updateError);
      return new Response(JSON.stringify(withTrace({ error: "Failed to update invoice" }, traceId)), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If paid, extend subscription
    if (newStatus === "PAID") {
      // Get current subscription
      const { data: currentSub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", invoice.tenant_id)
        .order("end_date", { ascending: false })
        .limit(1)
        .single();

      // Calculate new subscription dates
      let startDate = new Date();
      if (currentSub && new Date(currentSub.end_date) > startDate) {
        startDate = new Date(currentSub.end_date);
      }

      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + (invoice.package_duration_months || 1));

      // Create or update subscription
      const { error: subError } = await supabase.from("subscriptions").upsert({
        tenant_id: invoice.tenant_id,
        status: "active",
        max_employees: invoice.employee_count,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "tenant_id",
      });

      if (subError) {
        logTraceError(traceId, "Failed to update subscription", subError);
      }

      // Record in financial ledger
      await supabase.from("financial_ledger").insert({
        invoice_id: invoice.id,
        tenant_id: invoice.tenant_id,
        transaction_type: "PAYMENT",
        gross_amount: invoice.gross_amount,
        xendit_fee: invoice.xendit_fee,
        vat_amount: invoice.vat_amount,
        net_amount: invoice.net_amount,
        payment_source: "XENDIT",
        transaction_date: new Date().toISOString().split("T")[0],
        description: `Payment for ${invoice.invoice_number}`,
      });

      // Log subscription extension
      await supabase.from("payment_logs").insert({
        invoice_id: invoice.id,
        event_type: "SUBSCRIPTION_EXTENDED",
        payload: {
          tenant_id: invoice.tenant_id,
          new_end_date: endDate.toISOString(),
          duration_months: invoice.package_duration_months,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Webhook error", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logTraceError(traceId, `Details: ${errorMessage}`);
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error" }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
