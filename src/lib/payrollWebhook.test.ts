import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import {
  buildPayrollWebhookTestPayload,
  sendPayrollWebhookTest,
} from "@/lib/payrollWebhook";

describe("payrollWebhook", () => {
  const payload = buildPayrollWebhookTestPayload({
    tenantId: "tenant-1",
    traceId: "PWH-TEST-1",
    attendanceSource: "attendance_records",
    attendanceRecords30d: 12,
    payrollPeriodCount: 2,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mengembalikan hasil relay saat fungsi merespons sukses", async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        http_status: 200,
        response_text: "{\"ok\":true}",
        trace_id: "PWH-TRACE-OK",
        relay_trace_id: "relay-trace-ok",
        log_id: "log-ok",
      },
      error: null,
    });

    const result = await sendPayrollWebhookTest({
      tenantId: "tenant-1",
      payload,
    });

    expect(result).toEqual({
      success: true,
      error: null,
      status: 200,
      responseText: "{\"ok\":true}",
      traceId: "PWH-TRACE-OK",
      logId: "log-ok",
      relayTraceId: "relay-trace-ok",
    });
  });

  it("menormalkan FunctionsHttpError menjadi hasil gagal terstruktur", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        name: "FunctionsHttpError",
        message: "Edge Function returned a non-2xx status code",
        context: {
          status: 502,
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              success: false,
              error: "Webhook relay gagal: HTTP_502",
              http_status: 502,
              response_text: "Bad Gateway",
              trace_id: "PWH-TRACE-ERR",
              relay_trace_id: "relay-trace-err",
              log_id: "log-err",
            }),
          ),
        },
      },
    });

    const result = await sendPayrollWebhookTest({
      tenantId: "tenant-1",
      payload,
    });

    expect(result).toEqual({
      success: false,
      error: "Webhook relay gagal: HTTP_502",
      status: 502,
      responseText: "Bad Gateway",
      traceId: "PWH-TRACE-ERR",
      logId: "log-err",
      relayTraceId: "relay-trace-err",
    });
  });

  it("menormalkan invoke error non-HTTP menjadi hasil gagal terstruktur", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        name: "FunctionsFetchError",
        message: "Failed to send a request to the Edge Function",
      },
    });

    const result = await sendPayrollWebhookTest({
      tenantId: "tenant-1",
      payload,
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to send a request to the Edge Function",
      status: 0,
      responseText: "",
      traceId: "PWH-TEST-1",
      logId: null,
      relayTraceId: null,
    });
  });
});
