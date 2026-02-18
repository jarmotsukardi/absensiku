import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Mail, Save, Send, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const SMTP_PRESETS = {
  gmail: {
    host: "smtp.gmail.com",
    port: "587",
    useTLS: true,
  },
  outlook: {
    host: "smtp.office365.com",
    port: "587",
    useTLS: true,
  },
  sendgrid: {
    host: "smtp.sendgrid.net",
    port: "587",
    useTLS: true,
  },
  mailgun: {
    host: "smtp.mailgun.org",
    port: "587",
    useTLS: true,
  },
  ses: {
    host: "email-smtp.us-east-1.amazonaws.com",
    port: "587",
    useTLS: true,
  },
  custom: {
    host: "",
    port: "587",
    useTLS: true,
  },
};

export function EmailGatewaySettings() {
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("email_gateway");
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState({
    provider: "custom",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    senderEmail: "noreply@absensi.app",
    senderName: "AbsensiKu",
    isEnabled: false,
    useTLS: true,
  });

  useEffect(() => {
    if (setting) {
      setSettings((prev) => ({ ...prev, ...(setting as Record<string, unknown>) }));
    }
  }, [setting]);

  const handleProviderChange = (provider: string) => {
    const preset = SMTP_PRESETS[provider as keyof typeof SMTP_PRESETS];
    setSettings((prev) => ({
      ...prev,
      provider,
      smtpHost: preset.host,
      smtpPort: preset.port,
      useTLS: preset.useTLS,
    }));
  };

  const handleChange = (field: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestEmail = async () => {
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      toast.error("Lengkapi konfigurasi SMTP terlebih dahulu");
      return;
    }
    if (!testEmail) {
      toast.error("Masukkan email tujuan untuk test");
      return;
    }
    setIsTesting(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!sessionData.session?.access_token) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData.session?.access_token) {
          accessToken = refreshData.session.access_token;
        }
      }

      const payload = {
        to: testEmail,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
        smtpPassword: settings.smtpPassword,
        senderEmail: settings.senderEmail,
        senderName: settings.senderName,
        useTLS: settings.useTLS,
      };

      const invokeTest = (token: string) =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-test-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
        });

      const readJsonSafe = async (response: Response): Promise<Record<string, unknown>> => {
        try {
          return await response.json();
        } catch {
          const raw = await response.text().catch(() => "");
          return { raw };
        }
      };

      let response = await invokeTest(accessToken);
      let data = await readJsonSafe(response);

      if (
        response.status === 401 &&
        String(data?.message || "").toLowerCase().includes("invalid jwt")
      ) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        const retryToken = refreshData.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        response = await invokeTest(retryToken);
        data = await readJsonSafe(response);
      }

      if (!response.ok) {
        const baseError =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.message === "string"
            ? data.message
            : "Gagal mengirim email";
        const hint = typeof data?.error_hint === "string" ? ` (${data.error_hint})` : "";
        const detailRaw = typeof data?.details === "string"
          ? data.details
          : (data?.details || data?.raw)
          ? JSON.stringify(data.details || data.raw)
          : "";
        const detail = detailRaw ? ` Detail: ${detailRaw.slice(0, 300)}` : "";
        throw new Error(
          appendErrorReference(`${baseError}${hint}${detail}`, typeof data?.trace_id === "string" ? data.trace_id : null)
        );
      }

      toast.success(
        appendErrorReference(
          `Email tes berhasil dikirim ke ${testEmail}!`,
          typeof data?.trace_id === "string" ? data.trace_id : null
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengirim email tes";
      const logId = reportError(error, "admin.settings.email_gateway.test_email", {
        test_email: testEmail,
        provider: settings.provider,
        smtp_host: settings.smtpHost,
        smtp_port: settings.smtpPort,
      });
      toast.error(appendErrorReference(message, logId));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await saveSetting("email_gateway", settings, "Konfigurasi SMTP Email Gateway");
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
          <Mail className="h-5 w-5 text-primary" />
          Email Gateway
        </h3>
        <p className="text-sm text-muted-foreground">
          Konfigurasi pengiriman email notifikasi
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konfigurasi SMTP</CardTitle>
            <CardDescription>Masukkan detail server email Anda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Aktifkan Email Gateway</Label>
                <p className="text-sm text-muted-foreground">
                  Kirim notifikasi via email
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
                  <SelectItem value="gmail">Google SMTP (Gmail)</SelectItem>
                  <SelectItem value="outlook">Microsoft Outlook</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                  <SelectItem value="ses">Amazon SES</SelectItem>
                  <SelectItem value="custom">SMTP Custom</SelectItem>
                </SelectContent>
              </Select>
              {settings.provider === "gmail" && (
                <p className="text-xs text-muted-foreground">
                  Untuk Gmail, gunakan App Password. Buat di: Google Account → Security → 2-Step Verification → App Passwords
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={settings.smtpHost}
                  onChange={(e) => handleChange("smtpHost", e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input
                  id="smtpPort"
                  value={settings.smtpPort}
                  onChange={(e) => handleChange("smtpPort", e.target.value)}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtpUser">SMTP Username</Label>
                <Input
                  id="smtpUser"
                  value={settings.smtpUser}
                  onChange={(e) => handleChange("smtpUser", e.target.value)}
                  placeholder="username atau email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPassword">SMTP Password</Label>
                <Input
                  id="smtpPassword"
                  type="password"
                  value={settings.smtpPassword}
                  onChange={(e) => handleChange("smtpPassword", e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="font-medium">Gunakan TLS/SSL</Label>
              <Switch
                checked={settings.useTLS}
                onCheckedChange={(checked) => handleChange("useTLS", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengaturan Pengirim</CardTitle>
            <CardDescription>Identitas email yang akan muncul</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="senderEmail">Email Pengirim</Label>
                <Input
                  id="senderEmail"
                  type="email"
                  value={settings.senderEmail}
                  onChange={(e) => handleChange("senderEmail", e.target.value)}
                  placeholder="noreply@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senderName">Nama Pengirim</Label>
                <Input
                  id="senderName"
                  value={settings.senderName}
                  onChange={(e) => handleChange("senderName", e.target.value)}
                  placeholder="AbsensiKu"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="testEmail">Email Tujuan Test</Label>
              <div className="flex gap-2">
                <Input
                  id="testEmail"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleTestEmail} disabled={isTesting}>
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
      </div>

      <PageGlossarySection preset="settings_email_gateway" />

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
