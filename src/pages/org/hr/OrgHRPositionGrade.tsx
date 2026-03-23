import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Briefcase, Layers, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { toast } from "sonner";

type PositionRow = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean | null;
};

type GroupingRow = {
  label: string;
  total: number;
};

type EmployeeLite = {
  employee_category: string | null;
  golongan: string | null;
};

export default function OrgHRPositionGrade() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/position-grade");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [positionRes, employeeRes] = await Promise.all([
        supabase
          .from("positions")
          .select("id, name, is_active")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true })
          .limit(200),
        supabase.from("employees").select("employee_category, golongan").eq("tenant_id", tenantId),
      ]);
      if (positionRes.error) throw positionRes.error;
      if (employeeRes.error) throw employeeRes.error;

      setPositions(((positionRes.data || []) as Array<Omit<PositionRow, "code">>).map((item) => ({ ...item, code: null })));
      setEmployees((employeeRes.data || []) as EmployeeLite[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.position_grade.fetch");
      toast.error(appendErrorReference("Gagal memuat data jabatan/grade", ref));
      setPositions([]);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const categoryRows = useMemo<GroupingRow[]>(() => {
    const map = new Map<string, number>();
    employees.forEach((item) => {
      const key = (item.employee_category || "Belum Diisi").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [employees]);

  const golonganRows = useMemo<GroupingRow[]>(() => {
    const map = new Map<string, number>();
    employees.forEach((item) => {
      const key = (item.golongan || "Belum Diisi").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  }, [employees]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Hubungan Kerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Jabatan dan Grade</h1>
          <p className="text-sm text-muted-foreground">
            Standarisasi struktur karier dan segmentasi pegawai untuk kebutuhan HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat kelola klasifikasi dan konfigurasi" : access.canEdit ? "admin dapat kelola klasifikasi" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Jabatan" value={positions.length} icon={Briefcase} />
          <StatCard title="Kategori Pegawai" value={categoryRows.length} icon={Users} />
          <StatCard title="Golongan" value={golonganRows.length} icon={Layers} />
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Master Klasifikasi HR</CardTitle>
            <CardDescription>
              Data klasifikasi ditampilkan khusus untuk kebutuhan HR tanpa menampilkan tautan ke workspace absensi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="jabatan">
              <TabsList>
                <TabsTrigger value="jabatan">Daftar Jabatan</TabsTrigger>
                <TabsTrigger value="kategori">Kategori Pegawai</TabsTrigger>
                <TabsTrigger value="golongan">Golongan</TabsTrigger>
              </TabsList>
              <TabsContent value="jabatan">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat data jabatan...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Jabatan</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.code || "-"}</TableCell>
                          <TableCell>{item.is_active === false ? "Nonaktif" : "Aktif"}</TableCell>
                        </TableRow>
                      ))}
                      {positions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                            Belum ada data jabatan.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
              <TabsContent value="kategori">
                <GroupingTable rows={categoryRows} emptyLabel="Belum ada kategori pegawai terpakai." />
              </TabsContent>
              <TabsContent value="golongan">
                <GroupingTable rows={golonganRows} emptyLabel="Belum ada golongan pegawai terpakai." />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><Icon className="h-4 w-4 text-muted-foreground" /></CardContent>
    </Card>
  );
}

function GroupingTable({ rows, emptyLabel }: { rows: GroupingRow[]; emptyLabel: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead className="text-right">Jumlah Pegawai</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.label}>
            <TableCell className="font-medium">{item.label}</TableCell>
            <TableCell className="text-right">{item.total}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
