import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Users, CreditCard, Loader2, CheckCircle2, Info } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface BillingPolicySettingsProps {
  tenantId: string;
  currentMode?: string;
  onUpdate?: () => void;
}
const BILLING_POLICY_READ_TIMEOUT_MS = 12000;
const BILLING_POLICY_WRITE_TIMEOUT_MS = 15000;
const BILLING_POLICY_MAX_RETRIES = 2;

export function BillingPolicySettings({ tenantId, currentMode, onUpdate }: BillingPolicySettingsProps) {
  const [billingMode, setBillingMode] = useState(currentMode || "centralized");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCurrentMode = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("billing_mode")
              .eq("id", tenantId)
              .single(),
            BILLING_POLICY_READ_TIMEOUT_MS,
            "Permintaan mode billing tenant timeout."
          ),
        {
          maxRetries: BILLING_POLICY_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setBillingMode(data?.billing_mode || "centralized");
    } catch (err) {
      const errorRef = reportError(err, "admin.billing.policy.fetch_mode", { tenant_id: tenantId });
      setLoadError(appendErrorReference("Gagal memuat mode billing tenant", errorRef));
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (currentMode) {
      setBillingMode(currentMode);
    } else {
      fetchCurrentMode();
    }
  }, [currentMode, fetchCurrentMode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatePayload: TablesUpdate<"tenants"> = {
        billing_mode: billingMode,
        billing_mode_updated_at: new Date().toISOString(),
      };

      const { error } = await withTimeout(
        supabase
          .from("tenants")
          .update(updatePayload)
          .eq("id", tenantId),
        BILLING_POLICY_WRITE_TIMEOUT_MS,
        "Simpan kebijakan billing timeout."
      );

      if (error) throw error;
      toast.success("Kebijakan pembayaran berhasil disimpan");
      onUpdate?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const errorRef = reportError(err, "admin.billing.policy.save", { tenant_id: tenantId, billing_mode: billingMode });
      toast.error(appendErrorReference("Gagal menyimpan: " + message, errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
            <div className="rounded-full bg-slate-100 p-3">
              <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            </div>
            <p className="text-base font-medium text-slate-900">Memuat kebijakan pembayaran</p>
            <p className="text-sm text-muted-foreground">
              Konfigurasi model penagihan tenant sedang diproses.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Kebijakan Pembayaran
        </CardTitle>
        <CardDescription>
          Pilih model pembayaran langganan untuk organisasi ini
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat kebijakan billing...
          </div>
        )}
        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchCurrentMode()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <RadioGroup value={billingMode} onValueChange={setBillingMode} className="space-y-4">
          {/* Centralized */}
          <label
            className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              billingMode === "centralized"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <RadioGroupItem value="centralized" className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-5 h-5 text-primary" />
                <span className="font-semibold">Billing Terpusat</span>
                {billingMode === "centralized" && (
                  <Badge variant="default" className="text-xs">Aktif</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Pembayaran lisensi dilakukan oleh organisasi untuk semua anggota. 
                Admin organisasi yang bertanggung jawab atas seluruh biaya langganan.
              </p>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  Cocok untuk instansi pemerintah, perusahaan besar, dan organisasi dengan anggaran terpusat
                </p>
              </div>
            </div>
          </label>

          {/* Individual */}
          <label
            className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              billingMode === "individual"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <RadioGroupItem value="individual" className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-primary" />
                <span className="font-semibold">Billing Mandiri</span>
                {billingMode === "individual" && (
                  <Badge variant="default" className="text-xs">Aktif</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Pembayaran dilakukan oleh masing-masing pegawai secara individu. 
                Setiap pegawai bertanggung jawab atas biaya langganannya sendiri.
              </p>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  Cocok untuk komunitas, freelancer, atau organisasi dengan anggaran desentralisasi
                </p>
              </div>
            </div>
          </label>
        </RadioGroup>

        {/* Info */}
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Perubahan kebijakan ini akan mempengaruhi alur checkout dan tampilan billing 
              untuk seluruh anggota organisasi. Pastikan semua pihak telah diinformasikan sebelum mengubah.
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Simpan Kebijakan"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
