import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Download, FileText, Search, Timer } from "lucide-react";
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
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { RequestReportsTabs } from "@/components/org/reports/RequestReportsTabs";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  buildReportCsv,
  createReportTraceId,
  downloadCsvFile,
  downloadReportPdf,
  recordReportOutputAudit,
  type ReportOutputColumn,
} from "@/lib/reportOutput";

type OvertimeRequestRow = Tables<"overtime_requests">;
type OPD = Tables<"opd">;
type WorkUnit = Tables<"work_units">;

interface OvertimeDateRow {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  is_weekend: boolean | null;
  is_holiday: boolean | null;
}

interface OvertimeEmployee {
  id: string;
  name: string | null;
  nip: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
}

interface OvertimeQueryRow extends OvertimeRequestRow {
  dates: OvertimeDateRow[] | null;
}

interface OvertimeRecord extends OvertimeRequestRow {
  employee: OvertimeEmployee | null;
  dates: OvertimeDateRow[];
}

const ITEMS_PER_PAGE = 20;
const FETCH_CHUNK = 500;
const OVERTIME_REPORT_QUERY_TIMEOUT_MS = 15000;
const OVERTIME_REPORT_QUERY_RETRY_MAX = 1;

const STATUS_OPTIONS = [
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;

const getStatusLabel = (status: string): string =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

const getStatusBadge = (status: string) => {
  if (status === "pending") return <Badge variant="secondary">Menunggu</Badge>;
  if (status === "approved") return <Badge className="bg-green-500 hover:bg-green-600">Disetujui</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Ditolak</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Dibatalkan</Badge>;
  return <Badge variant="outline">{status}</Badge>;
};

const formatHours = (hours: number | null): string => `${Number(hours || 0).toFixed(2)} jam`;

const getDateRangeLabel = (dates: OvertimeDateRow[]): string => {
  if (!dates.length) return "-";
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 1) {
    return format(parseISO(sorted[0].date), "d MMM yyyy", { locale: localeId });
  }
  return `${format(parseISO(sorted[0].date), "d MMM yyyy", { locale: localeId })} - ${format(parseISO(sorted[sorted.length - 1].date), "d MMM yyyy", { locale: localeId })}`;
};

const getOvertimeCreatedAtLabel = (record: OvertimeRecord, pattern: string) =>
  format(new Date(record.created_at), pattern, { locale: localeId });

const getOvertimeOpdLabel = (record: OvertimeRecord, opdMap: Map<string, OPD>) =>
  record.employee?.opd_id ? opdMap.get(record.employee.opd_id)?.code || "-" : "-";

const getOvertimeWorkUnitLabel = (record: OvertimeRecord, workUnitMap: Map<string, WorkUnit>) =>
  record.employee?.work_unit_id ? workUnitMap.get(record.employee.work_unit_id)?.name || "-" : "-";

const buildOvertimeCsvColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => format(new Date(row.created_at), "yyyy-MM-dd HH:mm"), width: 82 },
    { header: "No Request", value: (row) => row.request_number || "-" },
    { header: "Nama Pegawai", value: (row) => row.employee?.name || "-" },
    { header: "NIP", value: (row) => row.employee?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getOvertimeOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getOvertimeWorkUnitLabel(row, workUnitMap) },
    { header: "Rentang Tanggal Lembur", value: (row) => getDateRangeLabel(row.dates) },
    { header: "Jumlah Tanggal", value: (row) => row.dates.length, align: "right", width: 48 },
    { header: "Total Jam", value: (row) => Number(row.total_hours || 0).toFixed(2), align: "right", width: 48 },
    { header: "Status", value: (row) => getStatusLabel(row.status), width: 54 },
    { header: "Alasan", value: (row) => row.reason || "-" },
    { header: "Catatan Penolakan", value: (row) => row.rejection_reason || "-" },
  ] satisfies ReportOutputColumn<OvertimeRecord>[];

const buildOvertimePdfColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => getOvertimeCreatedAtLabel(row, "d MMM yyyy HH:mm"), width: 82 },
    { header: "No Request", value: (row) => row.request_number || "-" },
    { header: "Nama Pegawai", value: (row) => row.employee?.name || "-" },
    { header: "NIP", value: (row) => row.employee?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getOvertimeOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getOvertimeWorkUnitLabel(row, workUnitMap) },
    { header: "Rentang Tanggal Lembur", value: (row) => getDateRangeLabel(row.dates) },
    { header: "Jumlah Tanggal", value: (row) => row.dates.length, align: "right", width: 48 },
    { header: "Total Jam", value: (row) => formatHours(row.total_hours), align: "right", width: 52 },
    { header: "Status", value: (row) => getStatusLabel(row.status), width: 54 },
  ] satisfies ReportOutputColumn<OvertimeRecord>[];

