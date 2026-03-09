import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type ContractRow = Database["public"]["Tables"]["hr_contracts"]["Row"];
type EmployeeLite = { id: string; name: string; email: string };

export default function OrgHRDocuments() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "ended" | "terminated">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [contractRes, employeeRes] = await Promise.all([
        supabase.from("hr_contracts").select("*").eq("tenant_id", tenantId).order("start_date", { ascending: false }).limit(200),
        supabase.from("employees").select("id, name, email").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(2000),
      ]);
      if (contractRes.error) throw contractRes.error;
      if (employeeRes.error) throw employeeRes.error;

      setContracts(contractRes.data || []);
      setEmployees((employeeRes.data || []) as EmployeeLite[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.documents.fetch");
      const message = appendErrorReference("Gagal memuat dokumen HR", ref);
      toast.error(message);
      setLoadError(message);
      setContracts([]);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);
  const normalizeText = (value: string | null | undefined) => (value || "").trim().toLowerCase();
  const formatDateLabel = (dateValue: string | null) => {
    if (!dateValue) return "-";
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  };
  const keyword = search.trim().toLowerCase();
  const filteredContracts = useMemo(() => {
    return contracts.filter((item) => {
      const status = normalizeText(item.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!keyword) return true;
      const employee = employeeMap.get(item.employee_id);
      return [
        item.contract_number || "",
        item.contract_type,
        item.status,
        item.notes || "",
        employee?.name || "",
        employee?.email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [contracts, employeeMap, keyword, statusFilter]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Documents</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Dokumen HR</h1>
          <p className="text-sm text-muted-foreground">
            Arsip dokumen kontrak dan administrasi kepegawaian untuk audit dan compliance.
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate("/org/hr/contracts")}>Kelola Kontrak Kerja</Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/org/hr/settings")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Pengaturan HR
              </Button>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kontrak, pegawai, tipe, status..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "Semua" },
                { key: "active", label: "Aktif" },
                { key: "draft", label: "Draft" },
                { key: "ended", label: "Berakhir" },
                { key: "terminated", label: "Terminasi" },
              ].map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant={statusFilter === item.key ? "default" : "outline"}
                  onClick={() => setStatusFilter(item.key as typeof statusFilter)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="kontrak">
              <TabsList>
                <TabsTrigger value="kontrak">Arsip Kontrak ({filteredContracts.length})</TabsTrigger>
                <TabsTrigger value="administrasi">Administrasi</TabsTrigger>
              </TabsList>
              <TabsContent value="kontrak">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat arsip kontrak...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pegawai</TableHead>
                        <TableHead>No. Kontrak</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Masa Berlaku</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContracts.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{employeeMap.get(item.employee_id)?.name || "-"}</TableCell>
                          <TableCell>{item.contract_number || "-"}</TableCell>
                          <TableCell>{item.contract_type}</TableCell>
                          <TableCell>
                            {formatDateLabel(item.start_date)}
                            {item.end_date ? ` s/d ${formatDateLabel(item.end_date)}` : " (tanpa akhir)"}
                          </TableCell>
                          <TableCell>{item.status}</TableCell>
                        </TableRow>
                      ))}
                      {filteredContracts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                            {contracts.length === 0
                              ? "Belum ada dokumen kontrak."
                              : "Tidak ada dokumen yang cocok dengan filter."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                )}
                {loadError ? <p className="mt-3 text-xs text-destructive">{loadError}</p> : null}
              </TabsContent>
              <TabsContent value="administrasi">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Dokumen Administrasi</CardTitle>
                    <CardDescription>
                      Fase berikutnya dapat ditambahkan repository dokumen per pegawai (SK, sertifikat, lampiran).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Untuk sementara, gunakan halaman pegawai dan kontrak sebagai sumber dokumen resmi.
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
