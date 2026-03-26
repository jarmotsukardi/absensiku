import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { supabase } from "@/integrations/supabase/client";
import {
  applyOrgOnboardingTemplateToTenant,
  fetchOrgOnboardingCounts,
  loadOrgOnboardingTemplate,
  type OrgOnboardingApplyResult,
  type OrgOnboardingCounts,
} from "@/lib/orgOnboardingTemplates";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { CheckCircle2, Loader2, RefreshCcw, Sparkles, Wand2 } from "lucide-react";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  emitOrgMasterDataModulesUpdated,
  fetchTenantOrgMasterDataModules,
  ORG_MASTER_DATA_MODULE_OPTIONS,
  saveTenantOrgMasterDataModules,
  type OrgMasterDataModuleKey,
} from "@/lib/orgMasterDataModules";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  emitOrgWorkspaceModulesUpdated,
  fetchTenantOrgWorkspaceModules,
  saveTenantOrgWorkspaceModules,
  type OrgWorkspaceModuleKey,
} from "@/lib/orgWorkspaceModules";
import {
  ORG_ONBOARDING_REQUIRED_STEPS,
  getOrgOnboardingModuleTotal,
  getOrgOnboardingReadyModules,
  isOrgOnboardingComplete,
} from "@/lib/orgOnboardingProgress";

const EMPTY_COUNTS: OrgOnboardingCounts = {
  opd: 0,
  work_units: 0,
  positions: 0,
  offices: 0,
  work_hours: 0,
  absence_limits: 0,
  announcements: 0,
};

