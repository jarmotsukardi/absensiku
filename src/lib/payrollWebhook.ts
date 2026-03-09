import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    error?: string;
    trace_id?: string;
    relay_trace_id?: string;
    log_id?: string;
    http_status?: number;
    response_text?: string;
  }>("payroll-webhook-relay", {
    body: {
      tenant_id: input.tenantId,
      payload: input.payload,
      timeout_ms: input.timeoutMs ?? 10000,
    },
  });

  if (error) throw error;
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
