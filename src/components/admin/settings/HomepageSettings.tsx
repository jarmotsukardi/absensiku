import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Save, Upload, Image } from "lucide-react";
import { toast } from "sonner";

export function HomepageSettings() {
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({
    heroTitle: "Platform Absensi #1 untuk Pemerintah & Swasta",
    heroSubtitle: "Kelola kehadiran pegawai dengan akurat menggunakan teknologi GPS",
    heroCta: "Mulai Gratis",
    showStats: true,
    showTestimonials: true,
    showPartners: true,
    showPricing: true,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast.success("Pengaturan halaman depan berhasil disimpan");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          Pengaturan Halaman Depan
        </h3>
        <p className="text-sm text-muted-foreground">
          Kustomisasi tampilan landing page
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hero Section</CardTitle>
            <CardDescription>Bagian utama yang pertama dilihat pengunjung</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="heroTitle">Judul Utama</Label>
              <Input
                id="heroTitle"
                value={settings.heroTitle}
                onChange={(e) => handleChange("heroTitle", e.target.value)}
                placeholder="Judul hero section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroSubtitle">Subjudul</Label>
              <Textarea
                id="heroSubtitle"
                value={settings.heroSubtitle}
                onChange={(e) => handleChange("heroSubtitle", e.target.value)}
                placeholder="Deskripsi singkat"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroCta">Teks Tombol CTA</Label>
              <Input
                id="heroCta"
                value={settings.heroCta}
                onChange={(e) => handleChange("heroCta", e.target.value)}
                placeholder="Mulai Gratis"
              />
            </div>
            <div className="space-y-2">
              <Label>Gambar Hero</Label>
              <div className="flex items-center gap-4">
                <div className="h-24 w-40 rounded-lg bg-muted flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Gambar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visibility Section</CardTitle>
            <CardDescription>Pilih section yang ingin ditampilkan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan Statistik</Label>
                <p className="text-sm text-muted-foreground">
                  Jumlah pengguna, organisasi, dll
                </p>
              </div>
              <Switch
                checked={settings.showStats}
                onCheckedChange={(checked) => handleChange("showStats", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan Testimoni</Label>
                <p className="text-sm text-muted-foreground">
                  Ulasan dari pengguna
                </p>
              </div>
              <Switch
                checked={settings.showTestimonials}
                onCheckedChange={(checked) => handleChange("showTestimonials", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan Partner</Label>
                <p className="text-sm text-muted-foreground">
                  Logo organisasi partner
                </p>
              </div>
              <Switch
                checked={settings.showPartners}
                onCheckedChange={(checked) => handleChange("showPartners", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan Harga</Label>
                <p className="text-sm text-muted-foreground">
                  Tabel harga paket
                </p>
              </div>
              <Switch
                checked={settings.showPricing}
                onCheckedChange={(checked) => handleChange("showPricing", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
