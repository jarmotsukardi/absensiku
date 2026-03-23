import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarDays, Download, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { RequestReportsTabs } from "@/components/org/reports/RequestReportsTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

type LeaveRequestRow = Tables<"leave_requests">;
type OPD = Tables<"opd">;
type WorkUnit = Tables<"work_units">;
type LeaveType = Database["public"]["Enums"]["leave_type"];
type RequestStatus = Database["public"]["Enums"]["request_status"];

interface LeaveEmployee {
  id: string;
  name: string | null;
  nip: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
}

interface LeaveQueryRow extends LeaveRequestRow {
  employees: LeaveEmployee | null;
}

interface LeaveRecord extends LeaveRequestRow {
  employees: LeaveEmployee | null;
}

const ITEMS_PER_PAGE = 20;
const FETCH_CHUNK = 500;
const LEAVE_REPORT_QUERY_TIMEOUT_MS = 15000;
const LEAVE_REPORT_QUERY_RETRY_MAX = 1;

const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveType; label: string }> = [
  { value: "izin", label: "Izin" },
  { value: "cuti_tahunan", label: "Cuti Tahunan" },
  { value: "cuti_penting", label: "Cuti Penting" },
  { value: "cuti_lainnya", label: "Cuti Lainnya" },
  { value: "sakit", label: "Sakit" },
  { value: "tugas_luar", label: "Tugas Luar" },
];

const REQUEST_STATUS_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: "menunggu", label: "Menunggu" },
  { value: "disetujui", label: "Disetujui" },
  { value: "ditolak", label: "Ditolak" },
];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getLeaveTypeLabel = (type: string): string =>
  LEAVE_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;

const getStatusLabel = (status: string): string =>
  REQUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

const getStatusBadge = (status: string) => {
  if (status === "menunggu") return <Badge variant="secondary">Menunggu</Badge>;
  if (status === "disetujui") return <Badge className="bg-green-500 hover:bg-green-600">Disetujui</Badge>;
  if (status === "ditolak") return <Badge variant="destructive">Ditolak</Badge>;
  return <Badge variant="outline">{status}</Badge>;
};

const getDurationLabel = (record: LeaveRecord): string => {
  if (record.is_half_day) return "0.5 hari";
  const durationDays = differenceInCalendarDays(new Date(record.end_date), new Date(record.start_date)) + 1;
  const safeDays = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 1;
  return `${safeDays} hari`;
};

