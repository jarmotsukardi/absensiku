import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { FileSpreadsheet, Download, Search, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import {
  isPeakHours,
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import { AttendanceRecapTabs } from "@/components/org/reports/AttendanceRecapTabs";
import {
  buildReportCsv,
  createReportTraceId,
  downloadCsvFile,
  downloadReportPdf,
  recordReportOutputAudit,
  type ReportOutputColumn,
} from "@/lib/reportOutput";

type OPD = Tables<"opd">;

type AttendanceReportRecord = {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  raw_status: string | null;
  employee_id: string;
  employee_name: string;
  employee_nip: string | null;
  employee_opd_code: string | null;
  office_name: string | null;
  status_label: string;
  keterangan: string;
};

const STATUS_OPTIONS = ["Hadir", "Izin", "Cuti", "Sakit", "Tugas Luar", "Tidak Hadir"];
const KETERANGAN_OPTIONS = ["Hadir", "Telat", "Pulang Cepat", "Telat + Pulang Cepat", "Tidak Absen Pulang", "Telat (Belum Pulang)"];
const ATTENDANCE_READ_TIMEOUT_MS = 12000;
const ATTENDANCE_OUTPUT_TIMEOUT_MS = 20000;
const ATTENDANCE_MAX_RETRIES = 2;

const toDateOnly = (dateValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatAttendanceDateLabel = (dateValue: string, pattern: string) =>
  format(toDateOnly(dateValue), pattern, { locale: id });

const attendanceOutputColumns: ReportOutputColumn<AttendanceReportRecord>[] = [
  { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
  { header: "Tanggal", value: (row) => formatAttendanceDateLabel(row.date, "dd/MM/yyyy"), width: 56 },
  { header: "NIP", value: (row) => row.employee_nip || "-" },
  { header: "Nama", value: (row) => row.employee_name || "-" },
  { header: "OPD", value: (row) => row.employee_opd_code || "-" },
  { header: "Lokasi", value: (row) => row.office_name || "-" },
  { header: "Jam Masuk", value: (row) => (row.check_in_time ? format(new Date(row.check_in_time), "HH:mm") : "-"), align: "center", width: 44 },
  { header: "Jam Keluar", value: (row) => (row.check_out_time ? format(new Date(row.check_out_time), "HH:mm") : "-"), align: "center", width: 48 },
  { header: "Status", value: (row) => row.status_label || "-" },
  { header: "Keterangan", value: (row) => row.keterangan || "-" },
];

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    Hadir: { variant: "default", className: "bg-green-500 hover:bg-green-600" },
    Izin: { variant: "outline", className: "border-blue-500 text-blue-600" },
    Cuti: { variant: "outline", className: "border-purple-500 text-purple-600" },
    Sakit: { variant: "outline", className: "border-pink-500 text-pink-600" },
    "Tugas Luar": { variant: "outline", className: "border-cyan-500 text-cyan-600" },
    "Tidak Hadir": { variant: "destructive", className: "" },
  };
  const style = variants[status] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{status}</Badge>;
};

const getKeteranganBadge = (keterangan: string) => {
  if (keterangan === "-") return <span className="text-muted-foreground">-</span>;
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    Hadir: { variant: "default", className: "bg-green-500 hover:bg-green-600" },
    Telat: { variant: "secondary", className: "bg-yellow-500 text-black hover:bg-yellow-600" },
    "Pulang Cepat": { variant: "secondary", className: "bg-orange-500 hover:bg-orange-600" },
    "Telat + Pulang Cepat": { variant: "destructive", className: "bg-red-500 hover:bg-red-600" },
    "Tidak Absen Pulang": { variant: "outline", className: "border-orange-500 text-orange-600" },
    "Telat (Belum Pulang)": { variant: "outline", className: "border-yellow-500 text-yellow-600" },
  };
  const style = variants[keterangan] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{keterangan}</Badge>;
};

export default function OrgAttendanceReport() {
  const [records, setRecords] = useState<AttendanceReportRecord[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterKeterangan, setFilterKeterangan] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasQueried, setHasQueried] = useState(false);
  const [isBusyHours, setIsBusyHours] = useState<boolean>(() => isPeakHours());
  const itemsPerPage = 20;
  const busyHoursMessage =
    "Jam sibuk absensi sedang berlangsung. Penarikan Laporan Absensi sementara dibatasi. Coba lagi di luar jam sibuk (06:00-09:00 dan 15:00-18:00).";

  const fetchOpds = useCallback(async (tid: string) => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("*")
              .eq("tenant_id", tid)
              .order("name"),
            ATTENDANCE_READ_TIMEOUT_MS,
            "Permintaan data OPD timeout."
          ),
        {
          maxRetries: ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      setOpds(data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.attendance.fetch_opd");
      const message = appendErrorReference("Gagal memuat data OPD", errorRef);
      toast.error(message);
      setLoadError(message);
      setOpds([]);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoadError(null);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ATTENDANCE_READ_TIMEOUT_MS,
            "Permintaan user auth timeout."
          ),
        {
          maxRetries: ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!user) return;

      let resolvedTenantId: string | null = null;
      const { data: roleRows, error: roleError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("user_roles")
              .select("role, tenant_id")
              .eq("user_id", user.id)
              .eq("role", "admin_instansi"),
            ATTENDANCE_READ_TIMEOUT_MS,
            "Permintaan role tenant timeout."
          ),
        {
          maxRetries: ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (roleError) throw roleError;
      resolvedTenantId = roleRows?.find((row) => row.tenant_id)?.tenant_id ?? null;

      if (!resolvedTenantId) {
        const { data: empData, error: empError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("tenant_id")
                .eq("user_id", user.id)
                .maybeSingle(),
              ATTENDANCE_READ_TIMEOUT_MS,
              "Permintaan tenant pegawai timeout."
            ),
          {
            maxRetries: ATTENDANCE_MAX_RETRIES,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (empError) throw empError;
        resolvedTenantId = empData?.tenant_id ?? null;
      }

      if (!resolvedTenantId) return;
      setTenantId(resolvedTenantId);
      await fetchOpds(resolvedTenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.attendance.fetch_initial_data");
      const message = appendErrorReference("Gagal memuat data awal laporan", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsRetrying(false);
    }
  }, [fetchOpds]);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsBusyHours(isPeakHours());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchReportPage = useCallback(async (page: number) => {
    if (!startDate || !endDate || !tenantId) return;
    if (isPeakHours()) {
      setLoadError(busyHoursMessage);
      return;
    }
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("org_get_attendance_report_page", {
              p_start_date: startDate,
              p_end_date: endDate,
              p_opd_id: filterOpd === "all" ? null : filterOpd,
              p_search: searchTerm.trim() || null,
              p_status: filterStatus === "all" ? null : filterStatus,
              p_keterangan: filterKeterangan === "all" ? null : filterKeterangan,
              p_page: page,
              p_page_size: itemsPerPage,
            }),
            ATTENDANCE_READ_TIMEOUT_MS,
            "Permintaan halaman laporan absensi timeout."
          ),
        {
          maxRetries: ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      const rows = (data || []) as Array<AttendanceReportRecord & { total_count: number }>;
      setRecords(rows.map(({ total_count: _ignore, ...rest }) => rest));
      setTotalRecords(rows[0]?.total_count ?? 0);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.attendance.fetch_report", {
        tenant_id: tenantId,
        filter_opd: filterOpd,
        start_date: startDate,
        end_date: endDate,
      });
      const message = appendErrorReference("Gagal memuat laporan absensi", errorRef);
      toast.error(message);
      setLoadError(message);
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [busyHoursMessage, endDate, filterKeterangan, filterOpd, filterStatus, itemsPerPage, searchTerm, startDate, tenantId]);

  const fetchAllForOutput = useCallback(async (): Promise<AttendanceReportRecord[]> => {
    if (isPeakHours()) {
      return [];
    }
    const pageSize = 200;
    let page = 1;
    let allRows: AttendanceReportRecord[] = [];

    while (true) {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("org_get_attendance_report_page", {
              p_start_date: startDate,
              p_end_date: endDate,
              p_opd_id: filterOpd === "all" ? null : filterOpd,
              p_search: searchTerm.trim() || null,
              p_status: filterStatus === "all" ? null : filterStatus,
              p_keterangan: filterKeterangan === "all" ? null : filterKeterangan,
              p_page: page,
              p_page_size: pageSize,
            }),
            ATTENDANCE_OUTPUT_TIMEOUT_MS,
            "Permintaan data export laporan absensi timeout."
          ),
        {
          maxRetries: ATTENDANCE_MAX_RETRIES,
          shouldRetry: isRetryableError,
        }
      );
      if (error) throw error;

      const rows = (data || []) as Array<AttendanceReportRecord & { total_count: number }>;
      allRows = allRows.concat(rows.map(({ total_count: _ignore, ...rest }) => rest));
      const total = rows[0]?.total_count ?? 0;
      if (allRows.length >= total || rows.length === 0) break;
      page += 1;
    }

    return allRows;
  }, [endDate, filterKeterangan, filterOpd, filterStatus, searchTerm, startDate]);

  const fetchReport = async () => {
    if (isBusyHours) {
      toast.error(busyHoursMessage);
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Pilih rentang tanggal");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum terdeteksi. Muat ulang halaman.");
      return;
    }
    setCurrentPage(1);
    setHasQueried(true);
    await fetchReportPage(1);
  };

  useEffect(() => {
    if (hasQueried) {
      void fetchReportPage(currentPage);
    }
  }, [currentPage, hasQueried, fetchReportPage]);

  useEffect(() => {
    if (!hasQueried) return;
    setCurrentPage(1);
    void fetchReportPage(1);
  }, [searchTerm, filterStatus, filterKeterangan, filterOpd, hasQueried, fetchReportPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalRecords / itemsPerPage));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalRecords]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

  const handleExport = async () => {
    if (isBusyHours) {
      toast.error(busyHoursMessage);
      return;
    }
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }

    try {
      const outputRows = await fetchAllForOutput();
      if (outputRows.length === 0) {
        toast.error("Tidak ada data untuk diexport");
        return;
      }
      const traceId = createReportTraceId("ATT-CSV");
      const csv = buildReportCsv({
        columns: attendanceOutputColumns,
        rows: outputRows,
      });

      downloadCsvFile(`laporan-absensi-${startDate}-${endDate}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: "attendance_report_export_csv",
        filters: {
          end_date: endDate,
          keterangan: filterKeterangan === "all" ? null : filterKeterangan,
          opd_id: filterOpd === "all" ? null : filterOpd,
          search: searchTerm.trim() || null,
          start_date: startDate,
          status: filterStatus === "all" ? null : filterStatus,
        },
        outputType: "csv",
        reportName: "Laporan Absensi Organisasi",
        rowCount: outputRows.length,
        tenantId,
        traceId,
      });

      if (!auditResult.ok) {
        toast.warning(
          appendErrorReference(`CSV berhasil diunduh, tetapi audit log gagal dicatat. Ref dokumen: ${traceId}`, auditResult.errorRef),
        );
        return;
      }

      toast.success(`CSV berhasil diunduh (Ref: ${traceId})`);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.attendance.export");
      toast.error(appendErrorReference("Gagal export data laporan", errorRef));
    }
  };

  const handleDownloadPdf = async () => {
    if (isBusyHours) {
      toast.error(busyHoursMessage);
      return;
    }
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }

    try {
      const outputRows = await fetchAllForOutput();
      if (outputRows.length === 0) {
        toast.error("Tidak ada data untuk dicetak");
        return;
      }
      const traceId = createReportTraceId("ATT-PDF");
      const periodLabel = startDate && endDate ? `${startDate} s/d ${endDate}` : "Semua periode";
      const opdLabel =
        filterOpd === "all" ? "Semua OPD" : opds.find((item) => item.id === filterOpd)?.name || filterOpd;

      downloadReportPdf({
        columns: attendanceOutputColumns,
        filename: `laporan-absensi-${startDate}-${endDate}.pdf`,
        metadataLines: [
          `Periode: ${periodLabel}`,
          `Filter OPD: ${opdLabel}`,
          `Filter status: ${filterStatus === "all" ? "Semua status" : filterStatus}`,
          `Filter keterangan: ${filterKeterangan === "all" ? "Semua keterangan" : filterKeterangan}`,
          `Pencarian: ${searchTerm.trim() || "-"}`,
          `Total data: ${outputRows.length}`,
        ],
        rows: outputRows,
        sourceLabel: "AbsensiKu /org/reports/attendance",
        title: "Laporan Absensi Pegawai",
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: "attendance_report_download_pdf",
        filters: {
          end_date: endDate,
          keterangan: filterKeterangan === "all" ? null : filterKeterangan,
          opd_id: filterOpd === "all" ? null : filterOpd,
          search: searchTerm.trim() || null,
          start_date: startDate,
          status: filterStatus === "all" ? null : filterStatus,
        },
        outputType: "pdf",
        reportName: "Laporan Absensi Organisasi",
        rowCount: outputRows.length,
        tenantId,
        traceId,
      });

      if (!auditResult.ok) {
        toast.warning(
          appendErrorReference(`PDF berhasil diunduh, tetapi audit log gagal dicatat. Ref dokumen: ${traceId}`, auditResult.errorRef),
        );
        return;
      }

      toast.success(`PDF berhasil diunduh (Ref: ${traceId})`);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.attendance.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF laporan", errorRef));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data laporan absensi...
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Laporan Absensi
            </h1>
            <p className="text-muted-foreground">Laporan absensi pegawai berdasarkan jadwal jam kerja</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPdf} disabled={totalRecords === 0 || isLoading || isBusyHours}>
              <FileText className="mr-2 h-4 w-4" /> Unduh PDF
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={totalRecords === 0 || isLoading || isBusyHours}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <AttendanceRecapTabs />

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchReportPage(currentPage)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Coba Lagi
            </Button>
          </div>
        )}

        {isBusyHours && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {busyHoursMessage}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="grid gap-2">
                <Label>OPD</Label>
                <Select value={filterOpd} onValueChange={setFilterOpd}>
                  <SelectTrigger><SelectValue placeholder="Semua OPD" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opds.map((opd) => (
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
                  <SelectTrigger><SelectValue placeholder="Semua Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Keterangan</Label>
                <Select value={filterKeterangan} onValueChange={setFilterKeterangan}>
                  <SelectTrigger><SelectValue placeholder="Semua Keterangan" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Keterangan</SelectItem>
                    {KETERANGAN_OPTIONS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading || isBusyHours}>
                  {isLoading ? "Memuat..." : "Tampilkan"}
                </Button>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Laporan</CardTitle>
            <CardDescription>Total {totalRecords} data absensi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari nama / NIP..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
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
                  ) : records.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Pilih filter dan klik Tampilkan</TableCell></TableRow>
                  ) : (
                    records.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell>{(currentPage - 1) * itemsPerPage + i + 1}</TableCell>
                        <TableCell>{formatAttendanceDateLabel(r.date, "d MMM yyyy")}</TableCell>
                        <TableCell className="font-mono text-sm">{r.employee_nip || "-"}</TableCell>
                        <TableCell>{r.employee_name}</TableCell>
                        <TableCell>{r.employee_opd_code || "-"}</TableCell>
                        <TableCell>{r.check_in_time ? format(new Date(r.check_in_time), "HH:mm") : "-"}</TableCell>
                        <TableCell>{r.check_out_time ? format(new Date(r.check_out_time), "HH:mm") : "-"}</TableCell>
                        <TableCell>{getStatusBadge(r.status_label)}</TableCell>
                        <TableCell>{getKeteranganBadge(r.keterangan)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalRecords > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalRecords)} dari {totalRecords} data
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    {currentPage > 2 && (<PaginationItem><PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">1</PaginationLink></PaginationItem>)}
                    {currentPage > 3 && (<PaginationItem><PaginationEllipsis /></PaginationItem>)}
                    {Array.from({ length: Math.min(3, totalPages) }, (_, idx) => {
                      const pageNum = Math.max(1, Math.min(currentPage - 1, totalPages - 2)) + idx;
                      if (pageNum > totalPages) return null;
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink isActive={pageNum === currentPage} onClick={() => setCurrentPage(pageNum)} className="cursor-pointer">{pageNum}</PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    {currentPage < totalPages - 2 && (<PaginationItem><PaginationEllipsis /></PaginationItem>)}
                    {currentPage < totalPages - 1 && totalPages > 3 && (<PaginationItem><PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">{totalPages}</PaginationLink></PaginationItem>)}
                    <PaginationItem>
                      <PaginationNext onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_report_attendance" />
      </div>
    </OrganizationLayout>
  );
}
