import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlayCircle, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";
import {
  calculatePayrollAuto,
  type PayrollBpjsRate,
  type PayrollComplianceFlags,
  type PayrollComponent,
  type PayrollEmployeeCompensation,
  type PayrollEmployeeLite,
  type PayrollMinimumWage,
  type PayrollPeriodLite,
  type PayrollTerRate,
  type PayrollVariableInput,
} from "@/lib/payrollAutoCalculator";
import { buildDefaultComplianceRules, resolvePayrollComplianceSettings } from "@/lib/payrollComplianceRules";

type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
type PayrollRunInsert = Database["public"]["Tables"]["payroll_runs"]["Insert"];
type PayrollRunUpdate = Database["public"]["Tables"]["payroll_runs"]["Update"];
type PayrollSlipInsert = Database["public"]["Tables"]["payroll_slips"]["Insert"];
type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
type PayrollPolicy = Database["public"]["Tables"]["payroll_policies"]["Row"];
type EmployeeRow = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "nik" | "email" | "is_active"
>;
type CompensationRow = Database["public"]["Tables"]["payroll_employee_compensations"]["Row"];
type IncomeComponentRow = Database["public"]["Tables"]["payroll_income_components"]["Row"];
type DeductionComponentRow = Database["public"]["Tables"]["payroll_deduction_components"]["Row"];
type VariableInputRow = Database["public"]["Tables"]["payroll_variable_inputs"]["Row"];
type TerRateRow = Database["public"]["Tables"]["payroll_tax_ter_rates"]["Row"];
type BpjsRateRow = Database["public"]["Tables"]["payroll_bpjs_rates"]["Row"];
type MinimumWageRow = Database["public"]["Tables"]["payroll_minimum_wages"]["Row"];

type RunStatus = "draft" | "processing" | "review" | "approved" | "paid" | "archived" | "failed";