export default function OrgLeaveReport() {
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<"all" | LeaveType>("all");
  const [opdFilter, setOpdFilter] = useState("all");
  const [workUnitFilter, setWorkUnitFilter] = useState("all");

  useEffect(() => {
    const init = async () => {
      try {
        setLoadError(null);
        const resolvedTenant = await withTimeout(
          resolveOrgTenantId(),
          LEAVE_REPORT_QUERY_TIMEOUT_MS,
          "org.reports.leave.init.resolve_tenant timeout",
        );
        setTenantId(resolvedTenant);
        if (!resolvedTenant) return;

        const [opdRes, workUnitRes] = await withExponentialBackoff(
          () =>
            withTimeout(
              Promise.all([
                supabase.from("opd").select("*").eq("tenant_id", resolvedTenant).order("name"),
                supabase.from("work_units").select("*").eq("tenant_id", resolvedTenant).order("name"),
              ]),
              LEAVE_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.leave.init.query timeout",
            ),
          {
            maxRetries: LEAVE_REPORT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );

        if (opdRes.error) throw opdRes.error;
        if (workUnitRes.error) throw workUnitRes.error;

        setOpds(opdRes.data || []);
        setWorkUnits(workUnitRes.data || []);
      } catch (error) {
        const errorRef = reportError(error, "org.reports.leave.init");
        const message = appendErrorReference("Gagal memuat data awal laporan izin/cuti", errorRef);
        setLoadError(message);
        toast.error(message);
      }
    };

    void init();
  }, []);

  const opdMap = useMemo(() => {
    const map = new Map<string, OPD>();
    opds.forEach((opd) => map.set(opd.id, opd));
    return map;
  }, [opds]);

  const workUnitMap = useMemo(() => {
    const map = new Map<string, WorkUnit>();
    workUnits.forEach((workUnit) => map.set(workUnit.id, workUnit));
    return map;
  }, [workUnits]);

  const fetchReport = useCallback(async () => {
    if (!tenantId) {
      setRecords([]);
      return;
    }

    setIsLoading(true);
    try {
      setLoadError(null);
      const employeeIds = await withExponentialBackoff(
        () =>
          withTimeout(
            getTenantEmployeeIds(tenantId),
            LEAVE_REPORT_QUERY_TIMEOUT_MS,
            "org.reports.leave.fetch.employee_ids timeout",
          ),
        {
          maxRetries: LEAVE_REPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (employeeIds.length === 0) {
        setRecords([]);
        return;
      }

      const allRows: LeaveRecord[] = [];
      let offset = 0;

      while (true) {
        let query = supabase
          .from("leave_requests")
          .select("id, employee_id, start_date, end_date, leave_type, reason, status, rejection_reason, approved_by, approved_at, is_half_day, attachment_url, created_at, updated_at, employees!leave_requests_employee_id_fkey(id, name, nip, opd_id, work_unit_id)")
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + FETCH_CHUNK - 1);

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }
        if (leaveTypeFilter !== "all") {
          query = query.eq("leave_type", leaveTypeFilter);
        }
        if (startDate) {
          query = query.gte("end_date", startDate);
        }
        if (endDate) {
          query = query.lte("start_date", endDate);
        }

        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              query,
              LEAVE_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.leave.fetch.chunk timeout",
            ),
          {
            maxRetries: LEAVE_REPORT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );
        if (error) throw error;

        const chunk = ((data || []) as LeaveQueryRow[]).map((row) => ({
          ...row,
          employees: row.employees || null,
        }));
        allRows.push(...chunk);

        if (chunk.length < FETCH_CHUNK) break;
        offset += FETCH_CHUNK;
      }

      setRecords(allRows);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.leave.fetch", {
        tenant_id: tenantId,
        status: statusFilter,
        leave_type: leaveTypeFilter,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      const message = appendErrorReference("Gagal memuat laporan izin/cuti", errorRef);
      setLoadError(message);
      toast.error(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, leaveTypeFilter, startDate, statusFilter, tenantId]);

  const filteredRecords = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      if (opdFilter !== "all" && record.employees?.opd_id !== opdFilter) return false;
      if (workUnitFilter !== "all" && record.employees?.work_unit_id !== workUnitFilter) return false;

      if (!needle) return true;
      const searchable = [
        record.employees?.name || "",
        record.employees?.nip || "",
        record.reason || "",
        getLeaveTypeLabel(record.leave_type),
        getStatusLabel(record.status || ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [opdFilter, records, searchTerm, workUnitFilter]);

  const totalRows = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, opdFilter, workUnitFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredRecords]);

  const handleShow = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan. Muat ulang halaman.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error("Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }

    setHasQueried(true);
    setCurrentPage(1);
    await fetchReport();
  };

  const handleExport = async () => {
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    try {
      const csv = [
        [
          "No",
          "Tanggal Pengajuan",
          "Nama Pegawai",
          "NIP",
          "OPD",
          "Satuan Kerja",
          "Jenis",
          "Periode",
          "Durasi",
          "Status",
          "Alasan",
          "Catatan Penolakan",
        ].join(","),
        ...filteredRecords.map((record, index) => {
          const opdLabel = record.employees?.opd_id ? opdMap.get(record.employees.opd_id)?.code || "-" : "-";
          const unitLabel = record.employees?.work_unit_id ? workUnitMap.get(record.employees.work_unit_id)?.name || "-" : "-";
          return [
            index + 1,
            record.created_at ? format(new Date(record.created_at), "yyyy-MM-dd HH:mm") : "-",
            `"${(record.employees?.name || "-").replace(/"/g, '""')}"`,
            record.employees?.nip || "-",
            `"${opdLabel.replace(/"/g, '""')}"`,
            `"${unitLabel.replace(/"/g, '""')}"`,
            getLeaveTypeLabel(record.leave_type),
            `${record.start_date} s/d ${record.end_date}`,
            getDurationLabel(record),
            getStatusLabel(record.status || ""),
            `"${(record.reason || "-").replace(/"/g, '""')}"`,
            `"${(record.rejection_reason || "-").replace(/"/g, '""')}"`,
          ].join(",");
        }),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan-izin-cuti-${startDate || "all"}-${endDate || "all"}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Export berhasil");
    } catch (error) {
      const errorRef = reportError(error, "org.reports.leave.export");
      toast.error(appendErrorReference("Gagal export laporan izin/cuti", errorRef));
    }
  };

  const handlePrintPdf = async () => {
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk dicetak");
      return;
    }

    try {
      const periodLabel = startDate && endDate ? `${startDate} s/d ${endDate}` : "Semua periode";
      const printedAt = format(new Date(), "d MMMM yyyy HH:mm", { locale: localeId });
      const rowsHtml = filteredRecords
        .map((record, index) => {
          const opdLabel = record.employees?.opd_id ? opdMap.get(record.employees.opd_id)?.code || "-" : "-";
          const unitLabel = record.employees?.work_unit_id ? workUnitMap.get(record.employees.work_unit_id)?.name || "-" : "-";
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(record.created_at ? format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId }) : "-")}</td>
              <td>${escapeHtml(record.employees?.name || "-")}</td>
              <td>${escapeHtml(record.employees?.nip || "-")}</td>
              <td>${escapeHtml(opdLabel)}</td>
              <td>${escapeHtml(unitLabel)}</td>
              <td>${escapeHtml(getLeaveTypeLabel(record.leave_type))}</td>
              <td>${escapeHtml(`${record.start_date} s/d ${record.end_date}`)}</td>
              <td>${escapeHtml(getDurationLabel(record))}</td>
              <td>${escapeHtml(getStatusLabel(record.status || ""))}</td>
            </tr>
          `;
        })
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
            <title>Laporan Izin/Cuti</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
              h1 { margin: 0 0 8px; font-size: 20px; }
              .meta { margin: 0 0 16px; font-size: 12px; color: #444; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
              th { background: #f3f4f6; }
              .footer { margin-top: 12px; font-size: 11px; color: #666; }
            </style>
          </head>
          <body>
            <h1>Laporan Izin/Cuti Pegawai</h1>
            <p class="meta">Periode: ${escapeHtml(periodLabel)} | Total: ${filteredRecords.length} data | Dicetak: ${escapeHtml(printedAt)}</p>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tgl Pengajuan</th>
                  <th>Nama</th>
                  <th>NIP</th>
                  <th>OPD</th>
                  <th>Satuan Kerja</th>
                  <th>Jenis</th>
                  <th>Periode</th>
                  <th>Durasi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <p class="footer">Sumber: AbsensiKu /org/reports/leave</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } catch (error) {
      const errorRef = reportError(error, "org.reports.leave.print");
      toast.error(appendErrorReference("Gagal menyiapkan print PDF", errorRef));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Laporan Izin/Cuti
            </h1>
            <p className="text-muted-foreground">Laporan pengajuan izin, cuti, sakit, dan tugas luar</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrintPdf} disabled={filteredRecords.length === 0 || isLoading}>
              <Printer className="mr-2 h-4 w-4" /> Print PDF
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={filteredRecords.length === 0 || isLoading}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <RequestReportsTabs />

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Tanggal Mulai</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Tanggal Akhir</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | RequestStatus)}>
                  <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    {REQUEST_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Jenis Izin/Cuti</Label>
                <Select value={leaveTypeFilter} onValueChange={(value) => setLeaveTypeFilter(value as "all" | LeaveType)}>
                  <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua jenis</SelectItem>
                    {LEAVE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Filter OPD</Label>
                <Select value={opdFilter} onValueChange={setOpdFilter}>
                  <SelectTrigger><SelectValue placeholder="Semua OPD" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opds.map((opd) => (
                      <SelectItem key={opd.id} value={opd.id}>
                        {opd.code} - {opd.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Filter Satuan Kerja</Label>
                <Select value={workUnitFilter} onValueChange={setWorkUnitFilter}>
                  <SelectTrigger><SelectValue placeholder="Semua satuan kerja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua satuan kerja</SelectItem>
                    {workUnits.map((workUnit) => (
                      <SelectItem key={workUnit.id} value={workUnit.id}>
                        {workUnit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Pencarian</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari nama, NIP, alasan, jenis, status..."
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleShow} className="w-full" disabled={isLoading}>
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
            <CardDescription>Total {totalRows} pengajuan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tgl Pengajuan</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Alasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
                      </TableCell>
                    </TableRow>
                  ) : !hasQueried ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Pilih filter lalu klik Tampilkan
                      </TableCell>
                    </TableRow>
                  ) : pagedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Tidak ada data laporan untuk filter saat ini
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRecords.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{record.created_at ? format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId }) : "-"}</TableCell>
                        <TableCell>{record.employees?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{record.employees?.nip || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{getLeaveTypeLabel(record.leave_type)}</Badge></TableCell>
                        <TableCell>{record.start_date} s/d {record.end_date}</TableCell>
                        <TableCell>{getDurationLabel(record)}</TableCell>
                        <TableCell>{getStatusBadge(record.status || "")}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={record.reason}>{record.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {hasQueried && totalRows > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalRows)} dari {totalRows} data
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">Halaman {currentPage} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_report_leave" />
      </div>
    </OrganizationLayout>
  );
}
