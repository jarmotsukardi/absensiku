import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

const EMPTY_COUNTS: OrgOnboardingCounts = {
  opd: 0,
  work_units: 0,
  positions: 0,
  offices: 0,
  work_hours: 0,
  absence_limits: 0,
  announcements: 0,
};

const MODULE_LINKS: Array<{
  key: keyof OrgOnboardingCounts;
  label: string;
  path: string;
}> = [
  { key: "opd", label: "Data OPD", path: "/org/master/opd" },
  { key: "work_units", label: "Satuan Kerja", path: "/org/master/work-units" },
  { key: "positions", label: "Jabatan", path: "/org/master/positions" },
  { key: "offices", label: "Lokasi Kerja", path: "/org/master/work-locations" },
  { key: "work_hours", label: "Jam Kerja", path: "/org/schedule/work-hours" },
  { key: "absence_limits", label: "Batas Absen", path: "/org/schedule/absence-limits" },
  { key: "announcements", label: "Pengumuman", path: "/org/news" },
];

export default function OrgOnboardingSetup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [counts, setCounts] = useState<OrgOnboardingCounts>(EMPTY_COUNTS);
  const [templateLabel, setTemplateLabel] = useState<string>("Template Setup Awal");
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<OrgOnboardingApplyResult | null>(null);

  const configuredModules = useMemo(
    () => MODULE_LINKS.filter((item) => counts[item.key] > 0).length,
    [counts]
  );

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) {
        toast.error("Tenant organisasi tidak ditemukan. Silakan login ulang.");
        navigate("/org/login", { replace: true });
        return;
      }
      setTenantId(resolvedTenantId);

      const [{ template, updatedAt }, tenantCounts] = await Promise.all([
        loadOrgOnboardingTemplate(),
        fetchOrgOnboardingCounts(resolvedTenantId),
      ]);

      setTemplateLabel(template.label);
      setTemplateUpdatedAt(updatedAt);
      setCounts(tenantCounts);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.onboarding.fetch_data");
      toast.error(appendErrorReference("Gagal memuat data onboarding organisasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleApplyTemplate = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum tersedia. Muat ulang halaman.");
      return;
    }

    try {
      setIsApplying(true);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user?.id || null;

      let actorEmployeeId: string | null = null;
      if (userId) {
        const { data: employeeData } = await supabase
          .from("employees")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle();
        actorEmployeeId = employeeData?.id || null;
      }

      const result = await applyOrgOnboardingTemplateToTenant(tenantId, { actorEmployeeId });
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
              <Badge variant={configuredModules === MODULE_LINKS.length ? "default" : "secondary"}>
                Modul Siap: {configuredModules}/{MODULE_LINKS.length}
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
                  {MODULE_LINKS.map((item) => {
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
