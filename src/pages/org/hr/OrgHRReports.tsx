import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, FileText, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type EmployeeLite = {
  id: string;
  is_active: boolean | null;
  employee_category: string | null;
  golongan: string | null;
};

type ContractLite = {
  id: string;
  status: string;
  end_date: string | null;
};

const toDateOnly = (dateValue: string | null): Date | null => {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export default function OrgHRReports() {
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [contracts, setContracts] = useState<ContractLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [employeeRes, contractRes] = await Promise.all([
        supabase.from("employees").select("id, is_active, employee_category, golongan").eq("tenant_id", tenantId),
        supabase.from("hr_contracts").select("id, status, end_date").eq("tenant_id", tenantId),
      ]);
      if (employeeRes.error) throw employeeRes.error;
      if (contractRes.error) throw contractRes.error;

      setEmployees((employeeRes.data || []) as EmployeeLite[]);
      setContracts((contractRes.data || []) as ContractLite[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.reports.fetch");
      toast.error(appendErrorReference("Gagal memuat laporan HR", ref));
      setEmployees([]);
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const headcount = employees.length;
  const activeCount = employees.filter((item) => item.is_active === true).length;
  const inactiveCount = employees.filter((item) => item.is_active === false).length;
  const unknownActiveFlagCount = employees.filter((item) => item.is_active == null).length;
  const activeContracts = contracts.filter((item) => item.status.toLowerCase() === "active").length;
  const endingSoonContracts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);
    return contracts.filter((item) => {
      if (item.status.toLowerCase() !== "active") return false;
      const end = toDateOnly(item.end_date);
      return Boolean(end && end >= today && end <= next30);
    }).length;
  }, [contracts]);
  const overdueContracts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return contracts.filter((item) => {
      if (item.status.toLowerCase() !== "active") return false;
      const end = toDateOnly(item.end_date);
      return Boolean(end && end < today);
    }).length;
  }, [contracts]);

  const employeeCategorySummary = useMemo(() => {
    const map = new Map<string, number>();
    employees.forEach((item) => {
      const key = (item.employee_category || "Belum Diisi").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [employees]);

  const contractStatusSummary = useMemo(() => {
    const map = new Map<string, number>();
    contracts.forEach((item) => {
      const key = (item.status || "unknown").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total || a.status.localeCompare(b.status));
  }, [contracts]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Reports</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Laporan HR</h1>
          <p className="text-sm text-muted-foreground">Pantau kesehatan data HR dan status kontrak pegawai.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-7">
          <Stat title="Headcount" value={headcount} />
          <Stat title="Pegawai Aktif" value={activeCount} />
          <Stat title="Pegawai Nonaktif" value={inactiveCount} />
          <Stat title="Status Aktif Tidak Diisi" value={unknownActiveFlagCount} />
          <Stat title="Kontrak Aktif" value={activeContracts} />
          <Stat title="Kontrak Berakhir ≤30 Hari" value={endingSoonContracts} />
          <Stat title="Kontrak Lewat Jatuh Tempo" value={overdueContracts} />
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Tab Laporan</CardTitle>
            <CardDescription>Gunakan tab sesuai kebutuhan monitoring harian HR.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="headcount">
              <TabsList>
                <TabsTrigger value="headcount">Headcount</TabsTrigger>
                <TabsTrigger value="kontrak">Kontrak</TabsTrigger>
                <TabsTrigger value="operasional">Operasional</TabsTrigger>
              </TabsList>
              <TabsContent value="headcount" className="space-y-3">
                <InfoRow icon={Users} title="Total Pegawai" description={`Total data pegawai: ${headcount}`} />
                <InfoRow icon={Users} title="Pegawai Aktif" description={`Pegawai aktif: ${activeCount}`} />
                <InfoRow icon={Users} title="Pegawai Nonaktif" description={`Pegawai nonaktif: ${inactiveCount}`} />
                <InfoRow
                  icon={Users}
                  title="Status Aktif Belum Ditentukan"
                  description={`Data pegawai dengan is_active null: ${unknownActiveFlagCount}`}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Drill-down Kategori Pegawai</CardTitle>
                    <CardDescription>Distribusi headcount berdasarkan kategori pegawai.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="text-right">Jumlah Pegawai</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeCategorySummary.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Belum ada data kategori pegawai.</TableCell>
                          </TableRow>
                        ) : (
                          employeeCategorySummary.map((row) => (
                            <TableRow key={row.label}>
                              <TableCell>{row.label}</TableCell>
                              <TableCell className="text-right">{row.total}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="kontrak" className="space-y-3">
                <InfoRow icon={FileText} title="Kontrak Aktif" description={`Kontrak aktif saat ini: ${activeContracts}`} />
                <InfoRow icon={FileText} title="Kontrak Segera Berakhir" description={`Berakhir <= 30 hari: ${endingSoonContracts}`} />
                <InfoRow icon={FileText} title="Kontrak Lewat Jatuh Tempo" description={`Aktif namun melewati end date: ${overdueContracts}`} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Drill-down Status Kontrak</CardTitle>
                    <CardDescription>Distribusi kontrak berdasarkan status saat ini.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Jumlah Kontrak</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractStatusSummary.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Belum ada data kontrak.</TableCell>
                          </TableRow>
                        ) : (
                          contractStatusSummary.map((row) => (
                            <TableRow key={row.status}>
                              <TableCell className="capitalize">{row.status}</TableCell>
                              <TableCell className="text-right">{row.total}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="operasional" className="space-y-3">
                <InfoRow icon={BarChart3} title="Mutasi Pegawai" description="Analisis mutasi lintas unit/jabatan tersedia di Laporan Mutasi." />
                <InfoRow icon={BarChart3} title="Permohonan SDM" description="Pantau cuti, izin, dan lembur dari tab Laporan Permohonan." />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {isLoading ? <p className="text-sm text-muted-foreground">Memuat laporan HR...</p> : null}
      </div>
    </OrganizationLayout>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function InfoRow({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
