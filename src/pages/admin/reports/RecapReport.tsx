import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Download, Filter, Users, CheckCircle, XCircle, Clock, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

type OPD = Tables<"opd">;

interface RecapData {
  employee_id: string;
  employee_name: string;
  opd_code: string;
  total_days: number;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  cuti: number;
  tidak_hadir: number;
  tugas_luar: number;
}

const MONTHS = [
  { value: "1", label: "Januari" },
  { value: "2", label: "Februari" },
  { value: "3", label: "Maret" },
  { value: "4", label: "April" },
  { value: "5", label: "Mei" },
  { value: "6", label: "Juni" },
  { value: "7", label: "Juli" },
  { value: "8", label: "Agustus" },
  { value: "9", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];
const ITEMS_PER_PAGE = 15;

export default function RecapReport() {
  const [recapData, setRecapData] = useState<RecapData[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      
      const year = parseInt(filterYear);
      const month = parseInt(filterMonth);
      const monthStart = startOfMonth(new Date(year, month - 1));
      const monthEnd = endOfMonth(new Date(year, month - 1));

      const [opdResult, recordResult, employeeResult] = await Promise.all([
        supabase.from("opd").select("*").order("name"),
        supabase
          .from("attendance_records_partitioned")
          .select("employee_id, status, date")
          .gte("date", format(monthStart, "yyyy-MM-dd"))
          .lte("date", format(monthEnd, "yyyy-MM-dd")),
        supabase.from("employees").select("id, name, opd:opd_id(code)").eq("is_active", true),
      ]);

      if (opdResult.error) throw opdResult.error;
      if (recordResult.error) throw recordResult.error;
      if (employeeResult.error) throw employeeResult.error;

      setOpdList(opdResult.data || []);

      // Group records by employee
      const employeeRecords: Record<string, RecapData> = {};
      
      (employeeResult.data || []).forEach(emp => {
        const opdCode =
          typeof emp.opd === "object" && emp.opd !== null && "code" in emp.opd
            ? String((emp.opd as { code?: string }).code || "-")
            : "-";
        employeeRecords[emp.id] = {
          employee_id: emp.id,
          employee_name: emp.name,
          opd_code: opdCode,
          total_days: 0,
          hadir: 0,
          terlambat: 0,
          izin: 0,
          sakit: 0,
          cuti: 0,
          tidak_hadir: 0,
          tugas_luar: 0,
        };
      });

      (recordResult.data || []).forEach(rec => {
        if (employeeRecords[rec.employee_id]) {
          employeeRecords[rec.employee_id].total_days++;
          const status = rec.status as keyof Omit<RecapData, "employee_id" | "employee_name" | "opd_code" | "total_days">;
          if (status && employeeRecords[rec.employee_id][status] !== undefined) {
            (employeeRecords[rec.employee_id][status] as number)++;
          }
        }
      });

      setRecapData(Object.values(employeeRecords));
    } catch (error) {
      const errorRef = reportError(error, "admin.reports.recap.fetch", {
        month: filterMonth,
        year: filterYear,
      });
      const message = appendErrorReference("Gagal memuat data rekapitulasi", errorRef);
      toast.error(message);
      setLoadError(message);
      setRecapData([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    const headers = ["No", "Nama", "OPD", "Total", "Hadir", "Terlambat", "Izin", "Sakit", "Cuti", "Tidak Hadir", "Tugas Luar"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map((rec, index) => [
        index + 1,
        `"${rec.employee_name}"`,
        rec.opd_code,
        rec.total_days,
        rec.hadir,
        rec.terlambat,
        rec.izin,
        rec.sakit,
        rec.cuti,
        rec.tidak_hadir,
        rec.tugas_luar,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `rekapitulasi-${filterMonth}-${filterYear}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Laporan berhasil diexport");
  };

  const filteredData = recapData.filter((rec) => {
    if (filterOpd === "all") return true;
    const opd = opdList.find(o => o.id === filterOpd);
    return opd && rec.opd_code === opd.code;
  });
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterOpd, filterMonth, filterYear, recapData.length]);

  const totalStats = filteredData.reduce(
    (acc, rec) => ({
      hadir: acc.hadir + rec.hadir,
      terlambat: acc.terlambat + rec.terlambat,
      izin: acc.izin + rec.izin,
      sakit: acc.sakit + rec.sakit,
      cuti: acc.cuti + rec.cuti,
      tidak_hadir: acc.tidak_hadir + rec.tidak_hadir,
    }),
    { hadir: 0, terlambat: 0, izin: 0, sakit: 0, cuti: 0, tidak_hadir: 0 }
  );

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rekapitulasi</h1>
            <p className="text-muted-foreground">
              Rekap kehadiran pegawai per bulan
            </p>
          </div>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Hadir</p>
                  <p className="text-2xl font-bold">{totalStats.hadir}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Terlambat</p>
                  <p className="text-2xl font-bold">{totalStats.terlambat}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Izin</p>
                  <p className="text-2xl font-bold">{totalStats.izin}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-pink-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Sakit</p>
                  <p className="text-2xl font-bold">{totalStats.sakit}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Cuti</p>
                  <p className="text-2xl font-bold">{totalStats.cuti}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Tidak Hadir</p>
                  <p className="text-2xl font-bold">{totalStats.tidak_hadir}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Filter Rekapitulasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                        {opd.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bulan</Label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tahun</Label>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Tahun" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button className="w-full" onClick={fetchData}>
                  <Filter className="mr-2 h-4 w-4" />
                  Tampilkan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Rekapitulasi</CardTitle>
            <CardDescription>
              {MONTHS.find(m => m.value === filterMonth)?.label} {filterYear} - Total {filteredData.length} pegawai
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead className="text-center">Hadir</TableHead>
                    <TableHead className="text-center">Terlambat</TableHead>
                    <TableHead className="text-center">Izin</TableHead>
                    <TableHead className="text-center">Sakit</TableHead>
                    <TableHead className="text-center">Cuti</TableHead>
                    <TableHead className="text-center">TK</TableHead>
                    <TableHead className="text-center">Dinas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        Tidak ada data
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((rec, index) => (
                      <TableRow key={rec.employee_id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{rec.employee_name}</TableCell>
                        <TableCell>{rec.opd_code}</TableCell>
                        <TableCell className="text-center text-green-600 font-medium">{rec.hadir}</TableCell>
                        <TableCell className="text-center text-yellow-600">{rec.terlambat}</TableCell>
                        <TableCell className="text-center text-blue-600">{rec.izin}</TableCell>
                        <TableCell className="text-center text-pink-600">{rec.sakit}</TableCell>
                        <TableCell className="text-center text-purple-600">{rec.cuti}</TableCell>
                        <TableCell className="text-center text-red-600">{rec.tidak_hadir}</TableCell>
                        <TableCell className="text-center text-cyan-600">{rec.tugas_luar}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && filteredData.length > 0 && (
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
      </div>
    </SuperAdminLayout>
  );
}
