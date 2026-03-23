import { supabase } from "@/integrations/supabase/client";

type PayrollWebhookRelayResponse = {
  success?: boolean;
  error?: string;
  trace_id?: string;
  relay_trace_id?: string;
  log_id?: string;
  http_status?: number;
  response_text?: string;
};

export type PayrollWebhookTestPayload = {
  event: "payroll.webhook.test";
  trace_id: string;
  tenant_id: string;
  sent_at: string;
  source: "absensiku-payroll";
  data: {
    attendance_source: string;
    attendance_records_30d: number;
    payroll_period_count: number;
  };
};

export const generatePayrollWebhookTraceId = () =>
  `PWH-${Date.now().toString(36).toUpperCase()}`;

export function buildPayrollWebhookTestPayload(input: {
  tenantId: string;
  traceId: string;
  attendanceSource: string;
  attendanceRecords30d: number;
  payrollPeriodCount: number;
}): PayrollWebhookTestPayload {
  return {
    event: "payroll.webhook.test",
    trace_id: input.traceId,
    tenant_id: input.tenantId,
    sent_at: new Date().toISOString(),
    source: "absensiku-payroll",
    data: {
      attendance_source: input.attendanceSource,
      attendance_records_30d: input.attendanceRecords30d,
      payroll_period_count: input.payrollPeriodCount,
    },
  };
}

export async function sendPayrollWebhookTest(input: {
  tenantId: string;
  payload: PayrollWebhookTestPayload;
  timeoutMs?: number;
}): Promise<{
  success: boolean;
  error: string | null;
  status: number;
  responseText: string;
  traceId: string;
  logId: string | null;
  relayTraceId: string | null;
}> {
  const { data, error } = await supabase.functions.invoke<PayrollWebhookRelayResponse>("payroll-webhook-relay", {
    body: {
      tenant_id: input.tenantId,
      payload: input.payload,
      timeout_ms: input.timeoutMs ?? 10000,
    },
  });

  if (error) {
    const httpContext = (error as { name?: string; context?: { status?: number; text?: () => Promise<string> } }).context;
    const isHttpError = (error as { name?: string }).name === "FunctionsHttpError";
    if (!isHttpError || !httpContext) {
      return {
        success: false,
        error: error.message || "Gagal menghubungi payroll webhook relay.",
        status: httpContext?.status || 0,
        responseText: "",
        traceId: input.payload.trace_id,
        logId: null,
        relayTraceId: null,
      };
    }

    const rawText = typeof httpContext.text === "function" ? await httpContext.text().catch(() => "") : "";
    let parsed: PayrollWebhookRelayResponse | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as PayrollWebhookRelayResponse;
      } catch {
        parsed = null;
      }
    }

    return {
      success: false,
      error: parsed?.error || rawText || error.message || "Gagal menghubungi payroll webhook relay.",
      status: parsed?.http_status || httpContext.status || 0,
      responseText: parsed?.response_text || rawText || "",
      traceId: parsed?.trace_id || input.payload.trace_id,
      logId: parsed?.log_id || null,
      relayTraceId: parsed?.relay_trace_id || null,
    };
  }

  if (!data) throw new Error("Respons relay webhook kosong.");

  return {
    success: Boolean(data.success),
    error: data.error || null,
    status: data.http_status || 0,
    responseText: data.response_text || "",
    traceId: data.trace_id || input.payload.trace_id,
    logId: data.log_id || null,
    relayTraceId: data.relay_trace_id || null,
  };
}
