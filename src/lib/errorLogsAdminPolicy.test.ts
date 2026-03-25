import { describe, expect, it } from "vitest";
import {
  normalizeCentralizedPurgeScope,
  resolveCentralizedPurgeErrorMessage,
} from "@/lib/errorLogsAdminPolicy";

describe("errorLogsAdminPolicy", () => {
  it("normalizes purge scope safely", () => {
    expect(normalizeCentralizedPurgeScope("all")).toBe("all");
    expect(normalizeCentralizedPurgeScope("non_critical")).toBe("non_critical");
    expect(normalizeCentralizedPurgeScope("invalid")).toBe("archived_or_resolved");
    expect(normalizeCentralizedPurgeScope(null)).toBe("archived_or_resolved");
  });

  it("maps purge error text to actionable message", () => {
    expect(resolveCentralizedPurgeErrorMessage("forbidden")).toContain("Super Admin");
    expect(resolveCentralizedPurgeErrorMessage("pgrst202 missing rpc")).toContain("RPC purge belum tersedia");
    expect(resolveCentralizedPurgeErrorMessage("invalid_scope")).toContain("Scope purge");
    expect(resolveCentralizedPurgeErrorMessage("invalid_confirmation")).toContain("Ketik tepat");
    expect(resolveCentralizedPurgeErrorMessage("other error")).toBe("Gagal purge log terpusat");
  });
});
