import { afterEach, describe, expect, it, vi } from "vitest";

const importGuardModule = async () => {
  vi.resetModules();
  return import("./localhostWriteGuard");
};

const stubWindowUrl = (url: string) => {
  const parsed = new URL(url);
  vi.stubGlobal("window", {
    location: {
      hostname: parsed.hostname,
    },
  });
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("localhostWriteGuard", () => {
  it("blocks REST table mutations on localhost when using production project", async () => {
    stubWindowUrl("http://127.0.0.1:5173/");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://zrhgqpjbeyzwpgywelcr.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");

    const { shouldBlockSupabaseMutationRequest } = await importGuardModule();

    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/rest/v1/employees",
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/rest/v1/employees?select=*",
        { method: "GET" },
      ),
    ).toBe(false);
  });

  it("blocks likely mutating RPC calls but keeps read-only RPC calls allowed", async () => {
    stubWindowUrl("http://localhost:5173/");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://zrhgqpjbeyzwpgywelcr.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");

    const { shouldBlockSupabaseMutationRequest } = await importGuardModule();

    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/rest/v1/rpc/process_check_in",
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/rest/v1/rpc/get_monthly_stats",
        { method: "POST" },
      ),
    ).toBe(false);
  });

  it("blocks edge function invocations but keeps auth endpoints allowed", async () => {
    stubWindowUrl("http://localhost:5173/");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://zrhgqpjbeyzwpgywelcr.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");

    const { shouldBlockSupabaseMutationRequest } = await importGuardModule();

    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/functions/v1/batch-attendance",
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      shouldBlockSupabaseMutationRequest(
        "https://zrhgqpjbeyzwpgywelcr.supabase.co/auth/v1/token",
        { method: "POST" },
      ),
    ).toBe(false);
  });
});
