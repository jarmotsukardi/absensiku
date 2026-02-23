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
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface APKInfo {
  url: string;
  version: string;
  updatedAt: string;
  fileName: string;
}

type APKType = "reguler" | "pemda";
const APK_SETTINGS_READ_TIMEOUT_MS = 12000;
const APK_SETTINGS_WRITE_TIMEOUT_MS = 20000;
const APK_SETTINGS_MAX_RETRIES = 2;

export function APKUploadSettings() {
  const confirmDialog = useConfirmDialog();
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<APKType>("reguler");
  
  // Aplikasi Reguler
  const [apkReguler, setApkReguler] = useState<APKInfo | null>(null);
  const [versionReguler, setVersionReguler] = useState("1.0.0");
  
  // Aplikasi Pemda
  const [apkPemda, setApkPemda] = useState<APKInfo | null>(null);
  const [versionPemda, setVersionPemda] = useState("1.0.0");

  useEffect(() => {
    fetchAPKInfo();
  }, []);

  const fetchAPKInfo = async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      // Fetch Aplikasi Reguler
      const { data: regulerData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", "global_apk")
              .maybeSingle(),
            APK_SETTINGS_READ_TIMEOUT_MS,
            "Permintaan konfigurasi APK reguler timeout."
          ),
        {
          maxRetries: APK_SETTINGS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (regulerData?.value && typeof regulerData.value === "object" && !Array.isArray(regulerData.value)) {
        const apkData = regulerData.value as unknown as APKInfo;
        setApkReguler(apkData);
        if (apkData.version) {
          setVersionReguler(apkData.version);
        }
      }

      // Fetch Aplikasi Pemda
      const { data: pemdaData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", "global_apk_pemda")
              .maybeSingle(),
            APK_SETTINGS_READ_TIMEOUT_MS,
            "Permintaan konfigurasi APK pemda timeout."
          ),
        {
          maxRetries: APK_SETTINGS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (pemdaData?.value && typeof pemdaData.value === "object" && !Array.isArray(pemdaData.value)) {
        const apkData = pemdaData.value as unknown as APKInfo;
        setApkPemda(apkData);
        if (apkData.version) {
          setVersionPemda(apkData.version);
        }
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.components.apk_upload.fetch");
      const message = appendErrorReference("Gagal memuat konfigurasi APK", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
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
      const { error: uploadError } = await withTimeout(
        supabase.storage
          .from("apk-files")
          .upload(fileName, file, { upsert: true }),
        APK_SETTINGS_WRITE_TIMEOUT_MS,
        "Upload file APK timeout."
      );

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
      const { data: existing } = await withTimeout(
        supabase
          .from("system_settings")
          .select("id")
          .eq("key", settingsKey)
          .maybeSingle(),
        APK_SETTINGS_WRITE_TIMEOUT_MS,
        "Permintaan cek konfigurasi APK timeout."
      );

      if (existing) {
        const { error: updateError } = await withTimeout(
          supabase
            .from("system_settings")
            .update({ value: apkPayload, updated_at: new Date().toISOString() })
            .eq("key", settingsKey),
          APK_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan konfigurasi APK timeout."
        );
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await withTimeout(
          supabase
            .from("system_settings")
            .insert({
              key: settingsKey,
              value: apkPayload,
              description: type === "reguler" 
                ? "Aplikasi Reguler untuk organisasi umum" 
                : "Aplikasi Khusus untuk Pemerintah Daerah",
            }),
          APK_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan konfigurasi APK timeout."
        );
        if (insertError) throw insertError;
      }

      if (type === "reguler") {
        setApkReguler(newApkInfo);
      } else {
        setApkPemda(newApkInfo);
      }
      
      toast.success(`Aplikasi ${type === "reguler" ? "Reguler" : "Pemda"} berhasil diupload`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorRef = reportError(error, "admin.components.apk_upload.upload", { apk_type: type });
      toast.error(appendErrorReference("Gagal mengupload aplikasi: " + message, errorRef));
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (type: APKType) => {
    const apkInfo = type === "reguler" ? apkReguler : apkPemda;
    const settingsKey = type === "reguler" ? "global_apk" : "global_apk_pemda";
    
    if (!apkInfo) return;
    const confirmed = await confirmDialog({
      title: "Hapus Aplikasi APK",
      description: `Yakin ingin menghapus aplikasi ${type === "reguler" ? "Reguler" : "Pemda"}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      // Delete from storage
      if (apkInfo.fileName) {
        await withTimeout(
          supabase.storage.from("apk-files").remove([apkInfo.fileName]),
          APK_SETTINGS_WRITE_TIMEOUT_MS,
          "Hapus file APK timeout."
        );
      }

      // Delete from system_settings
      await withTimeout(
        supabase
          .from("system_settings")
          .delete()
          .eq("key", settingsKey),
        APK_SETTINGS_WRITE_TIMEOUT_MS,
        "Hapus konfigurasi APK timeout."
      );

      if (type === "reguler") {
        setApkReguler(null);
      } else {
        setApkPemda(null);
      }
      
      toast.success(`Aplikasi ${type === "reguler" ? "Reguler" : "Pemda"} berhasil dihapus`);
    } catch (error) {
      const errorRef = reportError(error, "admin.components.apk_upload.delete", { apk_type: type });
      toast.error(appendErrorReference("Gagal menghapus aplikasi", errorRef));
    }
  };

  const renderAPKCard = (type: APKType) => {
    const apkInfo = type === "reguler" ? apkReguler : apkPemda;
    const version = type === "reguler" ? versionReguler : versionPemda;
    const setVersion = type === "reguler" ? setVersionReguler : setVersionPemda;
    const Icon = type === "reguler" ? Users : Building2;
    const title = type === "reguler" ? "Aplikasi Reguler" : "Aplikasi Khusus Pemda";
    const description = type === "reguler" 
      ? "Aplikasi untuk organisasi umum (Perusahaan, Instansi, Sekolah)"
      : "Aplikasi khusus untuk Pemerintah Daerah dengan fitur tambahan";

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
              <p className="text-muted-foreground">Belum ada aplikasi yang diupload</p>
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
              <Label>Upload Aplikasi Baru</Label>
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
      {isRetrying && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Sedang mencoba ulang memuat konfigurasi APK...
        </div>
      )}
      {loadError && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void fetchAPKInfo()}>
            Coba Lagi
          </Button>
        </div>
      )}
      <div>
        <h3 className="text-lg font-medium">Upload Aplikasi Mobile</h3>
        <p className="text-sm text-muted-foreground">
          Upload aplikasi absensi yang akan tersedia untuk organisasi
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as APKType)}>
        <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <TabsTrigger value="reguler" className="flex items-center gap-2 whitespace-nowrap">
            <Users className="h-4 w-4" />
            Aplikasi Reguler
          </TabsTrigger>
          <TabsTrigger value="pemda" className="flex items-center gap-2 whitespace-nowrap">
            <Building2 className="h-4 w-4" />
            Aplikasi Pemda
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
