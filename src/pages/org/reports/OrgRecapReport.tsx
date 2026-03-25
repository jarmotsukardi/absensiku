import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  buildReportCsv,
  createReportTraceId,
  downloadCsvFile,
  downloadReportPdf,
  recordReportOutputAudit,
  type ReportOutputColumn,
} from "@/lib/reportOutput";

type OPD = Tables<"opd">;

interface RecapData {
  employee_id: string;
  employee_name: string;
  employee_nip: string;
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

const months = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const RECAP_READ_TIMEOUT_MS = 12000;
const RECAP_OUTPUT_TIMEOUT_MS = 20000;
const RECAP_MAX_RETRIES = 2;

const normalizeRecapRows = (rows: Array<RecapData & { total_count?: number }>): RecapData[] =>
  rows.map(({ total_count: _ignore, ...rest }) => ({
    ...rest,
    hadir: Number(rest.hadir || 0),
    terlambat: Number(rest.terlambat || 0),
    pulang_cepat: Number(rest.pulang_cepat || 0),
    terlambat_pulang_cepat: Number(rest.terlambat_pulang_cepat || 0),
    tidak_hadir: Number(rest.tidak_hadir || 0),
    izin: Number(rest.izin || 0),
    cuti: Number(rest.cuti || 0),
    sakit: Number(rest.sakit || 0),
    tugas_luar: Number(rest.tugas_luar || 0),
    wfh: Number(rest.wfh || 0),
  }));

const recapOutputColumns: ReportOutputColumn<RecapData>[] = [
  { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
  { header: "NIP", value: (row) => row.employee_nip || "-" },
  { header: "Nama", value: (row) => row.employee_name || "-" },
  { header: "OPD", value: (row) => row.opd_code || "-" },
  { header: "Hadir", value: (row) => row.hadir, align: "right", width: 36 },
  { header: "Terlambat", value: (row) => row.terlambat, align: "right", width: 44 },
  { header: "Pulang Cepat", value: (row) => row.pulang_cepat, align: "right", width: 48 },
  { header: "Telat + Pulang Cepat", value: (row) => row.terlambat_pulang_cepat, align: "right", width: 56 },
  { header: "Tidak Hadir", value: (row) => row.tidak_hadir, align: "right", width: 46 },
  { header: "Izin", value: (row) => row.izin, align: "right", width: 36 },
  { header: "Cuti", value: (row) => row.cuti, align: "right", width: 36 },
  { header: "Sakit", value: (row) => row.sakit, align: "right", width: 36 },
  { header: "Tugas Luar", value: (row) => row.tugas_luar, align: "right", width: 46 },
  { header: "WFH", value: (row) => row.wfh, align: "right", width: 36 },
];

export default function OrgRecapReport() {
  const [recap, setRecap] = useState<RecapData[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [hasQueried, setHasQueried] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBusyHours, setIsBusyHours] = useState<boolean>(() => isPeakHours());
  const [tenantId, setTenantId] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 15;
  const busyHoursMessage =
    "Jam sibuk absensi sedang berlangsung. Penarikan Rekapitulasi sementara dibatasi. Coba lagi di luar jam sibuk (06:00-09:00 dan 15:00-18:00).";

  const fetchInitialData = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) {
        throw new Error("Tenant organisasi tidak ditemukan.");
      }

      setTenantId(resolvedTenantId);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("opd").select("*").eq("tenant_id", resolvedTenantId).order("name"),
            RECAP_READ_TIMEOUT_MS,
            "Permintaan data OPD timeout."
          ),
        {
          maxRetries: RECAP_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      setOpds(data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.recap.fetch_initial_data");
      const message = appendErrorReference("Gagal memuat data awal rekapitulasi", errorRef);
      toast.error(message);
      setLoadError(message);
      setTenantId(null);
      setOpds([]);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsBusyHours(isPeakHours());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchRecapPage = useCallback(async (page: number) => {
    if (!tenantId) return;
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
            supabase.rpc("org_get_attendance_recap_page", {
              p_year: year,
              p_month: month,
              p_opd_id: filterOpd === "all" ? null : filterOpd,
              p_search: searchTerm.trim() || null,
              p_page: page,
              p_page_size: ITEMS_PER_PAGE,
            }),
            RECAP_READ_TIMEOUT_MS,
            "Permintaan halaman rekapitulasi timeout."
          ),
        {
          maxRetries: RECAP_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      const rows = (data || []) as Array<RecapData & { total_count: number }>;
      setRecap(normalizeRecapRows(rows));
      setTotalRows(rows[0]?.total_count ?? 0);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.recap.fetch", {
        opd_id: filterOpd === "all" ? null : filterOpd,
        month,
        tenant_id: tenantId,
        year,
      });
      const message = appendErrorReference("Gagal memuat rekapitulasi", errorRef);
      toast.error(message);
      setLoadError(message);
      setRecap([]);
      setTotalRows(0);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [ITEMS_PER_PAGE, busyHoursMessage, filterOpd, month, searchTerm, tenantId, year]);

  const fetchAllRecapForOutput = useCallback(async (): Promise<RecapData[]> => {
    if (!tenantId) {
      return [];
    }
    if (isPeakHours()) {
      return [];
    }
    const pageSize = 200;
    let page = 1;
    let allRows: RecapData[] = [];

    while (true) {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("org_get_attendance_recap_page", {
              p_year: year,
              p_month: month,
              p_opd_id: filterOpd === "all" ? null : filterOpd,
              p_search: searchTerm.trim() || null,
              p_page: page,
              p_page_size: pageSize,
            }),
            RECAP_OUTPUT_TIMEOUT_MS,
            "Permintaan data export rekapitulasi timeout."
          ),
        {
          maxRetries: RECAP_MAX_RETRIES,
          shouldRetry: isRetryableError,
        }
      );
      if (error) throw error;

      const rows = (data || []) as Array<RecapData & { total_count: number }>;
      const normalized = normalizeRecapRows(rows);

      allRows = allRows.concat(normalized);
      const total = rows[0]?.total_count ?? 0;
      if (allRows.length >= total || rows.length === 0) break;
      page += 1;
    }

    return allRows;
  }, [filterOpd, month, searchTerm, tenantId, year]);

  const handleShow = async () => {
    if (isBusyHours) {
      toast.error(busyHoursMessage);
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum terdeteksi. Muat ulang halaman.");
      return;
    }
    setCurrentPage(1);
    setHasQueried(true);
    await fetchRecapPage(1);
  };

  useEffect(() => {
    if (hasQueried) {
      void fetchRecapPage(currentPage);
    }
  }, [currentPage, hasQueried, fetchRecapPage]);

  useEffect(() => {
    if (!hasQueried) return;
    setCurrentPage(1);
    void fetchRecapPage(1);
  }, [filterOpd, month, year, searchTerm, hasQueried, fetchRecapPage]);

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
      const outputRows = await fetchAllRecapForOutput();
      if (outputRows.length === 0) {
        toast.error("Tidak ada data untuk diexport");
        return;
      }
      const traceId = createReportTraceId("RECAP-CSV");
      const csv = buildReportCsv({
        columns: recapOutputColumns,
        rows: outputRows,
      });

      downloadCsvFile(`rekapitulasi-${year}-${String(month).padStart(2, "0")}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: "attendance_recap_export_csv",
        filters: {
          month,
          opd_id: filterOpd === "all" ? null : filterOpd,
          search: searchTerm.trim() || null,
          year,
        },
        outputType: "csv",
        reportName: "Rekapitulasi Absensi Organisasi",
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
      const errorRef = reportError(error, "org.reports.recap.export");
      toast.error(appendErrorReference("Gagal export rekapitulasi", errorRef));
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
      const outputRows = await fetchAllRecapForOutput();
      if (outputRows.length === 0) {
        toast.error("Tidak ada data untuk dicetak");
        return;
      }

      const traceId = createReportTraceId("RECAP-PDF");
      const periodLabel = `${months[month - 1]} ${year}`;
      const opdLabel =
        filterOpd === "all" ? "Semua OPD" : opds.find((item) => item.id === filterOpd)?.name || filterOpd;

      downloadReportPdf({
        columns: recapOutputColumns,
        filename: `rekapitulasi-${year}-${String(month).padStart(2, "0")}.pdf`,
        metadataLines: [
          `Periode: ${periodLabel}`,
          `Filter OPD: ${opdLabel}`,
          `Pencarian: ${searchTerm.trim() || "-"}`,
          `Total pegawai: ${outputRows.length}`,
        ],
        rows: outputRows,
        sourceLabel: "AbsensiKu /org/reports/recap",
        title: "Rekapitulasi Absensi Pegawai",
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: "attendance_recap_download_pdf",
        filters: {
          month,
          opd_id: filterOpd === "all" ? null : filterOpd,
          search: searchTerm.trim() || null,
          year,
        },
        outputType: "pdf",
        reportName: "Rekapitulasi Absensi Organisasi",
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
      const errorRef = reportError(error, "org.reports.recap.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF rekapitulasi", errorRef));
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalRows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data rekapitulasi...
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Rekapitulasi Absensi
            </h1>
            <p className="text-muted-foreground">Rekap bulanan kehadiran pegawai</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPdf} disabled={totalRows === 0 || isLoading || isBusyHours}>
              <FileText className="mr-2 h-4 w-4" /> Unduh PDF
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={totalRows === 0 || isLoading || isBusyHours}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <AttendanceRecapTabs />

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchRecapPage(currentPage)}>
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
            <CardTitle>Filter Rekapitulasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
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
                <Label>Bulan</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tahun</Label>
                <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || "0", 10) || new Date().getFullYear())} />
              </div>
              <div className="flex items-end">
                <Button onClick={handleShow} className="w-full" disabled={isLoading || isBusyHours}>
                  {isLoading ? "Memuat..." : "Tampilkan"}
                </Button>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Rekapitulasi</CardTitle>
            <CardDescription>Periode: {months[month - 1]} {year} • Total {totalRows} pegawai</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 max-w-sm">
              <Input placeholder="Cari nama / NIP..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

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
                    <TableHead className="text-center">Cuti</TableHead>
                    <TableHead className="text-center">Sakit</TableHead>
                    <TableHead className="text-center">Dinas</TableHead>
                    <TableHead className="text-center">WFH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={14} className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div></TableCell></TableRow>
                  ) : recap.length === 0 ? (
                    <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Pilih filter dan klik Tampilkan</TableCell></TableRow>
                  ) : (
                    recap.map((r, i) => (
                      <TableRow key={r.employee_id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{r.employee_nip || "-"}</TableCell>
                        <TableCell>{r.employee_name}</TableCell>
                        <TableCell>{r.opd_code || "-"}</TableCell>
                        <TableCell className="text-center">{r.hadir}</TableCell>
                        <TableCell className="text-center">{r.terlambat}</TableCell>
                        <TableCell className="text-center">{r.pulang_cepat}</TableCell>
                        <TableCell className="text-center">{r.terlambat_pulang_cepat}</TableCell>
                        <TableCell className="text-center">{r.tidak_hadir}</TableCell>
                        <TableCell className="text-center">{r.izin}</TableCell>
                        <TableCell className="text-center">{r.cuti}</TableCell>
                        <TableCell className="text-center">{r.sakit}</TableCell>
                        <TableCell className="text-center">{r.tugas_luar}</TableCell>
                        <TableCell className="text-center">{r.wfh}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalRows > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Halaman {currentPage} dari {totalPages}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Sebelumnya</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Berikutnya</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_report_recap" />
      </div>
    </OrganizationLayout>
  );
}
