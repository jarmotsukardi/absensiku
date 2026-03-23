import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const createTraceId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const withTrace = <T extends Record<string, unknown>>(payload: T, traceId: string): T & { trace_id: string } => ({
  ...payload,
  trace_id: traceId,
});

const logTraceError = (traceId: string, message: string, details?: unknown) => {
  if (typeof details === "undefined") {
    console.error(`[${traceId}] ${message}`);
    return;
  }
  console.error(`[${traceId}] ${message}`, details);
};

interface DispatchRequest {
  invoice_id?: string;
  trigger?: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  tenant_id: string;
  status: string;
  gross_amount: number;
  due_date: string | null;
  paid_at: string | null;
}

interface TenantRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface GatewaySettingRow {
  key: string;
  value: JsonObject | null;
}

interface UserRoleRow {
  role: string;
  tenant_id: string | null;
}

const toStringSafe = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toBooleanSafe = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y", "on", "enabled", "active"].includes(normalized);
  }
  return false;
};

const formatCurrencyIdr = (amount: number): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDateId = (raw: string | null | undefined): string => {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
};

type SendResult = { ok: boolean; provider?: string; error?: string };

const sendEmailViaResend = async (
  emailSetting: JsonObject,
  to: string,
  payload: { subject: string; emailText: string; emailHtml: string },
): Promise<SendResult> => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ||
    toStringSafe(emailSetting.resend_api_key) ||
    toStringSafe(emailSetting.resendApiKey);
  if (!resendApiKey) {
    return { ok: false, error: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ||
    toStringSafe(emailSetting.resend_from_email) ||
    "AbsensiKu <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [to],
      subject: payload.subject,
      text: payload.emailText,
      html: payload.emailHtml,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `RESEND_FAILED: ${text}` };
  }

  return { ok: true, provider: "resend" };
};

