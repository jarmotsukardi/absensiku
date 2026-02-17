import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SecuritySettings {
  block_desktop_browser: boolean;
  require_realtime_location: boolean;
  block_all_browsers: boolean;
  allow_iphone_safari: boolean;
  enable_device_binding: boolean;
  max_device_reset_count: number;
  require_password_change_for_reset: boolean;
  min_android_version?: number;
}

interface SecurityCheckResult {
  isBlocked: boolean;
  reason: string | null;
  isDesktop: boolean;
  isMobile: boolean;
  isAndroidApp: boolean;
  isBrowserBlocked: boolean;
  userAgent: string;
}

interface LocationSecurityValidationResult {
  allowed: boolean;
  reason: string | null;
}

// Deteksi apakah diakses dari browser desktop
const isDesktopBrowser = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  
  // Deteksi desktop OS
  const isWindows = ua.includes("windows");
  const isMac = ua.includes("macintosh") || ua.includes("mac os");
  const isLinux = ua.includes("linux") && !ua.includes("android");
  const isChromeOS = ua.includes("cros");
  
  // Deteksi mobile
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  
  // Jika ada indicator mobile, bukan desktop
  if (isMobile) return false;
  
  // Jika ada indicator desktop OS
  return isWindows || isMac || isLinux || isChromeOS;
};

// Deteksi apakah diakses dari Android App (WebView)
const isAndroidWebView = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  // Android WebView biasanya memiliki "wv" di user agent atau custom header
  const hasAndroidBridge = Boolean(getAndroidBridge());
  return ua.includes("android") && (ua.includes("wv") || ua.includes("webview") || hasAndroidBridge);
};

// Deteksi Safari murni di iPhone (bukan Chrome/Firefox/Edge iOS)
const isIPhoneSafari = (): boolean => {
  const ua = navigator.userAgent;
  const isIphone = /iPhone/i.test(ua);
  const hasSafari = /Safari/i.test(ua);
  const isOtherIosBrowser = /(CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA)/i.test(ua);
  return isIphone && hasSafari && !isOtherIosBrowser;
};

// Deteksi apakah mobile browser
const isMobileBrowser = (): boolean => {
  const ua = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
};

const getAndroidBridge = (): Record<string, unknown> | null => {
  const candidate = (window as Window & { Android?: Record<string, unknown> }).Android;
  return candidate && typeof candidate === "object" ? candidate : null;
};

