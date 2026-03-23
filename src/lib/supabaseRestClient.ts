import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";

const REQUEST_TIMEOUT_MS = 15_000;

const createTimeoutController = () => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeoutId };
};

export const ensureSupabaseAccessToken = async () => {
  if (typeof window !== "undefined") {
    const authStorageKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (authStorageKey) {
      try {
        const raw = window.localStorage.getItem(authStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { access_token?: unknown };
          if (typeof parsed.access_token === "string" && parsed.access_token.trim()) {
            return parsed.access_token;
          }
        }
      } catch {
        // Fallback ke auth client jika localStorage tidak valid.
      }
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  return accessToken;
};

export const parseSupabaseRestError = async (response: Response) => {
  const fallbackMessage = `Request Supabase gagal dengan status ${response.status}`;

  try {
    const payload = await response.json();
    if (payload && typeof payload === "object") {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : fallbackMessage;
      const error = new Error(message) as Error & {
        status?: number;
        code?: string;
        details?: unknown;
        hint?: unknown;
      };
      error.status = response.status;
      error.code = typeof payload.code === "string" ? payload.code : undefined;
      error.details = payload.details;
      error.hint = payload.hint;
      return error;
    }
  } catch {
    // Abaikan parse error dan gunakan fallback di bawah.
  }

  const error = new Error(fallbackMessage) as Error & { status?: number };
  error.status = response.status;
  return error;
};

export const buildSupabaseRestUrl = (path: string, params?: Record<string, string>) => {
  const trimmedPath = path.replace(/^\/+/, "");
  if (!params || Object.keys(params).length === 0) {
    return `${supabaseUrl}/rest/v1/${trimmedPath}`;
  }
  const searchParams = new URLSearchParams(params);
  return `${supabaseUrl}/rest/v1/${trimmedPath}?${searchParams.toString()}`;
};

export const fetchSupabaseRest = async <T,>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    params?: Record<string, string>;
    body?: unknown;
    prefer?: string;
  },
): Promise<T> => {
  const accessToken = await ensureSupabaseAccessToken();
  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(buildSupabaseRestUrl(path, options?.params), {
      method: options?.method || "GET",
      signal: controller.signal,
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
        ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options?.prefer ? { Prefer: options.prefer } : {}),
      },
      ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    if (!response.ok) {
      throw await parseSupabaseRestError(response);
    }

    if (response.status === 204) {
      return null as T;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength === "0") {
      return null as T;
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const fetchSupabaseRpc = async <T,>(rpcName: string, payload: Record<string, unknown>): Promise<T> =>
  fetchSupabaseRest<T>(`rpc/${rpcName}`, {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });
