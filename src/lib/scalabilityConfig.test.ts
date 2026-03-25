import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({
  reportError: vi.fn(),
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
});

import {
  getScalabilityPeakHourLabel,
  getDeferredAttendanceSyncDelayMs,
  getProfile,
  loadAttendanceScalabilitySetting,
  normalizeAttendanceScalabilitySetting,
  saveAttendanceScalabilitySetting,
  shouldUseDeferredAttendanceSync,
} from "@/lib/scalabilityConfig";

describe("scalabilityConfig attendance sync policy", () => {
  it("menyimpan dan memuat cache attendance_scalability v2 secara lokal", () => {
    const setting = normalizeAttendanceScalabilitySetting({
      effective_tier: "enterprise",
      offpeak_release_strategy: "worker_only",
      queue_only_ingest: true,
    });

    saveAttendanceScalabilitySetting(setting);

    expect(loadAttendanceScalabilitySetting()).toMatchObject({
      effective_tier: "enterprise",
      offpeak_release_strategy: "worker_only",
      queue_only_ingest: true,
    });
  });

  it("mempertahankan tier small sebagai immediate di luar jam sibuk", () => {
    const profile = getProfile("small");

    expect(shouldUseDeferredAttendanceSync(profile, false)).toBe(false);
    expect(getDeferredAttendanceSyncDelayMs(profile, false)).toBe(0);
  });

  it("memaksa tier small menjadi deferred saat jam sibuk", () => {
    const profile = getProfile("small");

    expect(shouldUseDeferredAttendanceSync(profile, true)).toBe(true);
    expect(getDeferredAttendanceSyncDelayMs(profile, true)).toBe(5000);
  });

  it("menjaga tier deferred tetap deferred baik di jam sibuk maupun tidak", () => {
    const profile = getProfile("medium");

    expect(shouldUseDeferredAttendanceSync(profile, false)).toBe(true);
    expect(shouldUseDeferredAttendanceSync(profile, true)).toBe(true);
    expect(getDeferredAttendanceSyncDelayMs(profile, false)).toBe(profile.deferredSyncDelayMs);
    expect(getDeferredAttendanceSyncDelayMs(profile, true)).toBe(profile.deferredSyncDelayMs);
  });

  it("membatasi delay peak hour tier small tetap pendek dan stabil", () => {
    const profile = getProfile("small");

    const delay = getDeferredAttendanceSyncDelayMs(profile, true);

    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(15000);
  });

  it("menormalkan object attendance_scalability lama ke schema baru yang aman", () => {
    const setting = normalizeAttendanceScalabilitySetting({
      tier: "large",
      effective_tier: "large",
    });

    expect(setting.version).toBe(2);
    expect(setting.mode).toBe("manual");
    expect(setting.effective_tier).toBe("large");
    expect(setting.peak_hour_enabled).toBe(true);
    expect(setting.peak_hour_windows).toHaveLength(2);
    expect(setting.peak_hour_hold_sync).toBe(true);
  });

  it("membuat label jam sibuk operasional yang konsisten", () => {
    const setting = normalizeAttendanceScalabilitySetting({});

    expect(getScalabilityPeakHourLabel(setting.peak_hour_windows)).toBe("06:30-09:00, 16:00-18:30");
  });
});