const callAndroidNumber = (methods: string[]): number | null => {
  const bridge = getAndroidBridge();
  if (!bridge) return null;
  for (const methodName of methods) {
    const method = bridge[methodName];
    if (typeof method === "function") {
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
  }
  return null;
};

const parseAndroidVersionFromUA = (): number | null => {
  const match = navigator.userAgent.match(/Android\s+(\d+(?:\.\d+)?)/i);
  if (!match?.[1]) return null;
  const version = Number.parseFloat(match[1]);
  return Number.isFinite(version) ? version : null;
};

export function useSecurityCheck(tenantId?: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [settingsFetchFailed, setSettingsFetchFailed] = useState(false);
  const [securityResult, setSecurityResult] = useState<SecurityCheckResult>({
    isBlocked: false,
    reason: null,
    isDesktop: false,
    isMobile: false,
    isAndroidApp: false,
    isBrowserBlocked: false,
    userAgent: "",
  });

  const validateLocationSecurity = useCallback(
    (position: GeolocationPosition): LocationSecurityValidationResult => {
      if (!settings) return { allowed: true, reason: null };

      if (settings.require_realtime_location) {
        const locationAgeMs = Date.now() - position.timestamp;
        if (locationAgeMs > 60_000) {
          return {
            allowed: false,
            reason: "Lokasi tidak realtime. Aktifkan GPS dan ulangi absensi.",
          };
        }
      }

      return { allowed: true, reason: null };
    },
    [settings]
  );

  const fetchSettings = useCallback(async () => {
    const defaults: SecuritySettings = {
      block_desktop_browser: false,
      require_realtime_location: true,
      block_all_browsers: false,
      allow_iphone_safari: true,
      enable_device_binding: true,
      max_device_reset_count: 3,
      require_password_change_for_reset: true,
      min_android_version: 7,
    };

    try {
      setSettingsFetchFailed(false);
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "attendance_security")
        .maybeSingle();

      if (error) throw error;

      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const saved = data.value as Record<string, unknown>;
        setSettings({
          ...defaults,
          block_desktop_browser: typeof saved.block_desktop_browser === "boolean" ? saved.block_desktop_browser : defaults.block_desktop_browser,
          require_realtime_location: typeof saved.require_realtime_location === "boolean" ? saved.require_realtime_location : defaults.require_realtime_location,
          block_all_browsers: typeof saved.block_all_browsers === "boolean" ? saved.block_all_browsers : defaults.block_all_browsers,
          allow_iphone_safari: typeof saved.allow_iphone_safari === "boolean" ? saved.allow_iphone_safari : defaults.allow_iphone_safari,
          enable_device_binding: typeof saved.enable_device_binding === "boolean" ? saved.enable_device_binding : defaults.enable_device_binding,
          max_device_reset_count: typeof saved.max_device_reset_count === "number" ? saved.max_device_reset_count : defaults.max_device_reset_count,
          require_password_change_for_reset: typeof saved.require_password_change_for_reset === "boolean" ? saved.require_password_change_for_reset : defaults.require_password_change_for_reset,
          min_android_version: typeof saved.min_android_version === "number" ? saved.min_android_version : defaults.min_android_version,
        });
      } else {
        setSettings(defaults);
      }
    } catch (error) {
      console.error("Error fetching security settings:", error);
      setSettingsFetchFailed(true);
      setSettings(defaults);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Lakukan pengecekan keamanan
  useEffect(() => {
    if (isLoading || !settings) return;

    // Jika konfigurasi gagal dimuat, jangan blokir login untuk menghindari false positive.
    if (settingsFetchFailed) {
      setSecurityResult({
        isBlocked: false,
        reason: null,
        isDesktop: isDesktopBrowser(),
        isMobile: isMobileBrowser(),
        isAndroidApp: isAndroidWebView(),
        isBrowserBlocked: false,
        userAgent: navigator.userAgent,
      });
      return;
    }

    const ua = navigator.userAgent;
    const isDesktop = isDesktopBrowser();
    const isMobile = isMobileBrowser();
    const isAndroidApp = isAndroidWebView();
    const isIphoneSafari = isIPhoneSafari();

    let isBlocked = false;
    let reason: string | null = null;
    let isBrowserBlocked = false;

    // Cek apakah block semua browser diaktifkan
    if (
      settings.block_all_browsers &&
      !isAndroidApp &&
      !(settings.allow_iphone_safari && isIphoneSafari)
    ) {
      isBlocked = true;
      isBrowserBlocked = true;
      reason = "Absensi hanya diizinkan melalui WebView aplikasi internal atau Safari iPhone.";
    }
    // Cek apakah block desktop browser diaktifkan
    else if (settings.block_desktop_browser && isDesktop) {
      isBlocked = true;
      reason = "Absensi tidak dapat dilakukan via browser Desktop. Gunakan aplikasi mobile internal di perangkat Android.";
    }
    // Blokir jika versi Android di bawah minimum
    else if (isAndroidApp && typeof settings.min_android_version === "number") {
      const androidVersion =
        callAndroidNumber(["getAndroidVersion", "getSystemAndroidVersion"]) ??
        parseAndroidVersionFromUA();
      if (androidVersion !== null && androidVersion < settings.min_android_version) {
        isBlocked = true;
        reason = `Versi Android minimal ${settings.min_android_version}. Perangkat Anda belum memenuhi syarat.`;
      }
    }
    setSecurityResult({
      isBlocked,
      reason,
      isDesktop,
      isMobile,
      isAndroidApp,
      isBrowserBlocked,
      userAgent: ua,
    });
  }, [isLoading, settings, settingsFetchFailed]);

  return {
    isLoading,
    settings,
    settingsFetchFailed,
    securityResult,
    validateLocationSecurity,
    refetch: fetchSettings,
  };
}
