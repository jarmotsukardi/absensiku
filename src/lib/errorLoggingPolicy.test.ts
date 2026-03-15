import { describe, expect, it } from "vitest";
import {
  createDefaultRemoteErrorLoggingPolicy,
  normalizeRemoteErrorLoggingPolicy,
  resolveEffectiveRemoteErrorLoggingMode,
  serializeRemoteErrorLoggingPolicy,
} from "@/lib/errorLoggingPolicy";

describe("errorLoggingPolicy", () => {
  it("normalizes legacy string mode", () => {
    const policy = normalizeRemoteErrorLoggingPolicy("critical_only");
    expect(policy.mode).toBe("critical_only");
    expect(policy.schedule.enabled).toBe(false);
  });

  it("normalizes schedule object with snake_case keys", () => {
    const policy = normalizeRemoteErrorLoggingPolicy({
      mode: "full",
      schedule: {
        enabled: true,
        timezone: "Asia/Jakarta",
        business_start: "08:30",
        business_end: "17:30",
        business_mode: "critical_only",
        off_hours_mode: "paused",
      },
    });

    expect(policy.mode).toBe("full");
    expect(policy.schedule.enabled).toBe(true);
    expect(policy.schedule.businessStart).toBe("08:30");
    expect(policy.schedule.businessEnd).toBe("17:30");
    expect(policy.schedule.businessMode).toBe("critical_only");
    expect(policy.schedule.offHoursMode).toBe("paused");
  });

  it("resolves effective mode based on business schedule", () => {
    const policy = normalizeRemoteErrorLoggingPolicy({
      mode: "full",
      schedule: {
        enabled: true,
        timezone: "Asia/Jakarta",
        business_start: "08:00",
        business_end: "17:00",
        business_mode: "critical_only",
        off_hours_mode: "paused",
      },
    });

    const inBusiness = resolveEffectiveRemoteErrorLoggingMode(policy, new Date("2026-01-01T02:00:00.000Z"));
    const outOfBusiness = resolveEffectiveRemoteErrorLoggingMode(policy, new Date("2026-01-01T15:00:00.000Z"));
    expect(inBusiness).toBe("critical_only");
    expect(outOfBusiness).toBe("paused");
  });

  it("supports overnight window schedule", () => {
    const policy = normalizeRemoteErrorLoggingPolicy({
      mode: "full",
      schedule: {
        enabled: true,
        timezone: "Asia/Jakarta",
        business_start: "22:00",
        business_end: "06:00",
        business_mode: "critical_only",
        off_hours_mode: "paused",
      },
    });

    const inNightWindow = resolveEffectiveRemoteErrorLoggingMode(policy, new Date("2026-01-01T16:30:00.000Z"));
    const offNightWindow = resolveEffectiveRemoteErrorLoggingMode(policy, new Date("2026-01-01T06:30:00.000Z"));
    expect(inNightWindow).toBe("critical_only");
    expect(offNightWindow).toBe("paused");
  });

  it("serializes policy with schedule keys expected by system_settings", () => {
    const policy = createDefaultRemoteErrorLoggingPolicy("full");
    policy.schedule.enabled = true;
    policy.schedule.businessMode = "critical_only";
    const serialized = serializeRemoteErrorLoggingPolicy(policy) as Record<string, unknown>;
    const schedule = serialized.schedule as Record<string, unknown>;
    expect(serialized.mode).toBe("full");
    expect(schedule.business_mode).toBe("critical_only");
    expect(typeof serialized.updated_at).toBe("string");
  });
});
