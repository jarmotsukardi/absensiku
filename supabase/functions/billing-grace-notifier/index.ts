import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonObject = Record<string, unknown>;

interface NotifierRequest {
  tenant_id?: string;
  limit?: number;
  dry_run?: boolean;
}

interface GatewaySettingRow {
  key: string;
  value: JsonObject | null;
}

interface StreakRow {
  tenant_id: string;
  status: string;
  grace_period_end: string | null;
  reached_target: boolean | null;
  reached_target_at: string | null;
}

interface CleanupScheduleRow {
  tenant_id: string;
  status: string;
  purge_at: string;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  invoice_number: string | null;
  gross_amount: number | null;
  due_date: string | null;
  issue_date: string | null;
  status: string;
  payment_method_type: string | null;
  invoice_url: string | null;
  package_name: string | null;
  notes: string | null;
  created_at: string;
}

interface TenantRow {
  id: string;
  name: string;
  billing_mode: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  pic_whatsapp: string | null;
}

interface EmployeeRecipientRow {
  tenant_id: string;
  user_id: string | null;
  name: string | null;
}

interface AdminRecipientRow {
  tenant_id: string | null;
  user_id: string;
}

interface BillingLogRow {
  created_at: string;
  invoice_id: string | null;
  notification_type: string;
  status: string;
  metadata: JsonObject | null;
}

interface ArchivedManualPaymentRow {
  id: string;
  tenant_id: string;
  invoice_number: string | null;
  transfer_proof_url: string | null;
  transfer_proof_path: string | null;
  archive_expires_at: string | null;
}

interface SendResult {
  ok: boolean;
  provider?: string;
  error?: string;
}

type NotificationReason =
  | "GRACE_PERIOD_ENTERED"
  | "GRACE_PERIOD_REMINDER"
  | "GRACE_PERIOD_LAST_DAY"
  | "GRACE_PERIOD_EXPIRED"
  | "INVOICE_DUE_SOON";

const createErrorRef = (): string => {
  const compactIso = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "")
    .replaceAll(".", "")
    .replace("Z", "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${compactIso}-${random}`;
};

const logClientError = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    traceId: string;
    context: string;
    message: string;
    tenantId?: string | null;
    metadata?: JsonObject;
  },
) => {
  const payload = {
    error_ref: createErrorRef(),
    context: params.context,
    message: params.message,
    tenant_id: params.tenantId ?? null,
    source: "edge:billing-grace-notifier",
    metadata: {
      trace_id: params.traceId,
      ...(params.metadata || {}),
    },
  };
  const { error } = await supabase.from("client_error_logs").insert(payload);
  if (error) {
    logTraceError(params.traceId, "Failed to persist client_error_logs from billing-grace-notifier", error);
  }
};

const triggerAndroidPushDispatch = async (params: {
  traceId: string;
  tenantId: string | null;
  limit: number;
  dryRun: boolean;
}): Promise<JsonObject> => {
  if (params.dryRun) {
    return { skipped_reason: "DRY_RUN" };
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!supabaseUrl || !serviceRole) {
    return { skipped_reason: "SUPABASE_ENV_MISSING" };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-device-pushes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({
        tenant_id: params.tenantId ?? undefined,
        limit: Math.min(Math.max(params.limit * 2, 20), 500),
        notification_sources: ["billing_grace_notifier"],
        dry_run: false,
      }),
    });

    const rawText = await response.text();
    let payload: JsonObject = {};
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as JsonObject;
      } else {
        payload = { raw: rawText };
      }
    } catch {
      payload = { raw: rawText };
    }

    return {
      http_status: response.status,
      ...(payload ?? {}),
    };
  } catch (error) {
    logTraceError(params.traceId, "Gagal memicu dispatch-device-pushes", error);
    return {
      skipped_reason: "DISPATCH_HTTP_FAILED",
      error: error instanceof Error ? error.message : "HTTP dispatch failed",
    };
  }
};

const toStringSafe = (value: unknown): string => (typeof value === "string" ? value : "");

const toBooleanSafe = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

const formatDateId = (value: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(date);
};

const formatCurrencyIdr = (value: number | null): string => {
  const amount = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
};

const normalizePhone = (raw: string | null): string | null => {
  if (!raw) return null;
  let value = raw.replace(/[^0-9]/g, "");
  if (!value) return null;
  if (value.startsWith("0")) value = `62${value.slice(1)}`;
  return value;
};

const parseRetentionDays = (raw: unknown, fallback: number): number => {
  const min = 1;
  const max = 365;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.min(max, Math.max(min, Math.floor(raw)));
  if (typeof raw === "string" && raw.trim() && /^\d+$/.test(raw.trim())) {
    return Math.min(max, Math.max(min, Number.parseInt(raw.trim(), 10)));
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const value = (raw as Record<string, unknown>).value;
    return parseRetentionDays(value, fallback);
  }
  return Math.min(max, Math.max(min, fallback));
};

const toProofPathFromPublicUrl = (url: string | null): string | null => {
  if (!url) return null;
  const marker = "/storage/v1/object/public/payment-proofs/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rest = url.slice(idx + marker.length);
  return rest || null;
};

const parseDateOnlyUtc = (value: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
};

