import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { MessageCircle, Save, Send, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

const PROVIDERS = [
  { value: "fonnte", label: "Fonnte", url: "https://fonnte.com" },
  { value: "wablas", label: "Wablas", url: "https://wablas.com" },
  { value: "whacenter", label: "WhaCenter", url: "https://whacenter.com" },
  { value: "dripsender", label: "DripSender", url: "https://dripsender.id" },
  { value: "custom", label: "Custom API", url: null },
];

export function WhatsAppGatewaySettings() {
  const REQUEST_TIMEOUT_MS = 12000;
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("whatsapp_gateway");
  const [isTesting, setIsTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [settings, setSettings] = useState({
    provider: "fonnte",
    apiKey: "",
    apiUrl: "",
    senderNumber: "",
    isEnabled: false,
    welcomeMessage: "Selamat datang di AbsensiKu! Akun Anda telah berhasil dibuat.",
    attendanceReminder: "Jangan lupa absen hari ini! Klik link berikut: {link}",
    leaveApproval: "Pengajuan {type} Anda telah {status}.",
  });

  useEffect(() => {
    if (setting) {
      setSettings((prev) => ({ ...prev, ...(setting as Record<string, unknown>) }));
    }
  }, [setting]);

  const handleChange = (field: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleProviderChange = (provider: string) => {
    setSettings((prev) => ({ ...prev, provider, apiUrl: "" }));
  };

  const handleTestMessage = async () => {
    if (!settings.apiKey) {
      toast.error("Masukkan API Key terlebih dahulu");
      return;
    }
    if (!testPhone) {
      toast.error("Masukkan nomor WhatsApp tujuan untuk test");
      return;
    }
    setIsTesting(true);
    
    try {
      const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(),
        REQUEST_TIMEOUT_MS,
        "Memuat sesi autentikasi terlalu lama",
      );
      let accessToken = sessionData.session?.access_token || supabasePublishableKey;
      if (!sessionData.session?.access_token) {
        const { data: refreshData } = await withTimeout(
          supabase.auth.refreshSession(),
          REQUEST_TIMEOUT_MS,
          "Menyegarkan sesi autentikasi terlalu lama",
        );
        if (refreshData.session?.access_token) {
          accessToken = refreshData.session.access_token;
        }
      }

      const payload = {
        to: testPhone,
        provider: settings.provider,
        apiKey: settings.apiKey,
        apiUrl: settings.apiUrl,
        senderNumber: settings.senderNumber,
      };

      const invokeTest = (token: string) =>
        fetch(`${supabaseUrl}/functions/v1/send-test-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": supabasePublishableKey,
          },
          body: JSON.stringify(payload),
        });

      const readJsonSafe = async (response: Response): Promise<Record<string, unknown>> => {
        try {
          return await withTimeout(
            response.json(),
            REQUEST_TIMEOUT_MS,
            "Membaca response JSON test WhatsApp terlalu lama",
          );
        } catch {
          const raw = await withTimeout(
            response.text(),
            REQUEST_TIMEOUT_MS,
            "Membaca response text test WhatsApp terlalu lama",
          ).catch(() => "");
          return { raw };
        }
      };

      let response = await withTimeout(
        invokeTest(accessToken),
        REQUEST_TIMEOUT_MS,
        "Permintaan test WhatsApp terlalu lama",
      );
      let data = await readJsonSafe(response);

      if (
        response.status === 401 &&
        String(data?.message || "").toLowerCase().includes("invalid jwt")
      ) {
        const { data: refreshData } = await withTimeout(
          supabase.auth.refreshSession(),
          REQUEST_TIMEOUT_MS,
          "Menyegarkan sesi retry test WhatsApp terlalu lama",
        );
        const retryToken = refreshData.session?.access_token || supabasePublishableKey;
        response = await withTimeout(
          invokeTest(retryToken),
          REQUEST_TIMEOUT_MS,
          "Permintaan ulang test WhatsApp terlalu lama",
        );
        data = await readJsonSafe(response);
      }

      if (!response.ok) {
        const baseError =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.message === "string"
            ? data.message
            : "Gagal mengirim pesan";
        const hint = typeof data?.error_hint === "string" ? ` (${data.error_hint})` : "";
        const detailRaw = typeof data?.details === "string"
          ? data.details
          : (data?.details || data?.raw)
          ? JSON.stringify(data.details || data.raw)
          : "";
        const detail = detailRaw ? ` Rincian: ${detailRaw.slice(0, 300)}` : "";
        throw new Error(
          appendErrorReference(`${baseError}${hint}${detail}`, typeof data?.trace_id === "string" ? data.trace_id : null)
        );
      }

      toast.success(
        appendErrorReference(
          `Pesan tes berhasil dikirim ke ${testPhone}!`,
          typeof data?.trace_id === "string" ? data.trace_id : null
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengirim pesan tes";
      const logId = reportError(error, "admin.settings.whatsapp_gateway.test_message", {
        provider: settings.provider,
        target_phone: testPhone,
      });
      toast.error(appendErrorReference(message, logId));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await saveSetting("whatsapp_gateway", settings, "Konfigurasi WhatsApp Gateway");
  };

  const selectedProvider = PROVIDERS.find(p => p.value === settings.provider);

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
          <MessageCircle className="h-5 w-5 text-primary" />
          WhatsApp Gateway
        </h3>
        <p className="text-sm text-muted-foreground">
          Konfigurasi pengiriman notifikasi via WhatsApp
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konfigurasi Gateway</CardTitle>
            <CardDescription>Pilih provider dan masukkan kredensial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Aktifkan WhatsApp Gateway</Label>
                <p className="text-sm text-muted-foreground">
                  Kirim notifikasi otomatis via WhatsApp
                </p>
              </div>
              <Switch
                checked={settings.isEnabled}
                onCheckedChange={(checked) => handleChange("isEnabled", checked)}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={settings.provider}
                onValueChange={handleProviderChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProvider?.url && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => window.open(selectedProvider.url!, "_blank")}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Daftar {selectedProvider.label}
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key / Token</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => handleChange("apiKey", e.target.value)}
                  placeholder="Masukkan API Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senderNumber">Nomor Pengirim</Label>
                <Input
                  id="senderNumber"
                  value={settings.senderNumber}
                  onChange={(e) => handleChange("senderNumber", e.target.value)}
                  placeholder="628123456789"
                />
              </div>
            </div>

            {settings.provider === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="apiUrl">API URL</Label>
                <Input
                  id="apiUrl"
                  value={settings.apiUrl}
                  onChange={(e) => handleChange("apiUrl", e.target.value)}
                  placeholder="https://api.example.com/send"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="testPhone">Nomor Tujuan Test</Label>
              <div className="flex gap-2">
                <Input
                  id="testPhone"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="628123456789"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleTestMessage} disabled={isTesting}>
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Kirim Tes
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templat Pesan</CardTitle>
            <CardDescription>Kustomisasi template notifikasi WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="welcomeMessage">Pesan Selamat Datang</Label>
              <Textarea
                id="welcomeMessage"
                value={settings.welcomeMessage}
                onChange={(e) => handleChange("welcomeMessage", e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Variabel: {"{name}"}, {"{email}"}, {"{organization}"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendanceReminder">Pengingat Absensi</Label>
              <Textarea
                id="attendanceReminder"
                value={settings.attendanceReminder}
                onChange={(e) => handleChange("attendanceReminder", e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Variabel: {"{name}"}, {"{link}"}, {"{date}"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leaveApproval">Notifikasi Persetujuan</Label>
              <Textarea
                id="leaveApproval"
                value={settings.leaveApproval}
                onChange={(e) => handleChange("leaveApproval", e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Variabel: {"{name}"}, {"{type}"}, {"{status}"}, {"{date}"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <PageGlossarySection preset="settings_whatsapp_gateway" />

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
