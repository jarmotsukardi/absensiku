import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ErrorAlertSettings {
  enableRealtimeAlerts: boolean;
  webhookUrl: string;
  slackWebhookUrl: string;
  whatsappWebhookUrl: string;
  emailWebhookUrl: string;
}

interface AlertTarget {
  channel: "webhook" | "slack" | "whatsapp" | "email";
  url: string;
}

const getEnv = (key: string): string => Deno.env.get(key) || "";

const normalizeAlertSettings = (value: unknown): ErrorAlertSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      enableRealtimeAlerts: false,
      webhookUrl: "",
      slackWebhookUrl: "",
      whatsappWebhookUrl: "",
      emailWebhookUrl: "",
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    enableRealtimeAlerts: Boolean(raw.enable_realtime_alerts),
    webhookUrl: typeof raw.webhook_url === "string" ? raw.webhook_url.trim() : "",
    slackWebhookUrl: typeof raw.slack_webhook_url === "string" ? raw.slack_webhook_url.trim() : "",
    whatsappWebhookUrl: typeof raw.whatsapp_webhook_url === "string" ? raw.whatsapp_webhook_url.trim() : "",
    emailWebhookUrl: typeof raw.email_webhook_url === "string" ? raw.email_webhook_url.trim() : "",
  };
};

const toTargets = (settings: ErrorAlertSettings): AlertTarget[] => {
  const list: AlertTarget[] = [
    { channel: "webhook", url: settings.webhookUrl },
    { channel: "slack", url: settings.slackWebhookUrl },
    { channel: "whatsapp", url: settings.whatsappWebhookUrl },
    { channel: "email", url: settings.emailWebhookUrl },
  ];
  return list.filter((item) => item.url.length > 0);
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
};

const asStringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

const resolvePayload = (rawBody: unknown): Record<string, unknown> => {
  const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
    ? (rawBody as Record<string, unknown>)
    : {};
  const errorPart = body.error && typeof body.error === "object" && !Array.isArray(body.error)
    ? (body.error as Record<string, unknown>)
    : {};

  return {
    event: typeof body.event === "string" ? body.event : "critical_error_log",
    source: typeof body.source === "string" ? body.source : "absensiku.admin.log_errors",
    sent_at: typeof body.sent_at === "string" ? body.sent_at : new Date().toISOString(),
    error: {
      ref: asStringOrNull(errorPart.ref),
      timestamp: asStringOrNull(errorPart.timestamp),
      context: asStringOrNull(errorPart.context),
      message: asStringOrNull(errorPart.message),
      route: asStringOrNull(errorPart.route),
      metadata: errorPart.metadata ?? null,
    },
  };
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const traceId = createTraceId("critical-error-alert-relay");

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify(withTrace({ error: "Supabase environment tidak lengkap" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authorization = req.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "").trim() || "";
    if (!token) {
      return new Response(
        JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify(withTrace({ error: "Token tidak valid" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData, error: roleError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (roleError) {
      throw roleError;
    }
    if (!roleData) {
      return new Response(
        JSON.stringify(withTrace({ error: "Forbidden" }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawBody = await req.json();
    const payload = resolvePayload(rawBody);
    const errorPayload = payload.error as Record<string, unknown>;
    if (!errorPayload.context || !errorPayload.message) {
      return new Response(
        JSON.stringify(withTrace({ error: "Payload error tidak lengkap" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: settingsRow, error: settingsError } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "error_alert_settings")
      .maybeSingle();
    if (settingsError) throw settingsError;

    const settings = normalizeAlertSettings(settingsRow?.value);
    if (!settings.enableRealtimeAlerts) {
      return new Response(
        JSON.stringify(withTrace({ success: true, skipped: true, reason: "alerts_disabled" }, traceId)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const targets = toTargets(settings);
    if (targets.length === 0) {
      return new Response(
        JSON.stringify(withTrace({ success: true, skipped: true, reason: "no_targets" }, traceId)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const response = await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...payload, channel: target.channel }),
        });
        if (!response.ok) {
          throw new Error(`${target.channel}: HTTP ${response.status}`);
        }
      }),
    );

    const failures = results
      .map((result, index) => ({ result, target: targets[index] }))
      .filter((item) => item.result.status === "rejected")
      .map((item) => ({
        channel: item.target.channel,
        url: item.target.url,
        message: toErrorMessage(
          item.result.status === "rejected" ? item.result.reason : "unknown",
        ),
      }));

    const responsePayload = withTrace(
      {
        success: failures.length === 0,
        attempted: targets.length,
        delivered: targets.length - failures.length,
        failed: failures.length,
        failures,
      },
      traceId,
    );

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logTraceError(traceId, "relay failed", error);
    return new Response(
      JSON.stringify(withTrace({ error: toErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
