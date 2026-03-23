import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchTenantHrEssPolicySettings } from "@/lib/hrEssPolicySettings";
import { resolveHrEssSessionEmployee } from "@/lib/hrEssSessionEmployee";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { CalendarClock, Clock3, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

type AttendanceRow = {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
  notes: string | null;
};

export default function OrgHRESSAttendance() {
  const [isLoading, setIsLoading] = useState(true);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [employeeNip, setEmployeeNip] = useState<string | null>(null);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [missingEmployee, setMissingEmployee] = useState(false);
  const [isDisabledByPolicy, setIsDisabledByPolicy] = useState(false);
  const [lookbackDays, setLookbackDays] = useState(31);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/ess/attendance");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setMissingEmployee(false);
    setIsDisabledByPolicy(false);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const essPolicy = await fetchTenantHrEssPolicySettings(tenantId);

      setLookbackDays(essPolicy.attendanceLookbackDays);
      if (!essPolicy.enableAttendanceView) {
        setIsDisabledByPolicy(true);
        setEmployeeName(null);
        setEmployeeNip(null);
        setRecords([]);
        return;
      }

      const { employee } = await resolveHrEssSessionEmployee(tenantId);
      if (!employee) {
        setMissingEmployee(true);
        setEmployeeName(null);
        setEmployeeNip(null);
        setRecords([]);
        return;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - essPolicy.attendanceLookbackDays);

      const { data, error } = await supabase
        .from("attendance_records_partitioned")
        .select("id, date, check_in_time, check_out_time, status, notes")
        .eq("employee_id", employee.id)
        .gte("date", startDate.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(40);

      if (error) throw error;

      setEmployeeName(employee.name);
      setEmployeeNip(employee.nip);
      setRecords((data || []) as AttendanceRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.ess.attendance.fetch");
      toast.error(appendErrorReference("Gagal memuat kehadiran ESS", ref));
      setEmployeeName(null);
      setEmployeeNip(null);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const hadir = records.filter((item) => item.status === "hadir").length;
    const terlambat = records.filter((item) => ["terlambat", "terlambat_pulang_cepat"].includes(item.status || "")).length;
    const izin = records.filter((item) => ["izin", "cuti", "sakit", "tugas_luar"].includes(item.status || "")).length;
    const absen = records.filter((item) => item.status === "tidak_hadir").length;

    return {
      total: records.length,
      hadir,
      terlambat,
      izin,
      absen,
    };
  }, [records]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">ESS</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Kehadiran Saya</h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan kehadiran pribadi admin organisasi yang juga tercatat sebagai pegawai pada tenant aktif.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title={`Record ${lookbackDays} Hari`}
            value={summary.total}
            icon={CalendarClock}
            description="Riwayat yang berhasil dibaca"
          />
          <StatCard title="Hadir" value={summary.hadir} icon={UserCheck} description="Status hadir normal" />
          <StatCard title="Terlambat" value={summary.terlambat} icon={Clock3} description="Butuh perhatian disiplin waktu" />
          <StatCard title="Tidak Hadir" value={summary.absen} icon={XCircle} description="Hari tidak hadir pada periode ini" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Identitas ESS</CardTitle>
                <CardDescription>
                  Halaman ini membaca kehadiran milik akun yang sedang login jika akun tersebut terhubung ke data pegawai.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/ess/requests">Buka Pengajuan ESS</OrgHRContextLink>
                </Button>
                <Button asChild size="sm">
                  <OrgHRContextLink to="/org/hr/work-hours">Lihat Jam Kerja</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <InfoTile label="Nama Pegawai" value={employeeName || "-"} />
            <InfoTile label="NIP" value={employeeNip || "-"} />
            <InfoTile label="Status" value={missingEmployee ? "Belum terhubung ke data pegawai" : "Terhubung"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Kehadiran Terkini</CardTitle>
            <CardDescription>Menampilkan kehadiran pribadi terbaru dalam {lookbackDays} hari terakhir.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : isDisabledByPolicy ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Tampilan kehadiran ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.
              </div>
            ) : missingEmployee ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Akun ini belum terhubung ke data pegawai tenant aktif. Hubungi admin HR untuk sinkronisasi profil pegawai.
              </div>
            ) : records.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat kehadiran yang bisa ditampilkan.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead>Pulang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{new Date(item.date).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>{formatTime(item.check_in_time)}</TableCell>
                      <TableCell>{formatTime(item.check_out_time)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "tidak_hadir" ? "destructive" : "secondary"}>
                          {formatAttendanceStatus(item.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{item.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatAttendanceStatus(value: string | null) {
  const labels: Record<string, string> = {
    hadir: "Hadir",
    terlambat: "Terlambat",
    pulang_cepat: "Pulang Cepat",
    terlambat_pulang_cepat: "Terlambat & Pulang Cepat",
    izin: "Izin",
    cuti: "Cuti",
    sakit: "Sakit",
    tugas_luar: "Tugas Luar",
    tidak_hadir: "Tidak Hadir",
  };

  return labels[value || ""] || "Belum Ditandai";
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-sky-600" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
