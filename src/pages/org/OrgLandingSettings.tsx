import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { 
  Globe, 
  Link as LinkIcon, 
  Copy, 
  ExternalLink, 
  Download,
  Smartphone,
  Loader2,
  Upload,
  Image as ImageIcon,
  X,
  Settings,
  Link2,
} from "lucide-react";

interface APKInfo {
  url: string;
  version: string;
  updatedAt: string;
  fileName: string;
}

type Tenant = Tables<"tenants">;

export default function OrgLandingSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  
  // APK Global dari SuperAdmin
  const [apkReguler, setApkReguler] = useState<APKInfo | null>(null);
  const [apkPemda, setApkPemda] = useState<APKInfo | null>(null);
  
  const [settings, setSettings] = useState({
    landing_enabled: false,
    landing_description: "",
    landing_hero_image: "",
    apk_url: "",
    logo_url: "",
  });

  useEffect(() => {
    fetchTenant();
    fetchGlobalAPKs();
  }, []);

  const fetchGlobalAPKs = async () => {
    try {
      // Fetch Aplikasi Reguler
      const { data: regulerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "global_apk")
        .maybeSingle();

      if (regulerData?.value && typeof regulerData.value === "object" && !Array.isArray(regulerData.value)) {
        setApkReguler(regulerData.value as unknown as APKInfo);
      }

      // Fetch Aplikasi Pemda
      const { data: pemdaData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "global_apk_pemda")
        .maybeSingle();

      if (pemdaData?.value && typeof pemdaData.value === "object" && !Array.isArray(pemdaData.value)) {
        setApkPemda(pemdaData.value as unknown as APKInfo);
      }
    } catch (error) {
      console.error("Error fetching global apps:", error);
    }
  };

  const fetchTenant = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.tenant_id) return;

      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", roleData.tenant_id)
        .single();

      if (error) throw error;

      setTenant(data);
      setSettings({
        landing_enabled: data.landing_enabled || false,
        landing_description: data.landing_description || "",
        landing_hero_image: data.landing_hero_image || "",
        apk_url: data.apk_url || "",
        logo_url: data.logo_url || "",
      });
    } catch (error) {
      console.error("Error fetching tenant:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("tenants")
        .update(settings)
        .eq("id", tenant.id);

      if (error) throw error;
      toast.success("Pengaturan berhasil disimpan");
      fetchTenant();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setIsSaving(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link berhasil disalin");
  };

  // Logo upload removed - using URL input instead

  const landingUrl = tenant ? `${window.location.origin}/landing/${tenant.code?.toLowerCase()}` : "";
  const loginUrl = `${window.location.origin}/employee/login`;

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Pengaturan Landing Page & Aplikasi
          </h1>
          <p className="text-muted-foreground">Kelola halaman publik dan aplikasi mobile organisasi</p>
        </div>

        <Tabs defaultValue="links" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-[500px]">
            <TabsTrigger value="links" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Link Aplikasi
            </TabsTrigger>
            <TabsTrigger value="apk" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Aplikasi Mobile
            </TabsTrigger>
            <TabsTrigger value="landing" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Landing Page
            </TabsTrigger>
          </TabsList>

          {/* Tab Links */}
          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Link Aplikasi
                </CardTitle>
                <CardDescription>Link penting untuk akses aplikasi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Link Login Pegawai</Label>
                  <div className="flex gap-2">
                    <Input value={loginUrl} readOnly className="flex-1 font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyLink(loginUrl)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => window.open(loginUrl, "_blank")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Link ini digunakan pegawai untuk login ke aplikasi absensi
                  </p>
                </div>

                {settings.landing_enabled && (
                  <div className="space-y-2">
                    <Label>Link Landing Page</Label>
                    <div className="flex gap-2">
                      <Input value={landingUrl} readOnly className="flex-1 font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={() => copyLink(landingUrl)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => window.open(landingUrl, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Halaman publik organisasi dengan informasi unduh aplikasi
                    </p>
                  </div>
                )}

                {settings.apk_url && (
                  <div className="space-y-2">
                    <Label>Tautan Unduh Aplikasi</Label>
                    <div className="flex gap-2">
                      <Input value={settings.apk_url} readOnly className="flex-1 font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={() => copyLink(settings.apk_url)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => window.open(settings.apk_url, "_blank")}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tautan langsung unduh aplikasi untuk pegawai
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab APK */}
          <TabsContent value="apk">
            <div className="space-y-4">
              {/* Aplikasi Reguler */}
              <Card className="border-accent/30 bg-accent/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-accent" />
                    Aplikasi Reguler
                  </CardTitle>
                  <CardDescription>Untuk organisasi umum (Perusahaan, Instansi, Sekolah)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apkReguler ? (
                    <div className="p-4 bg-card rounded-lg border">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Download className="h-4 w-4 text-green-600" />
                        Aplikasi Reguler v{apkReguler.version}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Aplikasi siap diunduh oleh pegawai.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={() => window.open(apkReguler.url, "_blank")} className="flex-1">
                          <Download className="h-4 w-4 mr-2" />
                          Unduh Aplikasi Reguler
                        </Button>
                        <Button variant="outline" onClick={() => copyLink(apkReguler.url)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Salin Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-muted/50 rounded-lg border border-dashed text-center">
                      <Smartphone className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-sm text-muted-foreground">Aplikasi Reguler belum tersedia.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Aplikasi Pemda */}
              <Card className="border-blue-500/30 bg-blue-50 dark:bg-blue-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-blue-600" />
                    Aplikasi Khusus Pemda
                  </CardTitle>
                  <CardDescription>Khusus untuk Pemerintah Daerah dengan fitur tambahan</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apkPemda ? (
                    <div className="p-4 bg-card rounded-lg border">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Download className="h-4 w-4 text-blue-600" />
                        Aplikasi Pemda v{apkPemda.version}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Aplikasi khusus Pemerintah Daerah siap diunduh.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={() => window.open(apkPemda.url, "_blank")} variant="default" className="flex-1 bg-blue-600 hover:bg-blue-700">
                          <Download className="h-4 w-4 mr-2" />
                          Unduh Aplikasi Pemda
                        </Button>
                        <Button variant="outline" onClick={() => copyLink(apkPemda.url)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Salin Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-muted/50 rounded-lg border border-dashed text-center">
                      <Smartphone className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-sm text-muted-foreground">Aplikasi Pemda belum tersedia.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Info Box */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-2">
                <h4 className="font-medium text-blue-900 dark:text-blue-100">Informasi Aplikasi:</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>Aplikasi mobile diupload dan dikelola oleh SuperAdmin</li>
                  <li>Pilih aplikasi sesuai jenis organisasi Anda</li>
                  <li>Pegawai dapat mengunduh aplikasi melalui tautan atau landing page organisasi</li>
                  <li>Pastikan perangkat mengizinkan instalasi aplikasi dari sumber tepercaya organisasi sesuai SOP instansi</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* Tab Landing Page */}
          <TabsContent value="landing">
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan Landing Page</CardTitle>
                <CardDescription>Konfigurasi halaman publik organisasi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Aktifkan Landing Page</Label>
                    <p className="text-sm text-muted-foreground">
                      Halaman publik dengan informasi organisasi dan unduh aplikasi
                    </p>
                  </div>
                  <Switch
                    checked={settings.landing_enabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, landing_enabled: checked })}
                  />
                </div>

                {settings.landing_enabled && (
                  <>
                    {/* Logo Upload */}
                    <div className="space-y-2">
                      <Label>Logo Organisasi</Label>
                      <div className="flex items-start gap-4">
                        <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/50">
                          {settings.logo_url ? (
                            <>
                              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                onClick={() => setSettings({ ...settings, logo_url: '' })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="https://example.com/logo.png"
                            value={settings.logo_url || ""}
                            onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                          />
                          {settings.logo_url && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                                <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                              </div>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-6 w-6 rounded-full"
                                onClick={() => setSettings({ ...settings, logo_url: '' })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Deskripsi Landing Page</Label>
                      <Textarea
                        value={settings.landing_description}
                        onChange={(e) => setSettings({ ...settings, landing_description: e.target.value })}
                        placeholder="Deskripsi singkat yang muncul di halaman landing..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>URL Gambar Hero (opsional)</Label>
                      <Input
                        value={settings.landing_hero_image}
                        onChange={(e) => setSettings({ ...settings, landing_hero_image: e.target.value })}
                        placeholder="https://example.com/hero-image.jpg"
                      />
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Preview Landing Page</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Lihat tampilan halaman landing organisasi Anda
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => window.open(landingUrl, "_blank")}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Buka Landing Page
                        </Button>
                        <Button variant="ghost" onClick={() => copyLink(landingUrl)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Salin Link
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan Pengaturan"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OrganizationLayout>
  );
}
