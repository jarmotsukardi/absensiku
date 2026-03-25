import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-callback-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const parseBillingScopeFromMetadata = (raw: unknown): "individual" | "centralized" => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "centralized";
  const metadata = raw as Record<string, unknown>;
  return metadata.billing_scope === "individual" ? "individual" : "centralized";
};

const parseBillingJourneyFromMetadata = (raw: unknown): "activation_early" | "trial_streak" | "unknown" => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "unknown";
  const metadata = raw as Record<string, unknown>;
  if (metadata.billing_origin === "activation_early") return "activation_early";
  if (metadata.streak_billing === true) return "trial_streak";
  return "unknown";
};

const buildSubscriptionBillingJourneyNotes = (
  currentNotes: string | null | undefined,
  metadata: unknown,
): string | null => {
  const journey = parseBillingJourneyFromMetadata(metadata);
  const normalizedCurrent =
    typeof currentNotes === "string" && currentNotes.trim().length > 0 ? currentNotes.trim() : null;
  const line =
    journey === "activation_early"
      ? "Jalur billing: Aktivasi awal. Invoice pertama dibuat sebelum tenant menunggu streak siap tagih."
      : journey === "trial_streak"
        ? "Jalur billing: Trial & Streak Monitoring. Invoice pertama mengikuti jalur trial normal sampai siap ditagih."
        : null;

  if (!line) return normalizedCurrent;

  const preservedLines = (normalizedCurrent || "")
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("Jalur billing:"));

  return [line, ...preservedLines].join("\n");
};

const buildSubscriptionPricingSnapshot = (
  invoice: { employee_count?: number | null; price_per_employee?: number | null; metadata?: unknown },
  currentSubscription?: {
    intro_promo_started_at?: string | null;
    intro_promo_months_consumed?: number | null;
  } | null,
) => {
  const metadata =
    invoice.metadata && typeof invoice.metadata === "object" && !Array.isArray(invoice.metadata)
      ? (invoice.metadata as Record<string, unknown>)
      : null;
  const employeeCount = Number.isFinite(invoice.employee_count)
    ? Math.max(1, Math.round(invoice.employee_count as number))
    : 1;
  const unitPriceCandidate =
    typeof metadata?.subscription_recurring_price_per_employee === "number" &&
      Number.isFinite(metadata.subscription_recurring_price_per_employee)
      ? Number(metadata.subscription_recurring_price_per_employee)
      : Number.isFinite(invoice.price_per_employee)
        ? Math.max(0, invoice.price_per_employee as number)
        : 0;
  const unitPrice = unitPriceCandidate > 0 ? unitPriceCandidate : 0;
  const promoPrice =
    typeof metadata?.attendance_intro_promo_price_per_employee === "number" &&
      Number.isFinite(metadata.attendance_intro_promo_price_per_employee)
      ? Math.max(0, Number(metadata.attendance_intro_promo_price_per_employee))
      : null;
  const promoDuration =
    typeof metadata?.attendance_intro_promo_duration_months === "number" &&
      Number.isFinite(metadata.attendance_intro_promo_duration_months)
      ? Math.max(0, Math.floor(Number(metadata.attendance_intro_promo_duration_months)))
      : 0;
  const promoApplied =
    typeof metadata?.attendance_intro_promo_months_applied === "number" &&
      Number.isFinite(metadata.attendance_intro_promo_months_applied)
      ? Math.max(0, Math.floor(Number(metadata.attendance_intro_promo_months_applied)))
      : 0;
  const promoConsumedBefore =
    typeof metadata?.attendance_intro_promo_months_consumed_before_invoice === "number" &&
      Number.isFinite(metadata.attendance_intro_promo_months_consumed_before_invoice)
      ? Math.max(0, Math.floor(Number(metadata.attendance_intro_promo_months_consumed_before_invoice)))
      : Math.max(0, Math.floor(Number(currentSubscription?.intro_promo_months_consumed || 0)));
  const promoConsumedAfter =
    typeof metadata?.attendance_intro_promo_months_consumed_after_invoice === "number" &&
      Number.isFinite(metadata.attendance_intro_promo_months_consumed_after_invoice)
      ? Math.max(0, Math.floor(Number(metadata.attendance_intro_promo_months_consumed_after_invoice)))
      : Math.min(promoDuration, promoConsumedBefore + promoApplied);
  const promoRemainingAfter = Math.max(0, promoDuration - promoConsumedAfter);
  const promoLabel =
    typeof metadata?.attendance_intro_promo_label === "string" &&
      metadata.attendance_intro_promo_label.trim().length > 0
      ? metadata.attendance_intro_promo_label.trim()
      : null;
  const packageScope =
    typeof metadata?.package_scope === "string" && metadata.package_scope.trim().length > 0
      ? metadata.package_scope.trim()
      : "attendance";
  const hasPromoState =
    packageScope === "attendance" &&
    promoPrice !== null &&
    promoDuration > 0 &&
    (promoApplied > 0 || promoConsumedAfter > 0 || promoRemainingAfter > 0);
  const promoStartedAt =
    hasPromoState
      ? currentSubscription?.intro_promo_started_at || new Date().toISOString().slice(0, 10)
      : null;

  return {
    price_per_employee: unitPrice > 0 ? unitPrice : null,
    price_per_month: unitPrice > 0 ? unitPrice * employeeCount : null,
    intro_promo_active: hasPromoState && promoRemainingAfter > 0,
    intro_promo_price_per_employee: hasPromoState ? promoPrice : null,
    intro_promo_duration_months: hasPromoState ? promoDuration : null,
    intro_promo_months_consumed: hasPromoState ? promoConsumedAfter : 0,
    intro_promo_label: hasPromoState ? promoLabel : null,
    intro_promo_started_at: promoStartedAt,
  };
};

