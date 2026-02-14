import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("check-payment-status");

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

    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(JSON.stringify(withTrace({ error: "Missing invoice_id" }, traceId)), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get invoice from database
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify(withTrace({ error: "Invoice not found" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already paid or no Xendit API key, return current status
    if (invoice.status === "PAID" || !xenditSecretKey || invoice.payment_method_type !== "XENDIT") {
      return new Response(
        JSON.stringify({
          status: invoice.status,
          paid_at: invoice.paid_at,
          invoice_url: invoice.invoice_url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check with Xendit API
    if (invoice.external_id) {
      try {
        const xenditResponse = await fetch(
          `https://api.xendit.co/v2/invoices?external_id=${invoice.external_id}`,
          {
            headers: {
              "Authorization": `Basic ${btoa(xenditSecretKey + ":")}`,
            },
          }
        );

        if (xenditResponse.ok) {
          const xenditInvoices = await xenditResponse.json();
          const xenditInvoice = xenditInvoices[0];

          if (xenditInvoice) {
            // If status changed, update our database
            if (xenditInvoice.status === "PAID" && invoice.status !== "PAID") {
              await supabase
                .from("invoices")
                .update({
                  status: "PAID",
                  paid_at: xenditInvoice.paid_at || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", invoice_id);

              return new Response(
                JSON.stringify({
                  status: "PAID",
                  paid_at: xenditInvoice.paid_at,
                  invoice_url: invoice.invoice_url,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            } else if (xenditInvoice.status === "EXPIRED" && invoice.status !== "EXPIRED") {
              await supabase
                .from("invoices")
                .update({
                  status: "EXPIRED",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", invoice_id);

              return new Response(
                JSON.stringify({
                  status: "EXPIRED",
                  invoice_url: invoice.invoice_url,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
      } catch (xenditError) {
        logTraceError(traceId, "Xendit API error", xenditError);
        // Continue with current status if Xendit API fails
      }
    }

    return new Response(
      JSON.stringify({
        status: invoice.status,
        paid_at: invoice.paid_at,
        invoice_url: invoice.invoice_url,
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
