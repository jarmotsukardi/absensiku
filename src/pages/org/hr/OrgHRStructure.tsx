import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, MapPin, Network, FolderTree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { toast } from "sonner";

type NamedRow = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean | null;
};

export default function OrgHRStructure() {
  const [opdRows, setOpdRows] = useState<NamedRow[]>([]);
  const [workUnitRows, setWorkUnitRows] = useState<NamedRow[]>([]);
  const [officeRows, setOfficeRows] = useState<NamedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/structure");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const [opdRes, unitRes, officeRes] = await Promise.all([
        supabase.from("opd").select("id, name, code, is_active").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(50),
        supabase.from("work_units").select("id, name, code, is_active").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(50),
        supabase.from("offices").select("id, name, is_active").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(50),
      ]);
      if (opdRes.error) throw opdRes.error;
      if (unitRes.error) throw unitRes.error;
      if (officeRes.error) throw officeRes.error;
      setOpdRows((opdRes.data || []) as NamedRow[]);
      setWorkUnitRows((unitRes.data || []) as NamedRow[]);
      setOfficeRows(((officeRes.data || []) as Array<Omit<NamedRow, "code">>).map((item) => ({ ...item, code: null })));
    } catch (error) {
      const ref = reportError(error, "org.hr.structure.fetch");
      toast.error(appendErrorReference("Gagal memuat struktur organisasi HR", ref));
      setOpdRows([]);
      setWorkUnitRows([]);
      setOfficeRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(
    () => ({
      opd: opdRows.length,
      unit: workUnitRows.length,
      office: officeRows.length,
    }),
    [opdRows.length, workUnitRows.length, officeRows.length],
  );

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Organisasi</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Struktur Organisasi</h1>
          <p className="text-sm text-muted-foreground">
            Kelola struktur organisasi, satuan kerja, dan lokasi kerja untuk kebutuhan HR tenant.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat kelola struktur dan konfigurasi" : access.canEdit ? "admin dapat kelola struktur" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Data OPD" value={summary.opd} icon={FolderTree} />
          <StatCard title="Satuan Kerja" value={summary.unit} icon={Network} />
          <StatCard title="Lokasi Kerja" value={summary.office} icon={MapPin} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detail Data Organisasi</CardTitle>
            <CardDescription>
              Data organisasi ditampilkan per bagian agar konsisten dengan struktur submenu di sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Departemen (OPD)</h3>
              <StructureTable rows={opdRows} isLoading={isLoading} emptyText="Belum ada data OPD." icon={Building2} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Divisi / Satuan Kerja</h3>
              <StructureTable rows={workUnitRows} isLoading={isLoading} emptyText="Belum ada data satuan kerja." icon={Network} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Lokasi Kerja</h3>
              <StructureTable rows={officeRows} isLoading={isLoading} emptyText="Belum ada data lokasi kerja." icon={MapPin} />
            </section>
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

function StructureTable({
  rows,
  isLoading,
  emptyText,
  icon: Icon,
}: {
  rows: NamedRow[];
  isLoading: boolean;
  emptyText: string;
  icon: React.ElementType;
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Memuat data...</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Kode</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {item.name}
              </span>
            </TableCell>
            <TableCell>{item.code || "-"}</TableCell>
            <TableCell>{item.is_active === false ? "Nonaktif" : "Aktif"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
