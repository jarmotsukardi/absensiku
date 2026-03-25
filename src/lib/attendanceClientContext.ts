import { getAndroidId } from "@/lib/deviceId";

export interface AttendanceClientContext {
  client_mode: "android_webview" | "iphone_safari" | "mobile_browser" | "desktop_browser" | "unknown";
  device_id: string | null;
  app_code: string | null;
  android_version: number | null;
  user_agent: string | null;
}

const getAndroidBridge = (): Record<string, unknown> | null => {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { Android?: Record<string, unknown> }).Android;
  return candidate && typeof candidate === "object" ? candidate : null;
};

const parseAndroidVersionFromUA = (ua: string): number | null => {
  const match = ua.match(/Android\s+(\d+(?:\.\d+)?)/i);
  if (!match?.[1]) return null;
  const version = Number.parseFloat(match[1]);
  return Number.isFinite(version) ? version : null;
};

const callAndroidNumber = (methods: string[]): number | null => {
  const bridge = getAndroidBridge();
  if (!bridge) return null;
  for (const methodName of methods) {
    const method = bridge[methodName];
    if (typeof method !== "function") continue;
    try {
      const result = (method as () => unknown)();
      if (typeof result === "number" && Number.isFinite(result)) return result;
      if (typeof result === "string") {
        const parsed = Number.parseFloat(result);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const detectClientMode = (ua: string): AttendanceClientContext["client_mode"] => {
  const normalizedUa = ua.toLowerCase();
  const isAndroid = /android/i.test(ua);
  const isIphone = /iphone/i.test(ua);
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(normalizedUa);
  const hasSafari = /Safari/i.test(ua);
  const isOtherIosBrowser = /(CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA)/i.test(ua);
  const hasAndroidBridge = Boolean(getAndroidBridge());
  const isAndroidWebView = isAndroid && (/\bwv\b/i.test(ua) || /webview/i.test(ua) || hasAndroidBridge);
  const isIphoneSafari = isIphone && hasSafari && !isOtherIosBrowser;
  const isDesktop = !isMobile && /(windows|macintosh|mac os|linux|cros)/i.test(normalizedUa);

  if (isAndroidWebView) return "android_webview";
  if (isIphoneSafari) return "iphone_safari";
  if (isDesktop) return "desktop_browser";
  if (isMobile) return "mobile_browser";
  return "unknown";
};

const getDeviceId = (): string | null => {
  if (typeof window === "undefined") return null;
  const deviceId = getAndroidId(false);
  return deviceId && deviceId.trim().length > 0 ? deviceId.trim() : null;
};

const getAppCode = (): string | null => {
  if (typeof window === "undefined") return null;
  const bridge = getAndroidBridge();
  if (!bridge || typeof bridge.getAppCode !== "function") return null;
  try {
    const value = (bridge.getAppCode as () => unknown)();
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  } catch {
    return null;
  }
  return null;
};

export const buildAttendanceClientContext = (): AttendanceClientContext => {
  if (typeof navigator === "undefined") {
    return {
      client_mode: "unknown",
      device_id: null,
      app_code: null,
      android_version: null,
      user_agent: null,
    };
  }

  const ua = navigator.userAgent || "";
  return {
    client_mode: detectClientMode(ua),
    device_id: getDeviceId(),
    app_code: getAppCode(),
    android_version:
      callAndroidNumber(["getAndroidVersion", "getSystemAndroidVersion"]) ?? parseAndroidVersionFromUA(ua),
    user_agent: ua || null,
  };
};
