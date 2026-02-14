import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { FileSpreadsheet, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { calculateKeterangan, type AttendanceKeterangan } from "@/hooks/useWorkHours";

type OPD = Tables<"opd">;

interface WorkHoursInfo {
  time_in: string;
  time_out: string;
  day_of_week: number;
  institution_type: string;
}

// Get day of week dari date
const getDayOfWeek = (dateStr: string): number => new Date(dateStr).getDay();

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Hadir": { variant: "default", className: "bg-green-500 hover:bg-green-600" },
    "Izin": { variant: "outline", className: "border-blue-500 text-blue-600" },
    "Cuti": { variant: "outline", className: "border-purple-500 text-purple-600" },
    "Sakit": { variant: "outline", className: "border-pink-500 text-pink-600" },
    "Tugas Luar": { variant: "outline", className: "border-cyan-500 text-cyan-600" },
    "Tidak Hadir": { variant: "destructive", className: "" },
  };

  const style = variants[status] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{status}</Badge>;
};

const getKeteranganBadge = (keterangan: string) => {
  if (keterangan === "-") return <span className="text-muted-foreground">-</span>;
  
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Hadir": { variant: "default", className: "bg-green-500 hover:bg-green-600" },
    "Telat": { variant: "secondary", className: "bg-yellow-500 text-black hover:bg-yellow-600" },
    "Pulang Cepat": { variant: "secondary", className: "bg-orange-500 hover:bg-orange-600" },
    "Telat + Pulang Cepat": { variant: "destructive", className: "bg-red-500 hover:bg-red-600" },
    "Tidak Absen Pulang": { variant: "outline", className: "border-orange-500 text-orange-600" },
    "Telat (Belum Pulang)": { variant: "outline", className: "border-yellow-500 text-yellow-600" },
  };

  const style = variants[keterangan] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{keterangan}</Badge>;
};

const STATUS_OPTIONS = ["Hadir", "Izin", "Cuti", "Sakit", "Tugas Luar", "Tidak Hadir"];
const KETERANGAN_OPTIONS = ["Hadir", "Telat", "Pulang Cepat", "Telat + Pulang Cepat", "Tidak Absen Pulang"];