const sendEmailNotification = async (
  emailSetting: JsonObject,
  to: string,
  payload: { subject: string; emailText: string; emailHtml: string },
): Promise<SendResult> => {
  const isEnabled = toBooleanSafe(emailSetting.isEnabled ?? emailSetting.enabled);
  if (!isEnabled) return { ok: false, error: "EMAIL_GATEWAY_DISABLED" };

  const smtpHost = toStringSafe(emailSetting.smtpHost ?? emailSetting.smtp_host);
  const smtpPortRaw = emailSetting.smtpPort ?? emailSetting.smtp_port;
  const smtpPort = Number.parseInt(String(smtpPortRaw ?? ""), 10) || 587;
  const smtpUser = toStringSafe(emailSetting.smtpUser ?? emailSetting.smtp_user);
  const smtpPassword = toStringSafe(emailSetting.smtpPassword ?? emailSetting.smtp_password);
  const senderName = toStringSafe(emailSetting.senderName) || "AbsensiKu";
  const senderEmailCandidate = toStringSafe(emailSetting.senderEmail);
  const senderEmail = senderEmailCandidate || smtpUser;
  const useTLS = toBooleanSafe(emailSetting.useTLS);

  if (smtpHost && smtpUser && smtpPassword) {
    try {
      const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
      const connection: {
        hostname: string;
        port: number;
        auth: { username: string; password: string };
        tls?: boolean;
      } = {
        hostname: smtpHost,
        port: smtpPort,
        auth: { username: smtpUser, password: smtpPassword },
      };

      if (smtpPort === 465) connection.tls = true;
      else if (smtpPort === 587) connection.tls = false;
      else connection.tls = useTLS;

      const client = new SMTPClient({ connection });
      await client.send({
        from: `${senderName} <${senderEmail}>`,
        to,
        subject: payload.subject,
        content: payload.emailText,
        html: payload.emailHtml,
      });
      await client.close();
      return { ok: true, provider: "smtp" };
    } catch (smtpError) {
      const smtpMessage = smtpError instanceof Error ? smtpError.message : "SMTP_FAILED";
      const resendFallback = await sendEmailViaResend(emailSetting, to, payload);
      if (resendFallback.ok) return resendFallback;
      return { ok: false, error: `SMTP_FAILED: ${smtpMessage}; ${resendFallback.error ?? "RESEND_FAILED"}` };
    }
  }

  return await sendEmailViaResend(emailSetting, to, payload);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("dispatch-billing-email");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: DispatchRequest = await req.json();
    const invoiceId = toStringSafe(body.invoice_id);
    if (!invoiceId) {
      return new Response(JSON.stringify(withTrace({ error: "invoice_id diperlukan" }, traceId)), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify(withTrace({ error: "Invalid token" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventKey = `invoice_paid_email:${invoiceId}`;

    const [{ data: invoiceRow, error: invoiceError }, { data: gatewayRows, error: gatewayError }] = await Promise.all([
      admin
        .from("invoices")
        .select("id, invoice_number, tenant_id, status, gross_amount, due_date, paid_at")
        .eq("id", invoiceId)
        .maybeSingle(),
      admin
        .from("system_settings")
        .select("key, value")
        .eq("key", "email_gateway"),
    ]);

    if (invoiceError) throw invoiceError;
    if (!invoiceRow) {
      return new Response(JSON.stringify(withTrace({ error: "Invoice tidak ditemukan" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const invoice = invoiceRow as InvoiceRow;
    if (invoice.status !== "PAID") {
      return new Response(JSON.stringify(withTrace({ error: "Invoice belum status PAID" }, traceId)), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", authData.user.id)
      .in("role", ["super_admin", "admin_instansi"]);
    if (roleError) throw roleError;

    const roles = (roleRows ?? []) as UserRoleRow[];
    const isSuperAdmin = roles.some((row) => row.role === "super_admin");
    const isTenantAdmin = roles.some((row) => row.role === "admin_instansi" && row.tenant_id === invoice.tenant_id);
    if (!isSuperAdmin && !isTenantAdmin) {
      return new Response(JSON.stringify(withTrace({ error: "Forbidden" }, traceId)), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenantRow, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, email")
      .eq("id", invoice.tenant_id)
      .maybeSingle();
    if (tenantError) throw tenantError;

    const tenant = tenantRow as TenantRow | null;
    if (!tenant) {
      return new Response(JSON.stringify(withTrace({ error: "Tenant invoice tidak ditemukan" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingLog = await admin
      .from("billing_notification_logs")
      .select("id, status")
      .eq("invoice_id", invoice.id)
      .eq("notification_type", "EMAIL")
      .contains("metadata", { event_key: eventKey })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingLog.error) throw existingLog.error;
    if (existingLog.data && ["SENT", "DELIVERED", "PENDING"].includes(existingLog.data.status || "")) {
      return new Response(
        JSON.stringify(withTrace({ success: true, skipped: true, reason: "ALREADY_DISPATCHED" }, traceId)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (gatewayError) throw gatewayError;
    const gateway = ((gatewayRows as GatewaySettingRow[] | null)?.[0]?.value ?? {}) as JsonObject;

    const recipient = toStringSafe(tenant.email);
    if (!recipient) {
      await admin.from("billing_notification_logs").insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "EMAIL",
        recipient: "-",
        subject: "Invoice Paid Verified",
        message: "Email tenant tidak tersedia.",
        status: "FAILED",
        error_message: "TENANT_EMAIL_EMPTY",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
        },
      });
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Email tenant tidak tersedia" }, traceId)),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoiceNumber = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
    const paidDate = formatDateId(invoice.paid_at);
    const dueDate = formatDateId(invoice.due_date);
    const amountText = formatCurrencyIdr(invoice.gross_amount);
    const tenantName = tenant.name || "Organisasi";
    const subject = `Pembayaran terkonfirmasi - ${invoiceNumber}`;
    const emailText = [
      `Halo ${tenantName},`,
      "",
      "Pembayaran faktur Anda sudah dikonfirmasi admin.",
      `No Faktur: ${invoiceNumber}`,
      `Nominal: ${amountText}`,
      `Tanggal Bayar Tercatat: ${paidDate}`,
      `Jatuh Tempo Faktur: ${dueDate}`,
      "",
      "Langganan Anda sudah aktif. Silakan cek detail di dashboard billing.",
      "",
      "Terima kasih.",
    ].join("\n");
    const emailHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5">\n      <p>Halo ${tenantName},</p>\n      <p>Pembayaran faktur Anda sudah dikonfirmasi admin.</p>\n      <ul>\n        <li><strong>No Faktur:</strong> ${invoiceNumber}</li>\n        <li><strong>Nominal:</strong> ${amountText}</li>\n        <li><strong>Tanggal Bayar Tercatat:</strong> ${paidDate}</li>\n        <li><strong>Jatuh Tempo Faktur:</strong> ${dueDate}</li>\n      </ul>\n      <p>Langganan Anda sudah aktif. Silakan cek detail di dashboard billing.</p>\n      <p>Terima kasih.</p>\n    </div>`;

    const { data: logRow, error: logInsertError } = await admin
      .from("billing_notification_logs")
      .insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "EMAIL",
        recipient,
        subject,
        message: emailText,
        status: "PENDING",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
        },
      })
      .select("id")
      .single();
    if (logInsertError) throw logInsertError;

    const sendResult = await sendEmailNotification(gateway, recipient, { subject, emailText, emailHtml });
    const status = sendResult.ok ? "SENT" : "FAILED";
    const { error: updateError } = await admin
      .from("billing_notification_logs")
      .update({
        status,
        sent_at: sendResult.ok ? new Date().toISOString() : null,
        error_message: sendResult.ok ? null : sendResult.error || "EMAIL_SEND_FAILED",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
          provider: sendResult.provider || null,
        },
      })
      .eq("id", logRow.id);
    if (updateError) throw updateError;

    if (!sendResult.ok) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: sendResult.error || "Gagal kirim Email" }, traceId)),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(withTrace({ success: true }, traceId)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Unhandled error", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error", details: errorMessage }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
