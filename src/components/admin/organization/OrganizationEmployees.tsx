import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Search, Plus, Mail, Phone, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface Employee {
  id: string;
  name: string;
  email: string;
  nik: string;
  nip: string | null;
  phone: string | null;
  position: string | null;
  is_active: boolean | null;
}

interface OrganizationEmployeesProps {
  tenantId: string;
}
const ORG_EMPLOYEES_READ_TIMEOUT_MS = 12000;
const ORG_EMPLOYEES_WRITE_TIMEOUT_MS = 15000;
const ORG_EMPLOYEES_MAX_RETRIES = 2;

export function OrganizationEmployees({ tenantId }: OrganizationEmployeesProps) {
  const ITEMS_PER_PAGE = 10;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchEmployees = useCallback(async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("*")
              .eq("tenant_id", tenantId)
              .order("name"),
            ORG_EMPLOYEES_READ_TIMEOUT_MS,
            "Permintaan data pegawai organisasi timeout."
          ),
        {
          maxRetries: ORG_EMPLOYEES_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_employees.fetch", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal memuat data pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
      setEmployees([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const toggleEmployeeStatus = async (employeeId: string, currentStatus: boolean) => {
    try {
      const { error } = await withTimeout(
        supabase
          .from("employees")
          .update({ is_active: !currentStatus })
          .eq("id", employeeId),
        ORG_EMPLOYEES_WRITE_TIMEOUT_MS,
        "Perbarui status pegawai timeout."
      );

      if (error) throw error;
      toast.success(`Status pegawai berhasil diperbarui`);
      void fetchEmployees();
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_employees.toggle_status", {
        tenant_id: tenantId,
        employee_id: employeeId,
      });
      const message = appendErrorReference("Gagal memperbarui status", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.nik.includes(searchQuery)
  );
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE));
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, employees.length]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Daftar Pegawai
            </CardTitle>
            <CardDescription>
              {employees.length} pegawai terdaftar di organisasi ini
            </CardDescription>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Pegawai
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isRetrying && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat data pegawai...
          </div>
        )}
        {loadError && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchEmployees()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari pegawai..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>NIK</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "Tidak ada pegawai ditemukan" : "Belum ada pegawai terdaftar"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-sm text-muted-foreground">{emp.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{emp.nik}</code>
                      </TableCell>
                      <TableCell>{emp.nip || "-"}</TableCell>
                      <TableCell>{emp.position || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {emp.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {emp.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={emp.is_active ? "default" : "secondary"}>
                          {emp.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEmployeeStatus(emp.id, emp.is_active ?? true)}
                        >
                          {emp.is_active ? (
                            <UserX className="h-4 w-4 text-destructive" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && filteredEmployees.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {currentPage} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Berikutnya
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
