import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonObject = Record<string, unknown>;

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
  phone: string | null;
  whatsapp: string | null;
  pic_whatsapp: string | null;
}

interface GatewaySettingRow {
  key: string;
  value: JsonObject | null;
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

const normalizePhone = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return digits;
};

const maskPhone = (phone: string): string => {
  if (phone.length <= 5) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("dispatch-billing-whatsapp");

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

    const eventKey = `invoice_paid:${invoiceId}`;

    const [{ data: invoiceRow, error: invoiceError }, { data: gatewayRows, error: gatewayError }] = await Promise.all([
      admin
        .from("invoices")
        .select("id, invoice_number, tenant_id, status, gross_amount, due_date, paid_at")
        .eq("id", invoiceId)
        .maybeSingle(),
      admin
        .from("system_settings")
        .select("key, value")
        .in("key", ["whatsapp_gateway", "wa_gateway"]),
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

    const { data: tenantRow, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, phone, whatsapp, pic_whatsapp")
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
      .eq("notification_type", "WHATSAPP")
      .contains("metadata", { event_key: eventKey })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingLog.error) throw existingLog.error;
    if (existingLog.data && ["SENT", "DELIVERED", "PENDING"].includes(existingLog.data.status || "")) {
      return new Response(
        JSON.stringify(withTrace({ success: true, skipped: true, reason: "ALREADY_DISPATCHED", trace_id: traceId }, traceId)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (gatewayError) throw gatewayError;
    const rows = (gatewayRows ?? []) as GatewaySettingRow[];
    const selected = rows.find((row) => row.key === "whatsapp_gateway") || rows.find((row) => row.key === "wa_gateway");
    const gateway = (selected?.value ?? {}) as JsonObject;

    const recipient = normalizePhone(tenant.pic_whatsapp || tenant.whatsapp || tenant.phone);
    if (!recipient) {
      await admin.from("billing_notification_logs").insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "WHATSAPP",
        recipient: "-",
        subject: "Invoice Paid Verified",
        message: "Nomor WhatsApp tenant tidak tersedia.",
        status: "FAILED",
        error_message: "TENANT_WHATSAPP_EMPTY",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
        },
      });
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Nomor WhatsApp tenant tidak tersedia", trace_id: traceId }, traceId)),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoiceNumber = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
    const paidDate = formatDateId(invoice.paid_at);
    const dueDate = formatDateId(invoice.due_date);
    const amountText = formatCurrencyIdr(invoice.gross_amount);
    const tenantName = tenant.name || "Organisasi";
    const message = [
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

    const { data: logRow, error: logInsertError } = await admin
      .from("billing_notification_logs")
      .insert({
        tenant_id: tenant.id,
        invoice_id: invoice.id,
        notification_type: "WHATSAPP",
        recipient,
        subject: "Invoice Paid Verified",
        message,
        status: "PENDING",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
          recipient_masked: maskPhone(recipient),
        },
      })
      .select("id")
      .single();
    if (logInsertError) throw logInsertError;

    const sendResult = await sendWhatsAppNotification(gateway, recipient, message);
    const status = sendResult.ok ? "SENT" : "FAILED";
    const { error: updateError } = await admin
      .from("billing_notification_logs")
      .update({
        status,
        sent_at: sendResult.ok ? new Date().toISOString() : null,
        error_message: sendResult.ok ? null : sendResult.error || "WA_SEND_FAILED",
        metadata: {
          trace_id: traceId,
          event_key: eventKey,
          trigger: body.trigger || "MANUAL",
          recipient_masked: maskPhone(recipient),
          provider: sendResult.provider || null,
        },
      })
      .eq("id", logRow.id);
    if (updateError) throw updateError;

    if (!sendResult.ok) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: sendResult.error || "Gagal kirim WhatsApp", trace_id: traceId }, traceId)),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(withTrace({ success: true, trace_id: traceId }, traceId)),
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