export default function OrgAttendanceReport() {
  const [records, setRecords] = useState<any[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workHours, setWorkHours] = useState<WorkHoursInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterKeterangan, setFilterKeterangan] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    // Dapatkan tenant_id dari user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: empData } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (empData?.tenant_id) {
        setTenantId(empData.tenant_id);
        fetchWorkHours(empData.tenant_id);
      }
    }
    fetchOpds();
  };

  const fetchOpds = async () => {
    const { data } = await supabase.from("opd").select("*").order("name");
    setOpds(data || []);
  };

  const fetchWorkHours = async (tid: string) => {
    const { data } = await supabase
      .from("work_hours")
      .select("time_in, time_out, day_of_week, institution_type")
      .eq("tenant_id", tid)
      .eq("is_active", true);
    setWorkHours(data || []);
  };

  // Helper untuk mendapatkan jam kerja berdasarkan hari dan jenis instansi
  const getWorkHoursForRecord = (record: any): WorkHoursInfo | null => {
    const dayOfWeek = getDayOfWeek(record.date);
    // Default ke pemerintahan, bisa di-extend untuk jenis lain
    return workHours.find(wh => wh.day_of_week === dayOfWeek && wh.institution_type === "pemerintahan") || null;
  };

  // Menghitung status dan keterangan untuk record
  const getRecordKeterangan = (record: any): AttendanceKeterangan => {
    const wh = getWorkHoursForRecord(record);
    return calculateKeterangan(record, wh);
  };

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Pilih rentang tanggal");
      return;
    }

    setIsLoading(true);
    try {
      // Fetch attendance dan employees terpisah karena tabel partitioned tidak punya FK
      const [attendanceResult, employeesResult, officesResult] = await Promise.all([
        supabase
          .from("attendance_records_partitioned")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: false }),
        supabase
          .from("employees")
          .select("id, name, nip, opd:opd_id(id, code, name)")
          .eq("is_active", true),
        supabase
          .from("offices")
          .select("id, name")
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (employeesResult.error) throw employeesResult.error;
      if (officesResult.error) throw officesResult.error;

      // Build lookup maps
      const employeeMap = new Map<string, any>();
      (employeesResult.data || []).forEach((emp: any) => {
        employeeMap.set(emp.id, emp);
      });

      const officeMap = new Map<string, any>();
      (officesResult.data || []).forEach((office: any) => {
        officeMap.set(office.id, office);
      });

      // Join data di client
      let data = (attendanceResult.data || []).map((att: any) => ({
        ...att,
        employees: employeeMap.get(att.employee_id),
        offices: officeMap.get(att.office_id),
      }));

      let filtered = data;
      if (filterOpd !== "all") {
        filtered = filtered.filter((r: any) => r.employees?.opd?.id === filterOpd);
      }
      setRecords(filtered);
    } catch (error) {
      toast.error("Gagal memuat laporan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    const csv = [
      ["No", "Tanggal", "NIP", "Nama", "OPD", "Lokasi", "Jam Masuk", "Jam Keluar", "Status", "Keterangan"].join(","),
      ...filteredRecords.map((r, i) => {
        const ket = getRecordKeterangan(r);
        return [
          i + 1,
          r.date,
          r.employees?.nip || "",
          `"${r.employees?.name || ""}"`,
          r.employees?.opd?.code || "",
          `"${r.offices?.name || ""}"`,
          r.check_in_time ? format(new Date(r.check_in_time), "HH:mm") : "",
          r.check_out_time ? format(new Date(r.check_out_time), "HH:mm") : "",
          ket.status,
          ket.keterangan
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-absensi-${startDate}-${endDate}.csv`;
    a.click();
    toast.success("Export berhasil");
  };

  // Filter by search, status, and keterangan
  const filteredRecords = records.filter(r => {
    const matchSearch = (r.employees?.name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const ket = getRecordKeterangan(r);
    const matchStatus = filterStatus === "all" || ket.status === filterStatus;
    const matchKeterangan = filterKeterangan === "all" || ket.keterangan === filterKeterangan;
    return matchSearch && matchStatus && matchKeterangan;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterKeterangan, records]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Laporan Absensi
            </h1>
            <p className="text-muted-foreground">Laporan absensi pegawai berdasarkan jadwal jam kerja</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={filteredRecords.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="grid gap-2">
                <Label>OPD</Label>
                <Select value={filterOpd} onValueChange={setFilterOpd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua OPD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opds.map(opd => (
                      <SelectItem key={opd.id} value={opd.id}>{opd.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tanggal Mulai</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Tanggal Akhir</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Keterangan</Label>
                <Select value={filterKeterangan} onValueChange={setFilterKeterangan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Keterangan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Keterangan</SelectItem>
                    {KETERANGAN_OPTIONS.map(k => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  {isLoading ? "Memuat..." : "Tampilkan"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Laporan</CardTitle>
            <CardDescription>Total {filteredRecords.length} data absensi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari nama..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead>Keluar</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                  ) : paginatedRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Pilih filter dan klik Tampilkan</TableCell></TableRow>
                  ) : (
                    paginatedRecords.map((r, i) => {
                      const ket = getRecordKeterangan(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{(currentPage - 1) * itemsPerPage + i + 1}</TableCell>
                          <TableCell>{format(new Date(r.date), "d MMM yyyy", { locale: id })}</TableCell>
                          <TableCell className="font-mono text-sm">{r.employees?.nip || "-"}</TableCell>
                          <TableCell>{r.employees?.name}</TableCell>
                          <TableCell>{r.employees?.opd?.code || "-"}</TableCell>
                          <TableCell>{r.check_in_time ? format(new Date(r.check_in_time), "HH:mm") : "-"}</TableCell>
                          <TableCell>{r.check_out_time ? format(new Date(r.check_out_time), "HH:mm") : "-"}</TableCell>
                          <TableCell>{getStatusBadge(ket.status)}</TableCell>
                          <TableCell>{getKeteranganBadge(ket.keterangan)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredRecords.length)} dari {filteredRecords.length} data
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {/* First page */}
                    {currentPage > 2 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">1</PaginationLink>
                      </PaginationItem>
                    )}
                    
                    {currentPage > 3 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                    
                    {/* Current page range */}
                    {Array.from({ length: Math.min(3, totalPages) }, (_, idx) => {
                      const pageNum = Math.max(1, Math.min(currentPage - 1, totalPages - 2)) + idx;
                      if (pageNum > totalPages) return null;
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink 
                            isActive={pageNum === currentPage}
                            onClick={() => setCurrentPage(pageNum)}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    
                    {currentPage < totalPages - 2 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                    
                    {/* Last page */}
                    {currentPage < totalPages - 1 && totalPages > 3 && (
                      <PaginationItem>
                        <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">{totalPages}</PaginationLink>
                      </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
    </OrganizationLayout>
  );
}