const buildSubscriptionHeadcountSnapshot = (
  invoice: {
    employee_count?: number | null;
    metadata?: unknown;
  },
  currentSubscription?: {
    billing_headcount_mode?: string | null;
    contracted_employee_count?: number | null;
    max_employees?: number | null;
  } | null,
) => {
  const metadata =
    invoice.metadata && typeof invoice.metadata === "object" && !Array.isArray(invoice.metadata)
      ? (invoice.metadata as Record<string, unknown>)
      : null;
  const billingScope =
    typeof metadata?.billing_scope === "string" ? metadata.billing_scope.trim() : "centralized";
  if (billingScope === "individual") {
    return {
      billing_headcount_mode: currentSubscription?.billing_headcount_mode ?? "actual_active_employee",
      contracted_employee_count: currentSubscription?.contracted_employee_count ?? null,
      max_employees: currentSubscription?.max_employees ?? null,
    };
  }

  const invoiceEmployeeCount = Number.isFinite(invoice.employee_count)
    ? Math.max(1, Math.floor(Number(invoice.employee_count)))
    : 1;
  const explicitMode =
    metadata?.billing_headcount_mode_after_payment === "manual_contract" ||
    metadata?.billing_headcount_mode_after_payment === "actual_active_employee"
      ? String(metadata.billing_headcount_mode_after_payment)
      : metadata?.billing_headcount_mode === "manual_contract" ||
          metadata?.billing_headcount_mode === "actual_active_employee"
        ? String(metadata.billing_headcount_mode)
        : null;
  const explicitContractCount =
    typeof metadata?.contracted_employee_count_after_payment === "number" &&
    Number.isFinite(metadata.contracted_employee_count_after_payment)
      ? Math.max(1, Math.floor(Number(metadata.contracted_employee_count_after_payment)))
      : typeof metadata?.contracted_employee_count === "number" &&
          Number.isFinite(metadata.contracted_employee_count)
        ? Math.max(1, Math.floor(Number(metadata.contracted_employee_count)))
        : null;
  const billingOrigin =
    typeof metadata?.billing_origin === "string" ? metadata.billing_origin.trim() : null;
  const employeeCountSource =
    typeof metadata?.employee_count_source === "string" ? metadata.employee_count_source.trim() : null;
  const shouldUseManualContract =
    explicitMode === "manual_contract" ||
    employeeCountSource === "manual_contract" ||
    billingOrigin === "activation_early" ||
    currentSubscription?.billing_headcount_mode === "manual_contract";
  const contractedEmployeeCount = shouldUseManualContract
    ? explicitContractCount ??
      (typeof currentSubscription?.contracted_employee_count === "number" &&
      Number.isFinite(currentSubscription.contracted_employee_count)
        ? Math.max(1, Math.floor(Number(currentSubscription.contracted_employee_count)))
        : invoiceEmployeeCount)
    : null;

  return {
    billing_headcount_mode: shouldUseManualContract ? "manual_contract" : "actual_active_employee",
    contracted_employee_count: contractedEmployeeCount,
    max_employees: shouldUseManualContract ? contractedEmployeeCount : currentSubscription?.max_employees ?? null,
  };
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
    const updates: {
      updated_at: string;
      status?: string;
      paid_at?: string;
      payment_method_type?: string;
    } = { updated_at: new Date().toISOString() };

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

    // If paid, extend subscription for centralized billing only.
    if (newStatus === "PAID") {
      const billingScope = parseBillingScopeFromMetadata(invoice.metadata);
      const isIndividualInvoice = billingScope === "individual";

      // Get current subscription
      let endDate: Date | null = null;
      if (!isIndividualInvoice) {
        const { data: currentSub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", invoice.tenant_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Calculate new subscription dates
        let startDate = new Date();
        if (currentSub && new Date(currentSub.end_date) > startDate) {
          startDate = new Date(currentSub.end_date);
        }

        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + (invoice.package_duration_months || 1));

        // Update latest subscription row if exists, otherwise create a new one.
        if (currentSub?.id) {
          const { error: subError } = await supabase.from("subscriptions").update({
            status: "active",
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            last_invoice_id: invoice.id,
            grace_period_end: null,
            notes: buildSubscriptionBillingJourneyNotes(currentSub.notes, invoice.metadata),
            ...buildSubscriptionPricingSnapshot(invoice, currentSub),
            ...buildSubscriptionHeadcountSnapshot(invoice, currentSub),
            updated_at: new Date().toISOString(),
          }).eq("id", currentSub.id);
          if (subError) {
            logTraceError(traceId, "Failed to update subscription", subError);
          }
        } else {
          const { error: subInsertError } = await supabase.from("subscriptions").insert({
            tenant_id: invoice.tenant_id,
            status: "active",
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            last_invoice_id: invoice.id,
            grace_period_end: null,
            notes: buildSubscriptionBillingJourneyNotes(null, invoice.metadata),
            ...buildSubscriptionPricingSnapshot(invoice, currentSub),
            ...buildSubscriptionHeadcountSnapshot(invoice, currentSub),
            updated_at: new Date().toISOString(),
          });
          if (subInsertError) {
            logTraceError(traceId, "Failed to create subscription", subInsertError);
          }
        }
      }

      // Record in financial ledger if it does not exist yet for this invoice.
      const { data: existingLedger, error: existingLedgerError } = await supabase
        .from("financial_ledger")
        .select("id")
        .eq("invoice_id", invoice.id)
        .limit(1)
        .maybeSingle();
      if (existingLedgerError) {
        logTraceError(traceId, "Failed to check financial ledger", existingLedgerError);
      } else if (!existingLedger) {
        const { error: ledgerError } = await supabase.from("financial_ledger").insert({
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
          transaction_type: "PAYMENT",
          gross_amount: invoice.gross_amount,
          xendit_fee: invoice.xendit_fee,
          vat_amount: invoice.vat_amount,
          ppn_amount: invoice.ppn_amount ?? invoice.vat_amount,
          pph_amount: invoice.pph_amount ?? 0,
          net_amount: invoice.net_amount,
          payment_source: "XENDIT",
          payment_method: invoice.payment_method_type,
          transaction_date: new Date().toISOString().split("T")[0],
          notes: `Payment for ${invoice.invoice_number}`,
        });
        if (ledgerError) {
          logTraceError(traceId, "Failed to insert financial ledger", ledgerError);
        }
      }

      if (!isIndividualInvoice) {
        const { error: streakSyncError } = await supabase.rpc("mark_streak_invoiced", {
          p_tenant_id: invoice.tenant_id,
          p_invoice_id: invoice.id,
        });
        if (streakSyncError) {
          logTraceError(traceId, "Failed to sync streak invoiced state", streakSyncError);
        }

        // Log subscription extension
        await supabase.from("payment_logs").insert({
          invoice_id: invoice.id,
          event_type: "SUBSCRIPTION_EXTENDED",
          payload: {
            tenant_id: invoice.tenant_id,
            new_end_date: endDate?.toISOString() || null,
            duration_months: invoice.package_duration_months,
          },
        });
      }
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
