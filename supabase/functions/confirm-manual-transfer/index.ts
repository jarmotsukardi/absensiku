import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ConfirmManualTransferRequest {
  tenant_id: string;
  employee_id: string;
  invoice_id: string;
  reference_number?: string;
  payment_date?: string;
}

interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  invoice_number: string | null;
  status: string;
  payment_method_type: string | null;
  gross_amount: number;
  due_date: string | null;
  metadata: Record<string, unknown> | null;
}

const parseMetadataScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const value = metadata as Record<string, unknown>;
  return value.billing_scope === "individual" ? "individual" : "centralized";
};

const parseMetadataEmployeeId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.employee_id === "string" && value.employee_id.trim().length > 0) {
    return value.employee_id.trim();
  }
  return null;
};

const normalizePaymentDate = (raw: string | undefined): string => {
  const value = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("confirm-manual-transfer");

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify(withTrace({ error: "Invalid token" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ConfirmManualTransferRequest = await req.json();
    const tenantId = (body.tenant_id || "").trim();
    const employeeId = (body.employee_id || "").trim();
    const invoiceId = (body.invoice_id || "").trim();
    const referenceNumber = (body.reference_number || "").trim() || null;
    const paymentDate = normalizePaymentDate(body.payment_date);

    if (!tenantId || !employeeId || !invoiceId) {
      return new Response(
        JSON.stringify(withTrace({ error: "Missing required fields" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ data: employee, error: employeeError }, { data: actorRoles, error: roleError }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, tenant_id, user_id")
        .eq("id", employeeId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", authData.user.id),
    ]);

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify(withTrace({ error: "Data pegawai tidak ditemukan" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (roleError) {
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memverifikasi role user" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleRows = (actorRoles || []) as Array<{ role: string; tenant_id: string | null }>;
    const actorIsSuperAdmin = roleRows.some((row) => row.role === "super_admin");
    const actorIsTenantAdmin = roleRows.some(
      (row) => row.role === "admin_instansi" && row.tenant_id === tenantId,
    );
    const actorOwnsEmployee = (employee as EmployeeRow).user_id === authData.user.id;

    if (!actorIsSuperAdmin && !actorIsTenantAdmin && !actorOwnsEmployee) {
      return new Response(
        JSON.stringify(withTrace({ error: "Forbidden employee scope access" }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, tenant_id, invoice_number, status, payment_method_type, gross_amount, due_date, metadata")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify(withTrace({ error: "Invoice tidak ditemukan" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoiceRow = invoice as InvoiceRow;
    const billingScope = parseMetadataScope(invoiceRow.metadata);
    const scopedEmployeeId = parseMetadataEmployeeId(invoiceRow.metadata);
    if (billingScope !== "individual" || scopedEmployeeId !== employeeId) {
      return new Response(
        JSON.stringify(withTrace({ error: "Invoice ini bukan scope billing individual pegawai terkait." }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (invoiceRow.payment_method_type !== "MANUAL_TRANSFER") {
      return new Response(
        JSON.stringify(withTrace({ error: "Invoice ini bukan metode transfer manual." }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedStatus = (invoiceRow.status || "").toUpperCase();
    if (normalizedStatus === "PAID") {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: true,
              reused: true,
              status: invoiceRow.status,
              invoice: {
                id: invoiceRow.id,
                invoice_number: invoiceRow.invoice_number,
                due_date: invoiceRow.due_date,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (["AWAITING_VERIFICATION", "AWAITING_VERIFICATION_FULL", "PENDING_VERIFICATION_PARTIAL"].includes(normalizedStatus)) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: true,
              reused: true,
              status: invoiceRow.status,
              invoice: {
                id: invoiceRow.id,
                invoice_number: invoiceRow.invoice_number,
                due_date: invoiceRow.due_date,
              },
            },
            traceId,
          ),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["PENDING", "REJECTED_NEEDS_REVISION"].includes(normalizedStatus)) {
      return new Response(
        JSON.stringify(withTrace({ error: `Status invoice ${invoiceRow.status} tidak bisa dikonfirmasi transfer.` }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount = Number(invoiceRow.gross_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify(withTrace({ error: "Nominal invoice tidak valid untuk konfirmasi transfer." }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("manual_payments").insert({
      tenant_id: tenantId,
      amount,
      confirmed_amount: amount,
      payment_method: "bank_transfer",
      reference_number: referenceNumber,
      payment_date: paymentDate,
      status: "awaiting_verification_full",
      invoice_number: invoiceRow.invoice_number,
      notes: "Konfirmasi transfer dari employee billing mandiri.",
    });

    const currentMetadata =
      invoiceRow.metadata && typeof invoiceRow.metadata === "object" && !Array.isArray(invoiceRow.metadata)
        ? invoiceRow.metadata
        : {};

    await supabase
      .from("invoices")
      .update({
        status: "AWAITING_VERIFICATION_FULL",
        rejection_reason: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(currentMetadata as Record<string, unknown>),
          manual_confirmation_channel: "employee",
          manual_confirmation_at: new Date().toISOString(),
          manual_confirmed_by_employee_id: employeeId,
        },
      })
      .eq("id", invoiceRow.id)
      .eq("tenant_id", tenantId);

    return new Response(
      JSON.stringify(
        withTrace(
          {
            success: true,
            status: "AWAITING_VERIFICATION_FULL",
            invoice: {
              id: invoiceRow.id,
              invoice_number: invoiceRow.invoice_number,
              due_date: invoiceRow.due_date,
            },
          },
          traceId,
        ),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error", details: message }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

