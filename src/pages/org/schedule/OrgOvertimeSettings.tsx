import { useState, useEffect } from "react";
import { useOvertimeSettings } from "@/hooks/useOvertimeRequests";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Timer, Clock, Calendar, Percent, RotateCcw } from "lucide-react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import { toast } from "sonner";

const TENANT_RESOLVE_TIMEOUT_MS = 12000;
const SAVE_SETTINGS_TIMEOUT_MS = 15000;
const READ_MAX_RETRIES = 2;
 
export default function OrgOvertimeSettings() {
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [tenantReady, setTenantReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchTenantId = async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);

      const {
        data: { user },
      } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            TENANT_RESOLVE_TIMEOUT_MS,
            "Permintaan user auth timeout."
          ),
        {
          maxRetries: READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!user) {
        setTenantId(undefined);
        return;
      }

      const { data: roleRows, error: roleError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("user_roles")
              .select("tenant_id, role")
              .eq("user_id", user.id)
              .in("role", ["admin_instansi", "atasan"])
              .not("tenant_id", "is", null)
              .limit(5),
            TENANT_RESOLVE_TIMEOUT_MS,
            "Permintaan tenant organisasi timeout."
          ),
        {
          maxRetries: READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (roleError) throw roleError;

      const roleTenantIds = Array.from(
        new Set((roleRows || []).map((row) => row.tenant_id).filter((value): value is string => Boolean(value))),
      );

      if (roleTenantIds.length > 1) {
        reportError(new Error("Multiple tenant_id detected in user_roles"), "org.overtime_settings.resolve_tenant.multiple_role_tenants", {
          user_id: user.id,
          tenant_ids: roleTenantIds,
        });
      }

      if (roleTenantIds.length > 0) {
        setTenantId(roleTenantIds[0]);
        return;
      }

      const { data: employeeRows, error: employeeError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("tenant_id")
              .eq("user_id", user.id)
              .not("tenant_id", "is", null)
              .limit(5),
            TENANT_RESOLVE_TIMEOUT_MS,
            "Permintaan tenant pegawai timeout."
          ),
        {
          maxRetries: READ_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (employeeError) throw employeeError;

      const employeeTenantIds = Array.from(
        new Set((employeeRows || []).map((row) => row.tenant_id).filter((value): value is string => Boolean(value))),
      );

      if (employeeTenantIds.length > 1) {
        reportError(new Error("Multiple tenant_id detected in employees"), "org.overtime_settings.resolve_tenant.multiple_employee_tenants", {
          user_id: user.id,
          tenant_ids: employeeTenantIds,
        });
      }

      setTenantId(employeeTenantIds[0]);
    } catch (error) {
      const errorRef = reportError(error, "org.overtime_settings.resolve_tenant");
      const message = appendErrorReference("Gagal menentukan tenant organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setTenantId(undefined);
    } finally {
      setIsRetrying(false);
      setTenantReady(true);
    }
  };

  useEffect(() => {
    void fetchTenantId();
  }, []);

  const { settings, isLoading, saveSettings } = useOvertimeSettings(tenantId);

  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    is_enabled: true,
    min_hours: 1,
    max_hours_per_day: 4,
    max_hours_per_month: 40,
    requires_approval: true,
    rate_multiplier: 1.5,
    weekend_rate_multiplier: 2.0,
    holiday_rate_multiplier: 2.5,
    allow_multi_date_request: true,
    max_dates_per_request: 10,
    auto_reject_after_days: 3,
    notes: "",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        is_enabled: settings.is_enabled,
        min_hours: settings.min_hours,
        max_hours_per_day: settings.max_hours_per_day,
        max_hours_per_month: settings.max_hours_per_month,
        requires_approval: settings.requires_approval,
        rate_multiplier: settings.rate_multiplier,
        weekend_rate_multiplier: settings.weekend_rate_multiplier,
        holiday_rate_multiplier: settings.holiday_rate_multiplier,
        allow_multi_date_request: settings.allow_multi_date_request,
        max_dates_per_request: settings.max_dates_per_request,
        auto_reject_after_days: settings.auto_reject_after_days,
        notes: settings.notes || "",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await withTimeout(
        saveSettings(formData),
        SAVE_SETTINGS_TIMEOUT_MS,
        "Penyimpanan pengaturan lembur timeout."
      );
    } catch (error) {
      const errorRef = reportError(error, "org.overtime_settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan lembur", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (!tenantReady || isLoading) {
    return (
      <OrganizationLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pengaturan Lembur</h1>
            <p className="text-sm text-muted-foreground">Konfigurasi aturan lembur organisasi</p>
          </div>
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6 max-w-3xl">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data pengaturan lembur...
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchTenantId()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Coba Lagi
            </Button>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengaturan Lembur</h1>
          <p className="text-sm text-muted-foreground">Konfigurasi aturan dan kebijakan lembur</p>
        </div>
         {/* Enable/Disable */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Timer className="h-4 w-4" />
               Status Fitur Lembur
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="flex items-center justify-between">
               <div>
                 <Label>Aktifkan Fitur Lembur</Label>
                 <p className="text-sm text-muted-foreground">
                   Pegawai dapat mengajukan lembur jika diaktifkan
                 </p>
               </div>
               <Switch
                 checked={formData.is_enabled}
                 onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
               />
             </div>
           </CardContent>
         </Card>
 
         {/* Time Limits */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Clock className="h-4 w-4" />
               Batasan Waktu
             </CardTitle>
             <CardDescription>Atur batasan jam lembur</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                 <Label>Minimum Jam per Request</Label>
                 <Input
                   type="number"
                   step="0.5"
                   value={formData.min_hours}
                   onChange={(e) => setFormData({ ...formData, min_hours: parseFloat(e.target.value) })}
                   min={0.5}
                   max={8}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Maksimum Jam per Hari</Label>
                 <Input
                   type="number"
                   step="0.5"
                   value={formData.max_hours_per_day}
                   onChange={(e) => setFormData({ ...formData, max_hours_per_day: parseFloat(e.target.value) })}
                   min={1}
                   max={12}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Maksimum Jam per Bulan</Label>
                 <Input
                   type="number"
                   value={formData.max_hours_per_month}
                   onChange={(e) => setFormData({ ...formData, max_hours_per_month: parseFloat(e.target.value) })}
                   min={1}
                   max={100}
                 />
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Rate Multipliers */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Percent className="h-4 w-4" />
               Pengali Tarif (Rate Multiplier)
             </CardTitle>
             <CardDescription>Untuk perhitungan upah lembur</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                 <Label>Hari Kerja (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Weekend (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.weekend_rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, weekend_rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Hari Libur (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.holiday_rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, holiday_rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Request Settings */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Calendar className="h-4 w-4" />
               Pengaturan Pengajuan
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
               <div>
                 <Label>Perlu Persetujuan Admin</Label>
                 <p className="text-sm text-muted-foreground">
                   Lembur memerlukan approval dari admin
                 </p>
               </div>
               <Switch
                 checked={formData.requires_approval}
                 onCheckedChange={(checked) => setFormData({ ...formData, requires_approval: checked })}
               />
             </div>
 
             <div className="flex items-center justify-between">
               <div>
                 <Label>Izinkan Multi-Tanggal</Label>
                 <p className="text-sm text-muted-foreground">
                   Pegawai bisa ajukan beberapa tanggal sekaligus
                 </p>
               </div>
               <Switch
                 checked={formData.allow_multi_date_request}
                 onCheckedChange={(checked) => setFormData({ ...formData, allow_multi_date_request: checked })}
               />
             </div>
 
             <div className="grid gap-4 md:grid-cols-2">
               <div className="space-y-2">
                 <Label>Maks. Tanggal per Pengajuan</Label>
                 <Input
                   type="number"
                   value={formData.max_dates_per_request}
                   onChange={(e) => setFormData({ ...formData, max_dates_per_request: parseInt(e.target.value) })}
                   min={1}
                   max={30}
                   disabled={!formData.allow_multi_date_request}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Auto-Reject Setelah (hari)</Label>
                 <Input
                   type="number"
                   value={formData.auto_reject_after_days}
                   onChange={(e) => setFormData({ ...formData, auto_reject_after_days: parseInt(e.target.value) })}
                   min={1}
                   max={14}
                 />
               </div>
             </div>
 
             <div className="space-y-2">
               <Label>Catatan Kebijakan</Label>
               <Textarea
                 value={formData.notes}
                 onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                 placeholder="Catatan atau kebijakan lembur organisasi..."
                 rows={3}
               />
             </div>
           </CardContent>
         </Card>
 
         <div className="flex justify-end">
           <Button onClick={handleSave} disabled={isSaving}>
             {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
             Simpan Pengaturan
           </Button>
         </div>

         <PageGlossarySection preset="org_schedule_overtime_settings" />
      </div>
    </OrganizationLayout>
  );
}
