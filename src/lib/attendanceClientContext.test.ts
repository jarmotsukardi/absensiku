import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAttendanceClientContext } from "@/lib/attendanceClientContext";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attendanceClientContext", () => {
  it("mengambil app_code dari bridge Android bila tersedia", () => {
    vi.stubGlobal("window", {
      Android: {
        getAndroidId: () => "AND-123",
        getAndroidVersion: () => 35,
        getAppCode: () => "AKN1",
      },
      localStorage: {
        getItem: () => null,
      },
    });
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 wv",
    });

    const result = buildAttendanceClientContext();

    expect(result.client_mode).toBe("android_webview");
    expect(result.device_id).toBe("AND-123");
    expect(result.android_version).toBe(35);
    expect(result.app_code).toBe("AKN1");
  });

  it("mengembalikan app_code null untuk browser biasa", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "WEB-123",
      },
    });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    });

    const result = buildAttendanceClientContext();

    expect(result.client_mode).toBe("desktop_browser");
    expect(result.device_id).toBe("WEB-123");
    expect(result.app_code).toBeNull();
  });
});
