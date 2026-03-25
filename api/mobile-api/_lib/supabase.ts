import { assertEnv, env } from "./env.js";

export type SupabaseResponse = {
  ok: boolean;
  status: number;
  body: string;
  json: unknown;
};

const buildSupabaseUrl = (path: string) => {
  const base = assertEnv(env.supabaseUrl, "SUPABASE_URL").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

export const supabaseAuthRequest = async (
  path: string,
  options: {
    method: string;
    body?: Record<string, unknown> | null;
    accessToken?: string;
    useServiceRole?: boolean;
  }
): Promise<SupabaseResponse> => {
  const apiKey = options.useServiceRole
    ? assertEnv(env.supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY")
    : assertEnv(env.supabaseAnonKey, "SUPABASE_ANON_KEY");

  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${options.accessToken ?? apiKey}`,
    Accept: "application/json",
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildSupabaseUrl(path), {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: raw,
    json: parsed,
  };
};

export const supabaseRestRequest = async (
  path: string,
  options: {
    method: string;
    body?: Record<string, unknown> | null;
    useServiceRole?: boolean;
    headers?: Record<string, string>;
  }
): Promise<SupabaseResponse> => {
  const apiKey = options.useServiceRole
    ? assertEnv(env.supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY")
    : assertEnv(env.supabaseAnonKey, "SUPABASE_ANON_KEY");

  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildSupabaseUrl(path), {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: raw,
    json: parsed,
  };
};
