import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, Search, Filter, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import { GlossaryPanel } from "@/components/common/GlossaryPanel";
import {
  buildAdminAttendanceCsv,
  enrichAdminAttendanceRecords,
  formatAdminAttendanceDate,
  type AdminAttendanceEmployeeRow,
  type AdminAttendanceOfficeRow,
  type AdminAttendanceRecord,
  type AdminAttendanceRecordRow,
} from "@/lib/adminAttendanceReport";

type OPD = Tables<"opd">;

const ITEMS_PER_PAGE = 20;
const ADMIN_ATTENDANCE_TIMEOUT_MS = 12000;
const ADMIN_ATTENDANCE_MAX_RETRIES = 2;
const ADMIN_ATTENDANCE_CHUNK_SIZE = 500;

export default function AttendanceReport() {
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const chunkValues = <T,>(items: T[], size: number) => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }
    return result;
  };

  const fetchAttendanceRows = useCallback(async (startDateValue: string, endDateValue: string) => {
    const rows: AdminAttendanceRecordRow[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("attendance_records_partitioned")
              .select("*")
              .gte("date", startDateValue)
              .lte("date", endDateValue)
              .order("date", { ascending: false })
              .range(from, from + ADMIN_ATTENDANCE_CHUNK_SIZE - 1),
            ADMIN_ATTENDANCE_TIMEOUT_MS,
            "Permintaan halaman laporan absensi admin timeout."
          ),
        {
          maxRetries: ADMIN_ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      const batch = (data || []) as AdminAttendanceRecordRow[];
      rows.push(...batch);
      if (batch.length < ADMIN_ATTENDANCE_CHUNK_SIZE) break;
      from += ADMIN_ATTENDANCE_CHUNK_SIZE;
    }

    return rows;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setIsRetrying(false);

      const startDateValue = startDate ? format(startDate, "yyyy-MM-dd") : "2024-01-01";
      const endDateValue = endDate ? format(endDate, "yyyy-MM-dd") : "2099-12-31";

      const [opdResult, rawRows] = await Promise.all([
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("opd").select("*").order("name"),
              ADMIN_ATTENDANCE_TIMEOUT_MS,
              "Permintaan daftar OPD admin timeout."
            ),
          {
            maxRetries: ADMIN_ATTENDANCE_MAX_RETRIES,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        fetchAttendanceRows(startDateValue, endDateValue),
      ]);

      if (opdResult.error) throw opdResult.error;

      const employeeIds = [...new Set(rawRows.map((row) => row.employee_id).filter(Boolean))];
      const officeIds = [...new Set(rawRows.map((row) => row.office_id).filter(Boolean))];

      const employeeChunks = chunkValues(employeeIds, ADMIN_ATTENDANCE_CHUNK_SIZE);
      const officeChunks = chunkValues(officeIds, ADMIN_ATTENDANCE_CHUNK_SIZE);

      const [employeeGroups, officeGroups] = await Promise.all([
        Promise.all(
          employeeChunks.map(async (chunk) => {
            const { data, error } = await withExponentialBackoff(
              () =>
                withTimeout(
                  supabase.from("employees").select("id, name, nip, opd_id").in("id", chunk),
                  ADMIN_ATTENDANCE_TIMEOUT_MS,
                  "Permintaan data pegawai laporan absensi admin timeout."
                ),
              {
                maxRetries: ADMIN_ATTENDANCE_MAX_RETRIES,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              }
            );
            if (error) throw error;
            return (data || []) as AdminAttendanceEmployeeRow[];
          })
        ),
        Promise.all(
          officeChunks.map(async (chunk) => {
            const { data, error } = await withExponentialBackoff(
              () =>
                withTimeout(
                  supabase.from("offices").select("id, name").in("id", chunk),
                  ADMIN_ATTENDANCE_TIMEOUT_MS,
                  "Permintaan data lokasi laporan absensi admin timeout."
                ),
              {
                maxRetries: ADMIN_ATTENDANCE_MAX_RETRIES,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              }
            );
            if (error) throw error;
            return (data || []) as AdminAttendanceOfficeRow[];
          })
        ),
      ]);

      setOpdList(opdResult.data || []);
      setRecords(
        enrichAdminAttendanceRecords({
          records: rawRows,
          employees: employeeGroups.flat(),
          offices: officeGroups.flat(),
          opds: opdResult.data || [],
        })
      );
      setCurrentPage(1);
    } catch (error) {
      const errorRef = reportError(error, "admin.reports.attendance.fetch", {
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
        end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
      });
      const message = appendErrorReference("Gagal memuat data laporan absensi", errorRef);
      toast.error(message);
      setLoadError(message);
      setRecords([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [endDate, fetchAttendanceRows, startDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleExport = () => {
    const csvContent = buildAdminAttendanceCsv(filteredRecords);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan-absensi-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("Laporan berhasil diekspor");
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      hadir: { label: "Hadir", className: "bg-green-500/10 text-green-500" },
      terlambat: { label: "Terlambat", className: "bg-yellow-500/10 text-yellow-500" },
      pulang_cepat: { label: "Pulang Cepat", className: "bg-orange-500/10 text-orange-500" },
      terlambat_pulang_cepat: { label: "Telat + Pulang Cepat", className: "bg-red-500/10 text-red-500" },
      tidak_hadir: { label: "Tidak Hadir", className: "bg-red-500/10 text-red-500" },
      izin: { label: "Izin", className: "bg-blue-500/10 text-blue-500" },
      cuti: { label: "Cuti", className: "bg-purple-500/10 text-purple-500" },
      sakit: { label: "Sakit", className: "bg-pink-500/10 text-pink-500" },
      tugas_luar: { label: "Tugas Luar", className: "bg-cyan-500/10 text-cyan-500" },
    };
    
    const statusInfo = statusMap[status || ""] || { label: status || "-", className: "" };
    return <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const filteredRecords = records.filter((rec) => {
    const matchesOpd = filterOpd === "all" || rec.employee?.opd_id === filterOpd;
    const matchesSearch = searchTerm === "" || 
      rec.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.employee?.nip?.includes(searchTerm);
    return matchesOpd && matchesSearch;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat laporan absensi...
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Laporan Absensi</h1>
            <p className="text-muted-foreground">
              Lihat dan ekspor laporan kehadiran pegawai
            </p>
          </div>
          <Button onClick={handleExport} disabled={filteredRecords.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Ekspor Excel
          </Button>
        </div>
        <div className="flex justify-end">
          <GlossaryPanel defaultCategory="absensi" />
        </div>

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Coba Lagi
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Filter Laporan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label>OPD</Label>
                <Select value={filterOpd} onValueChange={setFilterOpd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih OPD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opdList.map((opd) => (
                      <SelectItem key={opd.id} value={opd.id}>
                        {opd.code} - {opd.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Mulai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd MMM yyyy", { locale: localeId }) : "Pilih tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Akhir</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd MMM yyyy", { locale: localeId }) : "Pilih tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Cari</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nama / NIP..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button className="w-full" onClick={fetchData}>
                  <Filter className="mr-2 h-4 w-4" />
                  Tampilkan
                </Button>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Laporan</CardTitle>
            <CardDescription>
              Total {filteredRecords.length} data absensi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Jam Masuk</TableHead>
                    <TableHead>Jam Keluar</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Tidak ada data absensi
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRecords.map((rec, index) => (
                      <TableRow key={rec.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>
                          {formatAdminAttendanceDate(rec.date, "dd MMM yyyy", { locale: localeId })}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {rec.employee?.nip || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {rec.employee?.name || "-"}
                        </TableCell>
                        <TableCell>{rec.employee?.opd?.code || "-"}</TableCell>
                        <TableCell>{rec.office?.name || "-"}</TableCell>
                        <TableCell>
                          {rec.check_in_time ? format(new Date(rec.check_in_time), "HH:mm") : "-"}
                        </TableCell>
                        <TableCell>
                          {rec.check_out_time ? format(new Date(rec.check_out_time), "HH:mm") : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(rec.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length)} dari {filteredRecords.length} data
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Halaman {currentPage} dari {totalPages}
                  </span>
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
      </div>
    </SuperAdminLayout>
  );
}
