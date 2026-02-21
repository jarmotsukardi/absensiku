import { useState, useEffect } from "react";
import { useBillingSettings } from "@/hooks/useBilling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, Key, Webhook, Shield, ExternalLink, Copy, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const parseNumericSettingValue = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const objectValue = raw as Record<string, unknown>;
    if ("value" in objectValue) {
      return parseNumericSettingValue(objectValue.value, fallback);
    }
    if ("amount" in objectValue) {
      return parseNumericSettingValue(objectValue.amount, fallback);
    }
  }
  return fallback;
};

export function XenditSettings() {
  const { settings, isLoading, getSetting, updateSetting } = useBillingSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [callbackToken, setCallbackToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showCallbackToken, setShowCallbackToken] = useState(false);
  
  // Bank account info for manual payments
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  // B2B negotiation threshold
  const [b2bThreshold, setB2bThreshold] = useState("2000");
  const [isSavingB2b, setIsSavingB2b] = useState(false);

  useEffect(() => {
    if (!isLoading && settings.length > 0) {
      const xendit = getSetting("xendit_enabled");
      const xenditConfig = getSetting("xendit_config");
      const manualBank = getSetting("manual_bank_account");

      if (xendit) setXenditEnabled(xendit.value || false);
      if (xenditConfig) {
        setSecretKey(xenditConfig.secret_key || "");
        setCallbackToken(xenditConfig.callback_token || "");
      }
      if (manualBank) {
        setBankName(manualBank.bank_name || "");
        setBankAccountNumber(manualBank.account_number || "");
        setBankAccountName(manualBank.account_name || "");
      }

      // Generate webhook URL
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "uvzruextguakdocvhfay";
      setWebhookUrl(`https://${projectId}.supabase.co/functions/v1/xendit-webhook`);
    }
  }, [settings, isLoading, getSetting]);

  // Fetch B2B threshold from system_settings
  useEffect(() => {
    const fetchB2b = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "b2b_negotiation_threshold")
          .maybeSingle();
        if (error) throw error;
        setB2bThreshold(String(Math.max(1, Math.floor(parseNumericSettingValue(data?.value, 2000)))));
      } catch (error) {
        reportError(error, "admin.billing.xendit.fetch_b2b_threshold");
      }
    };
    fetchB2b();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        updateSetting("xendit_enabled", { value: xenditEnabled }),
        updateSetting("xendit_config", {
          secret_key: secretKey,
          callback_token: callbackToken,
          is_production: !secretKey.includes("xnd_development"),
        }),
        updateSetting("manual_bank_account", {
          bank_name: bankName,
          account_number: bankAccountNumber,
          account_name: bankAccountName,
        }),
      ]);
      toast.success("Pengaturan Xendit berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.xendit.save_settings");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveB2bThreshold = async () => {
    setIsSavingB2b(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "b2b_negotiation_threshold")
        .maybeSingle();

      const valuePayload: Json = Math.max(1, parseInt(b2bThreshold, 10) || 2000);

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: valuePayload, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("system_settings")
          .insert({
            key: "b2b_negotiation_threshold",
            value: valuePayload,
            description: "Ambang batas pegawai untuk negosiasi B2B",
          });
      }
      toast.success("Ambang batas B2B berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.xendit.save_b2b_threshold");
      toast.error(appendErrorReference("Gagal menyimpan", errorRef));
    } finally {
      setIsSavingB2b(false);
    }
  };

  const handleTestConnection = async () => {
    if (!secretKey) {
      toast.error("Secret Key harus diisi terlebih dahulu");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Simple test by checking Xendit balance endpoint
      const response = await fetch("https://api.xendit.co/balance", {
        headers: {
          "Authorization": `Basic ${btoa(secretKey + ":")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult({
          success: true,
          message: `Koneksi berhasil! Saldo: Rp ${data.balance?.toLocaleString("id-ID") || 0}`,
        });
      } else {
        const error = await response.text();
        setTestResult({
          success: false,
          message: `Koneksi gagal: ${response.status} - ${error}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      reportError(error, "admin.billing.xendit.test_connection");
      setTestResult({
        success: false,
        message: `Error: ${message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const isProduction = secretKey && !secretKey.includes("xnd_development");

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Integrasi Xendit</h3>
        {secretKey ? (
          <Badge variant={isProduction ? "default" : "secondary"}>
            {isProduction ? "Production" : "Development"}
          </Badge>
        ) : (
          <Badge variant="outline">Belum Dikonfigurasi</Badge>
        )}
      </div>

      {/* Enable/Disable Switch */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Aktifkan Pembayaran Xendit</Label>
              <p className="text-sm text-muted-foreground">
                Virtual Account, E-Wallet, QRIS, Kartu Kredit
              </p>
            </div>
            <Switch
              checked={xenditEnabled}
              onCheckedChange={setXenditEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Keys
          </CardTitle>
          <CardDescription>
            Dapatkan API Key dari{" "}
            <a
              href="https://dashboard.xendit.co/settings/developers#api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Xendit Dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secretKey">Secret Key</Label>
            <div className="relative">
              <Input
                id="secretKey"
                type={showSecretKey ? "text" : "password"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="xnd_development_... atau xnd_production_..."
                className="pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Gunakan secret key yang dimulai dengan <code>xnd_development_</code> untuk testing
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="callbackToken">Callback Token (Webhook Verification)</Label>
            <div className="relative">
              <Input
                id="callbackToken"
                type={showCallbackToken ? "text" : "password"}
                value={callbackToken}
                onChange={(e) => setCallbackToken(e.target.value)}
                placeholder="Token untuk verifikasi webhook"
                className="pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowCallbackToken(!showCallbackToken)}
                >
                  {showCallbackToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!secretKey || isTesting}
            >
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Shield className="mr-2 h-4 w-4" />
              Test Koneksi
            </Button>
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {testResult.message}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Konfigurasi URL ini di Xendit Dashboard → Settings → Callbacks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Langkah Setup Webhook:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>Buka Xendit Dashboard → Settings → Callbacks</li>
                <li>Tambahkan URL webhook di atas untuk event "Invoice"</li>
                <li>Copy Callback Token dan paste di field di atas</li>
                <li>Simpan pengaturan di kedua tempat</li>
              </ol>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Manual Bank Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rekening Transfer Manual (B2B)</CardTitle>
          <CardDescription>
            Informasi rekening untuk pembayaran manual (instansi pemerintah)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bankName">Nama Bank</Label>
              <Input
                id="bankName"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BCA, Mandiri, dll"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">Nomor Rekening</Label>
              <Input
                id="bankAccountNumber"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountName">Atas Nama</Label>
              <Input
                id="bankAccountName"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="PT. Nama Perusahaan"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B2B Negotiation Threshold */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ambang Batas Negosiasi B2B</CardTitle>
          <CardDescription>
            Organisasi dengan pegawai aktif melebihi batas ini akan menerima notifikasi untuk negosiasi harga korporasi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-2 flex-1 max-w-xs">
              <Label htmlFor="b2bThreshold">Jumlah Pegawai Minimum</Label>
              <Input
                id="b2bThreshold"
                type="number"
                value={b2bThreshold}
                onChange={(e) => setB2bThreshold(e.target.value)}
                min={100}
                max={100000}
                placeholder="2000"
              />
            </div>
            <Button onClick={handleSaveB2bThreshold} disabled={isSavingB2b} variant="outline">
              {isSavingB2b ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Simpan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Organisasi dengan ≥ {parseInt(b2bThreshold) || 2000} pegawai akan melihat overlay negosiasi B2B di tab Pembiayaan
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
