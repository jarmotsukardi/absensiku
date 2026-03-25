import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Download, FileText, MapPinOff, Search } from "lucide-react";
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

type WfhRequestRow = Tables<"wfh_requests">;
type FlexibleRequestRow = Tables<"flexible_attendance_requests">;
type OPD = Tables<"opd">;
type WorkUnit = Tables<"work_units">;

interface EmployeeLite {
  id: string;
  name: string | null;
  nip: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
}

type WfhQueryRow = WfhRequestRow;
type FlexibleQueryRow = FlexibleRequestRow;

interface CombinedRecord {
  id: string;
  rowKey: string;
  request_type: "wfh" | "flexible";
  request_date: string;
  created_at: string;
  status: string;
  reason: string;
  rejection_reason: string | null;
  category_label: string;
  employee: EmployeeLite | null;
}

const ITEMS_PER_PAGE = 20;
const FETCH_CHUNK = 500;
const FLEXIBLE_REPORT_QUERY_TIMEOUT_MS = 15000;
const FLEXIBLE_REPORT_QUERY_RETRY_MAX = 1;

const STATUS_OPTIONS = [
  { value: "menunggu", label: "Menunggu" },
  { value: "disetujui", label: "Disetujui" },
  { value: "ditolak", label: "Ditolak" },
] as const;

const FLEXIBLE_REASON_LABELS: Record<string, string> = {
  dinas_luar: "Dinas Luar",
  rapat_eksternal: "Rapat Eksternal",
  kunjungan_lapangan: "Kunjungan Lapangan",
  tugas_pimpinan: "Tugas Pimpinan",
  kegiatan_instansi: "Kegiatan Instansi",
};

const getStatusLabel = (status: string): string =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

const getTypeLabel = (type: CombinedRecord["request_type"]): string => {
  if (type === "wfh") return "WFH";
  return "Absensi Khusus";
};

const getStatusBadge = (status: string) => {
  if (status === "menunggu") return <Badge variant="secondary">Menunggu</Badge>;
  if (status === "disetujui") return <Badge className="bg-green-500 hover:bg-green-600">Disetujui</Badge>;
  if (status === "ditolak") return <Badge variant="destructive">Ditolak</Badge>;
  return <Badge variant="outline">{status}</Badge>;
};

const getFlexibleCreatedAtLabel = (record: CombinedRecord, pattern: string) =>
  format(new Date(record.created_at), pattern, { locale: localeId });

const getFlexibleRequestDateLabel = (requestDate: string, pattern: string) =>
  format(parseISO(requestDate), pattern, { locale: localeId });

const getFlexibleOpdLabel = (record: CombinedRecord, opdMap: Map<string, OPD>) =>
  record.employee?.opd_id ? opdMap.get(record.employee.opd_id)?.code || "-" : "-";

const getFlexibleWorkUnitLabel = (record: CombinedRecord, workUnitMap: Map<string, WorkUnit>) =>
  record.employee?.work_unit_id ? workUnitMap.get(record.employee.work_unit_id)?.name || "-" : "-";

const buildFlexibleCsvColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => format(new Date(row.created_at), "yyyy-MM-dd HH:mm"), width: 82 },
    { header: "Tanggal Permohonan", value: (row) => row.request_date, width: 76 },
    { header: "Tipe", value: (row) => getTypeLabel(row.request_type) },
    { header: "Kategori", value: (row) => row.category_label },
    { header: "Nama Pegawai", value: (row) => row.employee?.name || "-" },
    { header: "NIP", value: (row) => row.employee?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getFlexibleOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getFlexibleWorkUnitLabel(row, workUnitMap) },
    { header: "Status", value: (row) => getStatusLabel(row.status), width: 54 },
    { header: "Alasan", value: (row) => row.reason || "-" },
    { header: "Catatan Penolakan", value: (row) => row.rejection_reason || "-" },
  ] satisfies ReportOutputColumn<CombinedRecord>[];

