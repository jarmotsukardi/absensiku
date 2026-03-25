import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({
  reportError: vi.fn(),
}));

const localStorageMock = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
});

vi.stubGlobal("localStorage", localStorageMock);

import { isPeakHours, setConfiguredPeakWindows } from "@/lib/attendanceResilience";

describe("attendanceResilience peak hour windows", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mengikuti default peak hour baru saat tidak ada konfigurasi tersimpan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T06:45:00+07:00"));
    expect(isPeakHours()).toBe(true);

    vi.setSystemTime(new Date("2026-03-19T15:30:00+07:00"));
    expect(isPeakHours()).toBe(false);

    vi.setSystemTime(new Date("2026-03-19T16:30:00+07:00"));
    expect(isPeakHours()).toBe(true);
  });

  it("menghormati configured peak windows dari policy skalabilitas", () => {
    setConfiguredPeakWindows([
      { start: "05:00", end: "05:30" },
    ], true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T05:10:00+07:00"));
    expect(isPeakHours()).toBe(true);

    vi.setSystemTime(new Date("2026-03-19T06:45:00+07:00"));
    expect(isPeakHours()).toBe(false);
  });

  it("tetap menghitung jam sibuk berdasarkan Asia/Jakarta saat runtime browser berada di UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T17:42:00Z"));
    expect(isPeakHours()).toBe(false);

    vi.setSystemTime(new Date("2026-03-19T10:15:00Z"));
    expect(isPeakHours()).toBe(true);
  });
});
