import { afterEach, describe, expect, it, vi } from "vitest";

const importRuntimeEnvironment = async () => {
  vi.resetModules();
  return import("./runtimeEnvironment");
};

const setWindowUrl = (url: string) => {
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
  setWindowUrl("http://localhost/");
});

describe("runtimeEnvironment", () => {
  it("parses supabase project ref from url", async () => {
    const { parseSupabaseProjectRef } = await importRuntimeEnvironment();
    expect(parseSupabaseProjectRef("https://demo123.supabase.co")).toBe("demo123");
    expect(parseSupabaseProjectRef("https://example.com")).toBeNull();
  });

  it("blocks localhost writes when current project ref matches production ref", async () => {
    setWindowUrl("http://127.0.0.1:5173/");
    vi.stubEnv("VITE_SUPABASE_URL", "https://zrhgqpjbeyzwpgywelcr.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "false");

    const { shouldBlockLocalProductionWrites, buildLocalProductionWriteBlockMessage } = await importRuntimeEnvironment();

    expect(shouldBlockLocalProductionWrites()).toBe(true);
    expect(buildLocalProductionWriteBlockMessage("Absen masuk")).toContain("localhost");
  });

  it("does not block localhost when override is explicitly enabled", async () => {
    setWindowUrl("http://localhost:5173/");
    vi.stubEnv("VITE_SUPABASE_URL", "https://zrhgqpjbeyzwpgywelcr.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "true");

    const { shouldBlockLocalProductionWrites } = await importRuntimeEnvironment();

    expect(shouldBlockLocalProductionWrites()).toBe(false);
  });

  it("does not block when localhost uses non-production project ref", async () => {
    setWindowUrl("http://localhost:5173/");
    vi.stubEnv("VITE_SUPABASE_URL", "https://staging123.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "staging123");
    vi.stubEnv("VITE_PRODUCTION_SUPABASE_PROJECT_REF", "zrhgqpjbeyzwpgywelcr");
    vi.stubEnv("VITE_ALLOW_LOCALHOST_PROD_WRITE", "false");

    const { shouldBlockLocalProductionWrites, getRuntimeAppEnvironment } = await importRuntimeEnvironment();

    expect(shouldBlockLocalProductionWrites()).toBe(false);
    expect(getRuntimeAppEnvironment()).toBe("development");
  });
});
