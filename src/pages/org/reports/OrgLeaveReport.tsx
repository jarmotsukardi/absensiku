import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarDays, Download, FileText, Search } from "lucide-react";
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
import {
  LEAVE_REQUEST_CATEGORY_OPTIONS,
  type LeaveRequestCategory,
  getLeaveRequestPresentation,
  matchesLeaveRequestCategory,
} from "@/lib/leaveRequestPresentation";
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

type LeaveQueryRow = LeaveRequestRow;

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
  const durationDays = differenceInCalendarDays(parseISO(record.end_date), parseISO(record.start_date)) + 1;
  const safeDays = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 1;
  return `${safeDays} hari`;
};

const getLeaveCreatedAtLabel = (record: LeaveRecord, pattern: string) =>
  record.created_at ? format(new Date(record.created_at), pattern, { locale: localeId }) : "-";

const getLeavePeriodLabel = (record: LeaveRecord) => `${record.start_date} s/d ${record.end_date}`;

const getLeaveOpdLabel = (record: LeaveRecord, opdMap: Map<string, OPD>) =>
  record.employees?.opd_id ? opdMap.get(record.employees.opd_id)?.code || "-" : "-";

const getLeaveWorkUnitLabel = (record: LeaveRecord, workUnitMap: Map<string, WorkUnit>) =>
  record.employees?.work_unit_id ? workUnitMap.get(record.employees.work_unit_id)?.name || "-" : "-";

const getLeaveDetailTimeLabel = (record: LeaveRecord) => {
  const presentation = getLeaveRequestPresentation(record);
  return presentation.detailLabel ? `${presentation.detailLabel}: ${presentation.detailText || "-"}` : "-";
};

const buildLeaveCsvColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => (row.created_at ? format(new Date(row.created_at), "yyyy-MM-dd HH:mm") : "-"), width: 82 },
    { header: "Nama Pegawai", value: (row) => row.employees?.name || "-" },
    { header: "NIP", value: (row) => row.employees?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getLeaveOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getLeaveWorkUnitLabel(row, workUnitMap) },
    { header: "Jenis", value: (row) => getLeaveRequestPresentation(row).leaveTypeLabel },
    { header: "Periode", value: (row) => getLeavePeriodLabel(row) },
    { header: "Durasi", value: (row) => getDurationLabel(row), align: "right", width: 44 },
    { header: "Status", value: (row) => getStatusLabel(row.status || ""), width: 54 },
    { header: "Detail Waktu", value: (row) => getLeaveDetailTimeLabel(row) },
    { header: "Alasan", value: (row) => getLeaveRequestPresentation(row).reasonText },
    { header: "Catatan Penolakan", value: (row) => row.rejection_reason || "-" },
  ] satisfies ReportOutputColumn<LeaveRecord>[];

const buildLeavePdfColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => getLeaveCreatedAtLabel(row, "d MMM yyyy HH:mm"), width: 82 },
    { header: "Nama Pegawai", value: (row) => row.employees?.name || "-" },
    { header: "NIP", value: (row) => row.employees?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getLeaveOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getLeaveWorkUnitLabel(row, workUnitMap) },
    { header: "Jenis", value: (row) => getLeaveRequestPresentation(row).leaveTypeLabel },
    { header: "Periode", value: (row) => getLeavePeriodLabel(row) },
    { header: "Durasi", value: (row) => getDurationLabel(row), align: "right", width: 44 },
    { header: "Status", value: (row) => getStatusLabel(row.status || ""), width: 54 },
    { header: "Detail Waktu", value: (row) => getLeaveDetailTimeLabel(row) },
    { header: "Alasan", value: (row) => getLeaveRequestPresentation(row).reasonText },
  ] satisfies ReportOutputColumn<LeaveRecord>[];

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
  const [requestCategoryFilter, setRequestCategoryFilter] = useState<LeaveRequestCategory>("all");
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

  const leaveCsvColumns = useMemo(() => buildLeaveCsvColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);
  const leavePdfColumns = useMemo(() => buildLeavePdfColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);

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

      const allRows: LeaveQueryRow[] = [];
      let offset = 0;

      while (true) {
        let query = supabase
          .from("leave_requests")
          .select("id, employee_id, start_date, end_date, leave_type, reason, status, rejection_reason, approved_by, approved_at, is_half_day, document_reference_number, document_reference_date, document_reference_issuer, document_reference_notes, created_at, updated_at")
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

        const chunk = (data || []) as LeaveQueryRow[];
        allRows.push(...chunk);

        if (chunk.length < FETCH_CHUNK) break;
        offset += FETCH_CHUNK;
      }

      const leaveEmployeeIds = Array.from(
        new Set(allRows.map((row) => row.employee_id).filter((employeeId): employeeId is string => Boolean(employeeId))),
      );
      let employeeMap = new Map<string, LeaveEmployee>();

      if (leaveEmployeeIds.length > 0) {
        const { data: employeesData, error: employeesError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("id, name, nip, opd_id, work_unit_id")
                .in("id", leaveEmployeeIds),
              LEAVE_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.leave.fetch.employee_detail timeout",
            ),
          {
            maxRetries: LEAVE_REPORT_QUERY_RETRY_MAX,
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
                  .in("id", leaveEmployeeIds),
                LEAVE_REPORT_QUERY_TIMEOUT_MS,
                "org.reports.leave.fetch.employee_fallback timeout",
              ),
            {
              maxRetries: LEAVE_REPORT_QUERY_RETRY_MAX,
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
          employees: employeeMap.get(row.employee_id) || null,
        })),
      );
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
      if (!matchesLeaveRequestCategory(record, requestCategoryFilter)) return false;

      if (!needle) return true;
      const presentation = getLeaveRequestPresentation(record);
      const searchable = [
        record.employees?.name || "",
        record.employees?.nip || "",
        presentation.reasonText,
        presentation.leaveTypeLabel,
        presentation.detailText || "",
        getStatusLabel(record.status || ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [opdFilter, records, requestCategoryFilter, searchTerm, workUnitFilter]);

  const totalRows = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, opdFilter, workUnitFilter, requestCategoryFilter]);

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
      const traceId = createReportTraceId("LEAVE-CSV");
      const csv = buildReportCsv({
        columns: leaveCsvColumns,
        rows: filteredRecords,
      });

      downloadCsvFile(`laporan-izin-cuti-${startDate || "all"}-${endDate || "all"}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: "leave_report_export_csv",
        filters: {
          end_date: endDate || null,
          leave_type: leaveTypeFilter === "all" ? null : leaveTypeFilter,
          opd_id: opdFilter === "all" ? null : opdFilter,
          request_category: requestCategoryFilter === "all" ? null : requestCategoryFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "csv",
        reportName: "Laporan Izin/Cuti Organisasi",
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
      const errorRef = reportError(error, "org.reports.leave.export");
      toast.error(appendErrorReference("Gagal export laporan izin/cuti", errorRef));
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
      const traceId = createReportTraceId("LEAVE-PDF");
      const periodLabel =
        startDate && endDate
          ? `${startDate} s/d ${endDate}`
          : startDate
            ? `Mulai ${startDate}`
            : endDate
              ? `Sampai ${endDate}`
              : "Semua periode";
      const leaveTypeLabel =
        leaveTypeFilter === "all"
          ? "Semua jenis"
          : LEAVE_TYPE_OPTIONS.find((option) => option.value === leaveTypeFilter)?.label || leaveTypeFilter;
      const requestCategoryLabel =
        LEAVE_REQUEST_CATEGORY_OPTIONS.find((option) => option.value === requestCategoryFilter)?.label || requestCategoryFilter;
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
        columns: leavePdfColumns,
        filename: `laporan-izin-cuti-${startDate || "all"}-${endDate || "all"}.pdf`,
        metadataLines: [
          `Periode: ${periodLabel}`,
          `Filter status: ${statusFilter === "all" ? "Semua status" : getStatusLabel(statusFilter)}`,
          `Jenis izin/cuti: ${leaveTypeLabel}`,
          `Kategori permohonan: ${requestCategoryLabel}`,
          `Filter OPD: ${opdLabel}`,
          `Filter satuan kerja: ${workUnitLabel}`,
          `Pencarian: ${searchTerm.trim() || "-"}`,
          `Total data: ${filteredRecords.length}`,
        ],
        orientation: "landscape",
        rows: filteredRecords,
        sourceLabel: "AbsensiKu /org/reports/leave",
        title: "Laporan Izin/Cuti Pegawai",
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: "leave_report_download_pdf",
        filters: {
          end_date: endDate || null,
          leave_type: leaveTypeFilter === "all" ? null : leaveTypeFilter,
          opd_id: opdFilter === "all" ? null : opdFilter,
          request_category: requestCategoryFilter === "all" ? null : requestCategoryFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "pdf",
        reportName: "Laporan Izin/Cuti Organisasi",
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
      const errorRef = reportError(error, "org.reports.leave.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF laporan izin/cuti", errorRef));
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
                <Label>Kategori Permohonan</Label>
                <Select
                  value={requestCategoryFilter}
                  onValueChange={(value) => setRequestCategoryFilter(value as LeaveRequestCategory)}
                >
                  <SelectTrigger><SelectValue placeholder="Semua permohonan" /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_REQUEST_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
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
                        {(() => {
                          const presentation = getLeaveRequestPresentation(record);
                          return (
                            <>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{record.created_at ? format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId }) : "-"}</TableCell>
                        <TableCell>{record.employees?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{record.employees?.nip || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{presentation.leaveTypeLabel}</Badge></TableCell>
                        <TableCell>{record.start_date} s/d {record.end_date}</TableCell>
                        <TableCell>{getDurationLabel(record)}</TableCell>
                        <TableCell>{getStatusBadge(record.status || "")}</TableCell>
                        <TableCell className="max-w-[320px]">
                          <p className="truncate text-sm" title={presentation.reasonText}>{presentation.reasonText}</p>
                          {(presentation.isLatePermission || presentation.isEarlyLeavePermission) && (
                            <p className="text-xs text-muted-foreground">
                              {presentation.detailLabel}: {presentation.detailText || "-"}
                            </p>
                          )}
                        </TableCell>
                            </>
                          );
                        })()}
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
