import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";
import { executeRpcWithAvailability } from "@/lib/rpcAvailability";
import { toast } from "sonner";

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

type HolidayAuditRow = {
  id: string;
  name: string;
  date: string;
  tenant_id: string | null;
  is_national: boolean | null;
};

type AuditFinding = {
  id: string;
  type: "global_mismatch" | "tenant_marked_national" | "duplicate_holiday";
  severity: "critical" | "warning";
  message: string;
  date?: string;
  tenantId?: string | null;
};

type HolidayAuditSummaryRpcRow = {
  total_holidays: number;
  global_mismatch_count: number;
  tenant_marked_national_count: number;
  duplicate_holiday_count: number;
};

type HolidayAuditFindingRpcRow = {
  finding_id: string;
  finding_type: AuditFinding["type"];
  severity: AuditFinding["severity"];
  message: string;
  finding_date: string | null;
  finding_tenant_id: string | null;
  total_count: number;
};

type ExpiringContractRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  contract_number: string | null;
  contract_type: string;
  end_date: string | null;
  status: string;
  employee?: {
    name: string | null;
    email: string | null;
  } | null;
};

type ExpiredLeaveQuotaRow = {
  id: string;
  tenant_id: string;
  employee_id: string | null;
  leave_type_id: string | null;
  quota_year: number;
  remaining_days: number;
  valid_until: string | null;
  employee?: {
    name: string | null;
    nip: string | null;
  } | null;
  leave_type?: {
    leave_name: string | null;
  } | null;
};

type AtsJobDraftRow = {
  id: string;
  tenant_id: string;
  title: string;
  department: string | null;
  status: string;
  created_at: string;
};

type AtsOfferExpiredRow = {
  id: string;
  tenant_id: string;
  candidate_id: string;
  offered_position: string | null;
  expiry_at: string | null;
  status: string;
  candidate?: {
    full_name: string | null;
  } | null;
};

