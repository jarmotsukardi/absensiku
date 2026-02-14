import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Shield } from "lucide-react";

interface RateLimitConfig {
  enabled: boolean;
  max_attempts: number;
  lockout_duration_minutes: number;
}

const defaultConfig: RateLimitConfig = {
  enabled: true,
  max_attempts: 3,
  lockout_duration_minutes: 15,
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 0 ? Math.floor(parsed) : fallback;
};

export function LoginRateLimitSettings() {
  const [config, setConfig] = useState<RateLimitConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "login_rate_limit_config")
        .maybeSingle();

      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const value = data.value as Partial<RateLimitConfig>;
        setConfig({
          enabled: parseBoolean(value.enabled, defaultConfig.enabled),
          max_attempts: parsePositiveInt(value.max_attempts, defaultConfig.max_attempts),
          lockout_duration_minutes: parsePositiveInt(
            value.lockout_duration_minutes,
            defaultConfig.lockout_duration_minutes
          ),
        });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const jsonValue = JSON.parse(JSON.stringify(config));
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: "login_rate_limit_config",
            value: jsonValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;

      toast.success("Pengaturan rate limit berhasil disimpan");
    } catch (error: any) {
      console.error("Error saving login rate limit config:", error);
      toast.error(error?.message || "Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Pengaturan Rate Limit Login
        </CardTitle>
        <CardDescription>
          Konfigurasi pembatasan percobaan login untuk mencegah brute force attack
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label className="font-medium">Aktifkan Rate Limit</Label>
            <p className="text-sm text-muted-foreground">Blokir akses setelah gagal login berulang kali</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
          />
        </div>

        {config.enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Maksimal Percobaan</Label>
              <Input
                type="number"
                value={config.max_attempts}
                onChange={(e) => setConfig({ ...config, max_attempts: Math.max(1, parseInt(e.target.value) || 3) })}
                min={1}
                max={20}
              />
              <p className="text-xs text-muted-foreground">Jumlah percobaan sebelum diblokir</p>
            </div>
            <div className="space-y-2">
              <Label>Durasi Blokir (menit)</Label>
              <Input
                type="number"
                value={config.lockout_duration_minutes}
                onChange={(e) => setConfig({ ...config, lockout_duration_minutes: Math.max(1, parseInt(e.target.value) || 15) })}
                min={1}
                max={120}
              />
              <p className="text-xs text-muted-foreground">Lama waktu blokir akses</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
