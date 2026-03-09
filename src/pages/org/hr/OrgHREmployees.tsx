import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserCheck, UserX, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  employee_category: string | null;
  golongan: string | null;
  is_active: boolean | null;
};

export default function OrgHREmployees() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, nip, employee_category, golongan, is_active")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (error) throw error;
      setRows((data || []) as EmployeeRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.employees.fetch");
      toast.error(appendErrorReference("Gagal memuat data pegawai HR", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!keyword) return rows;
    return rows.filter((item) =>
      [item.name, item.email, item.nip || "", item.employee_category || "", item.golongan || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [rows, keyword]);

  const activeEmployees = filtered.filter((item) => item.is_active !== false);
  const inactiveEmployees = filtered.filter((item) => item.is_active === false);
  const categoryCount = new Set(rows.map((item) => item.employee_category).filter(Boolean)).size;
  const golonganCount = new Set(rows.map((item) => item.golongan).filter(Boolean)).size;

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Core</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Data Pegawai HR</h1>
          <p className="text-sm text-muted-foreground">
            Kelola data kepegawaian sebagai sumber utama proses HR.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pegawai</CardDescription>
              <CardTitle className="text-2xl">{rows.length}</CardTitle>
            </CardHeader>
            <CardContent><Users className="h-4 w-4 text-muted-foreground" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pegawai Aktif</CardDescription>
              <CardTitle className="text-2xl">{rows.filter((item) => item.is_active !== false).length}</CardTitle>
            </CardHeader>
            <CardContent><UserCheck className="h-4 w-4 text-emerald-600" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pegawai Nonaktif</CardDescription>
              <CardTitle className="text-2xl">{rows.filter((item) => item.is_active === false).length}</CardTitle>
            </CardHeader>
            <CardContent><UserX className="h-4 w-4 text-amber-600" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Kategori / Golongan</CardDescription>
              <CardTitle className="text-2xl">{categoryCount} / {golonganCount}</CardTitle>
            </CardHeader>
            <CardContent><Badge variant="secondary">Master HR</Badge></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled>
                Sumber Data Pegawai HR
              </Button>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, email, NIP, kategori, golongan..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="aktif">
              <TabsList>
                <TabsTrigger value="aktif">Aktif ({activeEmployees.length})</TabsTrigger>
                <TabsTrigger value="nonaktif">Nonaktif ({inactiveEmployees.length})</TabsTrigger>
                <TabsTrigger value="ringkas">Ringkasan</TabsTrigger>
              </TabsList>
              <TabsContent value="aktif">
                <EmployeeTable rows={activeEmployees} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="nonaktif">
                <EmployeeTable rows={inactiveEmployees} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="ringkas">
                <div className="grid gap-3 md:grid-cols-2">
                  <Card><CardContent className="pt-6 text-sm">Kategori terpakai: <strong>{categoryCount}</strong></CardContent></Card>
                  <Card><CardContent className="pt-6 text-sm">Golongan terpakai: <strong>{golonganCount}</strong></CardContent></Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function EmployeeTable({ rows, isLoading }: { rows: EmployeeRow[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Memuat data pegawai...</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data pegawai untuk tab ini.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>NIP</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead>Golongan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.email}</TableCell>
            <TableCell>{item.nip || "-"}</TableCell>
            <TableCell>{item.employee_category || "-"}</TableCell>
            <TableCell>{item.golongan || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
