import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Upload, Smartphone, Download, Trash2, Building2, Users } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";

interface APKInfo {
  url: string;
  version: string;
  updatedAt: string;
  fileName: string;
}

type APKType = "reguler" | "pemda";

export function APKUploadSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<APKType>("reguler");
  
  // APK Reguler
  const [apkReguler, setApkReguler] = useState<APKInfo | null>(null);
  const [versionReguler, setVersionReguler] = useState("1.0.0");
  
  // APK Pemda
  const [apkPemda, setApkPemda] = useState<APKInfo | null>(null);
  const [versionPemda, setVersionPemda] = useState("1.0.0");

  useEffect(() => {
    fetchAPKInfo();
  }, []);

  const fetchAPKInfo = async () => {
    try {
      // Fetch APK Reguler
      const { data: regulerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "global_apk")
        .maybeSingle();

      if (regulerData?.value && typeof regulerData.value === "object" && !Array.isArray(regulerData.value)) {
        const apkData = regulerData.value as unknown as APKInfo;
        setApkReguler(apkData);
        if (apkData.version) {
          setVersionReguler(apkData.version);
        }
      }

      // Fetch APK Pemda
      const { data: pemdaData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "global_apk_pemda")
        .maybeSingle();

      if (pemdaData?.value && typeof pemdaData.value === "object" && !Array.isArray(pemdaData.value)) {
        const apkData = pemdaData.value as unknown as APKInfo;
        setApkPemda(apkData);
        if (apkData.version) {
          setVersionPemda(apkData.version);
        }
      }
    } catch (error) {
      console.error("Error fetching APK info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: APKType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".apk")) {
      toast.error("File harus berformat .apk");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 100MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `${type}-app-${Date.now()}.apk`;
      const { error: uploadError } = await supabase.storage
        .from("apk-files")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("apk-files")
        .getPublicUrl(fileName);

      const version = type === "reguler" ? versionReguler : versionPemda;
      const settingsKey = type === "reguler" ? "global_apk" : "global_apk_pemda";

      const newApkInfo: APKInfo = {
        url: publicUrl,
        version: version,
        updatedAt: new Date().toISOString(),
        fileName: fileName,
      };
      const apkPayload: Json = newApkInfo;

      // Save to system_settings
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", settingsKey)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: apkPayload, updated_at: new Date().toISOString() })
          .eq("key", settingsKey);
      } else {
        await supabase
          .from("system_settings")
          .insert({
            key: settingsKey,
            value: apkPayload,
            description: type === "reguler" 
              ? "APK Reguler untuk organisasi umum" 
              : "APK Khusus untuk Pemerintah Daerah",
          });
      }

      if (type === "reguler") {
        setApkReguler(newApkInfo);
      } else {
        setApkPemda(newApkInfo);
      }
      
      toast.success(`APK ${type === "reguler" ? "Reguler" : "Pemda"} berhasil diupload`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error uploading APK:", error);
      toast.error("Gagal mengupload APK: " + message);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (type: APKType) => {
    const apkInfo = type === "reguler" ? apkReguler : apkPemda;
    const settingsKey = type === "reguler" ? "global_apk" : "global_apk_pemda";
    
    if (!apkInfo || !confirm(`Yakin ingin menghapus APK ${type === "reguler" ? "Reguler" : "Pemda"}?`)) return;

    try {
      // Delete from storage
      if (apkInfo.fileName) {
        await supabase.storage.from("apk-files").remove([apkInfo.fileName]);
      }

      // Delete from system_settings
      await supabase
        .from("system_settings")
        .delete()
        .eq("key", settingsKey);

      if (type === "reguler") {
        setApkReguler(null);
      } else {
        setApkPemda(null);
      }
      
      toast.success(`APK ${type === "reguler" ? "Reguler" : "Pemda"} berhasil dihapus`);
    } catch (error) {
      console.error("Error deleting APK:", error);
      toast.error("Gagal menghapus APK");
    }
  };

  const renderAPKCard = (type: APKType) => {
    const apkInfo = type === "reguler" ? apkReguler : apkPemda;
    const version = type === "reguler" ? versionReguler : versionPemda;
    const setVersion = type === "reguler" ? setVersionReguler : setVersionPemda;
    const Icon = type === "reguler" ? Users : Building2;
    const title = type === "reguler" ? "APK Reguler" : "APK Khusus Pemda";
    const description = type === "reguler" 
      ? "APK untuk organisasi umum (Perusahaan, Instansi, Sekolah)"
      : "APK khusus untuk Pemerintah Daerah dengan fitur tambahan";

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apkInfo ? (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Smartphone className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Aplikasi Absensi v{apkInfo.version}</p>
                    <p className="text-sm text-muted-foreground">
                      Diupload: {format(new Date(apkInfo.updatedAt), "dd MMMM yyyy, HH:mm", { locale: id })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={apkInfo.url} download>
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(type)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 border-2 border-dashed rounded-lg text-center">
              <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Belum ada APK yang diupload</p>
            </div>
          )}

          <div className="grid gap-4 pt-4 border-t">
            <div className="grid gap-2">
              <Label>Versi Aplikasi</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
            <div className="grid gap-2">
              <Label>Upload APK Baru</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".apk"
                  onChange={(e) => handleUpload(e, type)}
                  disabled={isUploading}
                  className="flex-1"
                />
                {isUploading && <Loader2 className="h-5 w-5 animate-spin self-center" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Format: .apk, Maksimal: 100MB
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Upload APK Aplikasi</h3>
        <p className="text-sm text-muted-foreground">
          Upload APK aplikasi absensi yang akan tersedia untuk organisasi
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as APKType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reguler" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            APK Reguler
          </TabsTrigger>
          <TabsTrigger value="pemda" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            APK Pemda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reguler" className="mt-4">
          {renderAPKCard("reguler")}
        </TabsContent>

        <TabsContent value="pemda" className="mt-4">
          {renderAPKCard("pemda")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
