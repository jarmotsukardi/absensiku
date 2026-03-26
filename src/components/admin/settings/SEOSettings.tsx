import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, ExternalLink, Loader2, Save, Search } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { PUBLIC_BASE_URL } from "@/hooks/usePublicSeoSettings";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

const GOOGLE_SEARCH_CONSOLE_SITEMAPS_URL = "https://search.google.com/search-console/sitemaps";
const GOOGLE_SEARCH_CONSOLE_URL = "https://search.google.com/search-console";
const GOOGLE_SITE_VERIFICATION_FILENAME = "google0d02fdc9d62fc376.html";
const GOOGLE_SITE_VERIFICATION_CONTENT = "google-site-verification: google0d02fdc9d62fc376.html";
const GOOGLE_SITE_VERIFICATION_URL = `${PUBLIC_BASE_URL}/${GOOGLE_SITE_VERIFICATION_FILENAME}`;
const SITEMAP_URL = `${PUBLIC_BASE_URL}/sitemap.xml`;

export function SEOSettings() {
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("seo_settings");
  const [settings, setSettings] = useState({
    metaTitle: "AbsensiKu - Sistem Absensi GPS #1 Indonesia",
    metaDescription: "Aplikasi absensi pegawai berbasis GPS untuk pemerintah daerah, instansi pemerintah, perusahaan, dan sekolah. Akurat, aman, dan mudah digunakan.",
    metaKeywords: "absensi, gps, pegawai, pemerintah, perusahaan, sekolah, kehadiran",
    ogTitle: "AbsensiKu - Sistem Absensi GPS Terpercaya",
    ogDescription: "Kelola kehadiran pegawai dengan akurat menggunakan teknologi GPS.",
    ogImage: "",
    twitterTitle: "AbsensiKu - Sistem Absensi GPS #1",
    twitterDescription: "Aplikasi absensi pegawai berbasis GPS untuk semua jenis organisasi.",
    googleAnalyticsId: "",
    googleTagManagerId: "",
    facebookPixelId: "",
  });

  useEffect(() => {
    if (setting) {
      setSettings((prev) => ({ ...prev, ...(setting as Record<string, string>) }));
    }
  }, [setting]);

  const handleChange = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  // Image upload removed - using URL input instead

  const handleSave = async () => {
    await saveSetting("seo_settings", settings, "Pengaturan SEO & Analytics");
  };

  const handleCopySitemapUrl = async () => {
    try {
      await navigator.clipboard.writeText(SITEMAP_URL);
      toast.success("URL sitemap disalin ke clipboard.");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.copy_sitemap_url", {
        sitemap_url: SITEMAP_URL,
      });
      toast.error(appendErrorReference("Gagal menyalin URL sitemap.", errorRef));
    }
  };

  const handleSubmitSitemap = async () => {
    let copyErrorRef: string | null = null;

    try {
      await navigator.clipboard.writeText(SITEMAP_URL);
    } catch (error) {
      copyErrorRef = reportError(error, "admin.settings.seo.copy_sitemap_for_submit", {
        sitemap_url: SITEMAP_URL,
      });
    }

    try {
      const popup = window.open(GOOGLE_SEARCH_CONSOLE_SITEMAPS_URL, "_blank", "noopener,noreferrer");
      if (!popup) {
        throw new Error("Popup Search Console diblokir browser.");
      }

      if (copyErrorRef) {
        toast.warning(
          appendErrorReference(
            "Search Console dibuka, tetapi URL sitemap gagal disalin. Gunakan kolom sitemap di bawah untuk tempel manual.",
            copyErrorRef,
          ),
        );
        return;
      }

      toast.success("Search Console dibuka. URL sitemap sudah disalin, lalu tempel dan klik Submit.");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.open_sitemaps_report", {
        sitemap_url: SITEMAP_URL,
        search_console_url: GOOGLE_SEARCH_CONSOLE_SITEMAPS_URL,
      });
      toast.error(appendErrorReference("Gagal membuka Search Console untuk submit sitemap.", errorRef));
    }
  };

  const handleCopyGoogleVerificationUrl = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_SITE_VERIFICATION_URL);
      toast.success("URL file verifikasi Google disalin ke clipboard.");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.copy_google_verification_url", {
        verification_url: GOOGLE_SITE_VERIFICATION_URL,
      });
      toast.error(appendErrorReference("Gagal menyalin URL file verifikasi Google.", errorRef));
    }
  };

  const handleCopyGoogleVerificationContent = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_SITE_VERIFICATION_CONTENT);
      toast.success("Isi file verifikasi Google disalin ke clipboard.");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.copy_google_verification_content", {
        verification_filename: GOOGLE_SITE_VERIFICATION_FILENAME,
      });
      toast.error(appendErrorReference("Gagal menyalin isi file verifikasi Google.", errorRef));
    }
  };

  const handleOpenGoogleVerificationFile = () => {
    try {
      const popup = window.open(GOOGLE_SITE_VERIFICATION_URL, "_blank", "noopener,noreferrer");
      if (!popup) {
        throw new Error("Popup file verifikasi Google diblokir browser.");
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.open_google_verification_file", {
        verification_url: GOOGLE_SITE_VERIFICATION_URL,
      });
      toast.error(appendErrorReference("Gagal membuka file verifikasi Google.", errorRef));
    }
  };

  const handleOpenGoogleSearchConsole = () => {
    try {
      const popup = window.open(GOOGLE_SEARCH_CONSOLE_URL, "_blank", "noopener,noreferrer");
      if (!popup) {
        throw new Error("Popup Google Search Console diblokir browser.");
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.seo.open_google_search_console", {
        search_console_url: GOOGLE_SEARCH_CONSOLE_URL,
      });
      toast.error(appendErrorReference("Gagal membuka Google Search Console.", errorRef));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          Pengaturan SEO
        </h3>
        <p className="text-sm text-muted-foreground">
          Optimasi mesin pencari dan meta tags
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta Tags Umum</CardTitle>
            <CardDescription>Informasi dasar untuk mesin pencari</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metaTitle">Meta Title</Label>
              <Input
                id="metaTitle"
                value={settings.metaTitle}
                onChange={(e) => handleChange("metaTitle", e.target.value)}
                placeholder="Judul halaman"
              />
              <p className="text-xs text-muted-foreground">
                {settings.metaTitle.length}/60 karakter (rekomendasi)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaDescription">Meta Description</Label>
              <Textarea
                id="metaDescription"
                value={settings.metaDescription}
                onChange={(e) => handleChange("metaDescription", e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {settings.metaDescription.length}/160 karakter (rekomendasi)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaKeywords">Meta Keywords</Label>
              <Input
                id="metaKeywords"
                value={settings.metaKeywords}
                onChange={(e) => handleChange("metaKeywords", e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pratinjau Facebook</CardTitle>
            <CardDescription>Tampilan saat dibagikan di Facebook</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ogTitle">Judul OG</Label>
              <Input
                id="ogTitle"
                value={settings.ogTitle}
                onChange={(e) => handleChange("ogTitle", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ogDescription">Deskripsi OG</Label>
              <Textarea
                id="ogDescription"
                value={settings.ogDescription}
                onChange={(e) => handleChange("ogDescription", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>URL Gambar OG</Label>
              <Input
                placeholder="https://example.com/og-image.jpg (1200x630)"
                value={settings.ogImage || ""}
                onChange={(e) => handleChange("ogImage", e.target.value)}
              />
              {settings.ogImage && (
                <div className="h-20 w-36 rounded-lg bg-muted overflow-hidden">
                  <img src={settings.ogImage} alt="Gambar OG" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Twitter Card</CardTitle>
            <CardDescription>Tampilan saat dibagikan di Twitter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="twitterTitle">Twitter Title</Label>
              <Input
                id="twitterTitle"
                value={settings.twitterTitle}
                onChange={(e) => handleChange("twitterTitle", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitterDescription">Twitter Description</Label>
              <Textarea
                id="twitterDescription"
                value={settings.twitterDescription}
                onChange={(e) => handleChange("twitterDescription", e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analytics & Tracking</CardTitle>
            <CardDescription>Integrasi dengan layanan analytics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="googleAnalyticsId">Google Analytics ID</Label>
              <Input
                id="googleAnalyticsId"
                value={settings.googleAnalyticsId}
                onChange={(e) => handleChange("googleAnalyticsId", e.target.value)}
                placeholder="G-XXXXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="googleTagManagerId">Google Tag Manager ID</Label>
              <Input
                id="googleTagManagerId"
                value={settings.googleTagManagerId}
                onChange={(e) => handleChange("googleTagManagerId", e.target.value)}
                placeholder="GTM-XXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebookPixelId">Facebook Pixel ID</Label>
              <Input
                id="facebookPixelId"
                value={settings.facebookPixelId}
                onChange={(e) => handleChange("facebookPixelId", e.target.value)}
                placeholder="XXXXXXXXXXXXXXXX"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sitemap</CardTitle>
            <CardDescription>
              Submit sitemap dilakukan lewat Google Search Console. Tombol di bawah membuka laporan sitemap
              resmi Google dan menyalin URL sitemap agar bisa langsung ditempel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sitemapUrl">URL Sitemap Aktif</Label>
              <Input
                id="sitemapUrl"
                value={SITEMAP_URL}
                readOnly
                aria-readonly="true"
              />
              <p className="text-xs text-muted-foreground">
                Pastikan `robots.txt` tetap mereferensikan URL ini dan sitemap terbaru sudah ikut saat build/deploy.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={handleCopySitemapUrl}>
                <Copy className="mr-2 h-4 w-4" />
                Salin URL Sitemap
              </Button>
              <Button type="button" onClick={handleSubmitSitemap}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Submit Sitemap
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verifikasi Google Search Console</CardTitle>
            <CardDescription>
              File verifikasi HTML sudah disediakan di root domain. Gunakan kartu ini untuk membuka, menyalin,
              dan mengecek URL file saat setup property di Google Search Console.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="googleVerificationFilename">Nama File Verifikasi</Label>
              <Input
                id="googleVerificationFilename"
                value={GOOGLE_SITE_VERIFICATION_FILENAME}
                readOnly
                aria-readonly="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="googleVerificationUrl">URL File Verifikasi</Label>
              <Input
                id="googleVerificationUrl"
                value={GOOGLE_SITE_VERIFICATION_URL}
                readOnly
                aria-readonly="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="googleVerificationContent">Isi File Verifikasi</Label>
              <Input
                id="googleVerificationContent"
                value={GOOGLE_SITE_VERIFICATION_CONTENT}
                readOnly
                aria-readonly="true"
              />
              <p className="text-xs text-muted-foreground">
                File ini harus dapat diakses publik dengan isi persis sama seperti di atas agar verifikasi Search
                Console metode `HTML file` berhasil.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={handleCopyGoogleVerificationUrl}>
                <Copy className="mr-2 h-4 w-4" />
                Salin URL File
              </Button>
              <Button type="button" variant="outline" onClick={handleCopyGoogleVerificationContent}>
                <Copy className="mr-2 h-4 w-4" />
                Salin Isi File
              </Button>
              <Button type="button" variant="outline" onClick={handleOpenGoogleVerificationFile}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka File Verifikasi
              </Button>
              <Button type="button" onClick={handleOpenGoogleSearchConsole}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka Search Console
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
