import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserX, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { EmployeeDataTabs } from "@/components/org/employees/EmployeeDataTabs";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type Employee = Tables<"employees">;
type OPD = Tables<"opd">;
type Position = Tables<"positions">;

const ITEMS_PER_PAGE = 10;
const ORG_INACTIVE_EMPLOYEES_QUERY_TIMEOUT_MS = 12000;
const ORG_INACTIVE_EMPLOYEES_QUERY_RETRY_MAX = 2;

export default function OrgInactiveEmployees() {
  const confirmDialog = useConfirmDialog();
  const [employees, setEmployees] = useState<(Employee & { opd?: OPD | null; position_rel?: Position | null })[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      let query = supabase
        .from("employees")
        .select("*, opd(*), position_rel:position_id(*)", { count: "exact" })
        .eq("is_active", false);

      if (searchTerm.trim()) {
        const escaped = searchTerm.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,nip.ilike.%${escaped}%`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            query.order("name").range(from, to),
            ORG_INACTIVE_EMPLOYEES_QUERY_TIMEOUT_MS,
            "org.employees.inactive.fetch timeout"
          ),
        {
          maxRetries: ORG_INACTIVE_EMPLOYEES_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setEmployees(data || []);
      setTotalEmployees(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "org.employees.inactive.fetch");
      const message = appendErrorReference("Gagal memuat data pegawai non-aktif", errorRef);
      setLoadError(message);
      toast.error(message);
      setEmployees([]);
      setTotalEmployees(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleReactivate = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Aktifkan Kembali Pegawai",
        description: "Yakin ingin mengaktifkan kembali pegawai ini?",
        confirmText: "Ya, aktifkan",
      }))
    ) {
      return;
    }
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("employees").update({ is_active: true }).eq("id", id),
            ORG_INACTIVE_EMPLOYEES_QUERY_TIMEOUT_MS,
            "org.employees.inactive.reactivate timeout"
          ),
        {
          maxRetries: ORG_INACTIVE_EMPLOYEES_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      toast.success("Pegawai berhasil diaktifkan kembali");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.employees.inactive.reactivate", { employee_id: id });
      toast.error(appendErrorReference("Gagal mengaktifkan pegawai", errorRef));
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalEmployees]);

  const getFullName = (emp: Employee) => {
    const parts = [emp.gelar_depan, emp.name, emp.gelar_belakang].filter(Boolean);
    return parts.join(" ");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserX className="h-6 w-6" />
            Pegawai Non-Aktif
          </h1>
          <p className="text-muted-foreground">Daftar pegawai yang sudah tidak aktif</p>
        </div>
        <EmployeeDataTabs />

        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-6 text-sm text-amber-800">
              Sedang mencoba ulang memuat pegawai non-aktif...
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchData()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Pegawai Non-Aktif</CardTitle>
            <CardDescription>Total {totalEmployees} pegawai non-aktif</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, NIP..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama Lengkap</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Golongan</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                      </TableCell>
                    </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Tidak ada pegawai non-aktif
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((emp, index) => (
                    <TableRow key={emp.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{emp.nip || "-"}</TableCell>
                        <TableCell className="font-medium">{getFullName(emp)}</TableCell>
                        <TableCell>{emp.email}</TableCell>
                        <TableCell>{(emp.opd as OPD)?.code || "-"}</TableCell>
                        <TableCell>{(emp.position_rel as Position)?.name || emp.position || "-"}</TableCell>
                        <TableCell>{emp.golongan || "-"}</TableCell>
                        <TableCell>
                          {emp.employee_category && (
                            <Badge variant={emp.employee_category === "ASN" ? "default" : "secondary"}>
                              {emp.employee_category}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleReactivate(emp.id)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Aktifkan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalEmployees > 0 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalEmployees)} dari {totalEmployees}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_employee_management" />
      </div>
    </OrganizationLayout>
  );
}
