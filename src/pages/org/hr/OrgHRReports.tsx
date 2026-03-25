import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, FileText, Users, Download, RefreshCw, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { toast } from "sonner";
import {
  buildReportCsv,
  createReportTraceId,
  downloadCsvFile,
  downloadReportPdf,
  recordReportOutputAudit,
  type ReportOutputColumn,
  type ReportSummaryItem,
} from "@/lib/reportOutput";

type EmployeeLite = {
  id: string;
  name: string | null;
  email: string | null;
  nip: string | null;
  is_active: boolean | null;
  employee_category: string | null;
  golongan: string | null;
  joined_date: string | null;
  opd_name: string | null;
  work_unit_name: string | null;
};

type ContractLite = {
  id: string;
  employee_id: string | null;
  contract_number: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type EmployeeReportQueryRow = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "email" | "nip" | "is_active" | "employee_category" | "golongan"
> & {
  joined_date: string | null;
  opd: { name: string | null } | null;
  work_unit: { name: string | null } | null;
};

const AUDIT_PAGE_SIZE = 10;

type AuditLogLite = Pick<
  Database["public"]["Tables"]["audit_logs"]["Row"],
  "id" | "action" | "table_name" | "record_id" | "created_at" | "old_values" | "new_values"
> & {
  employee: { name: string | null } | null;
};

const toDateOnly = (dateValue: string | null): Date | null => {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateLabel = (dateValue: string | null) => {
  const date = toDateOnly(dateValue);
  if (!date) return dateValue || "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export default function OrgHRReports() {
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [contracts, setContracts] = useState<ContractLite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("headcount");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<"all" | "active" | "inactive" | "unknown">("all");
  const [employeeCategoryFilter, setEmployeeCategoryFilter] = useState<string>("all");
  const [opdFilter, setOpdFilter] = useState<string>("all");
  const [workUnitFilter, setWorkUnitFilter] = useState<string>("all");
  const [contractStatusFilter, setContractStatusFilter] = useState<string>("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [reportSearchTerm, setReportSearchTerm] = useState("");
  const [auditSearchTerm, setAuditSearchTerm] = useState("");
  const [auditDomainFilter, setAuditDomainFilter] = useState<string>("all");
  const [auditPage, setAuditPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/reports");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setTenantId(resolvedTenantId);

      const [employeeRes, contractRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, email, nip, is_active, employee_category, golongan, joined_date:created_at, opd:opd_id(name), work_unit:work_unit_id(name)")
          .eq("tenant_id", resolvedTenantId),
        supabase.from("hr_contracts").select("id, employee_id, contract_number, status, start_date, end_date").eq("tenant_id", resolvedTenantId),
      ]);
      if (employeeRes.error) throw employeeRes.error;
      if (contractRes.error) throw contractRes.error;

      const { data: auditData, error: auditError } = await supabase
        .from("audit_logs")
        .select("id, action, table_name, record_id, created_at, old_values, new_values, employee:employee_id(name)")
        .eq("tenant_id", resolvedTenantId)
        .in("table_name", [
          "employees",
          "hr_contracts",
          "mutation_requests",
          "leave_requests",
          "employee_invitations",
          "wfh_requests",
          "overtime_requests",
          "mutation_requests",
          "flexible_attendance_requests",
        ])
        .in("action", [
          "employee_status_update",
          "employee_mutation_applied",
          "employee_offboarding_deactivate",
          "contract_create",
          "contract_update",
          "contract_delete",
          "offboarding_create",
          "leave_request_approved_step",
          "leave_request_approved_final",
          "leave_request_rejected",
          "INVITATION_CREATE_NEW",
          "INVITATION_REUSE_EXISTING",
          "wfh_request_approved",
          "wfh_request_rejected",
          "overtime_request_approved",
          "overtime_request_rejected",
          "mutation_request_approved",
          "mutation_request_rejected",
          "flexible_attendance_approved",
          "flexible_attendance_rejected",
        ])
        .order("created_at", { ascending: false })
        .limit(100);
      if (auditError) throw auditError;

      setEmployees(
        ((employeeRes.data || []) as EmployeeReportQueryRow[]).map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          nip: item.nip,
          is_active: item.is_active,
          employee_category: item.employee_category,
          golongan: item.golongan,
          joined_date: item.joined_date,
          opd_name: item.opd?.name || null,
          work_unit_name: item.work_unit?.name || null,
        })),
      );
      setContracts((contractRes.data || []) as ContractLite[]);
      setAuditLogs((auditData || []) as AuditLogLite[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.reports.fetch");
      toast.error(appendErrorReference("Gagal memuat laporan HR", ref));
      setEmployees([]);
      setContracts([]);
      setAuditLogs([]);
      setTenantId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const headcount = employees.length;
  const activeCount = employees.filter((item) => item.is_active === true).length;
  const inactiveCount = employees.filter((item) => item.is_active === false).length;
  const unknownActiveFlagCount = employees.filter((item) => item.is_active == null).length;
  const activeContracts = contracts.filter((item) => item.status.toLowerCase() === "active").length;
  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);
  const uniqueEmployeeCategories = useMemo(
    () => [...new Set(employees.map((item) => (item.employee_category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees],
  );
  const uniqueOpdNames = useMemo(
    () => [...new Set(employees.map((item) => (item.opd_name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees],
  );
  const uniqueWorkUnitNames = useMemo(
    () => [...new Set(employees.map((item) => (item.work_unit_name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees],
  );
  const uniqueContractStatuses = useMemo(
    () => [...new Set(contracts.map((item) => (item.status || "").trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [contracts],
  );
  const reportKeyword = reportSearchTerm.trim().toLowerCase();
  const periodFromDate = useMemo(() => toDateOnly(periodFrom || null), [periodFrom]);
  const periodToDate = useMemo(() => toDateOnly(periodTo || null), [periodTo]);
  const filteredEmployees = useMemo(() => {
    return employees.filter((item) => {
      if (employeeStatusFilter === "active" && item.is_active !== true) return false;
      if (employeeStatusFilter === "inactive" && item.is_active !== false) return false;
      if (employeeStatusFilter === "unknown" && item.is_active != null) return false;
      if (employeeCategoryFilter !== "all" && (item.employee_category || "Belum Diisi").trim() !== employeeCategoryFilter) return false;
      if (opdFilter !== "all" && (item.opd_name || "Tanpa OPD").trim() !== opdFilter) return false;
      if (workUnitFilter !== "all" && (item.work_unit_name || "Tanpa Unit").trim() !== workUnitFilter) return false;
      const joinedDate = toDateOnly(item.joined_date);
      if (periodFromDate && (!joinedDate || joinedDate < periodFromDate)) return false;
      if (periodToDate && (!joinedDate || joinedDate > periodToDate)) return false;
      if (
        reportKeyword &&
        ![
          item.name || "",
          item.email || "",
          item.nip || "",
          item.employee_category || "",
          item.golongan || "",
          item.opd_name || "",
          item.work_unit_name || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(reportKeyword)
      ) {
        return false;
      }
      return true;
    });
  }, [employees, employeeCategoryFilter, employeeStatusFilter, opdFilter, periodFromDate, periodToDate, reportKeyword, workUnitFilter]);
  const filteredContracts = useMemo(() => {
    return contracts.filter((item) => {
      const employee = item.employee_id ? employeeMap.get(item.employee_id) : null;
      if (contractStatusFilter !== "all" && (item.status || "").toLowerCase() !== contractStatusFilter) return false;
      if (employeeStatusFilter === "active" && employee?.is_active !== true) return false;
      if (employeeStatusFilter === "inactive" && employee?.is_active !== false) return false;
      if (employeeStatusFilter === "unknown" && employee?.is_active != null) return false;
      if (employeeCategoryFilter !== "all" && (employee?.employee_category || "Belum Diisi").trim() !== employeeCategoryFilter) return false;
      if (opdFilter !== "all" && (employee?.opd_name || "Tanpa OPD").trim() !== opdFilter) return false;
      if (workUnitFilter !== "all" && (employee?.work_unit_name || "Tanpa Unit").trim() !== workUnitFilter) return false;
      const contractDate = toDateOnly(item.end_date || item.start_date);
      if (periodFromDate && (!contractDate || contractDate < periodFromDate)) return false;
      if (periodToDate && (!contractDate || contractDate > periodToDate)) return false;
      if (
        reportKeyword &&
        ![item.contract_number || "", item.status || "", item.employee_id || "", employee?.name || "", employee?.opd_name || "", employee?.work_unit_name || ""]
          .join(" ")
          .toLowerCase()
          .includes(reportKeyword)
      ) {
        return false;
      }
      return true;
    });
  }, [contractStatusFilter, contracts, employeeCategoryFilter, employeeMap, employeeStatusFilter, opdFilter, periodFromDate, periodToDate, reportKeyword, workUnitFilter]);
  const endingSoonContracts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);
    return filteredContracts.filter((item) => {
      if (item.status.toLowerCase() !== "active") return false;
      const end = toDateOnly(item.end_date);
      return Boolean(end && end >= today && end <= next30);
    }).length;
  }, [filteredContracts]);
  const overdueContracts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredContracts.filter((item) => {
      if (item.status.toLowerCase() !== "active") return false;
      const end = toDateOnly(item.end_date);
      return Boolean(end && end < today);
    }).length;
  }, [filteredContracts]);

  const employeeCategorySummary = useMemo(() => {
    const map = new Map<string, number>();
    filteredEmployees.forEach((item) => {
      const key = (item.employee_category || "Belum Diisi").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [filteredEmployees]);

  const contractStatusSummary = useMemo(() => {
    const map = new Map<string, number>();
    filteredContracts.forEach((item) => {
      const key = (item.status || "unknown").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total || a.status.localeCompare(b.status));
  }, [filteredContracts]);

  const filteredHeadcount = filteredEmployees.length;
  const filteredActiveCount = filteredEmployees.filter((item) => item.is_active === true).length;
  const filteredInactiveCount = filteredEmployees.filter((item) => item.is_active === false).length;
  const filteredUnknownActiveFlagCount = filteredEmployees.filter((item) => item.is_active == null).length;
  const filteredActiveContracts = filteredContracts.filter((item) => item.status.toLowerCase() === "active").length;

  const filteredAuditBase = useMemo(() => {
    return auditLogs.filter((item) => {
      const employee = item.record_id ? employeeMap.get(item.record_id) : null;
      if (employeeStatusFilter === "active" && employee && employee.is_active !== true) return false;
      if (employeeStatusFilter === "inactive" && employee && employee.is_active !== false) return false;
      if (employeeStatusFilter === "unknown" && employee && employee.is_active != null) return false;
      if (employeeCategoryFilter !== "all" && employee && (employee.employee_category || "Belum Diisi").trim() !== employeeCategoryFilter) return false;
      if (opdFilter !== "all" && employee && (employee.opd_name || "Tanpa OPD").trim() !== opdFilter) return false;
      if (workUnitFilter !== "all" && employee && (employee.work_unit_name || "Tanpa Unit").trim() !== workUnitFilter) return false;
      const auditDate = new Date(item.created_at);
      if (periodFromDate && auditDate < periodFromDate) return false;
      if (periodToDate) {
        const periodToEnd = new Date(periodToDate);
        periodToEnd.setHours(23, 59, 59, 999);
        if (auditDate > periodToEnd) return false;
      }
      return true;
    });
  }, [auditLogs, employeeCategoryFilter, employeeMap, employeeStatusFilter, opdFilter, periodFromDate, periodToDate, workUnitFilter]);
  const payrollImpactAuditCount = filteredAuditBase.length;

  const recentAuditRows = useMemo(
    () =>
      filteredAuditBase.map((item) => ({
        id: item.id,
        at: item.created_at,
        actor: item.employee?.name || "-",
        domain:
          item.table_name === "employees"
            ? "Pegawai"
            : item.table_name === "mutation_requests"
              ? item.action === "offboarding_create"
                ? "Offboarding"
                : "Persetujuan Mutasi"
              : item.table_name === "leave_requests"
                ? "Persetujuan Cuti"
                : item.table_name === "employee_invitations"
                  ? "Onboarding"
                  : item.table_name === "wfh_requests"
                    ? "Persetujuan WFH"
                    : item.table_name === "overtime_requests"
                      ? "Persetujuan Lembur"
                      : item.table_name === "flexible_attendance_requests"
                        ? "Absensi Khusus"
              : "Kontrak",
        actionLabel:
          item.action === "employee_status_update"
            ? "Status Pegawai"
            : item.action === "employee_offboarding_deactivate"
              ? "Pegawai Dinonaktifkan"
              : item.action === "offboarding_create"
                ? "Offboarding Dibuat"
                : item.action === "employee_mutation_applied"
                  ? "Mutasi Pegawai Diterapkan"
                  : item.action === "mutation_request_approved"
                    ? "Mutasi Disetujui"
                    : item.action === "mutation_request_rejected"
                      ? "Mutasi Ditolak"
                : item.action === "leave_request_approved_step"
                  ? "Cuti Disetujui Tahap"
                  : item.action === "leave_request_approved_final"
                    ? "Cuti Disetujui Final"
                    : item.action === "leave_request_rejected"
                      ? "Cuti Ditolak"
                      : item.action === "INVITATION_CREATE_NEW"
                        ? "Undangan Dibuat"
                        : item.action === "INVITATION_REUSE_EXISTING"
                          ? "Undangan Dipakai Ulang"
                          : item.action === "wfh_request_approved"
                            ? "WFH Disetujui"
                            : item.action === "wfh_request_rejected"
                              ? "WFH Ditolak"
                              : item.action === "overtime_request_approved"
                                ? "Lembur Disetujui"
                                : item.action === "overtime_request_rejected"
                                  ? "Lembur Ditolak"
                                  : item.action === "flexible_attendance_approved"
                                    ? "Absensi Khusus Disetujui"
                                    : item.action === "flexible_attendance_rejected"
                                      ? "Absensi Khusus Ditolak"
                : item.action === "contract_create"
              ? "Kontrak Dibuat"
              : item.action === "contract_update"
                ? "Kontrak Diperbarui"
                : "Kontrak Dihapus",
        summary: summarizeAuditChange(item),
      })),
    [filteredAuditBase],
  );
  const filteredAuditRows = useMemo(() => {
    const keyword = auditSearchTerm.trim().toLowerCase();
    return recentAuditRows.filter((row) => {
      if (auditDomainFilter !== "all" && row.domain !== auditDomainFilter) return false;
      if (
        keyword &&
        ![row.domain, row.actionLabel, row.actor, row.summary, row.at].join(" ").toLowerCase().includes(keyword)
      ) {
        return false;
      }
      return true;
    });
  }, [recentAuditRows, auditSearchTerm, auditDomainFilter]);
  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditRows.length / AUDIT_PAGE_SIZE));
  const safeAuditPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditRows = useMemo(() => {
    const from = (safeAuditPage - 1) * AUDIT_PAGE_SIZE;
    return filteredAuditRows.slice(from, from + AUDIT_PAGE_SIZE);
  }, [filteredAuditRows, safeAuditPage]);
  const employeeNeedsReviewRows = useMemo(
    () =>
      filteredEmployees
        .filter((item) => item.is_active == null || !(item.employee_category || "").trim())
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [filteredEmployees],
  );
  const contractRiskRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);

    return filteredContracts
      .filter((item) => (item.status || "").toLowerCase() === "active")
      .map((item) => {
        const endDate = toDateOnly(item.end_date);
        let risk: "overdue" | "expiring" | null = null;
        if (endDate && endDate < today) risk = "overdue";
        if (endDate && endDate >= today && endDate <= next30) risk = "expiring";
        return {
          ...item,
          risk,
        };
      })
      .filter((item) => item.risk !== null)
      .sort((a, b) => {
        const aTime = toDateOnly(a.end_date)?.getTime() || 0;
        const bTime = toDateOnly(b.end_date)?.getTime() || 0;
        return aTime - bTime;
      });
  }, [filteredContracts]);
  const auditDomains = useMemo(
    () => [...new Set(recentAuditRows.map((row) => row.domain))].sort((a, b) => a.localeCompare(b)),
    [recentAuditRows],
  );
  const reportValidationRows = useMemo(
    () => [
      {
        label: "Headcount vs distribusi kategori",
        summary: filteredHeadcount,
        source: employeeCategorySummary.reduce((total, row) => total + row.total, 0),
      },
      {
        label: "Pegawai aktif vs data pegawai terfilter",
        summary: filteredActiveCount,
        source: filteredEmployees.filter((item) => item.is_active === true).length,
      },
      {
        label: "Kontrak aktif vs distribusi status kontrak",
        summary: filteredActiveContracts,
        source: contractStatusSummary.find((row) => row.status === "active")?.total || 0,
      },
      {
        label: "Audit payroll-impact vs hasil filter audit",
        summary: payrollImpactAuditCount,
        source: filteredAuditRows.length,
      },
    ].map((item) => ({
      ...item,
      isMatched: item.summary === item.source,
    })),
    [contractStatusSummary, employeeCategorySummary, filteredActiveContracts, filteredActiveCount, filteredAuditRows.length, filteredEmployees, filteredHeadcount, payrollImpactAuditCount],
  );

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearchTerm, auditDomainFilter, activeTab]);

  useEffect(() => {
    setAuditPage((page) => Math.min(page, auditTotalPages));
  }, [auditTotalPages]);

  const getActiveOutputConfig = () => {
    const todayLabel = new Date().toISOString().slice(0, 10);
    const periodLabel = periodFrom || periodTo ? `${periodFrom || "-"} s/d ${periodTo || "-"}` : "Semua periode";
    const commonMetadata = [
      `Status pegawai: ${employeeStatusFilter === "all" ? "Semua" : employeeStatusFilter}`,
      `Kategori pegawai: ${employeeCategoryFilter === "all" ? "Semua" : employeeCategoryFilter}`,
      `OPD: ${opdFilter === "all" ? "Semua" : opdFilter}`,
      `Unit kerja: ${workUnitFilter === "all" ? "Semua" : workUnitFilter}`,
      `Periode: ${periodLabel}`,
    ];

    if (activeTab === "headcount") {
      return {
        auditActionBase: "hr_reports_headcount",
        columns: [
          { header: "No", value: (_row: unknown, index: number) => index + 1, align: "right", width: 28 },
          { header: "Kategori", value: (row: unknown) => (row as { label: string }).label },
          { header: "Jumlah Pegawai", value: (row: unknown) => (row as { total: number }).total, align: "right", width: 56 },
        ] satisfies ReportOutputColumn<unknown>[],
        filenameBase: `hr-report-headcount-${todayLabel}`,
        filters: {
          employee_category: employeeCategoryFilter === "all" ? null : employeeCategoryFilter,
          employee_status: employeeStatusFilter === "all" ? null : employeeStatusFilter,
          opd: opdFilter === "all" ? null : opdFilter,
          period_from: periodFrom || null,
          period_to: periodTo || null,
          search: reportSearchTerm.trim() || null,
          work_unit: workUnitFilter === "all" ? null : workUnitFilter,
        },
        metadataLines: [...commonMetadata, `Pencarian laporan: ${reportSearchTerm.trim() || "-"}`],
        rows: employeeCategorySummary as unknown[],
        summary: [
          { label: "Headcount", value: filteredHeadcount },
          { label: "Pegawai aktif", value: filteredActiveCount },
          { label: "Pegawai nonaktif", value: filteredInactiveCount },
          { label: "Status aktif belum diisi", value: filteredUnknownActiveFlagCount },
        ] satisfies ReportSummaryItem[],
        title: "Laporan HR - Headcount",
      };
    }

    if (activeTab === "kontrak") {
      return {
        auditActionBase: "hr_reports_kontrak",
        columns: [
          { header: "No", value: (_row: unknown, index: number) => index + 1, align: "right", width: 28 },
          { header: "Status Kontrak", value: (row: unknown) => (row as { status: string }).status },
          { header: "Jumlah Kontrak", value: (row: unknown) => (row as { total: number }).total, align: "right", width: 56 },
        ] satisfies ReportOutputColumn<unknown>[],
        filenameBase: `hr-report-kontrak-${todayLabel}`,
        filters: {
          contract_status: contractStatusFilter === "all" ? null : contractStatusFilter,
          employee_category: employeeCategoryFilter === "all" ? null : employeeCategoryFilter,
          employee_status: employeeStatusFilter === "all" ? null : employeeStatusFilter,
          opd: opdFilter === "all" ? null : opdFilter,
          period_from: periodFrom || null,
          period_to: periodTo || null,
          search: reportSearchTerm.trim() || null,
          work_unit: workUnitFilter === "all" ? null : workUnitFilter,
        },
        metadataLines: [
          ...commonMetadata,
          `Status kontrak: ${contractStatusFilter === "all" ? "Semua" : contractStatusFilter}`,
          `Pencarian laporan: ${reportSearchTerm.trim() || "-"}`,
        ],
        rows: contractStatusSummary as unknown[],
        summary: [
          { label: "Kontrak aktif", value: filteredActiveContracts },
          { label: "Kontrak berakhir <= 30 hari", value: endingSoonContracts },
          { label: "Kontrak lewat jatuh tempo", value: overdueContracts },
        ] satisfies ReportSummaryItem[],
        title: "Laporan HR - Kontrak",
      };
    }

    return {
      auditActionBase: "hr_reports_operasional",
      columns: [
        { header: "No", value: (_row: unknown, index: number) => index + 1, align: "right", width: 28 },
        { header: "Waktu", value: (row: unknown) => (row as { at: string }).at, width: 104 },
        { header: "Domain", value: (row: unknown) => (row as { domain: string }).domain, width: 72 },
        { header: "Aksi", value: (row: unknown) => (row as { actionLabel: string }).actionLabel },
        { header: "Aktor", value: (row: unknown) => (row as { actor: string }).actor },
        { header: "Ringkasan", value: (row: unknown) => (row as { summary: string }).summary },
      ] satisfies ReportOutputColumn<unknown>[],
      filenameBase: `hr-report-operasional-${todayLabel}`,
      filters: {
        audit_domain: auditDomainFilter === "all" ? null : auditDomainFilter,
        audit_search: auditSearchTerm.trim() || null,
        employee_category: employeeCategoryFilter === "all" ? null : employeeCategoryFilter,
        employee_status: employeeStatusFilter === "all" ? null : employeeStatusFilter,
        opd: opdFilter === "all" ? null : opdFilter,
        period_from: periodFrom || null,
        period_to: periodTo || null,
        work_unit: workUnitFilter === "all" ? null : workUnitFilter,
      },
      metadataLines: [
        ...commonMetadata,
        `Domain audit: ${auditDomainFilter === "all" ? "Semua" : auditDomainFilter}`,
        `Pencarian audit: ${auditSearchTerm.trim() || "-"}`,
      ],
      rows: filteredAuditRows as unknown[],
      summary: [
        { label: "Audit terfilter", value: filteredAuditRows.length },
        { label: "Audit payroll-impact", value: payrollImpactAuditCount },
      ] satisfies ReportSummaryItem[],
      title: "Laporan HR - Operasional",
    };
  };

  const handleExport = async () => {
    if (!access.canExport) {
      toast.error("Aksi export laporan hanya tersedia untuk admin organisasi.");
      return;
    }

    try {
      const outputConfig = getActiveOutputConfig();
      const traceId = createReportTraceId(`HR-${activeTab.toUpperCase()}-CSV`);
      const csv = buildReportCsv({
        columns: outputConfig.columns,
        rows: outputConfig.rows,
      });

      downloadCsvFile(`${outputConfig.filenameBase}.csv`, csv);

      const auditResult = await recordReportOutputAudit({
        action: `${outputConfig.auditActionBase}_export_csv`,
        filters: outputConfig.filters,
        outputType: "csv",
        reportName: outputConfig.title,
        rowCount: outputConfig.rows.length,
        tenantId,
        traceId,
      });

      if (!auditResult.ok) {
        toast.warning(
          appendErrorReference(`CSV berhasil diunduh, tetapi audit log gagal dicatat. Ref dokumen: ${traceId}`, auditResult.errorRef),
        );
        return;
      }

      toast.success(`Ekspor laporan HR berhasil (Ref: ${traceId})`);
    } catch (error) {
      const ref = reportError(error, "org.hr.reports.export");
      toast.error(appendErrorReference("Gagal export laporan HR", ref));
    }
  };

  const handleDownloadPdf = async () => {
    if (!access.canExport) {
      toast.error("Aksi unduh PDF laporan hanya tersedia untuk admin organisasi.");
      return;
    }

    try {
      const outputConfig = getActiveOutputConfig();
      const traceId = createReportTraceId(`HR-${activeTab.toUpperCase()}-PDF`);

      downloadReportPdf({
        columns: outputConfig.columns,
        filename: `${outputConfig.filenameBase}.pdf`,
        metadataLines: outputConfig.metadataLines,
        rows: outputConfig.rows,
        sourceLabel: "AbsensiKu /org/hr/reports",
        summary: outputConfig.summary,
        title: outputConfig.title,
        traceId,
      });

      const auditResult = await recordReportOutputAudit({
        action: `${outputConfig.auditActionBase}_download_pdf`,
        filters: outputConfig.filters,
        outputType: "pdf",
        reportName: outputConfig.title,
        rowCount: outputConfig.rows.length,
        tenantId,
        traceId,
      });

      if (!auditResult.ok) {
        toast.warning(
          appendErrorReference(`PDF berhasil diunduh, tetapi audit log gagal dicatat. Ref dokumen: ${traceId}`, auditResult.errorRef),
        );
        return;
      }

      toast.success(`PDF laporan HR berhasil diunduh (Ref: ${traceId})`);
    } catch (error) {
      const ref = reportError(error, "org.hr.reports.pdf_download");
      toast.error(appendErrorReference("Gagal menyiapkan PDF laporan HR", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Laporan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Laporan HR</h1>
          <p className="text-sm text-muted-foreground">Pantau headcount, status kepegawaian, dan kesehatan kontrak pegawai.</p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canExport ? "monitoring + ekspor" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-7">
          <Stat title="Headcount" value={filteredHeadcount} />
          <Stat title="Pegawai Aktif" value={filteredActiveCount} />
          <Stat title="Pegawai Nonaktif" value={filteredInactiveCount} />
          <Stat title="Status Aktif Tidak Diisi" value={filteredUnknownActiveFlagCount} />
          <Stat title="Kontrak Aktif" value={filteredActiveContracts} />
          <Stat title="Kontrak Berakhir ≤30 Hari" value={endingSoonContracts} />
          <Stat title="Kontrak Lewat Jatuh Tempo" value={overdueContracts} />
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Tab Laporan</CardTitle>
                <CardDescription>Gunakan tab sesuai kebutuhan monitoring harian HR.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={isLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Muat Ulang
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isLoadingAccess || !access.canExport}>
                  <FileText className="mr-2 h-4 w-4" />
                  Unduh PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoadingAccess || !access.canExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Ekspor CSV
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative md:col-span-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={reportSearchTerm}
                  onChange={(event) => setReportSearchTerm(event.target.value)}
                  placeholder="Cari pegawai, email, NIP, kontrak, atau kategori..."
                  className="pl-9"
                />
              </div>
              <Select value={employeeStatusFilter} onValueChange={(value) => setEmployeeStatusFilter(value as "all" | "active" | "inactive" | "unknown")}>
                <SelectTrigger>
                  <SelectValue placeholder="Status pegawai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status Pegawai</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                  <SelectItem value="unknown">Belum Ditentukan</SelectItem>
                </SelectContent>
              </Select>
              <Select value={employeeCategoryFilter} onValueChange={setEmployeeCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori pegawai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori Pegawai</SelectItem>
                  {uniqueEmployeeCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={contractStatusFilter} onValueChange={setContractStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status kontrak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status Kontrak</SelectItem>
                  {uniqueContractStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={opdFilter} onValueChange={setOpdFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="OPD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua OPD</SelectItem>
                  {uniqueOpdNames.map((opd) => (
                    <SelectItem key={opd} value={opd}>
                      {opd}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={workUnitFilter} onValueChange={setWorkUnitFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Unit kerja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Unit</SelectItem>
                  {uniqueWorkUnitNames.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
              <Input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="headcount">Headcount</TabsTrigger>
                <TabsTrigger value="kontrak">Kontrak</TabsTrigger>
                <TabsTrigger value="operasional">Operasional</TabsTrigger>
              </TabsList>
              <TabsContent value="headcount" className="space-y-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Validasi Ringkasan</CardTitle>
                    <CardDescription>Cross-check angka kartu ringkasan dengan sumber data yang sedang aktif di filter.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pemeriksaan</TableHead>
                          <TableHead className="text-right">Ringkasan</TableHead>
                          <TableHead className="text-right">Sumber</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportValidationRows.map((row) => (
                          <TableRow key={row.label}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell className="text-right">{row.summary}</TableCell>
                            <TableCell className="text-right">{row.source}</TableCell>
                            <TableCell>{row.isMatched ? "Sinkron" : "Perlu Tinjau"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <InfoRow icon={Users} title="Total Pegawai" description={`Total data pegawai terfilter: ${filteredHeadcount}`} />
                <InfoRow icon={Users} title="Pegawai Aktif" description={`Pegawai aktif: ${filteredActiveCount}`} />
                <InfoRow icon={Users} title="Pegawai Nonaktif" description={`Pegawai nonaktif: ${filteredInactiveCount}`} />
                <InfoRow
                  icon={Users}
                  title="Status Aktif Belum Ditentukan"
                  description={`Data pegawai dengan is_active null: ${filteredUnknownActiveFlagCount}`}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Drill-down Kategori Pegawai</CardTitle>
                    <CardDescription>Distribusi headcount berdasarkan kategori pegawai.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="text-right">Jumlah Pegawai</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeCategorySummary.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Belum ada data kategori pegawai.</TableCell>
                          </TableRow>
                        ) : (
                          employeeCategorySummary.map((row) => (
                            <TableRow key={row.label}>
                              <TableCell>{row.label}</TableCell>
                              <TableCell className="text-right">{row.total}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pegawai Butuh Tinjau</CardTitle>
                    <CardDescription>Fokuskan admin ke pegawai dengan kategori kosong atau status aktif belum jelas.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>NIP</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Status Aktif</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeNeedsReviewRows.length === 0 ? (
                          <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Tidak ada pegawai prioritas tinjau pada filter aktif.</TableCell>
                          </TableRow>
                        ) : (
                          employeeNeedsReviewRows.slice(0, 15).map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>
                                <div className="font-medium">{row.name || "-"}</div>
                                <div className="text-xs text-muted-foreground">{row.email || "-"}</div>
                              </TableCell>
                              <TableCell>{row.nip || "-"}</TableCell>
                              <TableCell>{row.employee_category || "Belum Diisi"}</TableCell>
                              <TableCell>
                                {row.is_active === true ? "Aktif" : row.is_active === false ? "Nonaktif" : "Belum Ditentukan"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="kontrak" className="space-y-3">
                <InfoRow icon={FileText} title="Kontrak Aktif" description={`Kontrak aktif saat ini: ${filteredActiveContracts}`} />
                <InfoRow icon={FileText} title="Kontrak Segera Berakhir" description={`Berakhir <= 30 hari: ${endingSoonContracts}`} />
                <InfoRow icon={FileText} title="Kontrak Lewat Jatuh Tempo" description={`Aktif namun melewati end date: ${overdueContracts}`} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Drill-down Status Kontrak</CardTitle>
                    <CardDescription>Distribusi kontrak berdasarkan status saat ini.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Jumlah Kontrak</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractStatusSummary.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">Belum ada data kontrak.</TableCell>
                          </TableRow>
                        ) : (
                          contractStatusSummary.map((row) => (
                            <TableRow key={row.status}>
                              <TableCell className="capitalize">{row.status}</TableCell>
                              <TableCell className="text-right">{row.total}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Kontrak Risiko Tinggi</CardTitle>
                    <CardDescription>Daftar kontrak aktif yang akan jatuh tempo atau sudah overdue.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>No. Kontrak</TableHead>
                          <TableHead>Berakhir</TableHead>
                          <TableHead>Risiko</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractRiskRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Tidak ada kontrak risiko tinggi pada filter aktif.</TableCell>
                          </TableRow>
                        ) : (
                          contractRiskRows.slice(0, 15).map((row) => {
                            const employee = row.employee_id ? employeeMap.get(row.employee_id) : null;
                            return (
                              <TableRow key={row.id}>
                                <TableCell>{employee?.name || row.employee_id || "-"}</TableCell>
                                <TableCell>{row.contract_number || row.id}</TableCell>
                                <TableCell>{formatDateLabel(row.end_date)}</TableCell>
                                <TableCell>{row.risk === "overdue" ? "Overdue" : "<= 30 Hari"}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="operasional" className="space-y-3">
                <InfoRow icon={BarChart3} title="Mutasi Pegawai" description="Analisis mutasi lintas unit/jabatan tersedia di Laporan Mutasi." />
                <InfoRow icon={BarChart3} title="Permohonan SDM" description="Pantau cuti, izin, dan lembur dari tab Laporan Permohonan." />
                <InfoRow
                  icon={BarChart3}
                  title="Audit Payroll-Impact"
                  description={`Perubahan payroll-impact terbaru yang tercatat: ${payrollImpactAuditCount}`}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Audit Trail Payroll-Impact</CardTitle>
                    <CardDescription>
                      Ringkasan perubahan pegawai dan kontrak yang paling relevan untuk audit payroll dasar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={auditSearchTerm}
                          onChange={(event) => setAuditSearchTerm(event.target.value)}
                          placeholder="Cari domain, aksi, aktor, atau ringkasan audit..."
                          className="pl-9"
                        />
                      </div>
                      <Select value={auditDomainFilter} onValueChange={setAuditDomainFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Filter domain audit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Domain Audit</SelectItem>
                          {auditDomains.map((domain) => (
                            <SelectItem key={domain} value={domain}>
                              {domain}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Waktu</TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>Aksi</TableHead>
                          <TableHead>Aktor</TableHead>
                          <TableHead>Ringkasan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedAuditRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              Belum ada audit payroll-impact terbaru.
                            </TableCell>
                          </TableRow>
                        ) : (
                          pagedAuditRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>{formatAuditTime(row.at)}</TableCell>
                              <TableCell>{row.domain}</TableCell>
                              <TableCell>{row.actionLabel}</TableCell>
                              <TableCell>{row.actor}</TableCell>
                              <TableCell>{row.summary}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safeAuditPage}
                      totalPages={auditTotalPages}
                      totalItems={filteredAuditRows.length}
                      pageSize={AUDIT_PAGE_SIZE}
                      itemLabel="audit payroll-impact"
                      onPrevious={() => setAuditPage((page) => Math.max(1, page - 1))}
                      onNext={() => setAuditPage((page) => Math.min(auditTotalPages, page + 1))}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {isLoading ? <p className="text-sm text-muted-foreground">Memuat laporan HR...</p> : null}
      </div>
    </OrganizationLayout>
  );
}

const readJsonObject = (value: Json | null): Record<string, Json> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
};

const summarizeAuditChange = (item: AuditLogLite) => {
  const oldValues = readJsonObject(item.old_values);
  const newValues = readJsonObject(item.new_values);

  if (item.action === "employee_status_update") {
    const effectiveDate = typeof newValues?.effective_date === "string" ? newValues.effective_date : "-";
    const reason = typeof newValues?.reason === "string" && newValues.reason.trim() ? newValues.reason : "tanpa alasan";
    const category = typeof newValues?.employee_category === "string" ? newValues.employee_category : "-";
    const activeFlag = typeof newValues?.is_active === "boolean" ? (newValues.is_active ? "aktif" : "nonaktif") : "tidak diketahui";
    return `Status ${activeFlag}, kategori ${category}, efektif ${effectiveDate}, alasan ${reason}`;
  }

  if (item.action === "employee_offboarding_deactivate") {
    const offboardingType = typeof newValues?.offboarding_type === "string" ? newValues.offboarding_type : "-";
    const offboardingDate = typeof newValues?.offboarding_date === "string" ? newValues.offboarding_date : "-";
    return `Pegawai dinonaktifkan lewat offboarding ${offboardingType}, efektif ${offboardingDate}`;
  }

  if (item.action === "offboarding_create") {
    const offboardingType = typeof newValues?.offboarding_type === "string" ? newValues.offboarding_type : "-";
    const offboardingDate = typeof newValues?.offboarding_date === "string" ? newValues.offboarding_date : "-";
    const documentRef =
      typeof newValues?.document_reference_number === "string" && newValues.document_reference_number.trim()
        ? `, ref ${newValues.document_reference_number}`
        : "";
    return `Offboarding ${offboardingType}, efektif ${offboardingDate}${documentRef}`;
  }

  if (item.action === "employee_mutation_applied") {
    const fields =
      typeof newValues === "object" && newValues && !Array.isArray(newValues)
        ? Object.keys(newValues).filter((key) => key !== "opd_name" && key !== "work_unit_name" && key !== "office_name")
        : [];
    return fields.length > 0 ? `Field pegawai diperbarui: ${fields.join(", ")}` : "Data pegawai diperbarui lewat approval mutasi";
  }

  if (item.action === "mutation_request_approved" || item.action === "mutation_request_rejected") {
    const mutationType = typeof newValues?.mutation_type === "string" ? newValues.mutation_type : "-";
    const status = typeof newValues?.status === "string" ? newValues.status : "-";
    const reason =
      typeof newValues?.rejection_reason === "string" && newValues.rejection_reason.trim()
        ? `, alasan ${newValues.rejection_reason}`
        : "";
    return `Mutasi ${mutationType}, status ${status}${reason}`;
  }

  if (item.table_name === "leave_requests") {
    const status = typeof newValues?.status === "string" ? newValues.status : "-";
    const level = typeof newValues?.current_approval_level === "number" ? newValues.current_approval_level : "-";
    const required =
      typeof newValues?.required_approval_levels === "number" ? newValues.required_approval_levels : "-";
    const reason =
      typeof newValues?.rejection_reason === "string" && newValues.rejection_reason.trim()
        ? `, alasan ${newValues.rejection_reason}`
        : "";
    return `Status ${status}, level ${level}/${required}${reason}`;
  }

  if (item.table_name === "employee_invitations") {
    const payload =
      typeof newValues?.payload === "object" && newValues.payload && !Array.isArray(newValues.payload)
        ? (newValues.payload as Record<string, Json>)
        : null;
    const invitationType = typeof payload?.invitation_type === "string" ? payload.invitation_type : "individual";
    const email = typeof payload?.email === "string" ? payload.email : "-";
    return `Undangan ${invitationType}, email ${email}`;
  }

  if (item.table_name === "wfh_requests") {
    const status = typeof newValues?.status === "string" ? newValues.status : "-";
    const requestDate = typeof newValues?.request_date === "string" ? newValues.request_date : "-";
    const reason =
      typeof newValues?.rejection_reason === "string" && newValues.rejection_reason.trim()
        ? `, alasan ${newValues.rejection_reason}`
        : "";
    return `Status ${status}, tanggal WFH ${requestDate}${reason}`;
  }

  if (item.table_name === "overtime_requests") {
    const status = typeof newValues?.status === "string" ? newValues.status : "-";
    const totalHours =
      typeof newValues?.total_hours === "number" || typeof newValues?.total_hours === "string"
        ? String(newValues.total_hours)
        : "-";
    const requestNumber = typeof newValues?.request_number === "string" ? newValues.request_number : "-";
    const reason =
      typeof newValues?.rejection_reason === "string" && newValues.rejection_reason.trim()
        ? `, alasan ${newValues.rejection_reason}`
        : "";
    return `Status ${status}, request ${requestNumber}, total ${totalHours} jam${reason}`;
  }

  if (item.table_name === "flexible_attendance_requests") {
    const status = typeof newValues?.status === "string" ? newValues.status : "-";
    const requestDate = typeof newValues?.request_date === "string" ? newValues.request_date : "-";
    const reasonType = typeof newValues?.reason_type === "string" ? newValues.reason_type : "-";
    const reason =
      typeof newValues?.rejection_reason === "string" && newValues.rejection_reason.trim()
        ? `, alasan ${newValues.rejection_reason}`
        : "";
    return `Status ${status}, tanggal ${requestDate}, tipe ${reasonType}${reason}`;
  }

  if (item.table_name === "hr_contracts") {
    const contractNumber =
      typeof newValues?.contract_number === "string"
        ? newValues.contract_number
        : typeof oldValues?.contract_number === "string"
          ? oldValues.contract_number
          : item.record_id || "-";
    const status =
      typeof newValues?.status === "string"
        ? newValues.status
        : typeof oldValues?.status === "string"
          ? oldValues.status
          : "-";
    const effectiveDate =
      typeof newValues?.metadata === "object" &&
      newValues.metadata &&
      !Array.isArray(newValues.metadata) &&
      typeof (newValues.metadata as Record<string, Json>).effective_date === "string"
        ? String((newValues.metadata as Record<string, Json>).effective_date)
        : "-";
    return `Kontrak ${contractNumber}, status ${status}, efektif ${effectiveDate}`;
  }

  return `${item.table_name} ${item.action}`;
};

const formatAuditTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function InfoRow({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
