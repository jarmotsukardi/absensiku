import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Save, Upload, Image, Loader2 } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export function SEOSettings() {
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("seo_settings");
  const [settings, setSettings] = useState({
    metaTitle: "AbsensiKu - Platform Absensi GPS #1 Indonesia",
    metaDescription: "Aplikasi absensi pegawai berbasis GPS untuk pemerintah daerah, instansi pemerintah, perusahaan, dan sekolah. Akurat, aman, dan mudah digunakan.",
    metaKeywords: "absensi, gps, pegawai, pemerintah, perusahaan, sekolah, kehadiran",
    ogTitle: "AbsensiKu - Platform Absensi GPS Terpercaya",
    ogDescription: "Kelola kehadiran pegawai dengan akurat menggunakan teknologi GPS.",
    ogImage: "",
    twitterTitle: "AbsensiKu - Platform Absensi GPS #1",
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
            <CardTitle className="text-base">Open Graph (Facebook)</CardTitle>
            <CardDescription>Tampilan saat dibagikan di Facebook</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ogTitle">OG Title</Label>
              <Input
                id="ogTitle"
                value={settings.ogTitle}
                onChange={(e) => handleChange("ogTitle", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ogDescription">OG Description</Label>
              <Textarea
                id="ogDescription"
                value={settings.ogDescription}
                onChange={(e) => handleChange("ogDescription", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>OG Image URL</Label>
              <Input
                placeholder="https://example.com/og-image.jpg (1200x630)"
                value={settings.ogImage || ""}
                onChange={(e) => handleChange("ogImage", e.target.value)}
              />
              {settings.ogImage && (
                <div className="h-20 w-36 rounded-lg bg-muted overflow-hidden">
                  <img src={settings.ogImage} alt="OG Image" className="w-full h-full object-cover" />
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
