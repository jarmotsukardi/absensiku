export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, listener: (chunk: Buffer) => void) => void;
};

export type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | Buffer): void;
};

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export const readJsonBody = async (req: ApiRequest): Promise<Record<string, unknown>> => {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (!req.on) return {};
  const chunks: Buffer[] = [];
  return await new Promise<Record<string, unknown>>((resolve) => {
    req.on?.("data", (chunk: Buffer) => chunks.push(chunk));
    req.on?.("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
};

export const sendJson = (
  res: ApiResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) => {
  res.statusCode = statusCode;
  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };
  Object.entries(mergedHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
};

export const sendNoContent = (res: ApiResponse) => {
  res.statusCode = 204;
  Object.entries(DEFAULT_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.end();
};

export const getHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  key: string
): string => {
  const value = headers[key.toLowerCase()] ?? headers[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};
