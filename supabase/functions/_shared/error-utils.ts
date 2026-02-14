export const createTraceId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const withTrace = <T extends Record<string, unknown>>(
  payload: T,
  traceId: string
): T & { trace_id: string } => ({
  ...payload,
  trace_id: traceId,
});

export const logTraceError = (traceId: string, message: string, details?: unknown) => {
  if (typeof details === "undefined") {
    console.error(`[${traceId}] ${message}`);
    return;
  }
  console.error(`[${traceId}] ${message}`, details);
};
