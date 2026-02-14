import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Code2, AlertTriangle, Info, Shield, Database } from "lucide-react";

interface DevelopmentModeSettingsState {
  bypassRLS: boolean;
  bypassValidation: boolean;
}

export function DevelopmentModeSettings() {
  const [settings, setSettings] = useState<DevelopmentModeSettingsState>({
    bypassRLS: false,
    bypassValidation: false,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dev_mode_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Handle migration from old format
        if (typeof parsed.enabled === "boolean") {
          setSettings({
            bypassRLS: parsed.enabled,
            bypassValidation: parsed.enabled,
          });
        } else {
          setSettings(parsed);
        }
      } catch (e) {
        console.error("Failed to parse dev mode settings");
      }
    }
  }, []);

  const handleToggleRLS = (bypassRLS: boolean) => {
    const newSettings = { ...settings, bypassRLS };
    setSettings(newSettings);
    localStorage.setItem("dev_mode_settings", JSON.stringify(newSettings));
  };

  const handleToggleValidation = (bypassValidation: boolean) => {
    const newSettings = { ...settings, bypassValidation };
    setSettings(newSettings);
    localStorage.setItem("dev_mode_settings", JSON.stringify(newSettings));
  };

  const isAnyEnabled = settings.bypassRLS || settings.bypassValidation;

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="text-lg">Mode Development</CardTitle>
                <CardDescription>
                  Aktifkan untuk bypass security checks saat testing
                </CardDescription>
              </div>
              {isAnyEnabled && (
                <Badge className="bg-accent text-accent-foreground">AKTIF</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warning Alert - Only shown when enabled */}
          {isAnyEnabled && (
            <Alert variant="default" className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning font-semibold">Peringatan Keamanan</AlertTitle>
              <AlertDescription className="text-warning/90">
                Mode development aktif! Beberapa pemeriksaan keamanan akan dilewati. Jangan aktifkan di lingkungan produksi.
              </AlertDescription>
            </Alert>
          )}

          {/* Bypass RLS Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-foreground">Bypass RLS Policy</p>
                <p className="text-sm text-muted-foreground">
                  Melewati Row Level Security untuk akses data tanpa batasan
                </p>
              </div>
            </div>
            <Switch
              checked={settings.bypassRLS}
              onCheckedChange={handleToggleRLS}
            />
          </div>

          {/* Bypass Validation Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-warning" />
              </div>
              <div>
                <p className="font-medium text-foreground">Bypass Validasi</p>
                <p className="text-sm text-muted-foreground">
                  Melewati validasi input dan business rules untuk testing
                </p>
              </div>
            </div>
            <Switch
              checked={settings.bypassValidation}
              onCheckedChange={handleToggleValidation}
            />
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Informasi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-foreground">
              <strong className="text-primary">Row Level Security (RLS)</strong> adalah fitur PostgreSQL yang membatasi akses data berdasarkan kebijakan yang ditentukan. Ketika diaktifkan, pengguna hanya dapat mengakses data sesuai dengan peran mereka.
            </p>
          </div>
          <div>
            <p className="text-foreground">
              <strong className="text-primary">Validasi</strong> mencakup pengecekan input data, business rules, dan format data yang diperlukan sebelum data disimpan ke database.
            </p>
          </div>
          <Alert variant="default" className="border-warning/50 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning/90 text-sm">
              Pengaturan ini hanya menyimpan preferensi di localStorage. Untuk benar-benar menonaktifkan RLS di PostgreSQL, diperlukan migrasi database yang mengubah policy secara langsung.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
