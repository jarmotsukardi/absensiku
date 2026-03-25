import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Download, Package, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  HOMEPAGE_PUBLIC_APK_URL,
  HOMEPAGE_PUBLIC_APK_VERSION,
  getPublicApkReleases,
  resolveConfiguredApkRelease,
  type ApkReleaseInfo,
} from "@/lib/apkDownload";
import { PUBLIC_BASE_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";

const formatReleaseDate = (value: string) => {
  const releaseDate = new Date(value);
  if (Number.isNaN(releaseDate.getTime())) return "Tanggal rilis belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(releaseDate);
};

const formatFileSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "Ukuran belum tersedia";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
};

const DownloadApk = () => {
  const seoSettings = usePublicSeoSettings({
    metaTitle: "Download APK AbsensiKu | Aplikasi Android Resmi",
    metaDescription:
      "Unduh APK Android resmi AbsensiKu, cek versi terbaru, ukuran file, dan verifikasi SHA-256 untuk instalasi yang aman.",
    metaKeywords: "download apk absensi, apk absensiku, aplikasi android absensi, absensi gps android",
  });
  const [releases, setReleases] = useState<ApkReleaseInfo[]>(() => getPublicApkReleases());

  useEffect(() => {
    let isMounted = true;

    const fetchConfiguredRelease = async () => {
      try {
        const [apkSettingsRes, globalApkRes, appDownloadRes] = await Promise.all([
          supabase.from("system_settings").select("value").eq("key", "apk_settings").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "global_apk").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "app_download_settings").maybeSingle(),
        ]);

        const configuredRelease = resolveConfiguredApkRelease({
          appDownloadValue: appDownloadRes.data?.value as Record<string, unknown> | null | undefined,
          globalApkValue: globalApkRes.data?.value as Record<string, unknown> | null | undefined,
          apkSettingsValue: apkSettingsRes.data?.value as Record<string, unknown> | null | undefined,
          fallbackUrl: HOMEPAGE_PUBLIC_APK_URL,
          fallbackVersion: HOMEPAGE_PUBLIC_APK_VERSION,
        });

        if (!isMounted) return;
        setReleases(getPublicApkReleases(configuredRelease));
      } catch {
        if (!isMounted) return;
        setReleases(getPublicApkReleases());
      }
    };

    void fetchConfiguredRelease();

    return () => {
      isMounted = false;
    };
  }, []);

  const latestRelease = releases[0] ?? null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Helmet>
        <title>{seoSettings.metaTitle}</title>
        <meta name="description" content={seoSettings.metaDescription} />
        <meta name="keywords" content={seoSettings.metaKeywords} />
        <link rel="canonical" href={`${PUBLIC_BASE_URL}/download`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seoSettings.ogTitle} />
        <meta property="og:description" content={seoSettings.ogDescription} />
        <meta property="og:url" content={`${PUBLIC_BASE_URL}/download`} />
        {seoSettings.ogImage ? <meta property="og:image" content={seoSettings.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoSettings.twitterTitle} />
        <meta name="twitter:description" content={seoSettings.twitterDescription} />
        {seoSettings.ogImage ? <meta name="twitter:image" content={seoSettings.ogImage} /> : null}
      </Helmet>
      <section className="border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Beranda
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-3xl border border-border/70 bg-card/90 p-8 shadow-sm">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                  <Smartphone className="h-4 w-4" />
                  Halaman Download Android
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground lg:text-5xl">
                    Unduh Aplikasi Android AbsensiKu
                  </h1>
                  <p className="text-base leading-7 text-muted-foreground lg:text-lg">
                    Halaman ini menampilkan maksimal 3 versi Android terbaru. Semua label versi ditampilkan dalam format angka agar lebih mudah dibedakan saat Anda mengunduh atau membagikan file instalasi.
                  </p>
                </div>
              </div>

              {latestRelease && (
                <Card className="w-full max-w-sm border-primary/20 bg-primary/5">
                  <CardHeader className="space-y-2">
                    <CardDescription>Versi terbaru</CardDescription>
                    <CardTitle className="text-3xl font-black tracking-tight text-primary">
                      v{latestRelease.version}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl bg-background/80 p-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Siap dipasang di Android</p>
                        <p className="text-sm text-muted-foreground">
                          Rilis {formatReleaseDate(latestRelease.releasedAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SHA-256 tersedia untuk verifikasi file resmi
                        </p>
                        {latestRelease.signingSha256 ? (
                          <p className="text-xs text-muted-foreground">
                            Sertifikat rilis resmi terverifikasi
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Button asChild size="lg" className="w-full gap-2">
                      <a href={latestRelease.url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-5 w-5" />
                        Download v{latestRelease.version}
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {releases.map((release, index) => (
              <Card key={`${release.version}-${release.url}`} className="rounded-3xl border-border/70">
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      <Package className="h-3.5 w-3.5" />
                      #{index + 1}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatReleaseDate(release.releasedAt)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl font-black tracking-tight text-foreground">
                      v{release.version}
                    </CardTitle>
                    <CardDescription>
                      {release.notes ?? "Rilis aplikasi Android AbsensiKu untuk instalasi perangkat."}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    File Android langsung tersedia untuk instalasi manual di perangkat Android.
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                    <p className="font-semibold">Verifikasi file resmi</p>
                    <p className="mt-1 text-xs leading-6 break-all">
                      SHA-256: {release.sha256 ?? "Belum tersedia"}
                    </p>
                    <p className="mt-1 text-xs text-emerald-900/80">
                      Ukuran file: {formatFileSize(release.fileSizeBytes)}
                    </p>
                    <p className="mt-2 text-xs font-medium text-emerald-950">
                      Sertifikat signing:
                    </p>
                    <p className="mt-1 text-xs leading-6 break-all">
                      Subject: {release.signingSubject ?? "Belum tersedia"}
                    </p>
                    <p className="mt-1 text-xs leading-6 break-all">
                      SHA-256 cert: {release.signingSha256 ?? "Belum tersedia"}
                    </p>
                  </div>
                  <Button asChild className="w-full gap-2">
                    <a href={release.url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                      Download v{release.version}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="rounded-3xl border border-dashed border-border/80 bg-background/90 p-6 text-sm leading-7 text-muted-foreground">
            <p>
              Halaman ini menampilkan hingga 3 versi Android terbaru. Jika nanti ada rilis baru, versi terbaru akan naik ke urutan paling atas dan versi lama tetap tersimpan di daftar ini sampai batas 3 entri.
            </p>
            <p className="mt-3">
              Sebelum memasang file, cocokkan versi, ukuran file, dan checksum SHA-256 dengan informasi verifikasi yang tampil di halaman ini.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default DownloadApk;