export default function OrgOvertimeReport() {
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [opdFilter, setOpdFilter] = useState("all");
  const [workUnitFilter, setWorkUnitFilter] = useState("all");

  const initializePage = useCallback(async () => {
    try {
      setLoadError(null);
      const resolvedTenant = await withTimeout(
        resolveOrgTenantId(),
        OVERTIME_REPORT_QUERY_TIMEOUT_MS,
        "org.reports.overtime.init.resolve_tenant timeout",
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
            OVERTIME_REPORT_QUERY_TIMEOUT_MS,
            "org.reports.overtime.init.query timeout",
          ),
        {
          maxRetries: OVERTIME_REPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (opdRes.error) throw opdRes.error;
      if (workUnitRes.error) throw workUnitRes.error;

      setOpds(opdRes.data || []);
      setWorkUnits(workUnitRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.overtime.init");
      const message = appendErrorReference("Gagal memuat data awal laporan lembur", errorRef);
      setLoadError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    void initializePage();
  }, [initializePage]);

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

  const overtimeCsvColumns = useMemo(() => buildOvertimeCsvColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);
  const overtimePdfColumns = useMemo(() => buildOvertimePdfColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);

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
            OVERTIME_REPORT_QUERY_TIMEOUT_MS,
            "org.reports.overtime.fetch.employee_ids timeout",
          ),
        {
          maxRetries: OVERTIME_REPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (employeeIds.length === 0) {
        setRecords([]);
        return;
      }

      const allRows: OvertimeQueryRow[] = [];
      let offset = 0;

      while (true) {
        let query = supabase
          .from("overtime_requests")
          .select("id, employee_id, tenant_id, request_number, total_hours, reason, status, approved_by, approved_at, rejection_reason, notes, created_at, updated_at, dates:overtime_request_dates(date, start_time, end_time, hours, is_weekend, is_holiday)")
          .eq("tenant_id", tenantId)
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + FETCH_CHUNK - 1);

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }
        if (startDate) {
          query = query.gte("created_at", `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte("created_at", `${endDate}T23:59:59.999`);
        }

        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              query,
              OVERTIME_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.overtime.fetch.chunk timeout",
            ),
          {
            maxRetries: OVERTIME_REPORT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );
        if (error) throw error;

        const chunk = (data || []) as OvertimeQueryRow[];
        allRows.push(...chunk);

        if (chunk.length < FETCH_CHUNK) break;
        offset += FETCH_CHUNK;
      }

      const overtimeEmployeeIds = Array.from(
        new Set(allRows.map((row) => row.employee_id).filter((employeeId): employeeId is string => Boolean(employeeId))),
      );
      let employeeMap = new Map<string, OvertimeEmployee>();

      if (overtimeEmployeeIds.length > 0) {
        const { data: employeesData, error: employeesError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("id, name, nip, opd_id, work_unit_id")
                .in("id", overtimeEmployeeIds),
              OVERTIME_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.overtime.fetch.employee_detail timeout",
            ),
          {
            maxRetries: OVERTIME_REPORT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );

        if (employeesError) {
          const { data: employeesFallback, error: employeesFallbackError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("employees")
                  .select("id, name, nip")
                  .in("id", overtimeEmployeeIds),
                OVERTIME_REPORT_QUERY_TIMEOUT_MS,
                "org.reports.overtime.fetch.employee_fallback timeout",
              ),
            {
              maxRetries: OVERTIME_REPORT_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
            },
          );

          if (employeesFallbackError) throw employeesFallbackError;

          employeeMap = new Map(
            (employeesFallback || []).map((employee) => [
              employee.id,
              {
                id: employee.id,
                name: employee.name,
                nip: employee.nip,
                opd_id: null,
                work_unit_id: null,
              },
            ]),
          );
        } else {
          employeeMap = new Map(
            (employeesData || []).map((employee) => [
              employee.id,
              {
                id: employee.id,
                name: employee.name,
                nip: employee.nip,
                opd_id: employee.opd_id,
                work_unit_id: employee.work_unit_id,
              },
            ]),
          );
        }
      }

      setRecords(
        allRows.map((row) => ({
          ...row,
          employee: employeeMap.get(row.employee_id) || null,
          dates: row.dates || [],
        })),
      );
    } catch (error) {
      const errorRef = reportError(error, "org.reports.overtime.fetch", {
        tenant_id: tenantId,
        status: statusFilter === "all" ? null : statusFilter,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      const message = appendErrorReference("Gagal memuat laporan lembur", errorRef);
      setLoadError(message);
      toast.error(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate, statusFilter, tenantId]);

  const filteredRecords = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      if (opdFilter !== "all" && record.employee?.opd_id !== opdFilter) return false;
      if (workUnitFilter !== "all" && record.employee?.work_unit_id !== workUnitFilter) return false;

      if (!needle) return true;
      const searchable = [
        record.request_number || "",
        record.employee?.name || "",
        record.employee?.nip || "",
        record.reason || "",
        getStatusLabel(record.status),
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

  const handleRetryLoad = async () => {
    await initializePage();
    if (tenantId && hasQueried) {
      await fetchReport();
    }
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
      const traceId = createReportTraceId("OT-CSV");
      const csv = buildReportCsv({
        columns: overtimeCsvColumns,
        rows: filteredRecords,
      });

      downloadCsvFile(`laporan-lembur-${startDate || "all"}-${endDate || "all"}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: "overtime_report_export_csv",
        filters: {
          end_date: endDate || null,
          opd_id: opdFilter === "all" ? null : opdFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "csv",
        reportName: "Laporan Lembur Organisasi",
        rowCount: filteredRecords.length,
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
      const errorRef = reportError(error, "org.reports.overtime.export");
      toast.error(appendErrorReference("Gagal export laporan lembur", errorRef));
    }
  };

  const handleDownloadPdf = async () => {
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk dicetak");
      return;
    }

    try {
      const traceId = createReportTraceId("OT-PDF");
      const periodLabel =
        startDate && endDate
          ? `${startDate} s/d ${endDate}`
          : startDate
            ? `Mulai ${startDate}`
            : endDate
              ? `Sampai ${endDate}`
              : "Semua periode";
      const opdLabel =
        opdFilter === "all"
          ? "Semua OPD"
          : (() => {
              const opd = opds.find((item) => item.id === opdFilter);
              return opd ? `${opd.code} - ${opd.name}` : opdFilter;
            })();
      const workUnitLabel =
        workUnitFilter === "all" ? "Semua satuan kerja" : workUnits.find((item) => item.id === workUnitFilter)?.name || workUnitFilter;

      downloadReportPdf({
        columns: overtimePdfColumns,
        filename: `laporan-lembur-${startDate || "all"}-${endDate || "all"}.pdf`,
        metadataLines: [
          `Periode: ${periodLabel}`,
          `Filter status: ${statusFilter === "all" ? "Semua status" : getStatusLabel(statusFilter)}`,
          `Filter OPD: ${opdLabel}`,
          `Filter satuan kerja: ${workUnitLabel}`,
          `Pencarian: ${searchTerm.trim() || "-"}`,
          `Total data: ${filteredRecords.length}`,
        ],
        orientation: "landscape",
        rows: filteredRecords,
        sourceLabel: "AbsensiKu /org/reports/overtime",
        title: "Laporan Pengajuan Lembur",
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: "overtime_report_download_pdf",
        filters: {
          end_date: endDate || null,
          opd_id: opdFilter === "all" ? null : opdFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "pdf",
        reportName: "Laporan Lembur Organisasi",
        rowCount: filteredRecords.length,
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
      const errorRef = reportError(error, "org.reports.overtime.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF laporan lembur", errorRef));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Timer className="h-6 w-6" />
              Laporan Lembur
            </h1>
            <p className="text-muted-foreground">Laporan pengajuan lembur pegawai dan status persetujuan</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPdf} disabled={filteredRecords.length === 0 || isLoading}>
              <FileText className="mr-2 h-4 w-4" /> Unduh PDF
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={filteredRecords.length === 0 || isLoading}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <RequestReportsTabs />

        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={handleRetryLoad} className="border-destructive/30 text-destructive hover:bg-destructive/10">
              Coba Lagi
            </Button>
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    {STATUS_OPTIONS.map((option) => (
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
                      <SelectItem key={opd.id} value={opd.id}>{opd.code} - {opd.name}</SelectItem>
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
                      <SelectItem key={workUnit.id} value={workUnit.id}>{workUnit.name}</SelectItem>
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
                    placeholder="Cari no request, nama, NIP, alasan, status..."
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
            <CardDescription>Total {totalRows} pengajuan lembur</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tgl Pengajuan</TableHead>
                    <TableHead>No Request</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Rentang Lembur</TableHead>
                    <TableHead>Total Jam</TableHead>
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
                        <TableCell>{format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId })}</TableCell>
                        <TableCell className="font-mono text-xs">{record.request_number || "-"}</TableCell>
                        <TableCell>{record.employee?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{record.employee?.nip || "-"}</TableCell>
                        <TableCell>{getDateRangeLabel(record.dates)}</TableCell>
                        <TableCell>{formatHours(record.total_hours)}</TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
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

        <PageGlossarySection preset="org_report_overtime" />
      </div>
    </OrganizationLayout>
  );
}
