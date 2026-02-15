import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type OPD = Tables<"opd">;
type AttendanceRecapRecord = Pick<Tables<"attendance_records_partitioned">, "employee_id" | "status" | "is_wfh">;
type EmployeeRecap = {
  id: string;
  name: string;
  nip: string | null;
  opd: { id: string; code: string } | null;
};

interface RecapData {
  employee_id: string;
  employee_name: string;
  nip: string;
  opd_code: string;
  hadir: number;
  terlambat: number;
  pulang_cepat: number;
  terlambat_pulang_cepat: number;
  tidak_hadir: number;
  izin: number;
  cuti: number;
  sakit: number;
  tugas_luar: number;
  wfh: number;
}

export default function OrgRecapReport() {
  const [recap, setRecap] = useState<RecapData[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchOpds();
  }, []);

  const fetchOpds = async () => {
    const { data } = await supabase.from("opd").select("*").order("name");
    setOpds(data || []);
  };

  const fetchRecap = async () => {
    setIsLoading(true);
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      // Fetch attendance dan employees terpisah karena tabel partitioned tidak punya FK
      const [attendanceResult, employeesResult] = await Promise.all([
        supabase
          .from("attendance_records_partitioned")
          .select("employee_id, status, is_wfh")
          .gte("date", startDate)
          .lte("date", endDate),
        supabase
          .from("employees")
          .select("id, name, nip, opd:opd_id(id, code)")
          .eq("is_active", true)
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (employeesResult.error) throw employeesResult.error;

      // Build employee lookup map
      const employeeRows = (employeesResult.data || []) as Array<{
        id: string;
        name: string;
        nip: string | null;
        opd: { id: string; code: string } | Array<{ id: string; code: string }> | null;
      }>;

      const employeeMap = new Map<string, EmployeeRecap>();
      employeeRows.forEach((emp) => {
        const opd = Array.isArray(emp.opd) ? (emp.opd[0] || null) : emp.opd;
        employeeMap.set(emp.id, {
          id: emp.id,
          name: emp.name,
          nip: emp.nip,
          opd,
        });
      });

      const grouped: Record<string, RecapData> = {};
      
      (attendanceResult.data || []).forEach((rec) => {
        const record = rec as AttendanceRecapRecord;
        const empId = record.employee_id;
        const emp = employeeMap.get(empId);
        
        if (!grouped[empId]) {
          grouped[empId] = {
            employee_id: empId,
            employee_name: emp?.name || "",
            nip: emp?.nip || "",
            opd_code: emp?.opd?.code || "",
            hadir: 0, terlambat: 0, pulang_cepat: 0, terlambat_pulang_cepat: 0,
            tidak_hadir: 0, izin: 0, cuti: 0, sakit: 0, tugas_luar: 0, wfh: 0,
          };
        }
        // Count WFH attendance
        if (record.is_wfh) {
          (grouped[empId].wfh as number)++;
        }
        const status = record.status as keyof RecapData;
        if (typeof grouped[empId][status] === "number") {
          (grouped[empId][status] as number)++;
        }
      });

      let result = Object.values(grouped);
      if (filterOpd !== "all") {
        result = result.filter(r => {
          const emp = employeeMap.get(r.employee_id);
          return emp?.opd?.id === filterOpd;
        });
      }

      setRecap(result);
    } catch (error) {
      toast.error("Gagal memuat rekapitulasi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (recap.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    const csv = [
      ["No", "NIP", "Nama", "OPD", "Hadir", "Terlambat", "Pulang Cepat", "Telat & Pulang Cepat", "Tidak Hadir", "Izin", "Cuti", "Sakit", "Tugas Luar", "WFH"].join(","),
      ...recap.map((r, i) => [
        i + 1, r.nip, r.employee_name, r.opd_code,
        r.hadir, r.terlambat, r.pulang_cepat, r.terlambat_pulang_cepat, r.tidak_hadir,
        r.izin, r.cuti, r.sakit, r.tugas_luar, r.wfh
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekapitulasi-${year}-${month}.csv`;
    a.click();
    toast.success("Export berhasil");
  };

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Rekapitulasi Absensi
            </h1>
            <p className="text-muted-foreground">Rekap bulanan kehadiran pegawai</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={recap.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Rekapitulasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
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
                <Label>Bulan</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tahun</Label>
                <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button onClick={fetchRecap} className="w-full" disabled={isLoading}>
                  {isLoading ? "Memuat..." : "Tampilkan"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Rekapitulasi</CardTitle>
            <CardDescription>Periode: {months[month - 1]} {year}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead className="text-center">Hadir</TableHead>
                    <TableHead className="text-center">Telat</TableHead>
                    <TableHead className="text-center">P. Cepat</TableHead>
                    <TableHead className="text-center">Telat+PC</TableHead>
                    <TableHead className="text-center">Alpa</TableHead>
                    <TableHead className="text-center">Izin</TableHead>
                    <TableHead className="text-center">Sakit</TableHead>
                    <TableHead className="text-center">Dinas</TableHead>
                    <TableHead className="text-center">WFH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                  ) : recap.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Pilih filter dan klik Tampilkan</TableCell></TableRow>
                  ) : (
                    recap.map((r, i) => (
                      <TableRow key={r.employee_id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{r.nip || "-"}</TableCell>
                        <TableCell>{r.employee_name}</TableCell>
                        <TableCell>{r.opd_code || "-"}</TableCell>
                        <TableCell className="text-center">{r.hadir}</TableCell>
                        <TableCell className="text-center">{r.terlambat}</TableCell>
                        <TableCell className="text-center">{r.pulang_cepat}</TableCell>
                        <TableCell className="text-center">{r.terlambat_pulang_cepat}</TableCell>
                        <TableCell className="text-center">{r.tidak_hadir}</TableCell>
                        <TableCell className="text-center">{r.izin}</TableCell>
                        <TableCell className="text-center">{r.sakit}</TableCell>
                        <TableCell className="text-center">{r.tugas_luar}</TableCell>
                        <TableCell className="text-center">{r.wfh}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