const ROUTE_AUDIT_TARGETS = [
  { domain: "Fondasi", label: "Data Pegawai", path: "/org/hr/employees" },
  { domain: "Fondasi", label: "Struktur Organisasi", path: "/org/hr/structure" },
  { domain: "Fondasi", label: "Status Kepegawaian", path: "/org/hr/employee-status" },
  { domain: "Operasional", label: "Proses Masuk Pegawai", path: "/org/hr/onboarding" },
  { domain: "Operasional", label: "Proses Keluar Pegawai", path: "/org/hr/offboarding" },
  { domain: "Operasional", label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
  { domain: "Operasional", label: "Integrasi Absensi", path: "/org/hr/attendance-integrations" },
  { domain: "Cuti", label: "Jenis Cuti", path: "/org/hr/leave-types" },
  { domain: "Cuti", label: "Kuota Cuti", path: "/org/hr/leave-quota" },
  { domain: "Cuti", label: "Rekap Cuti", path: "/org/hr/leave-recap" },
  { domain: "Kinerja", label: "KPI", path: "/org/hr/kpi" },
  { domain: "Kinerja", label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
  { domain: "Pelatihan", label: "Data Pelatihan", path: "/org/hr/training-data" },
  { domain: "Pelatihan", label: "Matriks Keahlian", path: "/org/hr/skill-matrix" },
  { domain: "Rekrutmen", label: "Lowongan ATS", path: "/org/hr/recruitment/jobs" },
  { domain: "ESS", label: "ESS Profil", path: "/org/hr/ess/profile" },
  { domain: "Pengaturan", label: "Hierarki Persetujuan", path: "/org/hr/approval-hierarchy" },
  { domain: "Pengaturan", label: "Log Error HR", path: "/org/hr/help/error-logs" },
] as const;

const getRouteStatusLabel = (path: string): string => {
  const policy = getHrRoutePolicy(path);
  if (policy.status === "redirect") return "Alias";
  if (policy.status === "internal") return "Internal";
  if (policy.status === "tunda") return "Tunda";
  return "Aktif";
};

const getRouteStatusVariant = (path: string): "default" | "secondary" | "destructive" | "outline" => {
  const policy = getHrRoutePolicy(path);
  if (policy.status === "tampil") return "secondary";
  if (policy.status === "tunda") return "destructive";
  return "outline";
};

const PAGE_SIZE = 8;
const HOLIDAY_AUDIT_SUMMARY_RPC_NAME = "get_hr_holiday_audit_summary";
const HOLIDAY_AUDIT_FINDINGS_RPC_NAME = "get_hr_holiday_audit_findings";
const rpcUntyped = supabase.rpc.bind(supabase) as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const paginateItems = <T,>(items: T[], currentPage: number, pageSize = PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const from = (safePage - 1) * pageSize;
  return {
    totalPages,
    safePage,
    rows: items.slice(from, from + pageSize),
  };
};

export default function AdminHRAudit() {
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  const [totalHolidays, setTotalHolidays] = useState(0);
  const [globalMismatchCount, setGlobalMismatchCount] = useState(0);
  const [tenantMarkedNationalCount, setTenantMarkedNationalCount] = useState(0);
  const [duplicateHolidayCount, setDuplicateHolidayCount] = useState(0);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [findingsTotalCount, setFindingsTotalCount] = useState(0);
  const [contractsExpiringSoonCount, setContractsExpiringSoonCount] = useState(0);
  const [draftContractCount, setDraftContractCount] = useState(0);
  const [expiredQuotaCount, setExpiredQuotaCount] = useState(0);
  const [negativeLeaveBalanceCount, setNegativeLeaveBalanceCount] = useState(0);
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContractRow[]>([]);
  const [expiredLeaveQuotas, setExpiredLeaveQuotas] = useState<ExpiredLeaveQuotaRow[]>([]);
  const [draftAtsJobsCount, setDraftAtsJobsCount] = useState(0);
  const [candidateWithoutJobCount, setCandidateWithoutJobCount] = useState(0);
  const [overdueInterviewCount, setOverdueInterviewCount] = useState(0);
  const [expiredOfferCount, setExpiredOfferCount] = useState(0);
  const [draftAtsJobs, setDraftAtsJobs] = useState<AtsJobDraftRow[]>([]);
  const [expiredAtsOffers, setExpiredAtsOffers] = useState<AtsOfferExpiredRow[]>([]);
  const [routeAuditPage, setRouteAuditPage] = useState(1);
  const [contractPage, setContractPage] = useState(1);
  const [quotaPage, setQuotaPage] = useState(1);
  const [draftJobPage, setDraftJobPage] = useState(1);
  const [expiredOfferPage, setExpiredOfferPage] = useState(1);
  const [findingPage, setFindingPage] = useState(1);
  const [contractSearch, setContractSearch] = useState("");
  const [quotaSearch, setQuotaSearch] = useState("");
  const [draftJobSearch, setDraftJobSearch] = useState("");
  const [expiredOfferSearch, setExpiredOfferSearch] = useState("");
  const [findingSearch, setFindingSearch] = useState("");
  const [findingTypeFilter, setFindingTypeFilter] = useState<"all" | AuditFinding["type"]>("all");
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<"all" | AuditFinding["severity"]>("all");

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500);

        if (error) throw error;
        setTenantOptions((data || []) as TenantOption[]);
      } catch (error) {
        const ref = reportError(error, "admin.hr.audit.tenants");
        toast.error(appendErrorReference("Gagal memuat tenant untuk audit HR", ref));
      }
    };

    void loadTenants();
  }, []);

  const tenantLabelMap = useMemo(() => {
    return new Map(tenantOptions.map((tenant) => [tenant.id, `${tenant.name} (${tenant.code})`]));
  }, [tenantOptions]);
  const routeAuditSummary = useMemo(() => {
    const counts = { aktif: 0, alias: 0, internal: 0, tunda: 0 };
    for (const target of ROUTE_AUDIT_TARGETS) {
      const policy = getHrRoutePolicy(target.path);
      if (policy.status === "tampil") counts.aktif += 1;
      if (policy.status === "redirect") counts.alias += 1;
      if (policy.status === "internal") counts.internal += 1;
      if (policy.status === "tunda") counts.tunda += 1;
    }
    return counts;
  }, []);
  const routeAuditNonFinalRows = useMemo(
    () => ROUTE_AUDIT_TARGETS.filter((target) => getHrRoutePolicy(target.path).status !== "tampil"),
    [],
  );
  const pagedRouteAudit = useMemo(
    () => paginateItems(routeAuditNonFinalRows, routeAuditPage),
    [routeAuditNonFinalRows, routeAuditPage],
  );
  const defaultBaselineFindings = useMemo(
    () => [
      {
        id: "contracts-expiring-soon",
        label: "Kontrak aktif mendekati akhir",
        value: contractsExpiringSoonCount,
        detail: "Kontrak aktif dengan akhir masa berlaku dalam 30 hari ke depan.",
        severity: contractsExpiringSoonCount > 0 ? "warning" : "ok",
      },
      {
        id: "contracts-draft",
        label: "Kontrak masih draft",
        value: draftContractCount,
        detail: "Kontrak draft yang masih butuh finalisasi atau aktivasi.",
        severity: draftContractCount > 0 ? "warning" : "ok",
      },
      {
        id: "leave-expired",
        label: "Kuota cuti kedaluwarsa",
        value: expiredQuotaCount,
        detail: "Kuota cuti yang sudah melewati valid_until namun masih tersisa.",
        severity: expiredQuotaCount > 0 ? "warning" : "ok",
      },
      {
        id: "leave-negative-balance",
        label: "Sisa kuota negatif",
        value: negativeLeaveBalanceCount,
        detail: "Kuota cuti dengan remaining_days di bawah nol.",
        severity: negativeLeaveBalanceCount > 0 ? "critical" : "ok",
      },
      {
        id: "ats-jobs-draft",
        label: "Lowongan ATS draft",
        value: draftAtsJobsCount,
        detail: "Lowongan yang belum dipublikasikan di tenant aktif.",
        severity: draftAtsJobsCount > 0 ? "warning" : "ok",
      },
      {
        id: "ats-candidate-no-job",
        label: "Kandidat tanpa lowongan",
        value: candidateWithoutJobCount,
        detail: "Kandidat ATS aktif yang belum terhubung ke lowongan.",
        severity: candidateWithoutJobCount > 0 ? "warning" : "ok",
      },
      {
        id: "ats-overdue-interview",
        label: "Wawancara terlewat",
        value: overdueInterviewCount,
        detail: "Wawancara terjadwal dengan jadwal yang sudah lewat.",
        severity: overdueInterviewCount > 0 ? "warning" : "ok",
      },
      {
        id: "ats-expired-offer",
        label: "Penawaran kedaluwarsa",
        value: expiredOfferCount,
        detail: "Penawaran yang masa berlakunya sudah lewat tetapi status belum selesai.",
        severity: expiredOfferCount > 0 ? "warning" : "ok",
      },
    ],
    [
      contractsExpiringSoonCount,
      draftContractCount,
      expiredQuotaCount,
      negativeLeaveBalanceCount,
      draftAtsJobsCount,
      candidateWithoutJobCount,
      overdueInterviewCount,
      expiredOfferCount,
    ],
  );
  const findingTotalPages = Math.max(1, Math.ceil(findingsTotalCount / PAGE_SIZE));
  const safeFindingPage = Math.min(findingPage, findingTotalPages);
  const contractTotalPages = Math.max(1, Math.ceil(contractsExpiringSoonCount / PAGE_SIZE));
  const quotaTotalPages = Math.max(1, Math.ceil(expiredQuotaCount / PAGE_SIZE));
  const draftJobTotalPages = Math.max(1, Math.ceil(draftAtsJobsCount / PAGE_SIZE));
  const expiredOfferTotalPages = Math.max(1, Math.ceil(expiredOfferCount / PAGE_SIZE));
  const safeContractPage = Math.min(contractPage, contractTotalPages);
  const safeQuotaPage = Math.min(quotaPage, quotaTotalPages);
  const safeDraftJobPage = Math.min(draftJobPage, draftJobTotalPages);
  const safeExpiredOfferPage = Math.min(expiredOfferPage, expiredOfferTotalPages);
  const normalizedContractSearch = contractSearch.trim().toLowerCase();
  const normalizedQuotaSearch = quotaSearch.trim().toLowerCase();
  const normalizedDraftJobSearch = draftJobSearch.trim().toLowerCase();
  const normalizedExpiredOfferSearch = expiredOfferSearch.trim().toLowerCase();
  const normalizedFindingSearch = findingSearch.trim().toLowerCase();
  const sanitizedContractSearch = useMemo(() => sanitizeOrKeyword(contractSearch), [contractSearch]);
  const sanitizedQuotaSearch = useMemo(() => sanitizeOrKeyword(quotaSearch), [quotaSearch]);
  const sanitizedDraftJobSearch = useMemo(() => sanitizeOrKeyword(draftJobSearch), [draftJobSearch]);
  const sanitizedExpiredOfferSearch = useMemo(() => sanitizeOrKeyword(expiredOfferSearch), [expiredOfferSearch]);
  const filteredExpiringContracts = useMemo(() => {
    if (!normalizedContractSearch) return expiringContracts;
    return expiringContracts.filter((item) => {
      const haystack = [
        tenantLabelMap.get(item.tenant_id) ?? item.tenant_id,
        item.employee?.name ?? "",
        item.employee?.email ?? "",
        item.contract_number ?? "",
        item.contract_type,
        item.end_date ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedContractSearch);
    });
  }, [expiringContracts, normalizedContractSearch, tenantLabelMap]);
  const filteredExpiredLeaveQuotas = useMemo(() => {
    if (!normalizedQuotaSearch) return expiredLeaveQuotas;
    return expiredLeaveQuotas.filter((item) => {
      const haystack = [
        tenantLabelMap.get(item.tenant_id) ?? item.tenant_id,
        item.employee?.name ?? "",
        item.employee?.nip ?? "",
        item.leave_type?.leave_name ?? "",
        item.quota_year.toString(),
        item.valid_until ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuotaSearch);
    });
  }, [expiredLeaveQuotas, normalizedQuotaSearch, tenantLabelMap]);
  const filteredDraftAtsJobs = useMemo(() => {
    if (!normalizedDraftJobSearch) return draftAtsJobs;
    return draftAtsJobs.filter((item) => {
      const haystack = [
        tenantLabelMap.get(item.tenant_id) ?? item.tenant_id,
        item.title,
        item.department ?? "",
        item.created_at,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedDraftJobSearch);
    });
  }, [draftAtsJobs, normalizedDraftJobSearch, tenantLabelMap]);
  const filteredExpiredAtsOffers = useMemo(() => {
    if (!normalizedExpiredOfferSearch) return expiredAtsOffers;
    return expiredAtsOffers.filter((item) => {
      const haystack = [
        tenantLabelMap.get(item.tenant_id) ?? item.tenant_id,
        item.candidate?.full_name ?? "",
        item.offered_position ?? "",
        item.status,
        item.expiry_at ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedExpiredOfferSearch);
    });
  }, [expiredAtsOffers, normalizedExpiredOfferSearch, tenantLabelMap]);
  useEffect(() => {
    setRouteAuditPage(1);
    setContractPage(1);
    setQuotaPage(1);
    setDraftJobPage(1);
    setExpiredOfferPage(1);
    setFindingPage(1);
  }, [tenantFilter]);

  useEffect(() => {
    setRouteAuditPage((page) => Math.min(page, pagedRouteAudit.totalPages));
    setContractPage((page) => Math.min(page, contractTotalPages));
    setQuotaPage((page) => Math.min(page, quotaTotalPages));
    setDraftJobPage((page) => Math.min(page, draftJobTotalPages));
    setExpiredOfferPage((page) => Math.min(page, expiredOfferTotalPages));
    setFindingPage((page) => Math.min(page, findingTotalPages));
  }, [
    pagedRouteAudit.totalPages,
    contractTotalPages,
    quotaTotalPages,
    draftJobTotalPages,
    expiredOfferTotalPages,
    findingTotalPages,
  ]);

  useEffect(() => {
    setContractPage(1);
  }, [contractSearch]);

  useEffect(() => {
    setQuotaPage(1);
  }, [quotaSearch]);

  useEffect(() => {
    setDraftJobPage(1);
  }, [draftJobSearch]);

  useEffect(() => {
    setExpiredOfferPage(1);
  }, [expiredOfferSearch]);

  useEffect(() => {
    setFindingPage(1);
  }, [findingSearch, findingTypeFilter, findingSeverityFilter]);

  const loadAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const next30DaysIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const resolveEmployeeIds = async (keyword: string) => {
        if (!keyword) return [] as string[];
        let query = supabase
          .from("employees")
          .select("id")
          .or(`name.ilike.%${keyword}%,email.ilike.%${keyword}%,nip.ilike.%${keyword}%`)
          .limit(1000);
        if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((row) => row.id);
      };

      const resolveLeaveTypeIds = async (keyword: string) => {
        if (!keyword) return [] as string[];
        let query = supabase
          .from("leave_types")
          .select("id")
          .or(`leave_name.ilike.%${keyword}%,description.ilike.%${keyword}%`)
          .limit(1000);
        if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((row) => row.id);
      };

      const resolveCandidateIds = async (keyword: string) => {
        if (!keyword) return [] as string[];
        let query = supabase
          .from("hr_recruitment_candidates")
          .select("id")
          .or(`full_name.ilike.%${keyword}%,email.ilike.%${keyword}%,phone.ilike.%${keyword}%`)
          .limit(1000);
        if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((row) => row.id);
      };

      const [
        contractEmployeeIds,
        quotaEmployeeIds,
        quotaLeaveTypeIds,
        expiredOfferCandidateIds,
      ] = await Promise.all([
        resolveEmployeeIds(sanitizedContractSearch),
        resolveEmployeeIds(sanitizedQuotaSearch),
        resolveLeaveTypeIds(sanitizedQuotaSearch),
        resolveCandidateIds(sanitizedExpiredOfferSearch),
      ]);

      let contractsExpiringSoonQuery = supabase
        .from("hr_contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .not("end_date", "is", null)
        .gte("end_date", todayIso)
        .lte("end_date", next30DaysIso);
      let draftContractsQuery = supabase
        .from("hr_contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft");
      let expiredQuotaQuery = supabase
        .from("leave_quotas")
        .select("id", { count: "exact", head: true })
        .not("valid_until", "is", null)
        .lt("valid_until", todayIso)
        .gt("remaining_days", 0);
      let negativeLeaveBalanceQuery = supabase
        .from("leave_quotas")
        .select("id", { count: "exact", head: true })
        .lt("remaining_days", 0);
      let expiringContractsRowsQuery = supabase
        .from("hr_contracts")
        .select("id, tenant_id, employee_id, contract_number, contract_type, end_date, status, employee:employee_id(name, email)")
        .eq("status", "active")
        .not("end_date", "is", null)
        .gte("end_date", todayIso)
        .lte("end_date", next30DaysIso)
        .order("end_date", { ascending: true })
        .range((safeContractPage - 1) * PAGE_SIZE, safeContractPage * PAGE_SIZE - 1);
      let expiredQuotaRowsQuery = supabase
        .from("leave_quotas")
        .select(
          "id, tenant_id, employee_id, leave_type_id, quota_year, remaining_days, valid_until, employee:employee_id(name, nip), leave_type:leave_type_id(leave_name)"
        )
        .not("valid_until", "is", null)
        .lt("valid_until", todayIso)
        .gt("remaining_days", 0)
        .order("valid_until", { ascending: false })
        .range((safeQuotaPage - 1) * PAGE_SIZE, safeQuotaPage * PAGE_SIZE - 1);
      let draftAtsJobsQuery = supabase
        .from("hr_recruitment_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft");
      let candidateWithoutJobQuery = supabase
        .from("hr_recruitment_candidates")
        .select("id", { count: "exact", head: true })
        .is("job_id", null)
        .in("status", ["active", "hold"]);
      let overdueInterviewQuery = supabase
        .from("hr_recruitment_interviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .lt("scheduled_at", new Date().toISOString());
      let expiredOfferQuery = supabase
        .from("hr_recruitment_offers")
        .select("id", { count: "exact", head: true })
        .not("expiry_at", "is", null)
        .lt("expiry_at", new Date().toISOString())
        .in("status", ["draft", "sent"]);
      let draftAtsJobsRowsQuery = supabase
        .from("hr_recruitment_jobs")
        .select("id, tenant_id, title, department, status, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .range((safeDraftJobPage - 1) * PAGE_SIZE, safeDraftJobPage * PAGE_SIZE - 1);
      let expiredAtsOffersRowsQuery = supabase
        .from("hr_recruitment_offers")
        .select("id, tenant_id, candidate_id, offered_position, expiry_at, status, candidate:candidate_id(full_name)")
        .not("expiry_at", "is", null)
        .lt("expiry_at", new Date().toISOString())
        .in("status", ["draft", "sent"])
        .order("expiry_at", { ascending: false })
        .range((safeExpiredOfferPage - 1) * PAGE_SIZE, safeExpiredOfferPage * PAGE_SIZE - 1);

      if (tenantFilter !== "all") {
        contractsExpiringSoonQuery = contractsExpiringSoonQuery.eq("tenant_id", tenantFilter);
        draftContractsQuery = draftContractsQuery.eq("tenant_id", tenantFilter);
        expiredQuotaQuery = expiredQuotaQuery.eq("tenant_id", tenantFilter);
        negativeLeaveBalanceQuery = negativeLeaveBalanceQuery.eq("tenant_id", tenantFilter);
        expiringContractsRowsQuery = expiringContractsRowsQuery.eq("tenant_id", tenantFilter);
        expiredQuotaRowsQuery = expiredQuotaRowsQuery.eq("tenant_id", tenantFilter);
        draftAtsJobsQuery = draftAtsJobsQuery.eq("tenant_id", tenantFilter);
        candidateWithoutJobQuery = candidateWithoutJobQuery.eq("tenant_id", tenantFilter);
        overdueInterviewQuery = overdueInterviewQuery.eq("tenant_id", tenantFilter);
        expiredOfferQuery = expiredOfferQuery.eq("tenant_id", tenantFilter);
        draftAtsJobsRowsQuery = draftAtsJobsRowsQuery.eq("tenant_id", tenantFilter);
        expiredAtsOffersRowsQuery = expiredAtsOffersRowsQuery.eq("tenant_id", tenantFilter);
      }

      const contractOrClause = buildPostgrestOrClause({
        keyword: sanitizedContractSearch,
        ilikeFields: ["contract_number", "contract_type", "status"],
        inFilters: [{ field: "employee_id", values: contractEmployeeIds }],
      });
      if (contractOrClause) {
        contractsExpiringSoonQuery = contractsExpiringSoonQuery.or(contractOrClause);
        expiringContractsRowsQuery = expiringContractsRowsQuery.or(contractOrClause);
      }

      const quotaOrClause = buildPostgrestOrClause({
        keyword: sanitizedQuotaSearch,
        ilikeFields: ["notes"],
        inFilters: [
          { field: "employee_id", values: quotaEmployeeIds },
          { field: "leave_type_id", values: quotaLeaveTypeIds },
        ],
      });
      if (quotaOrClause) {
        expiredQuotaQuery = expiredQuotaQuery.or(quotaOrClause);
        expiredQuotaRowsQuery = expiredQuotaRowsQuery.or(quotaOrClause);
      }

      const draftJobOrClause = buildPostgrestOrClause({
        keyword: sanitizedDraftJobSearch,
        ilikeFields: ["title", "department", "status"],
      });
      if (draftJobOrClause) {
        draftAtsJobsQuery = draftAtsJobsQuery.or(draftJobOrClause);
        draftAtsJobsRowsQuery = draftAtsJobsRowsQuery.or(draftJobOrClause);
      }

      const expiredOfferOrClause = buildPostgrestOrClause({
        keyword: sanitizedExpiredOfferSearch,
        ilikeFields: ["offered_position", "status", "notes"],
        inFilters: [{ field: "candidate_id", values: expiredOfferCandidateIds }],
      });
      if (expiredOfferOrClause) {
        expiredOfferQuery = expiredOfferQuery.or(expiredOfferOrClause);
        expiredAtsOffersRowsQuery = expiredAtsOffersRowsQuery.or(expiredOfferOrClause);
      }

      const holidayRpcParams = {
        p_tenant_id: tenantFilter === "all" ? null : tenantFilter,
      };
      const holidayFindingsRpcParams = {
        ...holidayRpcParams,
        p_page: safeFindingPage,
        p_page_size: PAGE_SIZE,
        p_finding_type: findingTypeFilter === "all" ? null : findingTypeFilter,
        p_severity: findingSeverityFilter === "all" ? null : findingSeverityFilter,
        p_search: normalizedFindingSearch || null,
      };

      const [
        holidaySummaryRpc,
        holidayFindingsRpc,
        contractsExpiringSoonResult,
        draftContractsResult,
        expiredQuotaResult,
        negativeLeaveBalanceResult,
        expiringContractsRowsResult,
        expiredQuotaRowsResult,
        draftAtsJobsResult,
        candidateWithoutJobResult,
        overdueInterviewResult,
        expiredOfferResult,
        draftAtsJobsRowsResult,
        expiredAtsOffersRowsResult,
      ] = await Promise.all([
        executeRpcWithAvailability<HolidayAuditSummaryRpcRow[]>(
          HOLIDAY_AUDIT_SUMMARY_RPC_NAME,
          () => rpcUntyped(HOLIDAY_AUDIT_SUMMARY_RPC_NAME, holidayRpcParams) as Promise<{ data: HolidayAuditSummaryRpcRow[] | null; error: unknown }>,
        ),
        executeRpcWithAvailability<HolidayAuditFindingRpcRow[]>(
          HOLIDAY_AUDIT_FINDINGS_RPC_NAME,
          () => rpcUntyped(HOLIDAY_AUDIT_FINDINGS_RPC_NAME, holidayFindingsRpcParams) as Promise<{ data: HolidayAuditFindingRpcRow[] | null; error: unknown }>,
        ),
        contractsExpiringSoonQuery,
        draftContractsQuery,
        expiredQuotaQuery,
        negativeLeaveBalanceQuery,
        expiringContractsRowsQuery,
        expiredQuotaRowsQuery,
        draftAtsJobsQuery,
        candidateWithoutJobQuery,
        overdueInterviewQuery,
        expiredOfferQuery,
        draftAtsJobsRowsQuery,
        expiredAtsOffersRowsQuery,
      ]);

      const queryError =
        contractsExpiringSoonResult.error ||
        draftContractsResult.error ||
        expiredQuotaResult.error ||
        negativeLeaveBalanceResult.error ||
        expiringContractsRowsResult.error ||
        expiredQuotaRowsResult.error ||
        draftAtsJobsResult.error ||
        candidateWithoutJobResult.error ||
        overdueInterviewResult.error ||
        expiredOfferResult.error ||
        draftAtsJobsRowsResult.error ||
        expiredAtsOffersRowsResult.error;

      if (queryError) {
        throw queryError;
      }
      const holidaySummaryData = holidaySummaryRpc.data?.[0] || null;
      const holidayFindingsData = holidayFindingsRpc.data || [];
      const canUseHolidayRpc = !holidaySummaryRpc.error && !holidayFindingsRpc.error && holidaySummaryData;

      if (canUseHolidayRpc) {
        setTotalHolidays(holidaySummaryData.total_holidays ?? 0);
        setGlobalMismatchCount(holidaySummaryData.global_mismatch_count ?? 0);
        setTenantMarkedNationalCount(holidaySummaryData.tenant_marked_national_count ?? 0);
        setDuplicateHolidayCount(holidaySummaryData.duplicate_holiday_count ?? 0);
        setFindings(
          holidayFindingsData.map((item) => ({
            id: item.finding_id,
            type: item.finding_type,
            severity: item.severity,
            message: item.message,
            date: item.finding_date || undefined,
            tenantId: item.finding_tenant_id,
          })),
        );
        setFindingsTotalCount(holidayFindingsData[0]?.total_count ?? 0);
      } else {
        const baseHolidayQuery = supabase.from("holidays").select("id", { count: "exact", head: true });
        const scopedHolidayCountQuery =
          tenantFilter === "all"
            ? baseHolidayQuery
            : supabase
                .from("holidays")
                .select("id", { count: "exact", head: true })
                .or(`tenant_id.eq.${tenantFilter},tenant_id.is.null`);

        const globalMismatchQuery = supabase
          .from("holidays")
          .select("id", { count: "exact", head: true })
          .is("tenant_id", null)
          .or("is_national.eq.false,is_national.is.null");

        const tenantMarkedNationalQuery =
          tenantFilter === "all"
            ? supabase
                .from("holidays")
                .select("id", { count: "exact", head: true })
                .not("tenant_id", "is", null)
                .eq("is_national", true)
            : supabase
                .from("holidays")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", tenantFilter)
                .eq("is_national", true);

        const scopedRowsQuery =
          tenantFilter === "all"
            ? supabase
                .from("holidays")
                .select("id, name, date, tenant_id, is_national")
                .order("date", { ascending: false })
                .limit(5000)
            : supabase
                .from("holidays")
                .select("id, name, date, tenant_id, is_national")
                .or(`tenant_id.eq.${tenantFilter},tenant_id.is.null`)
                .order("date", { ascending: false })
                .limit(5000);

        const [totalHolidaysResult, globalMismatchResult, tenantMarkedNationalResult, scopedRowsResult] = await Promise.all([
          scopedHolidayCountQuery,
          globalMismatchQuery,
          tenantMarkedNationalQuery,
          scopedRowsQuery,
        ]);

        const holidayFallbackError =
          totalHolidaysResult.error ||
          globalMismatchResult.error ||
          tenantMarkedNationalResult.error ||
          scopedRowsResult.error;

        if (holidayFallbackError) {
          throw holidayFallbackError;
        }

        const rows = (scopedRowsResult.data || []) as HolidayAuditRow[];
        const duplicateMap = new Map<string, HolidayAuditRow[]>();

        for (const row of rows) {
          const key = `${row.date}::${row.tenant_id || "global"}::${row.name.trim().toLowerCase()}`;
          const existing = duplicateMap.get(key);
          if (existing) {
            existing.push(row);
          } else {
            duplicateMap.set(key, [row]);
          }
        }

        const duplicateGroups = [...duplicateMap.values()].filter((group) => group.length > 1);
        const duplicateRowsCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);
        const computedFindings: AuditFinding[] = [];

        for (const row of rows) {
          if (row.tenant_id === null && (row.is_national === false || row.is_national === null)) {
            computedFindings.push({
              id: `global-${row.id}`,
              type: "global_mismatch",
              severity: "warning",
              message: "Hari libur global tanpa flag nasional yang konsisten.",
              date: row.date,
              tenantId: row.tenant_id,
            });
          }
          if (row.tenant_id !== null && row.is_national === true) {
            computedFindings.push({
              id: `tenant-national-${row.id}`,
              type: "tenant_marked_national",
              severity: "warning",
              message: "Hari libur tenant ditandai nasional. Periksa klasifikasi.",
              date: row.date,
              tenantId: row.tenant_id,
            });
          }
        }

        for (const group of duplicateGroups) {
          const first = group[0];
          computedFindings.push({
            id: `dup-${first.id}`,
            type: "duplicate_holiday",
            severity: "critical",
            message: `Duplikasi ${group.length} entri hari libur dengan tanggal & nama sama.`,
            date: first.date,
            tenantId: first.tenant_id,
          });
        }

        computedFindings.sort((a, b) => {
          if (a.severity !== b.severity) {
            return a.severity === "critical" ? -1 : 1;
          }
          return (b.date || "").localeCompare(a.date || "");
        });

        const fallbackFilteredFindings = computedFindings.filter((item) => {
          if (findingTypeFilter !== "all" && item.type !== findingTypeFilter) return false;
          if (findingSeverityFilter !== "all" && item.severity !== findingSeverityFilter) return false;
          if (!normalizedFindingSearch) return true;
          const haystack = [
            item.message,
            item.date ?? "",
            item.type,
            item.severity,
            item.tenantId ? tenantLabelMap.get(item.tenantId) ?? item.tenantId : "global",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedFindingSearch);
        });
        const pagedFallbackFindings = paginateItems(fallbackFilteredFindings, safeFindingPage);
        setTotalHolidays(totalHolidaysResult.count ?? 0);
        setGlobalMismatchCount(globalMismatchResult.count ?? 0);
        setTenantMarkedNationalCount(tenantMarkedNationalResult.count ?? 0);
        setDuplicateHolidayCount(duplicateRowsCount);
        setFindings(pagedFallbackFindings.rows);
        setFindingsTotalCount(fallbackFilteredFindings.length);
      }

      setContractsExpiringSoonCount(contractsExpiringSoonResult.count ?? 0);
      setDraftContractCount(draftContractsResult.count ?? 0);
      setExpiredQuotaCount(expiredQuotaResult.count ?? 0);
      setNegativeLeaveBalanceCount(negativeLeaveBalanceResult.count ?? 0);
      setExpiringContracts((expiringContractsRowsResult.data || []) as ExpiringContractRow[]);
      setExpiredLeaveQuotas((expiredQuotaRowsResult.data || []) as ExpiredLeaveQuotaRow[]);
      setDraftAtsJobsCount(draftAtsJobsResult.count ?? 0);
      setCandidateWithoutJobCount(candidateWithoutJobResult.count ?? 0);
      setOverdueInterviewCount(overdueInterviewResult.count ?? 0);
      setExpiredOfferCount(expiredOfferResult.count ?? 0);
      setDraftAtsJobs((draftAtsJobsRowsResult.data || []) as AtsJobDraftRow[]);
      setExpiredAtsOffers((expiredAtsOffersRowsResult.data || []) as AtsOfferExpiredRow[]);
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.audit.holidays_quality");
      toast.error(appendErrorReference("Gagal memuat audit kualitas data HR", ref));
      setExpiringContracts([]);
      setExpiredLeaveQuotas([]);
      setDraftAtsJobs([]);
      setExpiredAtsOffers([]);
      setFindings([]);
      setFindingsTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [
    findingSeverityFilter,
    findingTypeFilter,
    sanitizedContractSearch,
    sanitizedDraftJobSearch,
    sanitizedExpiredOfferSearch,
    sanitizedQuotaSearch,
    normalizedFindingSearch,
    safeContractPage,
    safeDraftJobPage,
    safeExpiredOfferPage,
    safeFindingPage,
    safeQuotaPage,
    tenantFilter,
    tenantLabelMap,
  ]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <AdminHRPageShell
      title="Audit HR"
      subtitle="Audit kualitas data dan acuan bawaan modul HR"
      description="Monitor kualitas data lintas tenant sambil memastikan acuan bawaan HR yang sudah aktif tetap konsisten di level admin."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Audit dijalankan manual untuk menjaga performa modul dan memudahkan verifikasi setelah aktivasi bertahap domain HR.
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat data audit..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Filter tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tenant</SelectItem>
                {tenantOptions.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadAudit()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang Audit
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/hr/error-logs">Buka Log Error HR</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Aktif</CardTitle>
              <CardDescription>Target audit /org/hr yang sudah tampil final.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{routeAuditSummary.aktif}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Alias</CardTitle>
              <CardDescription>Masih teralihkan ke rute HR utama.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{routeAuditSummary.alias}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Internal</CardTitle>
              <CardDescription>Disimpan untuk pemantauan atau kontrol admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{routeAuditSummary.internal}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Ditunda</CardTitle>
              <CardDescription>Masih belum final bila ada yang tersisa.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{routeAuditSummary.tunda}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audit Status Rute HR</CardTitle>
            <CardDescription>
              Snapshot rute `/org/hr` yang masih alias atau internal agar admin tidak membaca semuanya sebagai halaman final.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Rute Org</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routeAuditNonFinalRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Tidak ada rute non-final pada cakupan audit ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRouteAudit.rows.map((item) => (
                    <TableRow key={item.path}>
                      <TableCell>{item.domain}</TableCell>
                      <TableCell>{item.label}</TableCell>
                      <TableCell className="font-mono text-xs">{item.path}</TableCell>
                      <TableCell>
                        <Badge variant={getRouteStatusVariant(item.path)}>{getRouteStatusLabel(item.path)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePaginationFooter
              currentPage={pagedRouteAudit.safePage}
              totalPages={pagedRouteAudit.totalPages}
              totalItems={routeAuditNonFinalRows.length}
              pageSize={PAGE_SIZE}
              itemLabel="rute"
              onPrevious={() => setRouteAuditPage((page) => Math.max(1, page - 1))}
              onNext={() => setRouteAuditPage((page) => Math.min(pagedRouteAudit.totalPages, page + 1))}
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hari Libur Tercatat</CardTitle>
              <CardDescription>Total data hari libur pada cakupan audit.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : totalHolidays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Global Tidak Selaras</CardTitle>
              <CardDescription>`tenant_id` null namun bukan nasional/null.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : globalMismatchCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tenant Ditandai Nasional</CardTitle>
              <CardDescription>`tenant_id` terisi dengan `is_national=true`.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : tenantMarkedNationalCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Indikasi Duplikasi</CardTitle>
              <CardDescription>Nama + tanggal libur kembar dalam tenant/cakupan sama.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : duplicateHolidayCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kontrak Segera Berakhir</CardTitle>
              <CardDescription>Kontrak aktif dengan akhir masa berlaku 30 hari ke depan.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : contractsExpiringSoonCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kontrak Draf</CardTitle>
              <CardDescription>Kontrak yang belum difinalkan pada tenant aktif.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : draftContractCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kuota Kedaluwarsa</CardTitle>
              <CardDescription>Kuota cuti yang sudah lewat masa berlaku namun masih tersisa.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : expiredQuotaCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sisa Kuota Negatif</CardTitle>
              <CardDescription>Indikasi data cuti yang tidak konsisten.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : negativeLeaveBalanceCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audit Acuan Bawaan Kontrak dan Cuti</CardTitle>
            <CardDescription>
              Ringkasan indikator kualitas data yang paling relevan setelah domain HR inti aktif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tingkat Keparahan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Rincian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaultBaselineFindings.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge
                        variant={
                          item.severity === "critical"
                            ? "destructive"
                            : item.severity === "warning"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {item.severity === "critical" ? "Kritis" : item.severity === "warning" ? "Peringatan" : "Aman"}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.label}</TableCell>
                    <TableCell>{isLoading ? "..." : item.value}</TableCell>
                    <TableCell>{item.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lowongan Draf</CardTitle>
              <CardDescription>Lowongan ATS yang belum dipublikasikan.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : draftAtsJobsCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kandidat Tanpa Lowongan</CardTitle>
              <CardDescription>Kandidat aktif yang belum terhubung ke lowongan ATS.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : candidateWithoutJobCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Wawancara Terlewat</CardTitle>
              <CardDescription>Wawancara terjadwal dengan jadwal yang sudah lewat.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : overdueInterviewCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Penawaran Kedaluwarsa</CardTitle>
              <CardDescription>Penawaran kerja yang masa berlakunya lewat tetapi status belum final.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : expiredOfferCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Rincian Kontrak Segera Berakhir</CardTitle>
              <CardDescription>Kontrak aktif yang paling dekat tanggal berakhirnya pada halaman ini.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contractSearch}
                    onChange={(event) => setContractSearch(event.target.value)}
                    placeholder="Saring hasil halaman ini: tenant, pegawai, nomor kontrak..."
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter cepat ini hanya menyaring hasil pada halaman aktif.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Nomor Kontrak</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Berakhir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredExpiringContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Tidak ada kontrak aktif yang segera berakhir pada cakupan ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpiringContracts.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{tenantLabelMap.get(item.tenant_id) ?? item.tenant_id}</TableCell>
                        <TableCell>{item.employee?.name || item.employee_id}</TableCell>
                        <TableCell>{item.contract_number || "-"}</TableCell>
                        <TableCell>{item.contract_type}</TableCell>
                        <TableCell>{item.end_date || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safeContractPage}
                totalPages={contractTotalPages}
                totalItems={contractsExpiringSoonCount}
                pageSize={PAGE_SIZE}
                itemLabel="kontrak"
                onPrevious={() => setContractPage((page) => Math.max(1, page - 1))}
                onNext={() => setContractPage((page) => Math.min(contractTotalPages, page + 1))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rincian Kuota Cuti Kedaluwarsa</CardTitle>
              <CardDescription>Kuota cuti yang masa berlakunya sudah lewat tetapi masih punya sisa.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={quotaSearch}
                    onChange={(event) => setQuotaSearch(event.target.value)}
                    placeholder="Saring hasil halaman ini: tenant, pegawai, NIP, jenis cuti..."
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter cepat ini hanya menyaring hasil pada halaman aktif.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis Cuti</TableHead>
                    <TableHead>Tahun</TableHead>
                    <TableHead>Sisa</TableHead>
                    <TableHead>Valid Sampai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredExpiredLeaveQuotas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Tidak ada kuota cuti kedaluwarsa dengan sisa positif pada cakupan ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpiredLeaveQuotas.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{tenantLabelMap.get(item.tenant_id) ?? item.tenant_id}</TableCell>
                        <TableCell>{item.employee?.name || item.employee_id || "-"}</TableCell>
                        <TableCell>{item.leave_type?.leave_name || item.leave_type_id || "-"}</TableCell>
                        <TableCell>{item.quota_year}</TableCell>
                        <TableCell>{item.remaining_days}</TableCell>
                        <TableCell>{item.valid_until || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safeQuotaPage}
                totalPages={quotaTotalPages}
                totalItems={expiredQuotaCount}
                pageSize={PAGE_SIZE}
                itemLabel="kuota"
                onPrevious={() => setQuotaPage((page) => Math.max(1, page - 1))}
                onNext={() => setQuotaPage((page) => Math.min(quotaTotalPages, page + 1))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Rincian Lowongan Draf ATS</CardTitle>
              <CardDescription>Lowongan draf terbaru yang masih menunggu publikasi.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={draftJobSearch}
                    onChange={(event) => setDraftJobSearch(event.target.value)}
                    placeholder="Saring hasil halaman ini: tenant, judul lowongan, departemen..."
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter cepat ini hanya menyaring hasil pada halaman aktif.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Lowongan</TableHead>
                    <TableHead>Departemen</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredDraftAtsJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Tidak ada lowongan draf pada cakupan ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDraftAtsJobs.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{tenantLabelMap.get(item.tenant_id) ?? item.tenant_id}</TableCell>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>{item.department || "-"}</TableCell>
                        <TableCell>{new Date(item.created_at).toLocaleDateString("id-ID")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safeDraftJobPage}
                totalPages={draftJobTotalPages}
                totalItems={draftAtsJobsCount}
                pageSize={PAGE_SIZE}
                itemLabel="lowongan"
                onPrevious={() => setDraftJobPage((page) => Math.max(1, page - 1))}
                onNext={() => setDraftJobPage((page) => Math.min(draftJobTotalPages, page + 1))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rincian Penawaran ATS Kedaluwarsa</CardTitle>
              <CardDescription>Penawaran kerja yang lewat masa berlaku namun belum selesai.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={expiredOfferSearch}
                    onChange={(event) => setExpiredOfferSearch(event.target.value)}
                    placeholder="Saring hasil halaman ini: tenant, kandidat, posisi, status..."
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter cepat ini hanya menyaring hasil pada halaman aktif.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Kandidat</TableHead>
                    <TableHead>Posisi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredExpiredAtsOffers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Tidak ada penawaran ATS kedaluwarsa pada cakupan ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpiredAtsOffers.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{tenantLabelMap.get(item.tenant_id) ?? item.tenant_id}</TableCell>
                        <TableCell>{item.candidate?.full_name || item.candidate_id}</TableCell>
                        <TableCell>{item.offered_position || "-"}</TableCell>
                        <TableCell>{item.status}</TableCell>
                        <TableCell>{item.expiry_at ? new Date(item.expiry_at).toLocaleDateString("id-ID") : "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safeExpiredOfferPage}
                totalPages={expiredOfferTotalPages}
                totalItems={expiredOfferCount}
                pageSize={PAGE_SIZE}
                itemLabel="penawaran"
                onPrevious={() => setExpiredOfferPage((page) => Math.max(1, page - 1))}
                onNext={() => setExpiredOfferPage((page) => Math.min(expiredOfferTotalPages, page + 1))}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Temuan Audit Hari Libur</CardTitle>
            <CardDescription>
              Menampilkan temuan prioritas dari audit kualitas data hari libur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={findingSearch}
                  onChange={(event) => setFindingSearch(event.target.value)}
                  placeholder="Saring hasil halaman ini: tenant, pesan, tanggal..."
                  className="pl-9"
                />
              </div>
              <Select value={findingTypeFilter} onValueChange={(value: "all" | AuditFinding["type"]) => setFindingTypeFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua tipe</SelectItem>
                  <SelectItem value="global_mismatch">Global tidak selaras</SelectItem>
                  <SelectItem value="tenant_marked_national">Tenant nasional</SelectItem>
                  <SelectItem value="duplicate_holiday">Duplikasi</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={findingSeverityFilter}
                onValueChange={(value: "all" | AuditFinding["severity"]) => setFindingSeverityFilter(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Semua tingkat keparahan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua tingkat keparahan</SelectItem>
                  <SelectItem value="critical">Kritis</SelectItem>
                  <SelectItem value="warning">Peringatan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Filter temuan hari libur dijalankan dari query audit. Jika backend belum tersedia di sesi lama, halaman akan fallback ke penyaringan lokal.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tingkat Keparahan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Rincian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && findings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Tidak ada temuan pada cakupan audit ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  findings.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>
                          {item.severity === "critical" ? "Kritis" : "Peringatan"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.type === "global_mismatch"
                          ? "Global Tidak Selaras"
                          : item.type === "tenant_marked_national"
                            ? "Tenant Nasional"
                            : "Duplikasi"}
                      </TableCell>
                      <TableCell>{item.date ?? "-"}</TableCell>
                      <TableCell>
                        {item.tenantId ? tenantLabelMap.get(item.tenantId) ?? item.tenantId : "Global"}
                      </TableCell>
                      <TableCell>{item.message}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePaginationFooter
              currentPage={safeFindingPage}
              totalPages={findingTotalPages}
              totalItems={findingsTotalCount}
              pageSize={PAGE_SIZE}
              itemLabel="temuan"
              onPrevious={() => setFindingPage((page) => Math.max(1, page - 1))}
              onNext={() => setFindingPage((page) => Math.min(findingTotalPages, page + 1))}
            />
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}
