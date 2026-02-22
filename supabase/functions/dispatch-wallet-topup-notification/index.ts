import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonObject = Record<string, unknown>;

const createTraceId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const withTrace = <T extends Record<string, unknown>>(payload: T, traceId: string): T & { trace_id: string } => ({
  ...payload,
  trace_id: traceId,
});

const createErrorRef = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${timestamp}-${suffix}`;
};

const toStringSafe = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const toBooleanSafe = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y", "on", "enabled", "active"].includes(normalized);
  }
  return false;
};

const normalizePhone = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return digits;
};

const formatCurrencyIdr = (amount: number): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);

const sendWhatsAppNotification = async (
  waSetting: JsonObject,
  to: string,
  message: string,
): Promise<{ ok: boolean; provider?: string; error?: string }> => {
  const isEnabled = toBooleanSafe(waSetting.isEnabled ?? waSetting.enabled);
  if (!isEnabled) return { ok: false, error: "WHATSAPP_GATEWAY_DISABLED" };

  const provider = toStringSafe(waSetting.provider).toLowerCase() || "fonnte";
  const apiKey = toStringSafe(waSetting.apiKey ?? waSetting.api_key);
  const apiUrl = toStringSafe(waSetting.apiUrl ?? waSetting.api_url);
  const senderNumber = toStringSafe(waSetting.senderNumber ?? waSetting.sender_number);

  if (!apiKey) return { ok: false, error: "WHATSAPP_API_KEY_EMPTY" };

  let url = "";
  let body: JsonObject = {};
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "custom") {
    if (!apiUrl) return { ok: false, error: "WHATSAPP_CUSTOM_URL_EMPTY" };
    url = apiUrl;
    headers.Authorization = `Bearer ${apiKey}`;
    body = { to, message };
  } else if (provider === "fonnte") {
    url = "https://api.fonnte.com/send";
    headers.Authorization = apiKey;
    body = { target: to, message };
  } else if (provider === "wablas") {
    url = "https://pati.wablas.com/api/send-message";
    headers.Authorization = apiKey;
    body = { phone: to, message };
  } else if (provider === "whacenter") {
    url = "https://app.whacenter.com/api/send";
    headers.Authorization = `Bearer ${apiKey}`;
    body = { device_id: senderNumber, number: to, message };
  } else if (provider === "dripsender") {
    url = "https://api.dripsender.id/send";
    body = { api_key: apiKey, phone: to, text: message };
  } else {
    return { ok: false, error: `WHATSAPP_PROVIDER_UNSUPPORTED: ${provider}` };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `WHATSAPP_SEND_FAILED: ${text}` };
  }

  return { ok: true, provider };
};

const sendEmailViaResend = async (
  emailSetting: JsonObject,
  to: string,
  payload: { subject: string; emailText: string; emailHtml: string },
): Promise<{ ok: boolean; provider?: string; error?: string }> => {
  const resendApiKey =
    Deno.env.get("RESEND_API_KEY") ||
    toStringSafe(emailSetting.resend_api_key) ||
    toStringSafe(emailSetting.resendApiKey);
  if (!resendApiKey) {
    return { ok: false, error: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  const resendFrom =
    Deno.env.get("RESEND_FROM_EMAIL") ||
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
): Promise<{ ok: boolean; provider?: string; error?: string }> => {
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
    } catch {
      return await sendEmailViaResend(emailSetting, to, payload);
    }
  }

  return await sendEmailViaResend(emailSetting, to, payload);
};

interface DispatchRequest {
  topup_request_id?: string;
  trigger?: string;
}

const logClientDispatchFailure = async (
  admin: ReturnType<typeof createClient>,
  payload: {
    traceId: string;
    tenantId: string;
    topupRequestId: string;
    channel: "WHATSAPP" | "EMAIL";
    message: string;
    metadata?: Record<string, unknown>;
  },
) => {
  try {
    await admin.from("client_error_logs").insert({
      error_ref: createErrorRef(),
      occurred_at: new Date().toISOString(),
      context: "billing.wallet_topup.notification_dispatch_failed",
      message: payload.message,
      metadata: {
        trace_id: payload.traceId,
        topup_request_id: payload.topupRequestId,
        channel: payload.channel,
        ...(payload.metadata || {}),
      },
      tenant_id: payload.tenantId,
      source: "edge.dispatch_wallet_topup_notification",
      is_non_critical: false,
    });
  } catch {
    // Logging failure must not break main topup review flow.
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("dispatch-wallet-topup-notification");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: DispatchRequest = await req.json();
    const requestId = toStringSafe(body.topup_request_id);
    if (!requestId) {
      return new Response(JSON.stringify(withTrace({ error: "topup_request_id diperlukan" }, traceId)), {
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

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["super_admin", "admin_instansi"]);
    if (roleError) throw roleError;

    const isAllowed = (roleRows || []).some((row) => row.role === "super_admin" || row.role === "admin_instansi");
    if (!isAllowed) {
      return new Response(JSON.stringify(withTrace({ error: "Forbidden" }, traceId)), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: topupRow, error: topupError }, { data: gatewayRows, error: gatewayError }] = await Promise.all([
      admin
        .from("wallet_topup_requests")
        .select("id, tenant_id, status, requested_amount, approved_amount, rejection_reason, reference_number")
        .eq("id", requestId)
        .maybeSingle(),
      admin
        .from("system_settings")
        .select("key, value")
        .in("key", ["email_gateway", "whatsapp_gateway", "wa_gateway"]),
    ]);

    if (topupError) throw topupError;
    if (!topupRow) {
      return new Response(JSON.stringify(withTrace({ error: "Request topup tidak ditemukan" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!topupRow.status || !["APPROVED", "REJECTED"].includes(topupRow.status)) {
      return new Response(JSON.stringify(withTrace({ error: "Request topup belum direview" }, traceId)), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenantRow, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, email, phone, whatsapp, pic_whatsapp")
      .eq("id", topupRow.tenant_id)
      .maybeSingle();
    if (tenantError) throw tenantError;

    if (!tenantRow) {
      return new Response(JSON.stringify(withTrace({ error: "Tenant tidak ditemukan" }, traceId)), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (gatewayRows || []) as Array<{ key: string; value: JsonObject | null }>;
    const emailGateway = rows.find((row) => row.key === "email_gateway")?.value || {};
    const waGateway =
      rows.find((row) => row.key === "whatsapp_gateway")?.value ||
      rows.find((row) => row.key === "wa_gateway")?.value ||
      {};

    const amountText = formatCurrencyIdr(
      Number(topupRow.status === "APPROVED" ? topupRow.approved_amount ?? topupRow.requested_amount : topupRow.requested_amount),
    );
    const tenantName = toStringSafe(tenantRow.name) || "Organisasi";
    const topupStatusText = topupRow.status === "APPROVED" ? "Disetujui" : "Ditolak";

    const waText =
      topupRow.status === "APPROVED"
        ? `Halo ${tenantName}, request topup saldo ${amountText} sudah disetujui. Saldo wallet Anda telah ditambahkan.`
        : `Halo ${tenantName}, request topup saldo ${amountText} ditolak. Alasan: ${toStringSafe(topupRow.rejection_reason) || "Tidak ada alasan"}.`;

    const emailSubject = `Topup Saldo ${topupStatusText}`;
    const emailText = waText;
    const emailHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5">\n<p>Halo ${tenantName},</p>\n<p>${waText}</p>\n<p>Referensi: ${toStringSafe(topupRow.reference_number) || "-"}</p>\n</div>`;

    const results: Record<string, unknown> = {
      whatsapp: { skipped: true, reason: "NOT_ATTEMPTED" },
      email: { skipped: true, reason: "NOT_ATTEMPTED" },
    };

    const waRecipient = normalizePhone(tenantRow.pic_whatsapp || tenantRow.whatsapp || tenantRow.phone);
    if (waRecipient) {
      const waResult = await sendWhatsAppNotification(waGateway as JsonObject, waRecipient, waText);
      results.whatsapp = waResult;
      await admin.from("billing_notification_logs").insert({
        tenant_id: topupRow.tenant_id,
        invoice_id: null,
        notification_type: "WHATSAPP",
        recipient: waRecipient,
        subject: emailSubject,
        message: waText,
        status: waResult.ok ? "SENT" : "FAILED",
        sent_at: waResult.ok ? new Date().toISOString() : null,
        error_message: waResult.ok ? null : waResult.error || null,
        metadata: {
          event: "WALLET_TOPUP_REVIEWED",
          topup_request_id: topupRow.id,
          trace_id: traceId,
          status: topupRow.status,
          trigger: body.trigger || "ADMIN_REVIEW_TOPUP",
        },
      });
      if (!waResult.ok) {
        await logClientDispatchFailure(admin, {
          traceId,
          tenantId: topupRow.tenant_id,
          topupRequestId: topupRow.id,
          channel: "WHATSAPP",
          message: waResult.error || "WHATSAPP_DISPATCH_FAILED",
          metadata: { provider: waResult.provider || null, recipient: waRecipient },
        });
      }
    } else {
      results.whatsapp = { skipped: true, reason: "TENANT_PHONE_EMPTY" };
    }

    const emailRecipient = toStringSafe(tenantRow.email);
    if (emailRecipient) {
      const emailResult = await sendEmailNotification(emailGateway as JsonObject, emailRecipient, {
        subject: emailSubject,
        emailText,
        emailHtml,
      });
      results.email = emailResult;
      await admin.from("billing_notification_logs").insert({
        tenant_id: topupRow.tenant_id,
        invoice_id: null,
        notification_type: "EMAIL",
        recipient: emailRecipient,
        subject: emailSubject,
        message: emailText,
        status: emailResult.ok ? "SENT" : "FAILED",
        sent_at: emailResult.ok ? new Date().toISOString() : null,
        error_message: emailResult.ok ? null : emailResult.error || null,
        metadata: {
          event: "WALLET_TOPUP_REVIEWED",
          topup_request_id: topupRow.id,
          trace_id: traceId,
          status: topupRow.status,
          trigger: body.trigger || "ADMIN_REVIEW_TOPUP",
        },
      });
      if (!emailResult.ok) {
        await logClientDispatchFailure(admin, {
          traceId,
          tenantId: topupRow.tenant_id,
          topupRequestId: topupRow.id,
          channel: "EMAIL",
          message: emailResult.error || "EMAIL_DISPATCH_FAILED",
          metadata: { provider: emailResult.provider || null, recipient: emailRecipient },
        });
      }
    } else {
      results.email = { skipped: true, reason: "TENANT_EMAIL_EMPTY" };
    }

    return new Response(
      JSON.stringify(
        withTrace(
          {
            success: true,
            topup_request_id: topupRow.id,
            status: topupRow.status,
            channels: results,
          },
          traceId,
        ),
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify(withTrace({ success: false, error: message }, traceId)), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