export default function OrgOnboardingSetup() {
  const ORG_ONBOARDING_QUERY_TIMEOUT_MS = 15000;
  const ORG_ONBOARDING_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [counts, setCounts] = useState<OrgOnboardingCounts>(EMPTY_COUNTS);
  const [templateLabel, setTemplateLabel] = useState<string>("Template Setup Awal");
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<OrgOnboardingApplyResult | null>(null);
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);
  const [isSavingMasterDataModules, setIsSavingMasterDataModules] = useState(false);
  const [workspaceModules, setWorkspaceModules] = useState(DEFAULT_ORG_WORKSPACE_MODULES);
  const [isSavingWorkspaceModules, setIsSavingWorkspaceModules] = useState(false);

  const activeChecklistModules = ORG_ONBOARDING_REQUIRED_STEPS;

  const configuredModules = useMemo(
    () => getOrgOnboardingReadyModules(counts),
    [counts]
  );
  const activeMasterDataModuleCount = useMemo(
    () => ORG_MASTER_DATA_MODULE_OPTIONS.filter((item) => masterDataModules[item.key]).length,
    [masterDataModules]
  );
  const activeWorkspaceModuleCount = useMemo(
    () => Object.values(workspaceModules).filter(Boolean).length,
    [workspaceModules]
  );
  const isChecklistComplete = useMemo(() => isOrgOnboardingComplete(counts), [counts]);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      const resolvedTenantId = await withExponentialBackoff(
        () =>
          withTimeout(
            resolveOrgTenantId(),
            ORG_ONBOARDING_QUERY_TIMEOUT_MS,
            "org.onboarding.refresh.resolve_tenant timeout",
          ),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (!resolvedTenantId) {
        toast.error("Tenant organisasi tidak ditemukan. Silakan login ulang.");
        navigate("/org/login", { replace: true });
        return;
      }
      setTenantId(resolvedTenantId);

      const [{ template, updatedAt }, tenantCounts, moduleSetting, workspaceSetting] = await withExponentialBackoff(
        () =>
          Promise.all([
            withTimeout(
              loadOrgOnboardingTemplate(),
              ORG_ONBOARDING_QUERY_TIMEOUT_MS,
              "org.onboarding.refresh.load_template timeout",
            ),
            withTimeout(
              fetchOrgOnboardingCounts(resolvedTenantId),
              ORG_ONBOARDING_QUERY_TIMEOUT_MS,
              "org.onboarding.refresh.fetch_counts timeout",
            ),
            withTimeout(
              fetchTenantOrgMasterDataModules(resolvedTenantId),
              ORG_ONBOARDING_QUERY_TIMEOUT_MS,
              "org.onboarding.refresh.fetch_master_data_modules timeout",
            ),
            withTimeout(
              fetchTenantOrgWorkspaceModules(resolvedTenantId),
              ORG_ONBOARDING_QUERY_TIMEOUT_MS,
              "org.onboarding.refresh.fetch_workspace_modules timeout",
            ),
          ]),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      setTemplateLabel(template.label);
      setTemplateUpdatedAt(updatedAt);
      setCounts(tenantCounts);
      setMasterDataModules(moduleSetting.modules);
      setWorkspaceModules(workspaceSetting.modules);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.onboarding.fetch_data");
      const message = appendErrorReference("Gagal memuat data onboarding organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [navigate]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleToggleMasterDataModule = (key: OrgMasterDataModuleKey, checked: boolean) => {
    setMasterDataModules((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSaveMasterDataModules = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum tersedia. Muat ulang halaman.");
      return;
    }

    try {
      setIsSavingMasterDataModules(true);
      setIsRetrying(false);
      const savedModules = await withExponentialBackoff(
        () =>
          withTimeout(
            saveTenantOrgMasterDataModules(tenantId, masterDataModules),
            ORG_ONBOARDING_QUERY_TIMEOUT_MS,
            "org.onboarding.save_master_data_modules timeout",
          ),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      setMasterDataModules(savedModules);
      emitOrgMasterDataModulesUpdated(savedModules);
      toast.success("Preferensi modul master data berhasil disimpan.");
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.onboarding.save_master_data_modules", {
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menyimpan preferensi modul master data", errorRef));
    } finally {
      setIsSavingMasterDataModules(false);
      setIsRetrying(false);
    }
  };

  const handleToggleWorkspaceModule = (key: OrgWorkspaceModuleKey, checked: boolean) => {
    setWorkspaceModules((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSaveWorkspaceModules = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum tersedia. Muat ulang halaman.");
      return;
    }

    try {
      setIsSavingWorkspaceModules(true);
      setIsRetrying(false);
      const savedModules = await withExponentialBackoff(
        () =>
          withTimeout(
            saveTenantOrgWorkspaceModules(tenantId, workspaceModules),
            ORG_ONBOARDING_QUERY_TIMEOUT_MS,
            "org.onboarding.save_workspace_modules timeout",
          ),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      setWorkspaceModules(savedModules);
      emitOrgWorkspaceModulesUpdated(savedModules);
      toast.success("Preferensi workspace HR/Payroll berhasil disimpan.");
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.onboarding.save_workspace_modules", {
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menyimpan preferensi workspace HR/Payroll", errorRef));
    } finally {
      setIsSavingWorkspaceModules(false);
      setIsRetrying(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum tersedia. Muat ulang halaman.");
      return;
    }

    try {
      setIsApplying(true);
      setIsRetrying(false);
      const { data: userData, error: userError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ORG_ONBOARDING_QUERY_TIMEOUT_MS,
            "org.onboarding.apply.get_user timeout",
          ),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (userError) throw userError;
      if (!userData.user) throw new Error("Sesi user tidak ditemukan.");

      const result = await withExponentialBackoff(
        () =>
          withTimeout(
            applyOrgOnboardingTemplateToTenant(tenantId),
            ORG_ONBOARDING_QUERY_TIMEOUT_MS,
            "org.onboarding.apply.template timeout",
          ),
        {
          maxRetries: ORG_ONBOARDING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      setApplyResult(result);
      setCounts(result.counts_after);

      const insertedTotal = result.reports.reduce((acc, row) => acc + row.inserted, 0);
      if (insertedTotal > 0) {
        toast.success(`Template onboarding berhasil diterapkan (${insertedTotal} data baru).`);
      } else {
        toast.info("Tidak ada data baru yang ditambahkan. Mayoritas modul sudah terisi.");
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.onboarding.apply_template", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menerapkan template onboarding", errorRef));
    } finally {
      setIsApplying(false);
      setIsRetrying(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Setup Awal Organisasi
          </h1>
          <p className="text-muted-foreground">
            Panduan pengisian pertama kali untuk member/tenant baru agar modul /org siap digunakan.
          </p>
        </div>

        <Card className={isChecklistComplete ? "border-emerald-300/60 bg-emerald-50/40" : "border-amber-300/60 bg-amber-50/40"}>
          <CardHeader>
            <CardTitle>Urutan Setup yang Disarankan</CardTitle>
            <CardDescription>
              Fokus dulu ke 5 fondasi absensi. Selama checklist ini belum lengkap, dashboard utama akan tetap mengarahkan admin ke halaman ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isChecklistComplete ? "default" : "secondary"}>
                Progress Inti: {configuredModules}/{getOrgOnboardingModuleTotal()}
              </Badge>
              <Badge variant="outline">Wajib sebelum dashboard utama dibuka penuh</Badge>
            </div>
            <div className="space-y-3">
              {ORG_ONBOARDING_REQUIRED_STEPS.map((step, index) => {
                const ready = counts[step.key] > 0;
                return (
                  <div key={step.key} className="flex items-start justify-between gap-4 rounded-md border bg-background/80 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {index + 1}. {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={ready ? "default" : "secondary"}>{ready ? "Siap" : "Wajib"}</Badge>
                      <Button variant="outline" size="sm" onClick={() => navigate(step.path)}>
                        Buka
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Setelah lima langkah ini siap, lanjutkan tambah minimal satu pegawai dan buat rekam absensi awal agar tenant lebih cepat benar-benar operasional.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Template Admin Aktif
            </CardTitle>
            <CardDescription>
              Template ini dipakai untuk mengisi modul yang masih kosong tanpa menimpa data yang sudah ada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{templateLabel}</Badge>
              <Badge variant={configuredModules === activeChecklistModules.length ? "default" : "secondary"}>
                Modul Siap: {configuredModules}/{activeChecklistModules.length}
              </Badge>
              <Badge variant={activeWorkspaceModuleCount === 2 ? "default" : "secondary"}>
                Workspace Aktif: {activeWorkspaceModuleCount}/2
              </Badge>
            </div>
            {templateUpdatedAt && (
              <p className="text-xs text-muted-foreground">
                Template terakhir diperbarui:{" "}
                {format(new Date(templateUpdatedAt), "dd MMM yyyy, HH:mm:ss", { locale: idLocale })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshData()} disabled={isLoading || isApplying}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
              <Button onClick={() => void handleApplyTemplate()} disabled={isLoading || isApplying}>
                {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Terapkan Template Admin (Aman)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pilihan Modul Master Data</CardTitle>
            <CardDescription>
              Pilih modul yang ingin digunakan. Jika modul dimatikan, submenu terkait akan disembunyikan dari sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={activeMasterDataModuleCount === ORG_MASTER_DATA_MODULE_OPTIONS.length ? "default" : "secondary"}>
                Modul Aktif: {activeMasterDataModuleCount}/{ORG_MASTER_DATA_MODULE_OPTIONS.length}
              </Badge>
              <Badge variant="outline">Bisa diubah kapan saja</Badge>
            </div>

            <div className="space-y-3">
              {ORG_MASTER_DATA_MODULE_OPTIONS.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => navigate(item.path)}
                      disabled={!masterDataModules[item.key]}
                    >
                      Buka modul
                    </Button>
                  </div>
                  <Switch
                    checked={masterDataModules[item.key]}
                    onCheckedChange={(checked) => handleToggleMasterDataModule(item.key, checked)}
                    aria-label={`Aktifkan modul ${item.label}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void refreshData()}
                disabled={isLoading || isApplying || isSavingMasterDataModules}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Muat Ulang
              </Button>
              <Button
                onClick={() => void handleSaveMasterDataModules()}
                disabled={isLoading || isApplying || isSavingMasterDataModules}
              >
                {isSavingMasterDataModules ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Simpan Preferensi Modul
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Jika nanti butuh modul yang sempat dimatikan, aktifkan kembali di halaman ini lalu submenu akan muncul lagi.
            </p>
            <p className="text-xs text-muted-foreground">Checklist setup fokus ke 5 modul inti operasional.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pilihan Workspace Aplikasi</CardTitle>
            <CardDescription>
              Kontrol visibilitas area kerja HR dan Payroll. Switcher header + sidebar akan mengikuti pengaturan ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={activeWorkspaceModuleCount === 2 ? "default" : "secondary"}>
                Workspace Aktif: {activeWorkspaceModuleCount}/2
              </Badge>
              <Badge variant="outline">Sinkron ke App Switcher + Sidebar</Badge>
            </div>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Workspace HR</p>
                  <p className="text-xs text-muted-foreground">Aktifkan area kerja `/org/hr` untuk operasi HR.</p>
                </div>
                <Switch
                  checked={workspaceModules.hr}
                  onCheckedChange={(checked) => handleToggleWorkspaceModule("hr", checked)}
                  aria-label="Aktifkan workspace HR"
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Workspace Payroll</p>
                  <p className="text-xs text-muted-foreground">Aktifkan area kerja `/org/payroll` untuk operasi Payroll.</p>
                </div>
                <Switch
                  checked={workspaceModules.payroll}
                  onCheckedChange={(checked) => handleToggleWorkspaceModule("payroll", checked)}
                  aria-label="Aktifkan workspace Payroll"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void refreshData()}
                disabled={isLoading || isApplying || isSavingWorkspaceModules}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Muat Ulang
              </Button>
              <Button
                onClick={() => void handleSaveWorkspaceModules()}
                disabled={isLoading || isApplying || isSavingWorkspaceModules}
              >
                {isSavingWorkspaceModules ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Simpan Workspace
              </Button>
            </div>
          </CardContent>
        </Card>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshData()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data setup awal...</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Checklist Setup Modul</CardTitle>
            <CardDescription>Klik modul untuk melengkapi data manual setelah template diterapkan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modul</TableHead>
                    <TableHead>Jumlah Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ORG_ONBOARDING_REQUIRED_STEPS.map((item) => {
                    const value = counts[item.key];
                    const ready = value > 0;
                    return (
                      <TableRow key={item.key}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell>{value}</TableCell>
                        <TableCell>
                          {ready ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Siap</Badge>
                          ) : (
                            <Badge variant="secondary">Belum Lengkap</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => navigate(item.path)}>
                            Buka Modul
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {applyResult && (
          <Card>
            <CardHeader>
              <CardTitle>Hasil Terapkan Template</CardTitle>
              <CardDescription>Ringkasan modul yang ditambah atau dilewati pada eksekusi terakhir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {applyResult.reports.map((row) => (
                <div key={row.module} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${row.skipped ? "text-muted-foreground" : "text-emerald-600"}`} />
                      <p className="text-sm font-semibold">{row.module}</p>
                    </div>
                    <Badge variant={row.skipped ? "secondary" : "default"}>
                      {row.skipped ? "Skipped" : `+${row.inserted}`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>
                </div>
              ))}
              <Separator />
              <p className="text-xs text-muted-foreground">
                Total sebelum: {JSON.stringify(applyResult.counts_before)} | sesudah:{" "}
                {JSON.stringify(applyResult.counts_after)}
              </p>
            </CardContent>
          </Card>
        )}

        <PageGlossarySection preset="org_onboarding_setup" />
      </div>
    </OrganizationLayout>
  );
}
