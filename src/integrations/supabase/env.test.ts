import { afterEach, describe, expect, it, vi } from "vitest";

const importEnvModule = async () => {
  vi.resetModules();
  return import("./env");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("supabase env normalization", () => {
  it("trims surrounding whitespace and quotes", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", ' "https://example.supabase.co" \n');
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", " 'sb_publishable_test' \n");

    const { supabasePublishableKey, supabaseUrl } = await importEnvModule();

    expect(supabaseUrl).toBe("https://example.supabase.co");
    expect(supabasePublishableKey).toBe("sb_publishable_test");
  });

  it("falls back to NEXT_PUBLIC values when vite vars are empty", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://fallback.supabase.co ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "\nsb_publishable_fallback\n");

    const { supabasePublishableKey, supabaseUrl } = await importEnvModule();

    expect(supabaseUrl).toBe("https://fallback.supabase.co");
    expect(supabasePublishableKey).toBe("sb_publishable_fallback");
  });
});
