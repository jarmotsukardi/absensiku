import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserX, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Employee = Tables<"employees">;
type OPD = Tables<"opd">;
const ITEMS_PER_PAGE = 15;
const ADMIN_INACTIVE_EMP_READ_TIMEOUT_MS = 12000;
const ADMIN_INACTIVE_EMP_WRITE_TIMEOUT_MS = 15000;
const ADMIN_INACTIVE_EMP_MAX_RETRIES = 2;

export default function InactiveEmployees() {
  const confirmDialog = useConfirmDialog();
  const [employees, setEmployees] = useState<(Employee & { opd?: OPD })[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      let query = supabase
        .from("employees")
        .select("*, opd:opd_id(*)", { count: "exact" })
        .eq("is_active", false);

      if (searchTerm.trim()) {
        const escaped = searchTerm.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`name.ilike.%${escaped}%,nip.ilike.%${escaped}%,email.ilike.%${escaped}%`);
      }

      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            query
              .order("name")
              .range(from, to),
            ADMIN_INACTIVE_EMP_READ_TIMEOUT_MS,
            "Permintaan data pegawai non-aktif timeout."
          ),
        {
          maxRetries: ADMIN_INACTIVE_EMP_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setEmployees(data || []);
      setTotalEmployees(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "admin.inactive_employees.fetch_data");
      const message = appendErrorReference("Gagal memuat data pegawai non-aktif", errorRef);
      toast.error(message);
      setLoadError(message);
      setEmployees([]);
      setTotalEmployees(0);
    } finally {
      setIsRetrying(false);
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
      setLoadError(null);
      const { error } = await withTimeout(
        supabase
          .from("employees")
          .update({ is_active: true })
          .eq("id", id),
        ADMIN_INACTIVE_EMP_WRITE_TIMEOUT_MS,
        "Aktivasi ulang pegawai timeout."
      );

      if (error) throw error;
      toast.success("Pegawai berhasil diaktifkan kembali");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "admin.inactive_employees.reactivate", { employee_id: id });
      const message = appendErrorReference("Gagal mengaktifkan pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));
  const pageStart = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, idx) => pageStart + idx).filter(
    (page) => page <= totalPages
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalEmployees]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pegawai Non-Aktif</h1>
          <p className="text-muted-foreground">
            Daftar pegawai yang sudah tidak aktif
          </p>
        </div>

        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat pegawai non-aktif...
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              Coba Lagi
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Daftar Pegawai Non-Aktif
            </CardTitle>
            <CardDescription>
              Total {totalEmployees} pegawai non-aktif
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIP, atau email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Tidak ada pegawai non-aktif
                      </TableCell>
                    </TableRow>
                  ) : (
                    employees.map((emp, index) => (
                      <TableRow key={emp.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{emp.nip || "-"}</TableCell>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>{emp.opd?.code || "-"}</TableCell>
                        <TableCell>{emp.position || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Non-Aktif</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReactivate(emp.id)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Aktifkan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && totalEmployees > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
