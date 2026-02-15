import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceRecord = Tables<"attendance_records">;
type Employee = Tables<"employees">;
type OPD = Tables<"opd">;
type Office = Tables<"offices">;

const ITEMS_PER_PAGE = 20;

export default function AttendanceReport() {
  const [records, setRecords] = useState<(AttendanceRecord & { employee?: Employee & { opd?: OPD }; office?: Office })[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [opdResult, recordResult] = await Promise.all([
        supabase.from("opd").select("*").order("name"),
        supabase
          .from("attendance_records_partitioned")
          .select("*")
          .gte("date", startDate ? format(startDate, "yyyy-MM-dd") : "2024-01-01")
          .lte("date", endDate ? format(endDate, "yyyy-MM-dd") : "2099-12-31")
          .order("date", { ascending: false })
          .limit(1000),
      ]);

      if (opdResult.error) throw opdResult.error;
      if (recordResult.error) throw recordResult.error;

      setOpdList(opdResult.data || []);
      setRecords(recordResult.data || []);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    const headers = ["No", "Tanggal", "NIP", "Nama", "OPD", "Lokasi", "Jam Masuk", "Jam Keluar", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredRecords.map((rec, index) => [
        index + 1,
        format(new Date(rec.date), "dd/MM/yyyy"),
        rec.employee?.nip || "-",
        `"${rec.employee?.name || "-"}"`,
        rec.employee?.opd?.code || "-",
        `"${rec.office?.name || "-"}"`,
        rec.check_in_time ? format(new Date(rec.check_in_time), "HH:mm") : "-",
        rec.check_out_time ? format(new Date(rec.check_out_time), "HH:mm") : "-",
        rec.status || "-",
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan-absensi-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Laporan berhasil diexport");
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
  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Laporan Absensi</h1>
            <p className="text-muted-foreground">
              Lihat dan export laporan kehadiran pegawai
            </p>
          </div>
          <Button onClick={handleExport} disabled={filteredRecords.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Filter Laporan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                          {format(new Date(rec.date), "dd MMM yyyy", { locale: localeId })}
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