const buildFlexiblePdfColumns = (
  opdMap: Map<string, OPD>,
  workUnitMap: Map<string, WorkUnit>,
) =>
  [
    { header: "No", value: (_row, index) => index + 1, align: "right", width: 28 },
    { header: "Tanggal Pengajuan", value: (row) => getFlexibleCreatedAtLabel(row, "d MMM yyyy HH:mm"), width: 82 },
    { header: "Tanggal Permohonan", value: (row) => getFlexibleRequestDateLabel(row.request_date, "d MMM yyyy"), width: 70 },
    { header: "Tipe", value: (row) => getTypeLabel(row.request_type) },
    { header: "Kategori", value: (row) => row.category_label },
    { header: "Nama Pegawai", value: (row) => row.employee?.name || "-" },
    { header: "NIP", value: (row) => row.employee?.nip || "-", width: 68 },
    { header: "OPD", value: (row) => getFlexibleOpdLabel(row, opdMap) },
    { header: "Satuan Kerja", value: (row) => getFlexibleWorkUnitLabel(row, workUnitMap) },
    { header: "Status", value: (row) => getStatusLabel(row.status), width: 54 },
  ] satisfies ReportOutputColumn<CombinedRecord>[];

export default function OrgFlexibleReport() {
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [records, setRecords] = useState<CombinedRecord[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "menunggu" | "disetujui" | "ditolak">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "wfh" | "flexible">("all");
  const [opdFilter, setOpdFilter] = useState("all");
  const [workUnitFilter, setWorkUnitFilter] = useState("all");

  const initializePage = useCallback(async () => {
    try {
      setLoadError(null);
      const resolvedTenant = await withTimeout(
        resolveOrgTenantId(),
        FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
        "org.reports.flexible.init.resolve_tenant timeout",
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
            FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
            "org.reports.flexible.init.query timeout",
          ),
        {
          maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (opdRes.error) throw opdRes.error;
      if (workUnitRes.error) throw workUnitRes.error;

      setOpds(opdRes.data || []);
      setWorkUnits(workUnitRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.flexible.init");
      const message = appendErrorReference("Gagal memuat data awal laporan WFH/Absensi Khusus", errorRef);
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

  const flexibleCsvColumns = useMemo(() => buildFlexibleCsvColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);
  const flexiblePdfColumns = useMemo(() => buildFlexiblePdfColumns(opdMap, workUnitMap), [opdMap, workUnitMap]);

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
            FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
            "org.reports.flexible.fetch.employee_ids timeout",
          ),
        {
          maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );
      if (employeeIds.length === 0) {
        setRecords([]);
        return;
      }

      const wfhRows: WfhQueryRow[] = [];
      const flexibleRows: FlexibleQueryRow[] = [];

      if (typeFilter === "all" || typeFilter === "wfh") {
        let offset = 0;
        while (true) {
          let query = supabase
            .from("wfh_requests")
            .select("id, employee_id, request_date, reason, status, rejection_reason, approved_by, approved_at, created_at, updated_at")
            .in("employee_id", employeeIds)
            .order("created_at", { ascending: false })
            .range(offset, offset + FETCH_CHUNK - 1);

          if (statusFilter !== "all") {
            query = query.eq("status", statusFilter);
          }
          if (startDate) {
            query = query.gte("request_date", startDate);
          }
          if (endDate) {
            query = query.lte("request_date", endDate);
          }

          const { data, error } = await withExponentialBackoff(
            () =>
              withTimeout(
                query,
                FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
                "org.reports.flexible.fetch.wfh_chunk timeout",
              ),
            {
              maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
            },
          );
          if (error) throw error;

          const chunk = (data || []) as WfhQueryRow[];
          wfhRows.push(...chunk);

          if (chunk.length < FETCH_CHUNK) break;
          offset += FETCH_CHUNK;
        }
      }

      if (typeFilter === "all" || typeFilter === "flexible") {
        let offset = 0;
        while (true) {
          let query = supabase
            .from("flexible_attendance_requests")
            .select("id, employee_id, request_date, reason_type, reason, status, rejection_reason, approved_by, approved_at, created_at, updated_at, tenant_id")
            .eq("tenant_id", tenantId)
            .in("employee_id", employeeIds)
            .order("created_at", { ascending: false })
            .range(offset, offset + FETCH_CHUNK - 1);

          if (statusFilter !== "all") {
            query = query.eq("status", statusFilter);
          }
          if (startDate) {
            query = query.gte("request_date", startDate);
          }
          if (endDate) {
            query = query.lte("request_date", endDate);
          }

          const { data, error } = await withExponentialBackoff(
            () =>
              withTimeout(
                query,
                FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
                "org.reports.flexible.fetch.flexible_chunk timeout",
              ),
            {
              maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
            },
          );
          if (error) throw error;

          const chunk = (data || []) as FlexibleQueryRow[];
          flexibleRows.push(...chunk);

          if (chunk.length < FETCH_CHUNK) break;
          offset += FETCH_CHUNK;
        }
      }

      const combinedEmployeeIds = Array.from(
        new Set(
          [...wfhRows, ...flexibleRows]
            .map((row) => row.employee_id)
            .filter((employeeId): employeeId is string => Boolean(employeeId)),
        ),
      );
      let employeeMap = new Map<string, EmployeeLite>();

      if (combinedEmployeeIds.length > 0) {
        const { data: employeesData, error: employeesError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("id, name, nip, opd_id, work_unit_id")
                .in("id", combinedEmployeeIds),
              FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
              "org.reports.flexible.fetch.employee_detail timeout",
            ),
          {
            maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
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
                  .in("id", combinedEmployeeIds),
                FLEXIBLE_REPORT_QUERY_TIMEOUT_MS,
                "org.reports.flexible.fetch.employee_fallback timeout",
              ),
            {
              maxRetries: FLEXIBLE_REPORT_QUERY_RETRY_MAX,
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

      const combinedRows: CombinedRecord[] = [
        ...wfhRows.map((row) => ({
          id: row.id,
          rowKey: `wfh:${row.id}`,
          request_type: "wfh" as const,
          request_date: row.request_date,
          created_at: row.created_at,
          status: row.status,
          reason: row.reason,
          rejection_reason: row.rejection_reason,
          category_label: "WFH",
          employee: employeeMap.get(row.employee_id) || null,
        })),
        ...flexibleRows.map((row) => ({
          id: row.id,
          rowKey: `flexible:${row.id}`,
          request_type: "flexible" as const,
          request_date: row.request_date,
          created_at: row.created_at,
          status: row.status,
          reason: row.reason,
          rejection_reason: row.rejection_reason,
          category_label: FLEXIBLE_REASON_LABELS[row.reason_type] || row.reason_type,
          employee: employeeMap.get(row.employee_id) || null,
        })),
      ];

      combinedRows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRecords(combinedRows);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.flexible.fetch", {
        tenant_id: tenantId,
        status: statusFilter === "all" ? null : statusFilter,
        type: typeFilter,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      const message = appendErrorReference("Gagal memuat laporan WFH/Absensi Khusus", errorRef);
      setLoadError(message);
      toast.error(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate, statusFilter, tenantId, typeFilter]);

  const filteredRecords = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      if (opdFilter !== "all" && record.employee?.opd_id !== opdFilter) return false;
      if (workUnitFilter !== "all" && record.employee?.work_unit_id !== workUnitFilter) return false;

      if (!needle) return true;
      const searchable = [
        record.employee?.name || "",
        record.employee?.nip || "",
        record.reason || "",
        record.category_label || "",
        getStatusLabel(record.status),
        getTypeLabel(record.request_type),
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
      const traceId = createReportTraceId("FLEX-CSV");
      const csv = buildReportCsv({
        columns: flexibleCsvColumns,
        rows: filteredRecords,
      });

      downloadCsvFile(`laporan-wfh-absensi-khusus-${startDate || "all"}-${endDate || "all"}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: "flexible_report_export_csv",
        filters: {
          end_date: endDate || null,
          opd_id: opdFilter === "all" ? null : opdFilter,
          request_type: typeFilter === "all" ? null : typeFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "csv",
        reportName: "Laporan WFH dan Absensi Khusus Organisasi",
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
      const errorRef = reportError(error, "org.reports.flexible.export");
      toast.error(appendErrorReference("Gagal export laporan WFH/Absensi Khusus", errorRef));
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
      const traceId = createReportTraceId("FLEX-PDF");
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
      const requestTypeLabel =
        typeFilter === "all" ? "Semua tipe" : typeFilter === "wfh" ? "WFH" : "Absensi Khusus";

      downloadReportPdf({
        columns: flexiblePdfColumns,
        filename: `laporan-wfh-absensi-khusus-${startDate || "all"}-${endDate || "all"}.pdf`,
        metadataLines: [
          `Periode: ${periodLabel}`,
          `Filter status: ${statusFilter === "all" ? "Semua status" : getStatusLabel(statusFilter)}`,
          `Tipe permohonan: ${requestTypeLabel}`,
          `Filter OPD: ${opdLabel}`,
          `Filter satuan kerja: ${workUnitLabel}`,
          `Pencarian: ${searchTerm.trim() || "-"}`,
          `Total data: ${filteredRecords.length}`,
        ],
        orientation: "landscape",
        rows: filteredRecords,
        sourceLabel: "AbsensiKu /org/reports/flexible",
        title: "Laporan WFH & Absensi Khusus",
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: "flexible_report_download_pdf",
        filters: {
          end_date: endDate || null,
          opd_id: opdFilter === "all" ? null : opdFilter,
          request_type: typeFilter === "all" ? null : typeFilter,
          search: searchTerm.trim() || null,
          start_date: startDate || null,
          status: statusFilter === "all" ? null : statusFilter,
          work_unit_id: workUnitFilter === "all" ? null : workUnitFilter,
        },
        outputType: "pdf",
        reportName: "Laporan WFH dan Absensi Khusus Organisasi",
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
      const errorRef = reportError(error, "org.reports.flexible.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF laporan WFH/Absensi Khusus", errorRef));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPinOff className="h-6 w-6" />
              Laporan WFH & Absensi Khusus
            </h1>
            <p className="text-muted-foreground">Laporan pengajuan WFH dan permohonan absensi khusus pegawai</p>
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
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "menunggu" | "disetujui" | "ditolak")}>
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
                <Label>Tipe Permohonan</Label>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | "wfh" | "flexible")}>
                  <SelectTrigger><SelectValue placeholder="Semua tipe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tipe</SelectItem>
                    <SelectItem value="wfh">WFH</SelectItem>
                    <SelectItem value="flexible">Absensi Khusus</SelectItem>
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
                    placeholder="Cari nama, NIP, alasan, kategori, atau status..."
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
            <CardDescription>Total {totalRows} permohonan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tgl Pengajuan</TableHead>
                    <TableHead>Tgl Permohonan</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>NIP</TableHead>
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
                      <TableRow key={record.rowKey}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId })}</TableCell>
                        <TableCell>{getFlexibleRequestDateLabel(record.request_date, "d MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeLabel(record.request_type)}</Badge>
                        </TableCell>
                        <TableCell>{record.category_label}</TableCell>
                        <TableCell>{record.employee?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{record.employee?.nip || "-"}</TableCell>
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

        <PageGlossarySection preset="org_report_flexible" />
      </div>
    </OrganizationLayout>
  );
}
