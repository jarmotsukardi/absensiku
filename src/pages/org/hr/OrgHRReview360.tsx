import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import {
  DEFAULT_HR_REVIEW360_SETTINGS,
  fetchTenantHrReview360Settings,
  saveTenantHrReview360Settings,
  type HrReview360Settings,
} from "@/lib/hrPerformanceSettings";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

export default function OrgHRReview360() {
  const [settings, setSettings] = useState<HrReview360Settings>(DEFAULT_HR_REVIEW360_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/review-360");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setSettings(await fetchTenantHrReview360Settings(tenantId));
    } catch (error) {
      const ref = reportError(error, "org.hr.review360.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan ulasan 360", ref));
      setSettings(DEFAULT_HR_REVIEW360_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalWeight = useMemo(
    () => settings.managerWeight + settings.peerWeight + settings.subordinateWeight + settings.selfWeight,
    [settings],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      await saveTenantHrReview360Settings(tenantId, settings);
      toast.success("Pengaturan ulasan 360 berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "org.hr.review360.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan ulasan 360", ref));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kinerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Ulasan 360</h1>
          <p className="text-sm text-muted-foreground">
            Atur baseline evaluasi multi-penilai agar bobot, anonimitas, dan jumlah penilai tetap konsisten per tenant.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Status" value={settings.enabled ? "Aktif" : "Nonaktif"} />
          <SummaryCard title="Anonim" value={settings.anonymousFeedback ? "Ya" : "Tidak"} />
          <SummaryCard title="Min. Rekan" value={`${settings.minPeerReviewers}`} />
          <SummaryCard title="Total Bobot" value={`${totalWeight}%`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi Ulasan 360</CardTitle>
            <CardDescription>Pastikan total bobot mendekati 100 agar scoring akhir tetap stabil.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : (
              <>
                <ToggleRow
                  testId="org-hr-review360-enabled"
                  label="Aktifkan Ulasan 360"
                  note="Gunakan evaluasi multi-penilai pada tenant ini."
                  checked={settings.enabled}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
                />
                <ToggleRow
                  testId="org-hr-review360-anonymous"
                  label="Anonimkan Umpan Balik"
                  note="Sembunyikan identitas penilai pada rekap umpan balik."
                  checked={settings.anonymousFeedback}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, anonymousFeedback: checked }))}
                />
                <ToggleRow
                  label="Wajib Penilaian Diri"
                  note="Pegawai wajib mengisi penilaian diri sendiri."
                  checked={settings.selfReviewRequired}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, selfReviewRequired: checked }))}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    testId="org-hr-review360-peer-count"
                    label="Minimal Penilai Rekan"
                    value={String(settings.minPeerReviewers)}
                    onChange={(value) => setSettings((prev) => ({ ...prev, minPeerReviewers: Number(value) || 0 }))}
                  />
                  <Field
                    testId="org-hr-review360-manager-weight"
                    label="Bobot Atasan (%)"
                    value={String(settings.managerWeight)}
                    onChange={(value) => setSettings((prev) => ({ ...prev, managerWeight: Number(value) || 0 }))}
                  />
                  <Field
                    label="Bobot Rekan (%)"
                    value={String(settings.peerWeight)}
                    onChange={(value) => setSettings((prev) => ({ ...prev, peerWeight: Number(value) || 0 }))}
                  />
                  <Field
                    label="Bobot Bawahan (%)"
                    value={String(settings.subordinateWeight)}
                    onChange={(value) => setSettings((prev) => ({ ...prev, subordinateWeight: Number(value) || 0 }))}
                  />
                  <Field
                    label="Bobot Penilaian Diri (%)"
                    value={String(settings.selfWeight)}
                    onChange={(value) => setSettings((prev) => ({ ...prev, selfWeight: Number(value) || 0 }))}
                  />
                </div>

                <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                  Total bobot saat ini: <span className="font-semibold">{totalWeight}%</span>
                  {totalWeight === 100 ? " dan sudah seimbang." : " dan masih perlu disesuaikan agar mencapai 100%."}
                </div>

                {access.canConfigure ? (
                  <div className="flex gap-2">
                    <Button onClick={() => void handleSave()} disabled={isSaving}>
                      Simpan Pengaturan
                    </Button>
                    <Button variant="outline" onClick={() => void loadData()} disabled={isSaving}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Muat Ulang
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function ToggleRow({
  testId,
  label,
  note,
  checked,
  onCheckedChange,
}: {
  testId?: string;
  label: string;
  note: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <Switch data-testid={testId} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Field({
  testId,
  label,
  value,
  onChange,
}: {
  testId?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input data-testid={testId} type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