const getGraceDaysRemaining = (gracePeriodEnd: string | null): number | null => {
  if (!gracePeriodEnd) return null;
  const endDate = parseDateOnlyUtc(gracePeriodEnd);
  if (Number.isNaN(endDate.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.floor((endUtc - todayUtc) / (24 * 60 * 60 * 1000));
};

const buildReasonKey = (
  invoiceId: string,
  notificationType: "EMAIL" | "WHATSAPP" | "PUSH",
  reason: NotificationReason,
): string => `${invoiceId}:${notificationType}:${reason}`;

const getGatewaySetting = (
  rows: GatewaySettingRow[],
  key: "email_gateway" | "whatsapp_gateway",
): JsonObject => {
  const row = rows.find((item) => item.key === key);
  return (row?.value ?? {}) as JsonObject;
};

const getMessagePayload = (params: {
  tenantName: string;
  invoiceNumber: string;
  amountText: string;
  dueDateText: string;
  invoiceUrl: string;
  siteUrl: string;
  reason: NotificationReason;
  daysRemaining: number | null;
  purgeDateText?: string | null;
  purgeDaysRemaining?: number | null;
}): { subject: string; emailText: string; emailHtml: string; whatsappText: string } => {
  const {
    tenantName,
    invoiceNumber,
    amountText,
    dueDateText,
    invoiceUrl,
    siteUrl,
    reason,
    daysRemaining,
    purgeDateText,
    purgeDaysRemaining,
  } = params;

  const reasonLabel = reason === "GRACE_PERIOD_ENTERED"
    ? "Awal Grace Period"
    : reason === "GRACE_PERIOD_REMINDER"
    ? "Pengingat Grace Period"
    : reason === "GRACE_PERIOD_LAST_DAY"
    ? "Hari Terakhir Grace Period"
    : reason === "INVOICE_DUE_SOON"
    ? "Pengingat Jatuh Tempo Invoice"
    : "Grace Period Berakhir";

  const reasonLineBase = reason === "GRACE_PERIOD_ENTERED"
    ? "Tenant Anda sudah memasuki masa grace period kebijakan streak."
    : reason === "GRACE_PERIOD_REMINDER"
    ? `Pengingat pembayaran: masa grace period masih berjalan${
      typeof daysRemaining === "number" && daysRemaining > 0 ? ` (sisa ${daysRemaining} hari).` : "."
    }`
    : reason === "GRACE_PERIOD_LAST_DAY"
    ? "Hari ini adalah batas akhir grace period. Segera selesaikan pembayaran agar layanan tidak dinonaktifkan."
    : reason === "INVOICE_DUE_SOON"
    ? `Invoice Anda akan segera jatuh tempo${
      typeof daysRemaining === "number"
        ? daysRemaining <= 0
          ? " hari ini."
          : ` (sisa ${daysRemaining} hari).`
        : "."
    }`
    : "Masa grace period telah berakhir. Layanan dapat dinonaktifkan jika pembayaran belum diterima.";

  const purgeLine = purgeDateText
    ? `Tanggal purge data: ${purgeDateText}${
      typeof purgeDaysRemaining === "number" && purgeDaysRemaining >= 0
        ? ` (sisa ${purgeDaysRemaining} hari).`
        : "."
    }`
    : "";

  const reasonLine = reason !== "GRACE_PERIOD_ENTERED" && purgeLine
    ? `${reasonLineBase} ${purgeLine}`
    : reasonLineBase;

  const subject = `[AbsensiKu] ${reasonLabel} - ${invoiceNumber}`;
  const emailText = [
    `Yth. ${tenantName},`,
    "",
    reasonLine,
    `No. Invoice: ${invoiceNumber}`,
    `Total Tagihan: ${amountText}`,
    `Batas Akhir Grace Period: ${dueDateText}`,
    "",
    `Silakan lakukan pembayaran melalui: ${invoiceUrl}`,
    `Portal organisasi: ${siteUrl}/org/subscription`,
    "",
    "Abaikan pesan ini jika pembayaran sudah dilakukan.",
    "",
    "AbsensiKu Billing",
  ].join("\n");

  const emailHtml = `
  <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55;">
    <h2 style="margin: 0 0 12px;">${reasonLabel}</h2>
    <p>Yth. <strong>${tenantName}</strong>, ${reasonLine}</p>
    <table style="border-collapse: collapse; margin: 12px 0;">
      <tr><td style="padding: 4px 12px 4px 0;">No. Invoice</td><td style="padding: 4px 0;"><strong>${invoiceNumber}</strong></td></tr>
      <tr><td style="padding: 4px 12px 4px 0;">Total Tagihan</td><td style="padding: 4px 0;"><strong>${amountText}</strong></td></tr>
      <tr><td style="padding: 4px 12px 4px 0;">Batas Grace</td><td style="padding: 4px 0;"><strong>${dueDateText}</strong></td></tr>
    </table>
    <p>
      <a href="${invoiceUrl}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:white;text-decoration:none;border-radius:6px;">
        Buka Invoice
      </a>
    </p>
    <p style="margin-top: 16px;">Portal organisasi: <a href="${siteUrl}/org/subscription">${siteUrl}/org/subscription</a></p>
    <p style="color:#6b7280;font-size:12px;">Abaikan pesan ini jika pembayaran sudah dilakukan.</p>
  </div>`;

  const whatsappText = [
    `*AbsensiKu Billing*`,
    `*${reasonLabel}*`,
    `Yth. ${tenantName},`,
    reasonLine,
    `Invoice: ${invoiceNumber}`,
    `Tagihan: ${amountText}`,
    `Batas grace: ${dueDateText}`,
    `Bayar: ${invoiceUrl}`,
  ].join("\n");

  return { subject, emailText, emailHtml, whatsappText };
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

const sendWhatsAppNotification = async (
  waSetting: JsonObject,
  to: string,
  message: string,
): Promise<SendResult> => {
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

const hasReasonNotificationSent = (
  sentReasonMap: Set<string>,
  invoiceId: string,
  notificationType: "EMAIL" | "WHATSAPP" | "PUSH",
  reason: NotificationReason,
): boolean => sentReasonMap.has(buildReasonKey(invoiceId, notificationType, reason));

const getChannelReason = (
  graceDaysRemaining: number | null,
  channelEnteredSent: boolean,
): NotificationReason => {
  if (typeof graceDaysRemaining === "number") {
    if (graceDaysRemaining < 0) return "GRACE_PERIOD_EXPIRED";
    if (graceDaysRemaining === 0) return "GRACE_PERIOD_LAST_DAY";
  }
  if (!channelEnteredSent) return "GRACE_PERIOD_ENTERED";
  return "GRACE_PERIOD_REMINDER";
};

const normalizeReason = (value: string): NotificationReason => {
  if (value === "INVOICE_DUE_SOON") return "INVOICE_DUE_SOON";
  if (value === "GRACE_PERIOD_REMINDER") return "GRACE_PERIOD_REMINDER";
  if (value === "GRACE_PERIOD_LAST_DAY") return "GRACE_PERIOD_LAST_DAY";
  if (value === "GRACE_PERIOD_EXPIRED") return "GRACE_PERIOD_EXPIRED";
  return "GRACE_PERIOD_ENTERED";
};

const mapReasonToInAppType = (reason: NotificationReason): "info" | "warning" | "error" => {
  if (reason === "GRACE_PERIOD_EXPIRED") return "error";
  if (
    reason === "GRACE_PERIOD_LAST_DAY" ||
    reason === "GRACE_PERIOD_REMINDER" ||
    reason === "INVOICE_DUE_SOON"
  ) return "warning";
  return "info";
};

const mapReasonToInAppTitle = (reason: NotificationReason): string => {
  if (reason === "INVOICE_DUE_SOON") return "Pengingat Jatuh Tempo Invoice";
  if (reason === "GRACE_PERIOD_EXPIRED") return "Grace Period Berakhir";
  if (reason === "GRACE_PERIOD_LAST_DAY") return "Hari Terakhir Grace Period";
  if (reason === "GRACE_PERIOD_REMINDER") return "Pengingat Pembayaran Grace Period";
  return "Tenant Masuk Grace Period";
};

const BILLING_IN_APP_LINK = "/org/billing?menu=invoices";

const resolveBillingInAppRecipients = (
  tenant: TenantRow,
  recipientMap: Map<string, EmployeeRecipientRow[]>,
  tenantAdminMap: Map<string, string[]>,
): { userIds: string[]; recipientScope: "tenant_admin_only" | "active_employees" } => {
  const isCentralized = (tenant.billing_mode ?? "centralized") === "centralized";
  if (isCentralized) {
    return {
      userIds: tenantAdminMap.get(tenant.id) ?? [],
      recipientScope: "tenant_admin_only",
    };
  }

  const userIds = Array.from(
    new Set(
      (recipientMap.get(tenant.id) ?? [])
        .map((recipient) => recipient.user_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    userIds,
    recipientScope: "active_employees",
  };
};

const buildBillingInAppMessage = (params: {
  tenantName: string;
  invoiceNumber: string;
  amountText: string;
  dueDateText: string;
  reason: NotificationReason;
}): string => {
  const reasonText = params.reason === "INVOICE_DUE_SOON"
    ? "Invoice segera jatuh tempo dan perlu ditindaklanjuti."
    : params.reason === "GRACE_PERIOD_LAST_DAY"
    ? "Hari ini batas akhir grace period pembayaran."
    : params.reason === "GRACE_PERIOD_EXPIRED"
    ? "Grace period berakhir dan layanan berisiko ditangguhkan."
    : params.reason === "GRACE_PERIOD_REMINDER"
    ? "Tagihan masih berada dalam masa grace period."
    : "Tagihan streak baru sudah muncul dan perlu perhatian admin.";

  return [
    `${params.tenantName} - ${params.invoiceNumber}`,
    `Tagihan: ${params.amountText}`,
    `Batas tindak lanjut: ${params.dueDateText}`,
    reasonText,
  ].join(" | ");
};

const insertBillingInAppNotifications = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    traceId: string;
    tenant: TenantRow;
    invoice: InvoiceRow;
    reason: NotificationReason;
    amountText: string;
    dueDateText: string;
    daysRemaining: number | null;
    dryRun: boolean;
    recipientMap: Map<string, EmployeeRecipientRow[]>;
    tenantAdminMap: Map<string, string[]>;
    emailChannelOk: boolean;
    whatsappChannelOk: boolean;
  },
): Promise<JsonObject> => {
  const { userIds, recipientScope } = resolveBillingInAppRecipients(
    params.tenant,
    params.recipientMap,
    params.tenantAdminMap,
  );

  if (userIds.length === 0) {
    return {
      inserted: 0,
      reason: params.reason,
      recipient_scope: recipientScope,
      skipped_reason: "NO_RECIPIENTS",
    };
  }

  const metadataMatcher = {
    source: "billing_grace_notifier",
    invoice_id: params.invoice.id,
    reason: params.reason,
  };

  const { data: existingRows, error: existingError } = await supabase
    .from("notifications")
    .select("user_id")
    .in("user_id", userIds)
    .contains("metadata", metadataMatcher);

  if (existingError) {
    logTraceError(
      params.traceId,
      `Failed to check existing in-app billing notifications for invoice ${params.invoice.id}`,
      existingError,
    );
    return {
      inserted: 0,
      reason: params.reason,
      recipient_scope: recipientScope,
      skipped_reason: "EXISTING_CHECK_FAILED",
      error: existingError.message || "FAILED_TO_CHECK_EXISTING_NOTIFICATIONS",
    };
  }

  const notifiedUserIds = new Set(
    ((existingRows ?? []) as Array<{ user_id: string | null }>)
      .map((row) => row.user_id)
      .filter((value): value is string => Boolean(value)),
  );
  const pendingUserIds = userIds.filter((userId) => !notifiedUserIds.has(userId));

  if (pendingUserIds.length === 0) {
    return {
      inserted: 0,
      reason: params.reason,
      recipient_scope: recipientScope,
      skipped_reason: "ALREADY_EXISTS",
    };
  }

  if (params.dryRun) {
    return {
      inserted: pendingUserIds.length,
      reason: params.reason,
      recipient_scope: recipientScope,
      dry_run: true,
    };
  }

  const title = mapReasonToInAppTitle(params.reason);
  const message = buildBillingInAppMessage({
    tenantName: params.tenant.name,
    invoiceNumber: params.invoice.invoice_number || `INV-${params.invoice.id.slice(0, 8).toUpperCase()}`,
    amountText: params.amountText,
    dueDateText: params.dueDateText,
    reason: params.reason,
  });
  const notificationType = mapReasonToInAppType(params.reason);
  const notificationRows = pendingUserIds.map((userId) => ({
    user_id: userId,
    title,
    message,
    type: notificationType,
    is_read: false,
    link: BILLING_IN_APP_LINK,
    metadata: {
      source: "billing_grace_notifier",
      trace_id: params.traceId,
      invoice_id: params.invoice.id,
      invoice_number: params.invoice.invoice_number,
      reason: params.reason,
      email_sent: params.emailChannelOk,
      whatsapp_sent: params.whatsappChannelOk,
    },
  }));

  const { error: insertError } = await supabase.from("notifications").insert(notificationRows);
  const pushLogPayload = {
    tenant_id: params.tenant.id,
    invoice_id: params.invoice.id,
    notification_type: "PUSH",
    recipient: `in-app:${notificationRows.length}`,
    subject: title,
    message,
    status: insertError ? "FAILED" : "SENT",
    sent_at: insertError ? null : new Date().toISOString(),
    error_message: insertError ? String(insertError.message || "IN_APP_INSERT_FAILED") : null,
    metadata: {
      reason: params.reason,
      trace_id: params.traceId,
      days_remaining: params.daysRemaining,
    },
  };
  const { error: pushLogError } = await supabase.from("billing_notification_logs").insert(pushLogPayload);
  if (pushLogError) {
    logTraceError(
      params.traceId,
      `Failed to write PUSH billing log for invoice ${params.invoice.id}`,
      pushLogError,
    );
  }

  if (insertError) {
    logTraceError(
      params.traceId,
      `Failed to insert in-app billing notifications for invoice ${params.invoice.id}`,
      insertError,
    );
    return {
      inserted: 0,
      reason: params.reason,
      recipient_scope: recipientScope,
      skipped_reason: "INSERT_FAILED",
      error: insertError.message || "FAILED_TO_INSERT_NOTIFICATIONS",
    };
  }

  return {
    inserted: notificationRows.length,
    reason: params.reason,
    recipient_scope: recipientScope,
  };
};

const runArchivedManualPaymentCleanup = async (
  supabase: ReturnType<typeof createClient>,
  traceId: string,
  dryRun: boolean,
) => {
  const defaultRetentionDays = 7;
  let retentionDays = defaultRetentionDays;
  const summary = {
    retention_days: defaultRetentionDays,
    scanned: 0,
    deleted_rows: 0,
    deleted_files: 0,
    failed_rows: 0,
    dry_run: dryRun,
  };

  const { data: retentionSetting, error: retentionError } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "payment_archive_retention_days")
    .maybeSingle();
  if (retentionError) {
    logTraceError(traceId, "Failed to load payment archive retention setting", retentionError);
    await logClientError(supabase, {
      traceId,
      context: "billing.archive_cleanup.retention_setting.fetch_failed",
      message: retentionError.message || "Failed to load payment archive retention setting",
      metadata: { code: retentionError.code || null },
    });
  } else {
    retentionDays = parseRetentionDays((retentionSetting?.value as unknown) ?? defaultRetentionDays, defaultRetentionDays);
    summary.retention_days = retentionDays;
  }

  const { data: archivedRows, error: archivedError } = await supabase
    .from("manual_payments")
    .select("id, tenant_id, invoice_number, transfer_proof_url, transfer_proof_path, archive_expires_at")
    .eq("is_archived", true)
    .not("archive_expires_at", "is", null)
    .lte("archive_expires_at", new Date().toISOString())
    .order("archive_expires_at", { ascending: true })
    .limit(300);

  if (archivedError) {
    logTraceError(traceId, "Failed to load expired archived manual payments", archivedError);
    await logClientError(supabase, {
      traceId,
      context: "billing.archive_cleanup.expired_rows.fetch_failed",
      message: archivedError.message || "Failed to load expired archived manual payments",
      metadata: { code: archivedError.code || null },
    });
    return summary;
  }

  const rows = (archivedRows ?? []) as ArchivedManualPaymentRow[];
  summary.scanned = rows.length;
  if (rows.length === 0) return summary;

  if (dryRun) {
    return {
      ...summary,
      deleted_rows: rows.length,
    };
  }

  for (const row of rows) {
    try {
      const proofPath = row.transfer_proof_path || toProofPathFromPublicUrl(row.transfer_proof_url);
      if (proofPath) {
        const { error: removeFileError } = await supabase.storage.from("payment-proofs").remove([proofPath]);
        if (removeFileError) {
          summary.failed_rows += 1;
          logTraceError(traceId, `Failed to remove proof file for manual payment ${row.id}`, removeFileError);
          await logClientError(supabase, {
            traceId,
            context: "billing.archive_cleanup.storage.remove_failed",
            message: removeFileError.message || `Failed to remove proof file for manual payment ${row.id}`,
            tenantId: row.tenant_id,
            metadata: {
              manual_payment_id: row.id,
              invoice_number: row.invoice_number,
              proof_path: proofPath,
              code: removeFileError.code || null,
            },
          });
          continue;
        }
        summary.deleted_files += 1;
      }

      const { error: deleteRowError } = await supabase.from("manual_payments").delete().eq("id", row.id);
      if (deleteRowError) {
        summary.failed_rows += 1;
        logTraceError(traceId, `Failed to delete archived manual payment ${row.id}`, deleteRowError);
        await logClientError(supabase, {
          traceId,
          context: "billing.archive_cleanup.manual_payment.delete_failed",
          message: deleteRowError.message || `Failed to delete archived manual payment ${row.id}`,
          tenantId: row.tenant_id,
          metadata: {
            manual_payment_id: row.id,
            invoice_number: row.invoice_number,
            code: deleteRowError.code || null,
          },
        });
        continue;
      }
      summary.deleted_rows += 1;
    } catch (error) {
      summary.failed_rows += 1;
      logTraceError(traceId, `Unhandled cleanup error for archived manual payment ${row.id}`, error);
      await logClientError(supabase, {
        traceId,
        context: "billing.archive_cleanup.unhandled",
        message: error instanceof Error ? error.message : `Unhandled cleanup error for manual payment ${row.id}`,
        tenantId: row.tenant_id,
        metadata: {
          manual_payment_id: row.id,
          invoice_number: row.invoice_number,
        },
      });
    }
  }

  if (summary.failed_rows > 0) {
    await logClientError(supabase, {
      traceId,
      context: "billing.archive_cleanup.summary.partial_failure",
      message: `Cleanup arsip pembayaran gagal pada ${summary.failed_rows} dari ${summary.scanned} baris`,
      metadata: {
        scanned: summary.scanned,
        deleted_rows: summary.deleted_rows,
        deleted_files: summary.deleted_files,
        failed_rows: summary.failed_rows,
      },
    });
  }

  return summary;
};

const processDueSoonInvoiceReminders = async (
  supabase: ReturnType<typeof createClient>,
  traceId: string,
  params: {
    tenantFilter: string | null;
    limit: number;
    dryRun: boolean;
  },
): Promise<JsonObject> => {
  const dueSoonWindowDays = Math.max(
    Number.parseInt(Deno.env.get("BILLING_DUE_SOON_WINDOW_DAYS") ?? "3", 10) || 3,
    0,
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + dueSoonWindowDays);
  const dueWindowEndIso = windowEnd.toISOString().slice(0, 10);

  const summary: JsonObject = {
    window_days: dueSoonWindowDays,
    window_start: todayIso,
    window_end: dueWindowEndIso,
    dry_run: params.dryRun,
    scanned: 0,
    processed: 0,
    email_sent: 0,
    whatsapp_sent: 0,
    failed: 0,
    skipped: 0,
    details: [] as JsonObject[],
  };

  let invoiceQuery = supabase
    .from("invoices")
    .select(
      "id, tenant_id, invoice_number, gross_amount, due_date, issue_date, status, payment_method_type, invoice_url, package_name, notes, created_at",
    )
    .eq("status", "PENDING")
    .not("due_date", "is", null)
    .gte("due_date", todayIso)
    .lte("due_date", dueWindowEndIso)
    .order("due_date", { ascending: true })
    .limit(params.limit);

  if (params.tenantFilter) {
    invoiceQuery = invoiceQuery.eq("tenant_id", params.tenantFilter);
  }

  const { data: invoiceRows, error: invoiceError } = await invoiceQuery;
  if (invoiceError) {
    logTraceError(traceId, "Failed to load due-soon invoices", invoiceError);
    await logClientError(supabase, {
      traceId,
      context: "billing.due_soon.fetch_invoices_failed",
      message: invoiceError.message || "Failed to load due-soon invoices",
      tenantId: params.tenantFilter,
      metadata: { code: invoiceError.code || null },
    });
    return {
      ...summary,
      error: "FAILED_TO_LOAD_INVOICES",
    };
  }

  const invoices = (invoiceRows ?? []) as InvoiceRow[];
  summary.scanned = invoices.length;
  if (invoices.length === 0) return summary;

  const tenantIds = Array.from(new Set(invoices.map((invoice) => invoice.tenant_id)));
  const [tenantRes, gatewayRes, recipientRes, tenantAdminRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, billing_mode, email, phone, whatsapp, pic_whatsapp")
      .in("id", tenantIds),
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["email_gateway", "whatsapp_gateway"]),
    supabase
      .from("employees")
      .select("tenant_id, user_id, name")
      .in("tenant_id", tenantIds)
      .eq("is_active", true)
      .not("user_id", "is", null),
    supabase
      .from("user_roles")
      .select("tenant_id, user_id")
      .in("tenant_id", tenantIds)
      .eq("role", "admin_instansi"),
  ]);

  if (tenantRes.error) {
    logTraceError(traceId, "Failed to load tenants for due-soon reminder", tenantRes.error);
    await logClientError(supabase, {
      traceId,
      context: "billing.due_soon.fetch_tenants_failed",
      message: tenantRes.error.message || "Failed to load tenants for due-soon reminder",
      metadata: { code: tenantRes.error.code || null },
    });
    return {
      ...summary,
      error: "FAILED_TO_LOAD_TENANTS",
    };
  }
  if (gatewayRes.error) {
    logTraceError(traceId, "Failed to load gateway settings for due-soon reminder", gatewayRes.error);
    await logClientError(supabase, {
      traceId,
      context: "billing.due_soon.fetch_gateways_failed",
      message: gatewayRes.error.message || "Failed to load gateway settings for due-soon reminder",
      metadata: { code: gatewayRes.error.code || null },
    });
    return {
      ...summary,
      error: "FAILED_TO_LOAD_GATEWAYS",
    };
  }
  if (recipientRes.error) {
    logTraceError(traceId, "Failed to load in-app recipients for due-soon reminder", recipientRes.error);
    await logClientError(supabase, {
      traceId,
      context: "billing.due_soon.fetch_in_app_recipients_failed",
      message: recipientRes.error.message || "Failed to load in-app recipients for due-soon reminder",
      metadata: { code: recipientRes.error.code || null },
    });
    return {
      ...summary,
      error: "FAILED_TO_LOAD_IN_APP_RECIPIENTS",
    };
  }
  if (tenantAdminRes.error) {
    logTraceError(traceId, "Failed to load tenant admin recipients for due-soon reminder", tenantAdminRes.error);
    await logClientError(supabase, {
      traceId,
      context: "billing.due_soon.fetch_tenant_admins_failed",
      message: tenantAdminRes.error.message || "Failed to load tenant admin recipients for due-soon reminder",
      metadata: { code: tenantAdminRes.error.code || null },
    });
    return {
      ...summary,
      error: "FAILED_TO_LOAD_TENANT_ADMINS",
    };
  }

  const tenantMap = new Map(((tenantRes.data ?? []) as TenantRow[]).map((tenant) => [tenant.id, tenant]));
  const emailGateway = getGatewaySetting((gatewayRes.data ?? []) as GatewaySettingRow[], "email_gateway");
  const waGateway = getGatewaySetting((gatewayRes.data ?? []) as GatewaySettingRow[], "whatsapp_gateway");
  const recipientMap = new Map<string, EmployeeRecipientRow[]>();
  for (const recipient of ((recipientRes.data ?? []) as EmployeeRecipientRow[])) {
    const list = recipientMap.get(recipient.tenant_id) ?? [];
    list.push(recipient);
    recipientMap.set(recipient.tenant_id, list);
  }
  const tenantAdminMap = new Map<string, string[]>();
  for (const row of ((tenantAdminRes.data ?? []) as AdminRecipientRow[])) {
    if (!row.tenant_id) continue;
    const list = tenantAdminMap.get(row.tenant_id) ?? [];
    if (!list.includes(row.user_id)) list.push(row.user_id);
    tenantAdminMap.set(row.tenant_id, list);
  }

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const { data: existingLogs, error: logError } = await supabase
    .from("billing_notification_logs")
    .select("invoice_id, notification_type, status, metadata")
    .in("invoice_id", invoiceIds)
    .in("notification_type", ["EMAIL", "WHATSAPP"]);
  if (logError) {
    logTraceError(traceId, "Failed to load due-soon notification logs", logError);
  }

  const sentChannelKeys = new Set<string>();
  for (const row of ((existingLogs ?? []) as BillingLogRow[])) {
    if (!row.invoice_id || row.status !== "SENT") continue;
    const reason = normalizeReason(toStringSafe(row.metadata?.reason));
    if (reason !== "INVOICE_DUE_SOON") continue;
    sentChannelKeys.add(`${row.invoice_id}:${row.notification_type}`);
  }

  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "").trim() || "https://absensiku.app";
  const details = summary.details as JsonObject[];

  for (const invoice of invoices) {
    const tenant = tenantMap.get(invoice.tenant_id);
    if (!tenant) {
      summary.skipped = Number(summary.skipped || 0) + 1;
      continue;
    }

    const invoiceNumber = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
    const dueDateText = formatDateId(invoice.due_date);
    const amountText = formatCurrencyIdr(invoice.gross_amount);
    const daysRemaining = getGraceDaysRemaining(invoice.due_date);
    const invoiceUrl = (invoice.invoice_url || `${siteUrl}/org/subscription`).trim();

    const payload = getMessagePayload({
      tenantName: tenant.name,
      invoiceNumber,
      amountText,
      dueDateText,
      invoiceUrl,
      siteUrl,
      reason: "INVOICE_DUE_SOON",
      daysRemaining,
    });

    const tenantDetail: JsonObject = {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      invoice_id: invoice.id,
      invoice_number: invoiceNumber,
      due_date: invoice.due_date,
      days_remaining: daysRemaining,
      channels: {},
    };
    const channelResults = tenantDetail.channels as Record<string, unknown>;

    const emailChannelKey = `${invoice.id}:EMAIL`;
    const waChannelKey = `${invoice.id}:WHATSAPP`;
    const emailRecipient = toStringSafe(tenant.email).trim();
    const waRecipient = normalizePhone(tenant.pic_whatsapp || tenant.whatsapp || tenant.phone);

    if (sentChannelKeys.has(emailChannelKey)) {
      channelResults.email = { skipped: true, reason: "ALREADY_SENT", notification_reason: "INVOICE_DUE_SOON" };
      summary.skipped = Number(summary.skipped || 0) + 1;
    } else if (!emailRecipient) {
      channelResults.email = { ok: false, error: "TENANT_EMAIL_EMPTY", notification_reason: "INVOICE_DUE_SOON" };
      summary.failed = Number(summary.failed || 0) + 1;
      if (!params.dryRun) {
        await supabase.from("billing_notification_logs").insert({
          tenant_id: tenant.id,
          invoice_id: invoice.id,
          notification_type: "EMAIL",
          recipient: "-",
          subject: payload.subject,
          message: payload.emailText,
          status: "FAILED",
          error_message: "TENANT_EMAIL_EMPTY",
          metadata: { reason: "INVOICE_DUE_SOON", trace_id: traceId, days_remaining: daysRemaining },
        });
      }
    } else if (params.dryRun) {
      channelResults.email = {
        ok: true,
        dry_run: true,
        recipient: emailRecipient,
        notification_reason: "INVOICE_DUE_SOON",
      };
    } else {
      const emailResult = await sendEmailNotification(emailGateway, emailRecipient, payload);
      channelResults.email = { ...emailResult, recipient: emailRecipient, notification_reason: "INVOICE_DUE_SOON" };
      await supabase.from("billing_notification_logs").insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "EMAIL",
        recipient: emailRecipient,
        subject: payload.subject,
        message: payload.emailText,
        status: emailResult.ok ? "SENT" : "FAILED",
        sent_at: emailResult.ok ? new Date().toISOString() : null,
        error_message: emailResult.ok ? null : emailResult.error,
        metadata: {
          reason: "INVOICE_DUE_SOON",
          provider: emailResult.provider ?? null,
          trace_id: traceId,
          days_remaining: daysRemaining,
        },
      });
      if (emailResult.ok) {
        summary.email_sent = Number(summary.email_sent || 0) + 1;
        sentChannelKeys.add(emailChannelKey);
      } else {
        summary.failed = Number(summary.failed || 0) + 1;
      }
    }

    if (sentChannelKeys.has(waChannelKey)) {
      channelResults.whatsapp = { skipped: true, reason: "ALREADY_SENT", notification_reason: "INVOICE_DUE_SOON" };
      summary.skipped = Number(summary.skipped || 0) + 1;
    } else if (!waRecipient) {
      channelResults.whatsapp = { ok: false, error: "TENANT_WHATSAPP_EMPTY", notification_reason: "INVOICE_DUE_SOON" };
      summary.failed = Number(summary.failed || 0) + 1;
      if (!params.dryRun) {
        await supabase.from("billing_notification_logs").insert({
          tenant_id: tenant.id,
          invoice_id: invoice.id,
          notification_type: "WHATSAPP",
          recipient: "-",
          subject: null,
          message: payload.whatsappText,
          status: "FAILED",
          error_message: "TENANT_WHATSAPP_EMPTY",
          metadata: { reason: "INVOICE_DUE_SOON", trace_id: traceId, days_remaining: daysRemaining },
        });
      }
    } else if (params.dryRun) {
      channelResults.whatsapp = {
        ok: true,
        dry_run: true,
        recipient: waRecipient,
        notification_reason: "INVOICE_DUE_SOON",
      };
    } else {
      const waResult = await sendWhatsAppNotification(waGateway, waRecipient, payload.whatsappText);
      channelResults.whatsapp = { ...waResult, recipient: waRecipient, notification_reason: "INVOICE_DUE_SOON" };
      await supabase.from("billing_notification_logs").insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "WHATSAPP",
        recipient: waRecipient,
        subject: null,
        message: payload.whatsappText,
        status: waResult.ok ? "SENT" : "FAILED",
        sent_at: waResult.ok ? new Date().toISOString() : null,
        error_message: waResult.ok ? null : waResult.error,
        metadata: {
          reason: "INVOICE_DUE_SOON",
          provider: waResult.provider ?? null,
          trace_id: traceId,
          days_remaining: daysRemaining,
        },
      });
      if (waResult.ok) {
        summary.whatsapp_sent = Number(summary.whatsapp_sent || 0) + 1;
        sentChannelKeys.add(waChannelKey);
      } else {
        summary.failed = Number(summary.failed || 0) + 1;
      }
    }

    const emailOk = Boolean((channelResults.email as Record<string, unknown> | undefined)?.ok);
    const waOk = Boolean((channelResults.whatsapp as Record<string, unknown> | undefined)?.ok);
    tenantDetail.in_app_notifications = await insertBillingInAppNotifications(supabase, {
      traceId,
      tenant,
      invoice,
      reason: "INVOICE_DUE_SOON",
      amountText,
      dueDateText,
      daysRemaining,
      dryRun: params.dryRun,
      recipientMap,
      tenantAdminMap,
      emailChannelOk: emailOk,
      whatsappChannelOk: waOk,
    });

    details.push(tenantDetail);
    summary.processed = Number(summary.processed || 0) + 1;
  }

  return summary;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("billing-grace-notifier");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      return new Response(
        JSON.stringify(withTrace({ error: "Supabase service role tidak terkonfigurasi" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const cronSecret = Deno.env.get("BILLING_NOTIFIER_SECRET");
    const suppliedCronSecret = req.headers.get("x-cron-secret");

    let isSuperAdmin = false;
    let isAuthorized = false;

    if (cronSecret && suppliedCronSecret && cronSecret === suppliedCronSecret) {
      isAuthorized = true;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { data: authData, error: authError } = await supabase.auth.getUser(token);
        if (!authError && authData.user) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", authData.user.id);
          isSuperAdmin = (roles ?? []).some((item: { role: string }) => item.role === "super_admin");
          isAuthorized = isSuperAdmin;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestBody: NotifierRequest = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tenantFilter = toStringSafe(requestBody.tenant_id) || null;
    const dryRun = Boolean(requestBody.dry_run);
    const limit = Math.min(Math.max(Number(requestBody.limit ?? 100) || 100, 1), 500);

    if (tenantFilter && !isSuperAdmin && !(cronSecret && suppliedCronSecret === cronSecret)) {
      return new Response(
        JSON.stringify(withTrace({ error: "Forbidden tenant scope" }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Enforce suspend/expiry policy before sending notifications so grace-expired tenants
    // are processed near-real-time (same cadence as notifier cron).
    const syncArgs = tenantFilter ? { p_tenant_id: tenantFilter } : {};
    const { error: syncError } = await supabase.rpc("sync_streak_subscription_status", syncArgs);
    if (syncError) {
      logTraceError(traceId, "Failed to sync streak subscription status", syncError);
    }

    // Best-effort lifecycle automation: schedule/cancel cleanup, send purge reminders,
    // and execute cleanup when purge date is reached.
    let cleanupLifecycleResult: JsonObject | null = null;
    const lifecycleArgs = tenantFilter
      ? { p_limit: limit, p_dry_run: dryRun, p_tenant_id: tenantFilter }
      : { p_limit: limit, p_dry_run: dryRun };
    const { data: lifecycleData, error: lifecycleError } = await supabase.rpc(
      "run_unpaid_cleanup_lifecycle",
      lifecycleArgs,
    );
    if (lifecycleError) {
      logTraceError(traceId, "Failed to run unpaid cleanup lifecycle", lifecycleError);
    } else if (lifecycleData && typeof lifecycleData === "object") {
      cleanupLifecycleResult = lifecycleData as JsonObject;
    }

    const paymentArchiveCleanupResult = await runArchivedManualPaymentCleanup(supabase, traceId, dryRun);
    const dueSoonReminderResult = await processDueSoonInvoiceReminders(supabase, traceId, {
      tenantFilter,
      limit,
      dryRun,
    });

    let streakQuery = supabase
      .from("stability_streaks")
      .select("tenant_id, status, grace_period_end, reached_target, reached_target_at")
      .eq("reached_target", true)
      .in("status", ["ready_for_invoicing", "grace_period"])
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (tenantFilter) {
      streakQuery = streakQuery.eq("tenant_id", tenantFilter);
    }

    const { data: streakRows, error: streakError } = await streakQuery;
    if (streakError) {
      logTraceError(traceId, "Failed to load streak rows", streakError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat data streak" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const streaks = (streakRows ?? []) as StreakRow[];
    if (streaks.length === 0) {
      const pushDispatchResult = await triggerAndroidPushDispatch({
        traceId,
        tenantId: tenantFilter,
        limit,
        dryRun,
      });
      return new Response(
        JSON.stringify({
          success: true,
          trace_id: traceId,
          processed: 0,
          message: "Tidak ada tenant grace period.",
          cleanup_lifecycle: cleanupLifecycleResult,
          payment_archive_cleanup: paymentArchiveCleanupResult,
          due_soon_reminder: dueSoonReminderResult,
          android_push_dispatch: pushDispatchResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tenantIds = Array.from(new Set(streaks.map((item) => item.tenant_id)));
    const [invoiceRes, tenantRes, gatewayRes, recipientRes, tenantAdminRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, tenant_id, invoice_number, gross_amount, due_date, issue_date, status, payment_method_type, invoice_url, package_name, notes, created_at",
        )
        .in("tenant_id", tenantIds)
        .in("status", ["PENDING", "AWAITING_VERIFICATION"])
        .order("created_at", { ascending: false }),
      supabase
        .from("tenants")
        .select("id, name, billing_mode, email, phone, whatsapp, pic_whatsapp")
        .in("id", tenantIds),
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["email_gateway", "whatsapp_gateway"]),
      supabase
        .from("employees")
        .select("tenant_id, user_id, name")
        .in("tenant_id", tenantIds)
        .eq("is_active", true)
        .not("user_id", "is", null),
      supabase
        .from("user_roles")
        .select("tenant_id, user_id")
        .in("tenant_id", tenantIds)
        .eq("role", "admin_instansi"),
    ]);

    if (invoiceRes.error) {
      logTraceError(traceId, "Failed to load invoices", invoiceRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat invoice pending" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (tenantRes.error) {
      logTraceError(traceId, "Failed to load tenant rows", tenantRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat kontak tenant" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (gatewayRes.error) {
      logTraceError(traceId, "Failed to load gateway settings", gatewayRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat pengaturan gateway" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (recipientRes.error) {
      logTraceError(traceId, "Failed to load in-app recipients", recipientRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat penerima notifikasi in-app" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (tenantAdminRes.error) {
      logTraceError(traceId, "Failed to load tenant admin recipients", tenantAdminRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat admin organisasi penerima notifikasi" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let invoices = (invoiceRes.data ?? []) as InvoiceRow[];
    const tenants = (tenantRes.data ?? []) as TenantRow[];
    const gatewayRows = (gatewayRes.data ?? []) as GatewaySettingRow[];
    const employeeRecipients = (recipientRes.data ?? []) as EmployeeRecipientRow[];
    const tenantAdmins = (tenantAdminRes.data ?? []) as AdminRecipientRow[];
    const emailGateway = getGatewaySetting(gatewayRows, "email_gateway");
    const waGateway = getGatewaySetting(gatewayRows, "whatsapp_gateway");

    // Optional purge schedule context (migration may not exist yet on some environments).
    const cleanupScheduleMap = new Map<string, CleanupScheduleRow>();
    const { data: cleanupRows, error: cleanupRowsError } = await supabase
      .from("tenant_cleanup_lifecycle")
      .select("tenant_id, status, purge_at")
      .in("tenant_id", tenantIds)
      .eq("status", "scheduled");
    if (cleanupRowsError) {
      logTraceError(traceId, "Failed to load tenant cleanup lifecycle rows", cleanupRowsError);
    } else {
      for (const row of (cleanupRows ?? []) as CleanupScheduleRow[]) {
        cleanupScheduleMap.set(row.tenant_id, row);
      }
    }

    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const streakMap = new Map(streaks.map((streak) => [streak.tenant_id, streak]));
    const recipientMap = new Map<string, EmployeeRecipientRow[]>();
    for (const recipient of employeeRecipients) {
      const list = recipientMap.get(recipient.tenant_id) ?? [];
      list.push(recipient);
      recipientMap.set(recipient.tenant_id, list);
    }
    const tenantAdminMap = new Map<string, string[]>();
    for (const row of tenantAdmins) {
      if (!row.tenant_id) continue;
      const list = tenantAdminMap.get(row.tenant_id) ?? [];
      if (!list.includes(row.user_id)) list.push(row.user_id);
      tenantAdminMap.set(row.tenant_id, list);
    }

    const tenantWithoutOpenInvoice = tenantIds.filter((tenantId) =>
      !invoices.some((item) => item.tenant_id === tenantId),
    );

    if (!dryRun && tenantWithoutOpenInvoice.length > 0) {
      for (const tenantId of tenantWithoutOpenInvoice) {
        const { error: createInvoiceError } = await supabase.rpc("create_pending_streak_invoice", {
          p_tenant_id: tenantId,
        });
        if (createInvoiceError) {
          logTraceError(traceId, `Failed to auto-create pending streak invoice for tenant ${tenantId}`, createInvoiceError);
        }
      }

      const { data: refreshedInvoices, error: refreshedInvoicesError } = await supabase
        .from("invoices")
        .select(
          "id, tenant_id, invoice_number, gross_amount, due_date, issue_date, status, payment_method_type, invoice_url, package_name, notes, created_at",
        )
        .in("tenant_id", tenantIds)
        .in("status", ["PENDING", "AWAITING_VERIFICATION"])
        .order("created_at", { ascending: false });

      if (refreshedInvoicesError) {
        logTraceError(traceId, "Failed to reload invoices after auto-create", refreshedInvoicesError);
      } else {
        invoices = (refreshedInvoices ?? []) as InvoiceRow[];
      }
    }

    const candidateInvoices: InvoiceRow[] = [];
    for (const tenantId of tenantIds) {
      const tenantInvoices = invoices.filter((item) => item.tenant_id === tenantId);
      if (tenantInvoices.length === 0) continue;
      const streakInvoice = tenantInvoices.find((item) => {
        const packageName = (item.package_name ?? "").toLowerCase();
        return packageName.includes("streak billing") || (item.notes ?? "").toLowerCase().includes("streak");
      });
      const candidate = streakInvoice ?? tenantInvoices[0];
      if (candidate) candidateInvoices.push(candidate);
    }

    if (candidateInvoices.length === 0) {
      const pushDispatchResult = await triggerAndroidPushDispatch({
        traceId,
        tenantId: tenantFilter,
        limit,
        dryRun,
      });
      return new Response(
        JSON.stringify({
          success: true,
          trace_id: traceId,
          processed: 0,
          message: "Tenant grace period belum memiliki invoice pending.",
          cleanup_lifecycle: cleanupLifecycleResult,
          payment_archive_cleanup: paymentArchiveCleanupResult,
          due_soon_reminder: dueSoonReminderResult,
          android_push_dispatch: pushDispatchResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoiceIds = candidateInvoices.map((item) => item.id);
    const { data: sentRows, error: sentError } = await supabase
      .from("billing_notification_logs")
      .select("created_at, invoice_id, notification_type, status, metadata")
      .in("invoice_id", invoiceIds)
      .in("notification_type", ["EMAIL", "WHATSAPP", "PUSH"]);

    if (sentError) {
      logTraceError(traceId, "Failed to load notification logs", sentError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memuat log notifikasi billing" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sentReasonMap = new Set<string>();
    const attemptedRecentlyMap = new Set<string>();
    const lastSentAtMap = new Map<string, number>();
    const retryCooldownMinutes = Math.max(Number.parseInt(Deno.env.get("BILLING_NOTIFIER_RETRY_MINUTES") ?? "60", 10) || 60, 1);
    const reminderIntervalHours = Math.max(Number.parseInt(Deno.env.get("BILLING_NOTIFIER_REMINDER_HOURS") ?? "24", 10) || 24, 1);
    const retryCooldownMs = retryCooldownMinutes * 60 * 1000;
    const reminderIntervalMs = reminderIntervalHours * 60 * 60 * 1000;
    const nowTs = Date.now();

    for (const row of (sentRows ?? []) as BillingLogRow[]) {
      if (!row.invoice_id) continue;
      const reason = normalizeReason(toStringSafe(row.metadata?.reason));
      const reasonKey = buildReasonKey(row.invoice_id, row.notification_type as "EMAIL" | "WHATSAPP" | "PUSH", reason);
      const channelKey = `${row.invoice_id}:${row.notification_type}`;
      if (row.status === "SENT") {
        sentReasonMap.add(reasonKey);
      }
      const createdTs = new Date(row.created_at).getTime();
      if (!Number.isNaN(createdTs) && row.status === "SENT") {
        const previousSentTs = lastSentAtMap.get(channelKey) ?? 0;
        lastSentAtMap.set(channelKey, Math.max(previousSentTs, createdTs));
      }
      if (!Number.isNaN(createdTs) && nowTs - createdTs <= retryCooldownMs) {
        attemptedRecentlyMap.add(reasonKey);
      }
    }

    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "").trim() || "https://absensiku.app";

    let processed = 0;
    let emailSent = 0;
    let waSent = 0;
    let failed = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const invoice of candidateInvoices) {
      const tenant = tenantMap.get(invoice.tenant_id);
      const streak = streakMap.get(invoice.tenant_id);
      if (!tenant || !streak) continue;

      const invoiceNumber = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
      const graceDate = streak.grace_period_end || invoice.due_date;
      const graceDaysRemaining = getGraceDaysRemaining(graceDate);
      const amountText = formatCurrencyIdr(invoice.gross_amount);
      const dueDateText = formatDateId(graceDate);
      const invoiceUrl = (invoice.invoice_url || `${siteUrl}/org/subscription`).trim();
      const cleanupSchedule = cleanupScheduleMap.get(tenant.id);
      const purgeDateText = cleanupSchedule?.purge_at ? formatDateId(cleanupSchedule.purge_at) : null;
      const purgeDaysRemaining = cleanupSchedule?.purge_at
        ? getGraceDaysRemaining(cleanupSchedule.purge_at)
        : null;

      const tenantResult: Record<string, unknown> = {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        grace_days_remaining: graceDaysRemaining,
        cleanup_purge_at: cleanupSchedule?.purge_at ?? null,
        cleanup_days_remaining: purgeDaysRemaining,
        dry_run: dryRun,
        channels: {},
      };

      const emailRecipient = toStringSafe(tenant.email).trim();
      const waRecipient = normalizePhone(tenant.pic_whatsapp || tenant.whatsapp || tenant.phone);

      const channelResults: Record<string, unknown> = {};

      const emailEnteredSent = hasReasonNotificationSent(sentReasonMap, invoice.id, "EMAIL", "GRACE_PERIOD_ENTERED");
      const emailReason = getChannelReason(graceDaysRemaining, emailEnteredSent);
      const emailPayload = getMessagePayload({
        tenantName: tenant.name,
        invoiceNumber,
        amountText,
        dueDateText,
        invoiceUrl,
        siteUrl,
        reason: emailReason,
        daysRemaining: graceDaysRemaining,
        purgeDateText,
        purgeDaysRemaining,
      });
      const emailReasonKey = buildReasonKey(invoice.id, "EMAIL", emailReason);
      const emailChannelKey = `${invoice.id}:EMAIL`;
      const emailAttemptedRecently = attemptedRecentlyMap.has(emailReasonKey);
      const emailLastSentTs = lastSentAtMap.get(emailChannelKey) ?? 0;
      const emailReasonAlreadySent = emailReason !== "GRACE_PERIOD_REMINDER" &&
        hasReasonNotificationSent(sentReasonMap, invoice.id, "EMAIL", emailReason);
      const emailReminderCooldown = emailReason === "GRACE_PERIOD_REMINDER" &&
        emailLastSentTs > 0 &&
        nowTs - emailLastSentTs < reminderIntervalMs;

      if (emailReasonAlreadySent) {
        channelResults.email = { skipped: true, reason: "ALREADY_SENT", notification_reason: emailReason };
      } else if (!dryRun && emailAttemptedRecently) {
        channelResults.email = {
          skipped: true,
          reason: "RETRY_COOLDOWN",
          notification_reason: emailReason,
          retry_after_minutes: retryCooldownMinutes,
        };
      } else if (!dryRun && emailReminderCooldown) {
        channelResults.email = {
          skipped: true,
          reason: "REMINDER_INTERVAL",
          notification_reason: emailReason,
          retry_after_hours: reminderIntervalHours,
        };
      } else if (!emailRecipient) {
        channelResults.email = { ok: false, error: "TENANT_EMAIL_EMPTY", notification_reason: emailReason };
        failed += 1;
        if (!dryRun) {
          await supabase.from("billing_notification_logs").insert({
            tenant_id: tenant.id,
            invoice_id: invoice.id,
            notification_type: "EMAIL",
            recipient: "-",
            subject: emailPayload.subject,
            message: emailPayload.emailText,
            status: "FAILED",
            error_message: "TENANT_EMAIL_EMPTY",
            metadata: { reason: emailReason, trace_id: traceId, days_remaining: graceDaysRemaining },
          });
        }
      } else if (dryRun) {
        channelResults.email = {
          ok: true,
          dry_run: true,
          recipient: emailRecipient,
          notification_reason: emailReason,
        };
      } else {
        const emailResult = await sendEmailNotification(emailGateway, emailRecipient, emailPayload);
        channelResults.email = { ...emailResult, recipient: emailRecipient, notification_reason: emailReason };
        await supabase.from("billing_notification_logs").insert({
          tenant_id: tenant.id,
          invoice_id: invoice.id,
          notification_type: "EMAIL",
          recipient: emailRecipient,
          subject: emailPayload.subject,
          message: emailPayload.emailText,
          status: emailResult.ok ? "SENT" : "FAILED",
          sent_at: emailResult.ok ? new Date().toISOString() : null,
          error_message: emailResult.ok ? null : emailResult.error,
          metadata: {
            reason: emailReason,
            provider: emailResult.provider ?? null,
            trace_id: traceId,
            days_remaining: graceDaysRemaining,
          },
        });
        if (emailResult.ok) {
          emailSent += 1;
          sentReasonMap.add(emailReasonKey);
          lastSentAtMap.set(emailChannelKey, Date.now());
        } else {
          failed += 1;
        }
      }

      const waEnteredSent = hasReasonNotificationSent(sentReasonMap, invoice.id, "WHATSAPP", "GRACE_PERIOD_ENTERED");
      const waReason = getChannelReason(graceDaysRemaining, waEnteredSent);
      const waPayload = getMessagePayload({
        tenantName: tenant.name,
        invoiceNumber,
        amountText,
        dueDateText,
        invoiceUrl,
        siteUrl,
        reason: waReason,
        daysRemaining: graceDaysRemaining,
        purgeDateText,
        purgeDaysRemaining,
      });
      const waReasonKey = buildReasonKey(invoice.id, "WHATSAPP", waReason);
      const waChannelKey = `${invoice.id}:WHATSAPP`;
      const waAttemptedRecently = attemptedRecentlyMap.has(waReasonKey);
      const waLastSentTs = lastSentAtMap.get(waChannelKey) ?? 0;
      const waReasonAlreadySent = waReason !== "GRACE_PERIOD_REMINDER" &&
        hasReasonNotificationSent(sentReasonMap, invoice.id, "WHATSAPP", waReason);
      const waReminderCooldown = waReason === "GRACE_PERIOD_REMINDER" &&
        waLastSentTs > 0 &&
        nowTs - waLastSentTs < reminderIntervalMs;

      if (waReasonAlreadySent) {
        channelResults.whatsapp = { skipped: true, reason: "ALREADY_SENT", notification_reason: waReason };
      } else if (!dryRun && waAttemptedRecently) {
        channelResults.whatsapp = {
          skipped: true,
          reason: "RETRY_COOLDOWN",
          notification_reason: waReason,
          retry_after_minutes: retryCooldownMinutes,
        };
      } else if (!dryRun && waReminderCooldown) {
        channelResults.whatsapp = {
          skipped: true,
          reason: "REMINDER_INTERVAL",
          notification_reason: waReason,
          retry_after_hours: reminderIntervalHours,
        };
      } else if (!waRecipient) {
        channelResults.whatsapp = { ok: false, error: "TENANT_WHATSAPP_EMPTY", notification_reason: waReason };
        failed += 1;
        if (!dryRun) {
          await supabase.from("billing_notification_logs").insert({
            tenant_id: tenant.id,
            invoice_id: invoice.id,
            notification_type: "WHATSAPP",
            recipient: "-",
            subject: null,
            message: waPayload.whatsappText,
            status: "FAILED",
            error_message: "TENANT_WHATSAPP_EMPTY",
            metadata: { reason: waReason, trace_id: traceId, days_remaining: graceDaysRemaining },
          });
        }
      } else if (dryRun) {
        channelResults.whatsapp = {
          ok: true,
          dry_run: true,
          recipient: waRecipient,
          notification_reason: waReason,
        };
      } else {
        const waResult = await sendWhatsAppNotification(waGateway, waRecipient, waPayload.whatsappText);
        channelResults.whatsapp = { ...waResult, recipient: waRecipient, notification_reason: waReason };
        await supabase.from("billing_notification_logs").insert({
          tenant_id: tenant.id,
          invoice_id: invoice.id,
          notification_type: "WHATSAPP",
          recipient: waRecipient,
          subject: null,
          message: waPayload.whatsappText,
          status: waResult.ok ? "SENT" : "FAILED",
          sent_at: waResult.ok ? new Date().toISOString() : null,
          error_message: waResult.ok ? null : waResult.error,
          metadata: {
            reason: waReason,
            provider: waResult.provider ?? null,
            trace_id: traceId,
            days_remaining: graceDaysRemaining,
          },
        });
        if (waResult.ok) {
          waSent += 1;
          sentReasonMap.add(waReasonKey);
          lastSentAtMap.set(waChannelKey, Date.now());
        } else {
          failed += 1;
        }
      }

      {
        const inAppEnteredSent = hasReasonNotificationSent(sentReasonMap, invoice.id, "PUSH", "GRACE_PERIOD_ENTERED");
        const inAppReason = getChannelReason(graceDaysRemaining, inAppEnteredSent);
        const inAppReasonKey = buildReasonKey(invoice.id, "PUSH", inAppReason);
        const inAppChannelKey = `${invoice.id}:PUSH`;
        const inAppAttemptedRecently = attemptedRecentlyMap.has(inAppReasonKey);
        const inAppLastSentTs = lastSentAtMap.get(inAppChannelKey) ?? 0;
        const inAppReasonAlreadySent = inAppReason !== "GRACE_PERIOD_REMINDER" &&
          hasReasonNotificationSent(sentReasonMap, invoice.id, "PUSH", inAppReason);
        const inAppReminderCooldown = inAppReason === "GRACE_PERIOD_REMINDER" &&
          inAppLastSentTs > 0 &&
          nowTs - inAppLastSentTs < reminderIntervalMs;
        const inAppType = mapReasonToInAppType(inAppReason);
        const inAppTitle = mapReasonToInAppTitle(inAppReason);
        const inAppMessage = [
          `${tenant.name} - ${invoiceNumber}`,
          `Tagihan: ${amountText}`,
          `Batas grace: ${dueDateText}`,
          `Status: ${inAppReason.replaceAll("_", " ")}`,
        ].join(" | ");
        const inAppLink = `/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceNumber)}`;
        const isCentralized = (tenant.billing_mode ?? "centralized") === "centralized";
        const userIds = isCentralized
          ? (tenantAdminMap.get(tenant.id) ?? [])
          : Array.from(
            new Set(
              (recipientMap.get(tenant.id) ?? [])
                .map((r) => r.user_id)
                .filter((id): id is string => Boolean(id)),
            ),
          );

        if (inAppReasonAlreadySent) {
          tenantResult.in_app_notifications = {
            inserted: 0,
            reason: inAppReason,
            recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            skipped_reason: "ALREADY_SENT",
          };
        } else if (!dryRun && inAppAttemptedRecently) {
          tenantResult.in_app_notifications = {
            inserted: 0,
            reason: inAppReason,
            recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            skipped_reason: "RETRY_COOLDOWN",
            retry_after_minutes: retryCooldownMinutes,
          };
        } else if (!dryRun && inAppReminderCooldown) {
          tenantResult.in_app_notifications = {
            inserted: 0,
            reason: inAppReason,
            recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            skipped_reason: "REMINDER_INTERVAL",
            retry_after_hours: reminderIntervalHours,
          };
        } else if (userIds.length === 0) {
          tenantResult.in_app_notifications = {
            inserted: 0,
            reason: inAppReason,
            recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            skipped_reason: "NO_RECIPIENTS",
          };
        } else if (dryRun) {
          tenantResult.in_app_notifications = {
            inserted: userIds.length,
            reason: inAppReason,
            recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            dry_run: true,
          };
        } else {
          const notificationRows = userIds.map((userId) => ({
            user_id: userId,
            title: inAppTitle,
            message: inAppMessage,
            type: inAppType,
            is_read: false,
            link: inAppLink,
            metadata: {
              source: "billing_grace_notifier",
              trace_id: traceId,
              invoice_id: invoice.id,
              invoice_number: invoiceNumber,
              reason: inAppReason,
              email_sent: Boolean((channelResults.email as Record<string, unknown> | undefined)?.ok),
              whatsapp_sent: Boolean((channelResults.whatsapp as Record<string, unknown> | undefined)?.ok),
            },
          }));

          const { error: inAppError } = await supabase.from("notifications").insert(notificationRows);
          const { error: pushLogError } = await supabase.from("billing_notification_logs").insert({
            tenant_id: tenant.id,
            invoice_id: invoice.id,
            notification_type: "PUSH",
            recipient: `in-app:${notificationRows.length}`,
            subject: inAppTitle,
            message: inAppMessage,
            status: inAppError ? "FAILED" : "SENT",
            sent_at: inAppError ? null : new Date().toISOString(),
            error_message: inAppError ? String(inAppError.message || "IN_APP_INSERT_FAILED") : null,
            metadata: {
              reason: inAppReason,
              trace_id: traceId,
              days_remaining: graceDaysRemaining,
            },
          });

          if (pushLogError) {
            logTraceError(traceId, `Failed to write PUSH billing log for tenant ${tenant.id}`, pushLogError);
          }

          if (inAppError) {
            logTraceError(traceId, `Failed to write in-app notifications for tenant ${tenant.id}`, inAppError);
            failed += 1;
            tenantResult.in_app_notifications = {
              inserted: 0,
              reason: inAppReason,
              recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
              error: String(inAppError.message || "IN_APP_INSERT_FAILED"),
            };
          } else {
            sentReasonMap.add(inAppReasonKey);
            lastSentAtMap.set(inAppChannelKey, Date.now());
            tenantResult.in_app_notifications = {
              inserted: notificationRows.length,
              reason: inAppReason,
              recipient_scope: isCentralized ? "tenant_admin_only" : "active_employees",
            };
          }
        }
      }

      tenantResult.channels = channelResults;
      details.push(tenantResult);
      processed += 1;
    }

    const pushDispatchResult = await triggerAndroidPushDispatch({
      traceId,
      tenantId: tenantFilter,
      limit,
      dryRun,
    });

    return new Response(
      JSON.stringify({
        success: true,
        trace_id: traceId,
        dry_run: dryRun,
        processed,
        email_sent: emailSent,
        whatsapp_sent: waSent,
        failed,
        cleanup_lifecycle: cleanupLifecycleResult,
        payment_archive_cleanup: paymentArchiveCleanupResult,
        due_soon_reminder: dueSoonReminderResult,
        android_push_dispatch: pushDispatchResult,
        details,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Unhandled billing grace notifier error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(withTrace({ error: "Internal server error", details: message }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
