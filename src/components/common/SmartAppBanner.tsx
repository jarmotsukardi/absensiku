import { useState, useEffect } from "react";
import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { HOMEPAGE_PUBLIC_APK_URL, resolveApkUrl } from "@/lib/apkDownload";

interface SmartAppBannerProps {
  apkUrl?: string | null;
  appName?: string;
  dismissKey?: string;
}

const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isDismissed(dismissKey: string): boolean {
  const dismissed = localStorage.getItem(dismissKey);
  if (!dismissed) return false;
  const dismissedAt = parseInt(dismissed, 10);
  if (isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DURATION_MS;
}

export function SmartAppBanner({
  apkUrl,
  appName = "AbsensiKu",
  dismissKey = "smart_app_banner_dismissed",
}: SmartAppBannerProps) {
  const [visible, setVisible] = useState(false);
  const [resolvedApkUrl, setResolvedApkUrl] = useState<string | null>(apkUrl ?? HOMEPAGE_PUBLIC_APK_URL);

  useEffect(() => {
    if (apkUrl) {
      setResolvedApkUrl(apkUrl);
      return;
    }

    let isMounted = true;

    const fetchApkUrl = async () => {
      try {
        const [apkSettingsRes, globalApkRes, appDownloadRes] = await Promise.all([
          supabase.from("system_settings").select("value").eq("key", "apk_settings").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "global_apk").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "app_download_settings").maybeSingle(),
        ]);

        const nextUrl = resolveApkUrl({
          appDownloadValue: appDownloadRes.data?.value as Record<string, unknown> | null | undefined,
          globalApkValue: globalApkRes.data?.value as Record<string, unknown> | null | undefined,
          apkSettingsValue: apkSettingsRes.data?.value as Record<string, unknown> | null | undefined,
          fallbackUrl: HOMEPAGE_PUBLIC_APK_URL,
        });

        if (isMounted) {
          setResolvedApkUrl(nextUrl);
        }
      } catch {
        if (isMounted) {
          setResolvedApkUrl(HOMEPAGE_PUBLIC_APK_URL);
        }
      }
    };

    void fetchApkUrl();

    return () => {
      isMounted = false;
    };
  }, [apkUrl]);

  useEffect(() => {
    // Only show on Android mobile devices
    if (!isAndroid() || !isMobileDevice()) return;
    if (isDismissed(dismissKey)) return;
    if (!resolvedApkUrl) return;

    // Show after 3 second delay
    const timer = setTimeout(() => {
      setVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [resolvedApkUrl, dismissKey]);

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, Date.now().toString());
    setVisible(false);
  };

  const handleInstall = () => {
    if (resolvedApkUrl) {
      window.open(resolvedApkUrl, "_blank");
    }
    handleDismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] animate-fade-in">
      <div className="bg-card border-b border-border shadow-lg mx-auto">
        <div className="flex items-center gap-3 p-3 max-w-lg mx-auto">
          {/* App Icon */}
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-md">
            <Smartphone className="w-6 h-6 text-primary-foreground" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{appName}</p>
            <p className="text-xs text-muted-foreground">Instal aplikasi untuk pengalaman terbaik</p>
            <div className="flex items-center gap-1 mt-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg key={star} className="w-3 h-3 text-amber-400 fill-current" viewBox="0 0 20 20">
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
              ))}
              <span className="text-xs text-muted-foreground ml-1">GRATIS</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleInstall}
              className="h-8 px-4 text-xs font-semibold"
            >
              <Download className="w-3 h-3 mr-1" />
              Instal
            </Button>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              aria-label="Tutup"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
