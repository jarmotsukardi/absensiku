import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const createTraceId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const withTrace = <T extends Record<string, unknown>>(
  payload: T,
  traceId: string,
): T & { trace_id: string } => ({
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RelayRequest = {
  tenant_id?: string;
  payload?: Record<string, unknown>;
  timeout_ms?: number;
};

type UserRoleRow = {
  role: string;
  tenant_id: string | null;
};

const ORG_PAYROLL_INTEGRATIONS_SETTING_KEY = "org_payroll_integrations_v1";

const toStringSafe = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toBooleanSafe = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on", "enabled", "active"].includes(normalized);
  }
  return false;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const signPayload = async (secret: string, payloadRaw: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadRaw));
  return toHex(signature);
};

const maskUrlForAudit = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type RelayAttempt = {
  attempt: number;
  status: number;
  ok: boolean;
  duration_ms: number;
  error: string | null;
};

type AlertNotificationPayload = {
  event: "payroll.error.critical";
  tenant_id: string;
  trace_id: string;
  relay_trace_id: string;
  log_id: string;
  route: string;
  context: string;
  status_code: number;
  error_message: string | null;
  action_type: string;
  action_label: string;
  response_excerpt: string;
  occurred_at: string;
};

const postAlert = async (url: string, payload: AlertNotificationPayload): Promise<void> => {
  const targetUrl = toStringSafe(url);
  if (!targetUrl) return;

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), 4500);
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const relayTraceId = createTraceId("payroll-webhook-relay");

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Unauthorized" }, relayTraceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RelayRequest;
    const tenantId = toStringSafe(body.tenant_id);
    if (!tenantId) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "tenant_id diperlukan" }, relayTraceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Konfigurasi server tidak lengkap" }, relayTraceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await authed.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Sesi pengguna tidak valid" }, relayTraceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id)
      .in("role", ["super_admin", "admin_instansi"]);
    if (roleError) throw roleError;

    const roles = (roleRows ?? []) as UserRoleRow[];
    const isSuperAdmin = roles.some((row) => row.role === "super_admin");
    const isTenantAdmin = roles.some((row) => row.role === "admin_instansi" && row.tenant_id === tenantId);
    if (!isSuperAdmin && !isTenantAdmin) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Forbidden" }, relayTraceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: integrationSettingRow, error: integrationSettingError } = await admin
      .from("organization_settings")
      .select("setting_value")
      .eq("tenant_id", tenantId)
      .eq("setting_key", ORG_PAYROLL_INTEGRATIONS_SETTING_KEY)
      .maybeSingle();
    if (integrationSettingError) throw integrationSettingError;

    const rawSetting = integrationSettingRow?.setting_value;
    const root = isJsonObject(rawSetting) ? rawSetting : {};
    const settingValue = isJsonObject(root.settings) ? root.settings : root;
    const webhookRoot = isJsonObject(settingValue.webhook) ? settingValue.webhook : {};
    const errorAlertRoot = isJsonObject(settingValue.errorAlert) ? settingValue.errorAlert : {};

    const webhookEnabled = toBooleanSafe(webhookRoot.enabled);
    if (!webhookEnabled) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Webhook payroll belum aktif di Integrations" }, relayTraceId)),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const endpointUrl = toStringSafe(webhookRoot.endpointUrl);
    const secretKey = toStringSafe(webhookRoot.secretKey);
    if (!endpointUrl || !secretKey) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Endpoint URL/Secret webhook payroll belum lengkap" }, relayTraceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestedPayload = isJsonObject(body.payload) ? body.payload : {};
    const effectiveTraceId = toStringSafe(requestedPayload.trace_id) || createTraceId("payroll-webhook-test");
    const payload = {
      ...requestedPayload,
      trace_id: effectiveTraceId,
      tenant_id: tenantId,
      sent_at: typeof requestedPayload.sent_at === "string" ? requestedPayload.sent_at : new Date().toISOString(),
      source:
        typeof requestedPayload.source === "string"
          ? requestedPayload.source
          : "absensiku-payroll-relay",
    };
    const payloadRaw = JSON.stringify(payload);
    const signature = await signPayload(secretKey, payloadRaw);

    const timeoutMs = Math.max(3000, Math.min(30000, Number(body.timeout_ms) || 10000));
    const maxAttempts = 3;
    const attempts: RelayAttempt[] = [];

    let responseStatus = 0;
    let responseText = "";
    let relayErrorMessage: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStart = Date.now();
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const relayResponse = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payroll-Event": "payroll.webhook.test",
            "X-Payroll-Trace-Id": effectiveTraceId,
            "X-Payroll-Signature": signature,
          },
          body: payloadRaw,
          signal: abortController.signal,
        });
        responseStatus = relayResponse.status;
        responseText = await relayResponse.text();
        relayErrorMessage = null;
        const ok = responseStatus >= 200 && responseStatus < 300;
        attempts.push({
          attempt,
          status: responseStatus,
          ok,
          duration_ms: Date.now() - attemptStart,
          error: ok ? null : `HTTP_${responseStatus}`,
        });
        if (ok) break;
      } catch (relayError) {
        relayErrorMessage = relayError instanceof Error ? relayError.message : "Gagal mengirim webhook";
        responseStatus = 0;
        responseText = relayErrorMessage;
        attempts.push({
          attempt,
          status: 0,
          ok: false,
          duration_ms: Date.now() - attemptStart,
          error: relayErrorMessage,
        });
      } finally {
        clearTimeout(timer);
      }
      if (attempt < maxAttempts) {
        await sleep(250 * 2 ** (attempt - 1));
      }
    }

    const logId = `PWH-LOG-${Date.now().toString(36).toUpperCase()}`;
    const insertAuditPayload = {
      tenant_id: tenantId,
      entity_type: "payroll_webhook",
      entity_id: null,
      action_type:
        relayErrorMessage || responseStatus < 200 || responseStatus >= 300
          ? "webhook_test_failed"
          : "webhook_test_success",
      action_label: "Payroll Webhook Relay Test",
      actor_user_id: user.id,
      actor_role: isSuperAdmin ? "super_admin" : "admin_instansi",
      log_id: logId,
      trace_id: effectiveTraceId,
      before_state: {
        endpoint_url: maskUrlForAudit(endpointUrl),
        timeout_ms: timeoutMs,
        payload_event: payload.event ?? "payroll.webhook.test",
      },
      after_state: {
        relay_trace_id: relayTraceId,
        http_status: responseStatus,
        attempts,
        attempt_count: attempts.length,
        response_excerpt: responseText.slice(0, 1000),
        response_ok: !relayErrorMessage && responseStatus >= 200 && responseStatus < 300,
      },
      notes: relayErrorMessage || (responseStatus >= 200 && responseStatus < 300 ? null : `HTTP_${responseStatus}`),
    };

    const { error: auditError } = await admin.from("payroll_audit_logs").insert(insertAuditPayload);
    if (auditError) {
      logTraceError(relayTraceId, "Gagal menyimpan payroll_audit_logs untuk webhook relay", auditError);
    }

    if (insertAuditPayload.action_type === "webhook_test_failed" && toBooleanSafe(errorAlertRoot.enabled)) {
      const alertPayload: AlertNotificationPayload = {
        event: "payroll.error.critical",
        tenant_id: tenantId,
        trace_id: effectiveTraceId,
        relay_trace_id: relayTraceId,
        log_id: logId,
        route: "/org/payroll/integrations",
        context: "integration.webhook",
        status_code: responseStatus,
        error_message: relayErrorMessage || (responseStatus >= 200 && responseStatus < 300 ? null : `HTTP_${responseStatus}`),
        action_type: insertAuditPayload.action_type,
        action_label: insertAuditPayload.action_label,
        response_excerpt: responseText.slice(0, 1000),
        occurred_at: new Date().toISOString(),
      };

      const alertTargets = [
        toStringSafe(errorAlertRoot.webhookUrl),
        toStringSafe(errorAlertRoot.slackWebhookUrl),
        toStringSafe(errorAlertRoot.whatsappWebhookUrl),
        toStringSafe(errorAlertRoot.emailWebhookUrl),
      ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

      await Promise.all(
        alertTargets.map(async (targetUrl) => {
          try {
            await postAlert(targetUrl, alertPayload);
          } catch (notifyError) {
            logTraceError(
              relayTraceId,
              `Alert realtime payroll gagal dikirim ke ${maskUrlForAudit(targetUrl)}`,
              notifyError,
            );
          }
        }),
      );
    }

    if (relayErrorMessage) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: false,
              error: `Webhook relay gagal: ${relayErrorMessage}`,
              http_status: responseStatus,
              response_text: responseText.slice(0, 1000),
              log_id: logId,
            },
            effectiveTraceId,
          ),
        ),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const success = responseStatus >= 200 && responseStatus < 300;
    return new Response(
      JSON.stringify(
        withTrace(
          {
            success,
            http_status: responseStatus,
            response_text: responseText.slice(0, 1000),
            log_id: logId,
            relay_trace_id: relayTraceId,
          },
          effectiveTraceId,
        ),
      ),
      {
        status: success ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logTraceError(relayTraceId, "Payroll webhook relay error", error);
    return new Response(
      JSON.stringify(withTrace({ success: false, error: "Internal server error" }, relayTraceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
