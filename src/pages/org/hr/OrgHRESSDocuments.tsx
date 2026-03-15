import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchTenantHrEssPolicySettings } from "@/lib/hrEssPolicySettings";
import { resolveHrEssSessionEmployee } from "@/lib/hrEssSessionEmployee";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { FileCheck2, FileClock, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type ContractRow = Database["public"]["Tables"]["hr_contracts"]["Row"];

export default function OrgHRESSDocuments() {
  const [isLoading, setIsLoading] = useState(true);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [missingEmployee, setMissingEmployee] = useState(false);
  const [isDisabledByPolicy, setIsDisabledByPolicy] = useState(false);
  const [documentSource, setDocumentSource] = useState<"Kontrak Kerja" | "Dokumen HR">("Kontrak Kerja");
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/ess/documents");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setMissingEmployee(false);
    setIsDisabledByPolicy(false);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const essPolicy = await fetchTenantHrEssPolicySettings(tenantId);

      setDocumentSource(essPolicy.documentSource);
      if (!essPolicy.enableDocumentsView) {
        setIsDisabledByPolicy(true);
        setEmployeeName(null);
        setContracts([]);
        return;
      }

      const { employee } = await resolveHrEssSessionEmployee(tenantId);
      if (!employee) {
        setMissingEmployee(true);
        setEmployeeName(null);
        setContracts([]);
        return;
      }

      const { data, error } = await supabase
        .from("hr_contracts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("employee_id", employee.id)
        .order("start_date", { ascending: false });

      if (error) throw error;

      setEmployeeName(employee.name);
      setContracts((data || []) as ContractRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.ess.documents.fetch");
      toast.error(appendErrorReference("Gagal memuat dokumen ESS", ref));
      setEmployeeName(null);
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const active = contracts.filter((item) => item.status.toLowerCase() === "active").length;
    const draft = contracts.filter((item) => item.status.toLowerCase() === "draft").length;
    const ended = contracts.filter((item) => ["ended", "terminated"].includes(item.status.toLowerCase())).length;

    return {
      total: contracts.length,
      active,
      draft,
      ended,
    };
  }, [contracts]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">ESS</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Dokumen Saya</h1>
          <p className="text-sm text-muted-foreground">
            Arsip dokumen personal dari sumber ESS tenant yang terhubung ke akun aktif.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Dokumen" value={summary.total} icon={FileText} description="Kontrak yang terarsip" />
          <StatCard title="Kontrak Aktif" value={summary.active} icon={FileCheck2} description="Masih berlaku" />
          <StatCard title="Draf" value={summary.draft} icon={FileClock} description="Belum final" />
          <StatCard title="Berakhir" value={summary.ended} icon={ShieldCheck} description="Perlu referensi historis" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Cakupan Dokumen ESS</CardTitle>
                <CardDescription>
                  Saat ini ESS dokumen memakai baseline tenant dengan sumber aktif: {documentSource}.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/contracts">Buka Kontrak Kerja</OrgHRContextLink>
                </Button>
                <Button asChild size="sm">
                  <OrgHRContextLink to="/org/hr/documents">Buka Dokumen HR</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <InfoTile label="Pemilik Arsip" value={employeeName || "-"} />
            <InfoTile label="Repository Aktif" value={documentSource} />
            <InfoTile
              label="Dokumen Lain"
              value={documentSource === "Dokumen HR" ? "Baseline tenant membuka arsip Dokumen HR." : "Masih mengikuti roadmap HR"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arsip Kontrak Pribadi</CardTitle>
            <CardDescription>
              Kontrak yang terkait langsung dengan pegawai yang sedang login. Baseline sumber aktif: {documentSource}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : isDisabledByPolicy ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Tampilan dokumen ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.
              </div>
            ) : missingEmployee ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Akun ini belum terhubung ke data pegawai tenant aktif. Dokumen personal belum dapat ditampilkan.
              </div>
            ) : contracts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada kontrak pribadi yang terarsip.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Kontrak</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Masa Berlaku</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.contract_number || "-"}</TableCell>
                      <TableCell>{item.contract_type}</TableCell>
                      <TableCell>
                        {formatDate(item.start_date)}
                        {item.end_date ? ` s/d ${formatDate(item.end_date)}` : " (tanpa akhir)"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status.toLowerCase() === "active" ? "default" : "secondary"}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{item.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID");
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-indigo-600" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
