import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, QrCode, CheckCircle2, ShieldCheck, Package } from "lucide-react";
import type { Feature } from "@/hooks/useHomepageData";
import { APK_DOWNLOAD_PAGE_PATH, HOMEPAGE_PUBLIC_APK_URL } from "@/lib/apkDownload";

interface AppDownloadSectionProps {
  features: Feature[];
}

interface AppDownloadSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  apk_url: string;
  playstore_url: string;
  appstore_url: string;
  show_qr_code: boolean;
}

const defaultSettings: AppDownloadSettings = {
  enabled: true,
  title: "Unduh Aplikasi AbsensiKu",
  subtitle: "Tersedia untuk Android",
  description: "Unduh aplikasi mobile AbsensiKu untuk kemudahan absensi di mana saja.",
  apk_url: HOMEPAGE_PUBLIC_APK_URL,
  playstore_url: "",
  appstore_url: "",
  show_qr_code: false,
};

export function AppDownloadSection({ features }: AppDownloadSectionProps) {
  const [settings, setSettings] = useState<AppDownloadSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "app_download_settings")
        .maybeSingle();

      if (data?.value) {
        const nextSettings = { ...defaultSettings, ...(data.value as Partial<AppDownloadSettings>) };
        setSettings(nextSettings);
      }
    } catch (error) {
      console.error("Error fetching app download settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return null;
  if (!settings.enabled) return null;
  const latestApkUrl = settings.apk_url || HOMEPAGE_PUBLIC_APK_URL;

  const featureHighlights = Array.from(
    new Set(
      features
        .map((feature) => feature.title?.trim())
        .filter((title): title is string => Boolean(title))
    )
  ).slice(0, 4);

  return (
    <section id="download" className="py-16 px-4 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Smartphone className="w-4 h-4" />
              Aplikasi Mobile
            </div>
            
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              {settings.title}
            </h2>
            
            <p className="text-lg text-muted-foreground">
              {settings.description}
            </p>

            {/* Features List */}
            {featureHighlights.length > 0 && (
              <ul className="space-y-3">
                {featureHighlights.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Download Buttons */}
            <div className="flex flex-wrap gap-4 pt-4">
              {latestApkUrl && (
                <Button size="lg" asChild className="gap-2">
                  <Link to={APK_DOWNLOAD_PAGE_PATH}>
                    <Download className="w-5 h-5" />
                    Lihat Versi Android
                  </Link>
                </Button>
              )}
              {settings.playstore_url && (
                <Button size="lg" variant="outline" asChild className="gap-2">
                  <a href={settings.playstore_url} target="_blank" rel="noopener noreferrer">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 20.5V3.5a1 1 0 0 1 1.52-.85l14.96 8.5a1 1 0 0 1 0 1.7l-14.96 8.5A1 1 0 0 1 3 20.5z"/>
                    </svg>
                    Google Play
                  </a>
                </Button>
              )}
              {settings.appstore_url && (
                <Button size="lg" variant="outline" asChild className="gap-2">
                  <a href={settings.appstore_url} target="_blank" rel="noopener noreferrer">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    App Store
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Phone Mockup */}
          <div className="relative flex justify-center">
            <Card className="w-64 h-[500px] bg-card border-2 rounded-[3rem] shadow-2xl overflow-hidden">
              <CardContent className="p-0 h-full flex flex-col">
                {/* Phone Notch */}
                <div className="h-8 bg-foreground/5 flex items-center justify-center">
                  <div className="w-20 h-5 bg-foreground/10 rounded-full" />
                </div>
                
                {/* App Content Preview */}
                <div className="flex-1 bg-gradient-to-b from-primary/20 to-primary/5 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg">
                    <Smartphone className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <h3 className="font-bold text-xl text-foreground mb-2">AbsensiKu</h3>
                  <p className="text-sm text-muted-foreground">Absensi GPS Terpercaya</p>

                  <div className="mt-6 w-full max-w-[220px] rounded-2xl bg-white/95 p-4 shadow-inner backdrop-blur">
                    <div className="flex items-start gap-3 text-left">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">Aplikasi Android</p>
                        <p className="text-xs text-muted-foreground">Instal langsung aplikasi AbsensiKu</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-left">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="text-[11px] font-medium text-emerald-700">
                        Siap diunduh untuk perangkat Android
                      </span>
                    </div>

                    {latestApkUrl && (
                      <Button size="sm" asChild className="mt-3 w-full gap-2">
                        <Link to={APK_DOWNLOAD_PAGE_PATH}>
                          <Download className="h-4 w-4" />
                          Lihat Halaman Download
                        </Link>
                      </Button>
                    )}

                    {settings.show_qr_code && (
                      <div className="mt-4 rounded-xl border border-border/70 bg-background px-4 py-3">
                        <QrCode className="mx-auto h-16 w-16 text-foreground" />
                        <p className="mt-2 text-center text-[11px] text-muted-foreground">
                          Scan untuk unduh aplikasi
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Phone Home Bar */}
                <div className="h-8 bg-foreground/5 flex items-center justify-center">
                  <div className="w-24 h-1 bg-foreground/20 rounded-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
