import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, Printer, RotateCcw } from "lucide-react";
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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const months = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const RECAP_READ_TIMEOUT_MS = 12000;
const RECAP_OUTPUT_TIMEOUT_MS = 20000;
const RECAP_MAX_RETRIES = 2;

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
  const ITEMS_PER_PAGE = 15;
  const busyHoursMessage =
    "Jam sibuk absensi sedang berlangsung. Penarikan Rekapitulasi sementara dibatasi. Coba lagi di luar jam sibuk (06:00-09:00 dan 15:00-18:00).";

  useEffect(() => {
    const fetchOpds = async () => {
      try {
        setIsRetrying(false);
        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("opd").select("*").order("name"),
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
        const errorRef = reportError(error, "org.reports.recap.fetch_opd");
        const message = appendErrorReference("Gagal memuat data OPD", errorRef);
        toast.error(message);
        setLoadError(message);
      } finally {
        setIsRetrying(false);
      }
    };
    void fetchOpds();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsBusyHours(isPeakHours());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchRecapPage = useCallback(async (page: number) => {
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
      setRecap(rows.map(({ total_count: _ignore, ...rest }) => ({
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
      })));
      setTotalRows(rows[0]?.total_count ?? 0);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.recap.fetch", {
        opd_id: filterOpd === "all" ? null : filterOpd,
        month,
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
  }, [ITEMS_PER_PAGE, busyHoursMessage, filterOpd, month, searchTerm, year]);

  const fetchAllRecapForOutput = useCallback(async (): Promise<RecapData[]> => {
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
      const normalized = rows.map(({ total_count: _ignore, ...rest }) => ({
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

      allRows = allRows.concat(normalized);
      const total = rows[0]?.total_count ?? 0;
      if (allRows.length >= total || rows.length === 0) break;
      page += 1;
    }

    return allRows;
  }, [filterOpd, month, searchTerm, year]);

  const handleShow = async () => {
    if (isBusyHours) {
      toast.error(busyHoursMessage);
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

      const csv = [
        ["No", "NIP", "Nama", "OPD", "Hadir", "Terlambat", "Pulang Cepat", "Telat & Pulang Cepat", "Tidak Hadir", "Izin", "Cuti", "Sakit", "Tugas Luar", "WFH"].join(","),
        ...outputRows.map((r, i) => [
          i + 1,
          r.employee_nip || "",
          r.employee_name,
          r.opd_code || "",
          r.hadir,
          r.terlambat,
          r.pulang_cepat,
          r.terlambat_pulang_cepat,
          r.tidak_hadir,
          r.izin,
          r.cuti,
          r.sakit,
          r.tugas_luar,
          r.wfh,
        ].join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rekapitulasi-${year}-${month}.csv`;
      a.click();
      toast.success("Export berhasil");
    } catch (error) {
      const errorRef = reportError(error, "org.reports.recap.export");
      toast.error(appendErrorReference("Gagal export rekapitulasi", errorRef));
    }
  };

  const handlePrintPdf = async () => {
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

      const periodLabel = `${months[month - 1]} ${year}`;
      const printedAt = new Date().toLocaleString("id-ID");
      const rowsHtml = outputRows
        .map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.employee_nip || "-")}</td>
            <td>${escapeHtml(r.employee_name || "-")}</td>
            <td>${escapeHtml(r.opd_code || "-")}</td>
            <td>${r.hadir}</td>
            <td>${r.terlambat}</td>
            <td>${r.pulang_cepat}</td>
            <td>${r.terlambat_pulang_cepat}</td>
            <td>${r.tidak_hadir}</td>
            <td>${r.izin}</td>
            <td>${r.cuti}</td>
            <td>${r.sakit}</td>
            <td>${r.tugas_luar}</td>
            <td>${r.wfh}</td>
          </tr>
        `)
        .join("");

      const printWindow = window.open("", "_blank", "width=1200,height=800");
      if (!printWindow) {
        toast.error("Popup diblokir browser. Izinkan popup untuk cetak PDF.");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Rekapitulasi Absensi</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
              h1 { margin: 0 0 8px; font-size: 20px; }
              .meta { margin: 0 0 16px; font-size: 12px; color: #444; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
              th { background: #f3f4f6; }
              .center { text-align: center; }
              .footer { margin-top: 12px; font-size: 11px; color: #666; }
            </style>
          </head>
          <body>
            <h1>Rekapitulasi Absensi Pegawai</h1>
            <p class="meta">Periode: ${escapeHtml(periodLabel)} | Total: ${outputRows.length} pegawai | Dicetak: ${escapeHtml(printedAt)}</p>
            <table>
              <thead>
                <tr>
                  <th>No</th><th>NIP</th><th>Nama</th><th>OPD</th><th class="center">Hadir</th><th class="center">Telat</th><th class="center">P. Cepat</th><th class="center">Telat+PC</th><th class="center">Alpa</th><th class="center">Izin</th><th class="center">Cuti</th><th class="center">Sakit</th><th class="center">Dinas</th><th class="center">WFH</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <p class="footer">Sumber: AbsensiKu /org/reports/recap</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } catch (error) {
      const errorRef = reportError(error, "org.reports.recap.print");
      toast.error(appendErrorReference("Gagal menyiapkan print PDF", errorRef));
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
            <Button variant="outline" onClick={handlePrintPdf} disabled={totalRows === 0 || isLoading || isBusyHours}>
              <Printer className="mr-2 h-4 w-4" /> Print PDF
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