type RunFormState = {
  period_id: string;
  run_type: "simulation" | "final";
  status: RunStatus;
  trace_id: string;
  notes: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: Array<{ value: RunStatus; label: string }> = [
  { value: "draft", label: "Draf" },
  { value: "processing", label: "Diproses" },
  { value: "review", label: "Tinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "paid", label: "Dibayar" },
  { value: "archived", label: "Arsip" },
  { value: "failed", label: "Gagal" },
];

const initialFormState: RunFormState = {
  period_id: "",
  run_type: "simulation",
  status: "draft",
  trace_id: "",
  notes: "",
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  draft: "Draf",
  processing: "Diproses",
  review: "Tinjau",
  approved: "Disetujui",
  paid: "Dibayar",
  archived: "Arsip",
  failed: "Gagal",
};

const RUN_TYPE_LABELS: Record<"simulation" | "final", string> = {
  simulation: "Simulasi",
  final: "Final",
};

const toEpoch = (value: string) => new Date(value).getTime();

const isEffectiveRange = (row: { effective_from: string; effective_to: string | null; is_active: boolean }, dateKey: string) => {
  if (!row.is_active) return false;
  const target = toEpoch(dateKey);
  if (toEpoch(row.effective_from) > target) return false;
  if (row.effective_to && toEpoch(row.effective_to) < target) return false;
  return true;
};

const buildAutoTraceId = (periodKey: string) => {
  const safeKey = periodKey.replace(/[^0-9A-Z]/gi, "");
  return `AUTO-${safeKey}-${Date.now().toString().slice(-6)}`;
};

const buildSlipNumber = (periodKey: string, runSequence: number, employee?: EmployeeRow | null) => {
  const safeKey = periodKey.replace(/[^0-9A-Z]/gi, "");
  const rawEmployee = employee?.nik || employee?.id || "UNKNOWN";
  const employeeCode = rawEmployee.replace(/[^0-9A-Z]/gi, "").slice(-6).toUpperCase();
  return `SLIP-${safeKey}-${employeeCode}-R${runSequence}`;
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export default function OrgPayrollRunEngine() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RunFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RunStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const periodMap = useMemo(() => new Map(periods.map((item) => [item.id, item])), [periods]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { data: periodRows, error: periodError } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("period_start", { ascending: false });
      if (periodError) {
        reportError(periodError, "org.payroll.run_engine.fetch_periods", { tenant_id: resolvedTenantId });
        setPeriods([]);
      } else {
        setPeriods(periodRows || []);
      }

      let query = supabase
        .from("payroll_runs")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (periodFilter !== "all") query = query.eq("period_id", periodFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedPeriodIds = ((periodError ? [] : periodRows) || [])
          .filter((item) => `${item.period_key} ${item.status}`.toLowerCase().includes(keyword.toLowerCase()))
          .map((item) => item.id);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["trace_id", "notes"],
          inFilters: [{ field: "period_id", values: matchedPeriodIds }],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setRuns(data || []);
      setTotalRuns(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.fetch");
      const message = appendErrorReference("Gagal memuat data run payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setRuns([]);
      setTotalRuns(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, periodFilter, searchTerm, currentPage]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, periodFilter]);

  const totalPages = Math.max(1, Math.ceil(totalRuns / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_id: periods[0]?.id || "",
    });
    setEditingRunId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollRun) => {
    setEditingRunId(row.id);
    setFormState({
      period_id: row.period_id,
      run_type: row.run_type as "simulation" | "final",
      status: row.status as RunStatus,
      trace_id: row.trace_id || "",
      notes: row.notes || "",
    });
    setIsDialogOpen(true);
  };

  const ensureApprovalStages = useCallback(async (resolvedTenantId: string, runId: string) => {
    const { error } = await supabase.from("payroll_approvals").upsert(
      ["hr", "finance", "executive"].map((stage) => ({
        tenant_id: resolvedTenantId,
        run_id: runId,
        approval_stage: stage,
        status: "pending",
      })),
      { onConflict: "run_id,approval_stage" },
    );
    if (error) throw error;
  }, []);

  const resolvePeriod = useCallback(async (resolvedTenantId: string, periodId: string) => {
    const cached = periodMap.get(periodId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("tenant_id", resolvedTenantId)
      .eq("id", periodId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }, [periodMap]);

  const selectEffectiveCompensations = (rows: CompensationRow[], periodEnd: string) => {
    const sorted = rows
      .filter((row) => isEffectiveRange(row, periodEnd))
      .sort((a, b) => toEpoch(b.effective_from) - toEpoch(a.effective_from));
    const map = new Map<string, CompensationRow>();
    for (const row of sorted) {
      if (!map.has(row.employee_id)) map.set(row.employee_id, row);
    }
    return Array.from(map.values());
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);
      if (!formState.period_id) {
        toast.error("Periode payroll wajib dipilih");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const traceId = (formState.trace_id.trim() || `RUN-${Date.now()}`).slice(0, 120);

      if (editingRunId) {
        const updatePayload: PayrollRunUpdate = {
          period_id: formState.period_id,
          run_type: formState.run_type,
          status: formState.status,
          trace_id: traceId,
          notes: formState.notes.trim() || null,
        };
        const { error } = await supabase
          .from("payroll_runs")
          .update(updatePayload)
          .eq("id", editingRunId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        if (["review", "approved", "paid"].includes(formState.status)) {
          await ensureApprovalStages(resolvedTenantId, editingRunId);
        }
      } else {
        const { data: latestRun, error: latestRunError } = await supabase
          .from("payroll_runs")
          .select("run_sequence")
          .eq("tenant_id", resolvedTenantId)
          .eq("period_id", formState.period_id)
          .order("run_sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRunError) throw latestRunError;

        const payload: PayrollRunInsert = {
          tenant_id: resolvedTenantId,
          period_id: formState.period_id,
          run_sequence: (latestRun?.run_sequence || 0) + 1,
          run_type: formState.run_type,
          status: formState.status,
          trace_id: traceId,
          notes: formState.notes.trim() || null,
          summary: {} as Json,
          created_by: user?.id || null,
          started_at: formState.status === "processing" ? new Date().toISOString() : null,
          finished_at: ["review", "approved", "paid", "archived", "failed"].includes(formState.status)
            ? new Date().toISOString()
            : null,
        };

        const { data, error } = await supabase
          .from("payroll_runs")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id && ["review", "approved", "paid"].includes(formState.status)) {
          await ensureApprovalStages(resolvedTenantId, data.id);
        }
      }

      toast.success(`Run payroll berhasil ${editingRunId ? "diperbarui" : "dibuat"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.save");
      toast.error(appendErrorReference("Gagal menyimpan run payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoRun = async () => {
    let resolvedTenantId: string | null = null;
    let runId: string | null = null;
    try {
      setIsAutoRunning(true);
      resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const selectedPeriodId = formState.period_id || periods[0]?.id;
      if (!selectedPeriodId) {
        toast.error("Periode payroll wajib dipilih");
        return;
      }

      const period = await resolvePeriod(resolvedTenantId, selectedPeriodId);
      if (!period) {
        toast.error("Periode payroll tidak ditemukan");
        return;
      }

      const [
        employeeRes,
        compensationRes,
        incomeComponentRes,
        deductionComponentRes,
        variableInputRes,
        terRateRes,
        bpjsRateRes,
        minimumWageRes,
        policyRes,
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, nik, email, is_active")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("payroll_employee_compensations")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("effective_from", { ascending: false }),
        supabase
          .from("payroll_income_components")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("payroll_deduction_components")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("payroll_variable_inputs")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .eq("period_id", period.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("payroll_tax_ter_rates")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("effective_from", { ascending: false }),
        supabase
          .from("payroll_bpjs_rates")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("effective_from", { ascending: false }),
        supabase
          .from("payroll_minimum_wages")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("effective_from", { ascending: false }),
        supabase
          .from("payroll_policies")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_active", true)
          .order("effective_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (employeeRes.error) throw employeeRes.error;
      if (compensationRes.error) throw compensationRes.error;
      if (incomeComponentRes.error) throw incomeComponentRes.error;
      if (deductionComponentRes.error) throw deductionComponentRes.error;
      if (variableInputRes.error) throw variableInputRes.error;
      if (terRateRes.error) throw terRateRes.error;
      if (bpjsRateRes.error) throw bpjsRateRes.error;
      if (minimumWageRes.error) throw minimumWageRes.error;
      if (policyRes.error) throw policyRes.error;

      const employees = (employeeRes.data || []) as EmployeeRow[];
      if (employees.length === 0) {
        toast.error("Belum ada pegawai aktif untuk dihitung payroll.");
        return;
      }

      const compensations = selectEffectiveCompensations(
        (compensationRes.data || []) as CompensationRow[],
        period.period_end,
      );

      const compensationPayload: PayrollEmployeeCompensation[] = compensations.map((row) => ({
        employee_id: row.employee_id,
        base_salary: row.base_salary || 0,
        ter_category: row.ter_category || "A",
        jkk_risk_level: row.jkk_risk_level,
        region_level: row.region_level,
        region_code: row.region_code,
        region_name: row.region_name,
      }));

      const incomeComponents: PayrollComponent[] = (incomeComponentRes.data || []).map((row: IncomeComponentRow) => ({
        code: row.code,
        name: row.name,
        calculation_mode: row.calculation_mode,
        default_amount: row.default_amount,
        is_taxable: row.is_taxable,
        is_active: row.is_active,
      }));

      const deductionComponents: PayrollComponent[] = (deductionComponentRes.data || []).map((row: DeductionComponentRow) => ({
        code: row.code,
        name: row.name,
        calculation_mode: row.calculation_mode,
        default_amount: row.default_amount,
        is_taxable: row.is_taxable,
        is_active: row.is_active,
      }));

      const variableInputs: PayrollVariableInput[] = (variableInputRes.data || []).map((row: VariableInputRow) => ({
        employee_id: row.employee_id,
        component_scope: row.component_scope === "deduction" ? "deduction" : "income",
        component_code: row.component_code,
        component_name: row.component_name,
        input_type: row.input_type,
        amount: row.amount,
      }));

      const terRates = (terRateRes.data || []) as TerRateRow[];
      const bpjsRates = (bpjsRateRes.data || []) as BpjsRateRow[];
      const minimumWages = (minimumWageRes.data || []) as MinimumWageRow[];

      const compliance = policyRes.data
        ? resolvePayrollComplianceSettings((policyRes.data as PayrollPolicy).metadata)
        : { profile: "swasta_umum", rules: buildDefaultComplianceRules(), notes: "" };

      const complianceFlags: PayrollComplianceFlags = {
        pph21_ter: compliance.rules.pph21_ter,
        bpjs_kesehatan: compliance.rules.bpjs_kesehatan,
        bpjs_ketenagakerjaan: compliance.rules.bpjs_ketenagakerjaan,
        upah_minimum: compliance.rules.upah_minimum,
      };

      const calculation = calculatePayrollAuto({
        period: {
          id: period.id,
          period_key: period.period_key,
          period_start: period.period_start,
          period_end: period.period_end,
        } satisfies PayrollPeriodLite,
        employees: employees.map((row) => ({
          id: row.id,
          name: row.name,
          nik: row.nik,
          email: row.email,
        })) satisfies PayrollEmployeeLite[],
        compensations: compensationPayload,
        incomeComponents,
        deductionComponents,
        variableInputs,
        terRates: terRates as PayrollTerRate[],
        bpjsRates: bpjsRates as PayrollBpjsRate[],
        minimumWages: minimumWages as PayrollMinimumWage[],
        complianceFlags,
      });

      if (calculation.results.length === 0) {
        toast.error("Tidak ada slip payroll yang berhasil dihitung.");
        return;
      }

      const { data: latestRun, error: latestRunError } = await supabase
        .from("payroll_runs")
        .select("run_sequence")
        .eq("tenant_id", resolvedTenantId)
        .eq("period_id", period.id)
        .order("run_sequence", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRunError) throw latestRunError;
      const runSequence = (latestRun?.run_sequence || 0) + 1;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const traceId = (formState.trace_id.trim() || buildAutoTraceId(period.period_key)).slice(0, 120);

      const runPayload: PayrollRunInsert = {
        tenant_id: resolvedTenantId,
        period_id: period.id,
        run_sequence: runSequence,
        run_type: formState.run_type,
        status: "processing",
        trace_id: traceId,
        notes: formState.notes.trim() || null,
        summary: {} as Json,
        created_by: user?.id || null,
        started_at: new Date().toISOString(),
      };

      const { data: runData, error: runError } = await supabase
        .from("payroll_runs")
        .insert(runPayload)
        .select("id")
        .single();
      if (runError) throw runError;
      runId = runData?.id ?? null;
      if (!runId) throw new Error("Run payroll tidak berhasil dibuat.");

      const employeeMap = new Map(employees.map((item) => [item.id, item]));
      const slipPayloads: PayrollSlipInsert[] = calculation.results.map((result) => {
        const employee = employeeMap.get(result.employee_id);
        const slipNumber = buildSlipNumber(period.period_key, runSequence, employee || null);
        const employeeCode = (employee?.nik || employee?.id || result.employee_id).replace(/[^0-9A-Z]/gi, "").slice(-4).toUpperCase();
        return {
          tenant_id: resolvedTenantId,
          run_id: runId,
          employee_id: result.employee_id,
          slip_number: slipNumber,
          status: "generated",
          distribution_channel: "portal",
          trace_id: `SLP-${traceId}-${employeeCode}`,
          notes: null,
          metadata: {
            ...result.metadata,
            run: {
              id: runId,
              sequence: runSequence,
              type: formState.run_type,
              trace_id: traceId,
            },
            compliance: {
              profile: compliance.profile,
              rules: compliance.rules,
              notes: compliance.notes || "",
            },
          } as Json,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        };
      });

      for (const chunk of chunkArray(slipPayloads, 200)) {
        const { error } = await supabase.from("payroll_slips").insert(chunk);
        if (error) throw error;
      }

      const issueNames = {
        missing_compensations: calculation.summary.issues.missing_compensations.map(
          (id) => employeeMap.get(id)?.name || id,
        ),
        missing_ter_rate: calculation.summary.issues.missing_ter_rate.map(
          (id) => employeeMap.get(id)?.name || id,
        ),
        below_minimum_wage: calculation.summary.issues.below_minimum_wage.map(
          (id) => employeeMap.get(id)?.name || id,
        ),
        formula_components: calculation.summary.issues.formula_components,
      };

      const summaryPayload: Json = {
        ...calculation.summary,
        issues_detail: issueNames,
        generated_at: new Date().toISOString(),
        period_key: period.period_key,
        run_sequence: runSequence,
        run_type: formState.run_type,
        slip_count: calculation.results.length,
        compliance: {
          profile: compliance.profile,
          rules: compliance.rules,
        },
      };

      const { error: updateError } = await supabase
        .from("payroll_runs")
        .update({
          status: "review",
          finished_at: new Date().toISOString(),
          summary: summaryPayload,
        })
        .eq("id", runId)
        .eq("tenant_id", resolvedTenantId);
      if (updateError) throw updateError;

      await ensureApprovalStages(resolvedTenantId, runId);

      toast.success(`Payroll otomatis selesai. ${calculation.results.length} slip berhasil dibuat.`);
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.auto_run", { run_id: runId, tenant_id: resolvedTenantId ?? undefined });
      if (runId && resolvedTenantId) {
        await supabase
          .from("payroll_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            summary: { error_ref: ref, message: "Payroll otomatis gagal diproses." } as Json,
          })
          .eq("id", runId)
          .eq("tenant_id", resolvedTenantId);
      }
      toast.error(appendErrorReference("Gagal menjalankan payroll otomatis", ref));
    } finally {
      setIsAutoRunning(false);
    }
  };

  const quickSetStatus = async (row: PayrollRun, nextStatus: RunStatus) => {
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const patch: PayrollRunUpdate = {
        status: nextStatus,
      };

      if (nextStatus === "processing") {
        patch.started_at = new Date().toISOString();
      }
      if (["review", "approved", "paid", "archived", "failed"].includes(nextStatus)) {
        patch.finished_at = new Date().toISOString();
      }
      if (nextStatus === "approved") {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = user?.id || null;
      }
      if (nextStatus === "paid") {
        patch.paid_at = new Date().toISOString();
        patch.paid_by = user?.id || null;
      }

      const { error } = await supabase
        .from("payroll_runs")
        .update(patch)
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      if (["review", "approved", "paid"].includes(nextStatus)) {
        await ensureApprovalStages(resolvedTenantId, row.id);
      }

      toast.success(`Status run diperbarui ke ${RUN_STATUS_LABELS[nextStatus]}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.run_engine.quick_status");
      toast.error(appendErrorReference("Gagal memperbarui status run", ref));
    }
  };

  const summary = useMemo(() => {
    return {
      draft: runs.filter((item) => item.status === "draft").length,
      processing: runs.filter((item) => item.status === "processing").length,
      review: runs.filter((item) => item.status === "review").length,
      approved: runs.filter((item) => item.status === "approved").length,
      failed: runs.filter((item) => item.status === "failed").length,
    };
  }, [runs]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Proses Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Jalankan simulasi atau proses final payroll per periode dengan status yang rapi dan mudah ditelusuri.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard title="Draf" value={summary.draft} />
          <StatCard title="Diproses" value={summary.processing} />
          <StatCard title="Tinjau" value={summary.review} />
          <StatCard title="Disetujui" value={summary.approved} />
          <StatCard title="Gagal" value={summary.failed} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Eksekusi payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Jalankan payroll hanya setelah validasi cukup aman dan periode yang dipilih sudah jelas.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Yang perlu dijaga</CardDescription>
              <CardTitle className="text-lg">Status dan trace</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pastikan setiap run memiliki status yang tepat dan ID trace yang bisa dipakai untuk triase. Jika butuh log error payroll lintas tenant, eskalasi ke super admin.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-lg">Persetujuan Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => navigateWithOverlay("/org/payroll/approval")}>
                Buka Persetujuan Payroll
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Referensi HR & Absensi</CardDescription>
              <CardTitle className="text-lg">Cek sumber data</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateWithOverlay("/org/hr/employees")}>
                Data Pegawai HR
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateWithOverlay("/org/reports/attendance")}>
                Laporan Absensi
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Proses Payroll</CardTitle>
            <CardDescription>Filter periode dan status untuk meninjau run payroll.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  className="pl-9"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari ID trace, period key, atau catatan..."
                />
              </div>
            </div>
            <div>
              <Label>Periode</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Periode</SelectItem>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>{period.period_key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Payroll Run</CardTitle>
            <CardDescription>Buat run baru atau ubah status run sesuai alur payroll sederhana.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigateWithOverlay("/org/payroll/validation")}>
                <ArrowLeft className="mr-2 h-4 w-4" />Validasi
              </Button>
              <Button onClick={openCreateDialog}>
                <PlayCircle className="mr-2 h-4 w-4" />Buat Proses
              </Button>
              <Button variant="secondary" onClick={openCreateDialog} disabled={isAutoRunning}>
                <PlayCircle className="mr-2 h-4 w-4" />Hitung Otomatis
              </Button>
            </div>

            {loadError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Run</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Memuat payroll run...</TableCell></TableRow>
                ) : runs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada payroll run.</TableCell></TableRow>
                ) : (
                  runs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{periodMap.get(row.period_id)?.period_key || "-"}</TableCell>
                      <TableCell>Run #{row.run_sequence}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{RUN_TYPE_LABELS[row.run_type as "simulation" | "final"]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
                          {RUN_STATUS_LABELS[row.status as RunStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.trace_id || "-"}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <p>Mulai: {formatDateTime(row.started_at)}</p>
                          <p>Selesai: {formatDateTime(row.finished_at)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          {row.status === "draft" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "processing")}>Proses</Button>
                          ) : null}
                          {row.status === "processing" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "review")}>Tinjau</Button>
                          ) : null}
                          {row.status === "review" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "approved")}>
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" />Setujui
                            </Button>
                          ) : null}
                          {row.status === "approved" ? (
                            <Button variant="secondary" size="sm" onClick={() => quickSetStatus(row, "paid")}>Tandai Dibayar</Button>
                          ) : null}
                          {["draft", "processing", "review", "approved"].includes(row.status) ? (
                            <Button variant="destructive" size="sm" onClick={() => quickSetStatus(row, "failed")}>
                              <XCircle className="mr-1 h-3.5 w-3.5" />Tandai Gagal
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRuns} run</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</Button>
                <span>{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Berikutnya</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRunId ? "Edit Proses Payroll" : "Buat Proses Payroll"}</DialogTitle>
              <DialogDescription>Pilih periode, tipe proses, dan status awal payroll.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Periode</Label>
                <Select value={formState.period_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, period_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih periode" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>{period.period_key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Tipe Proses</Label>
                  <Select value={formState.run_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, run_type: value as "simulation" | "final" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simulation">Simulasi</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as RunStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="trace_id">ID Trace</Label>
                <Input id="trace_id" value={formState.trace_id} onChange={(event) => setFormState((prev) => ({ ...prev, trace_id: event.target.value }))} placeholder="Opsional, dibuat otomatis jika kosong" />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea id="notes" rows={3} value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
            </div>

            {!editingRunId ? (
              <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                Hitung otomatis akan membuat slip gaji, menyalin aturan kepatuhan aktif, dan mengubah status run ke Tinjau.
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              {!editingRunId ? (
                <Button variant="secondary" onClick={handleAutoRun} disabled={isAutoRunning || isSubmitting}>
                  {isAutoRunning ? "Menghitung..." : "Hitung Otomatis"}
                </Button>
              ) : null}
              <Button onClick={handleSave} disabled={isSubmitting || isAutoRunning}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OrgPayrollPageGuide pathname="/org/payroll/run-engine" />
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
