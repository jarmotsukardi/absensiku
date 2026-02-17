import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  to: string;
  message?: string;
  provider: string;
  apiKey: string;
  apiUrl?: string;
  senderNumber?: string;
}

type WhatsAppPayload = Record<string, unknown>;

interface ProviderConfig {
  url: string;
  buildPayload: (to: string, message: string, apiKey: string, sender?: string) => WhatsAppPayload;
  headers: (apiKey: string) => Record<string, string>;
}

interface GatewayAuditLogParams {
  traceId: string;
  action: string;
  userId: string | null;
  payload: Record<string, unknown>;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Gagal mengirim pesan WhatsApp";
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const extractUserIdFromAuthHeader = (authorization: string | null): string | null => {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadRaw = atob(parts[1]);
    const payload = JSON.parse(payloadRaw) as { sub?: string };
    if (typeof payload.sub === "string" && isUuid(payload.sub)) return payload.sub;
  } catch {
    // ignore invalid token payload
  }
  return null;
};

const maskPhone = (phone: string): string => {
  const clean = phone.replace(/[^0-9]/g, "");
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}***${clean.slice(-3)}`;
};

const mapWhatsAppErrorHint = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes("unauthorized") || lower.includes("invalid token") || lower.includes("apikey")) {
    return "WA_AUTH_FAILED";
  }
  if (lower.includes("quota") || lower.includes("limit")) {
    return "WA_QUOTA_LIMIT";
  }
  if (lower.includes("target") || lower.includes("phone") || lower.includes("number")) {
    return "WA_PHONE_INVALID";
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("connect")) {
    return "WA_NETWORK_FAILED";
  }
  return "WA_SEND_FAILED";
};

const isProviderDeliveryAccepted = (provider: string, payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return true;
  const body = payload as Record<string, unknown>;

  const toBoolean = (value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (["true", "ok", "success", "sent", "queued", "pending"].includes(lower)) return true;
      if (["false", "failed", "error", "invalid"].includes(lower)) return false;
    }
    return null;
  };

  const fromStatus = toBoolean(body.status);
  if (fromStatus !== null) return fromStatus;

  const fromSuccess = toBoolean(body.success);
  if (fromSuccess !== null) return fromSuccess;

  const fromOk = toBoolean(body.ok);
  if (fromOk !== null) return fromOk;

  // Provider-specific fallback
  if (provider === "fonnte") {
    const reason = typeof body.reason === "string" ? body.reason.toLowerCase() : "";
    if (reason.includes("invalid token") || reason.includes("token")) return false;
  }

  return true;
};

const writeGatewayAuditLog = async ({ traceId, action, userId, payload }: GatewayAuditLogParams) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    await admin.from("audit_logs").insert({
      user_id: userId,
      action,
      table_name: "gateway_test",
      new_values: {
        ...payload,
        trace_id: traceId,
        channel: "whatsapp",
      },
    });
  } catch (logError) {
    logTraceError(traceId, "Failed to persist gateway WhatsApp audit log", logError);
  }
};

// Provider configurations
const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  fonnte: {
    url: "https://api.fonnte.com/send",
    buildPayload: (to, message, apiKey) => ({
      target: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": apiKey,
      "Content-Type": "application/json",
    }),
  },
  wablas: {
    url: "https://pati.wablas.com/api/send-message",
    buildPayload: (to, message, apiKey) => ({
      phone: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": apiKey,
      "Content-Type": "application/json",
    }),
  },
  whacenter: {
    url: "https://app.whacenter.com/api/send",
    buildPayload: (to, message, apiKey, sender) => ({
      device_id: sender,
      number: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
  },
  dripsender: {
    url: "https://api.dripsender.id/send",
    buildPayload: (to, message, apiKey) => ({
      api_key: apiKey,
      phone: to,
      text: message,
    }),
    headers: () => ({
      "Content-Type": "application/json",
    }),
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-test-whatsapp");
  const userId = extractUserIdFromAuthHeader(req.headers.get("authorization"));

  try {
    const { 
      to, 
      message = "Ini adalah pesan percobaan dari AbsensiKu. Jika Anda menerima pesan ini, konfigurasi WhatsApp Gateway berfungsi dengan benar. ✓",
      provider,
      apiKey,
      apiUrl,
      senderNumber 
    }: WhatsAppRequest = await req.json();

    if (!to || !apiKey || !provider) {
      await writeGatewayAuditLog({
        traceId,
        action: "gateway.whatsapp.test.failed",
        userId,
        payload: {
          stage: "validation",
          reason: "MISSING_REQUIRED_FIELDS",
          to: to ? maskPhone(to) : null,
          provider: provider || null,
          has_api_key: Boolean(apiKey),
        },
      });
      return new Response(
        JSON.stringify(withTrace({ error: "Parameter tidak lengkap (to, apiKey, provider diperlukan)" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number (remove non-numeric, ensure starts with country code)
    let normalizedPhone = to.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "62" + normalizedPhone.slice(1);
    }

    let url: string;
    let payload: WhatsAppPayload;
    let headers: Record<string, string>;

    if (provider === "custom" && apiUrl) {
      // Custom API
      url = apiUrl;
      payload = {
        to: normalizedPhone,
        message: message,
      };
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    } else {
      const config = PROVIDER_CONFIGS[provider];
      if (!config) {
        await writeGatewayAuditLog({
          traceId,
          action: "gateway.whatsapp.test.failed",
          userId,
          payload: {
            stage: "validation",
            reason: "UNSUPPORTED_PROVIDER",
            provider,
            to: maskPhone(normalizedPhone),
          },
        });
        return new Response(
          JSON.stringify(withTrace({ error: `Provider '${provider}' tidak didukung` }, traceId)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      url = config.url;
      payload = config.buildPayload(normalizedPhone, message, apiKey, senderNumber);
      headers = config.headers(apiKey);
    }

    console.log(`[${traceId}] Sending WhatsApp via provider=${provider} target=${maskPhone(normalizedPhone)}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    const providerAccepted = isProviderDeliveryAccepted(provider, responseData);

    if (!response.ok || !providerAccepted) {
      logTraceError(traceId, "WhatsApp API error", responseData);
      const rawDetails = typeof responseData === "string"
        ? responseData
        : JSON.stringify(responseData);
      await writeGatewayAuditLog({
        traceId,
        action: "gateway.whatsapp.test.failed",
        userId,
        payload: {
          stage: "provider_response",
          reason: providerAccepted ? mapWhatsAppErrorHint(rawDetails) : "WA_PROVIDER_REJECTED",
          provider,
          to: maskPhone(normalizedPhone),
          status_code: response.status,
          response_snippet: rawDetails.slice(0, 800),
        },
      });
      return new Response(
        JSON.stringify(withTrace({ 
          error: "Gagal mengirim pesan WhatsApp",
          details: responseData,
          error_hint: providerAccepted ? mapWhatsAppErrorHint(rawDetails) : "WA_PROVIDER_REJECTED",
        }, traceId)),
        { status: providerAccepted ? response.status : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await writeGatewayAuditLog({
      traceId,
      action: "gateway.whatsapp.test.success",
      userId,
      payload: {
        stage: "sent",
        provider,
        to: maskPhone(normalizedPhone),
        status_code: response.status,
      },
    });

    return new Response(
      JSON.stringify(withTrace({ 
        success: true, 
        message: `Pesan berhasil dikirim ke ${normalizedPhone}`,
        response: responseData 
      }, traceId)),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Error sending WhatsApp", error);
    const rawError = String(error);
    await writeGatewayAuditLog({
      traceId,
      action: "gateway.whatsapp.test.failed",
      userId,
      payload: {
        stage: "send",
        reason: mapWhatsAppErrorHint(rawError),
        error_message: getErrorMessage(error),
        raw_error: rawError.slice(0, 800),
      },
    });
    return new Response(
      JSON.stringify(withTrace({ 
        error: getErrorMessage(error),
        details: rawError,
        error_hint: mapWhatsAppErrorHint(rawError),
      }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
