import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import {
  DEFAULT_HR_REVIEW360_SETTINGS,
  fetchTenantHrPerformanceForms,
  fetchTenantHrPerformanceKpis,
  fetchTenantHrPerformancePeriods,
  fetchTenantHrReview360Settings,
  saveTenantHrPerformanceForms,
  saveTenantHrPerformanceKpis,
  saveTenantHrPerformancePeriods,
  saveTenantHrReview360Settings,
  type HrKpiItem,
  type HrPerformanceForm,
  type HrPerformancePeriod,
  type HrReview360Settings,
} from "@/lib/hrPerformanceSettings";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CalendarRange, CheckCircle2, Clock3, FileSpreadsheet, FileText, Gauge, ListChecks, Pencil, Scale, Users } from "lucide-react";
import { toast } from "sonner";

type EvaluationWorkspaceData = {
  employees: number;
  employeeRows: Array<{
    id: string;
    employee_category: string | null;
    golongan: string | null;
    created_at: string | null;
  }>;
  kpis: HrKpiItem[];
  periods: HrPerformancePeriod[];
  forms: HrPerformanceForm[];
  latestRun: EvaluationRunSummary | null;
  runHistory: EvaluationRunSummary[];
  latestResults: EvaluationResultRow[];
  review360: HrReview360Settings;
};

type EvaluationRunSummary = {
  run_id: string;
  tenant_id: string;
  period_config_id: string;
  period_name: string;
  period_cycle: string | null;
  run_status: "draft" | "in_review" | "published" | "archived";
  cohort_size: number;
  result_total: number;
  ready_total: number;
  published_total: number;
  average_final_score: number | null;
  top_score: number | null;
  lowest_score: number | null;
  published_at: string | null;
  updated_at: string;
};

type EvaluationResultStatus = "draft" | "ready" | "published" | "excluded";

type EvaluationResultRow = {
  id: string;
  run_id: string;
  employee_id: string;
  employee_snapshot: {
    name?: string | null;
    email?: string | null;
    nip?: string | null;
  } | null;
  final_score: number | null;
  score_band: string | null;
  result_status: EvaluationResultStatus;
  recommendation: string | null;
  updated_at: string;
};

type EditableEvaluationResult = {
  finalScore: string;
  resultStatus: EvaluationResultStatus;
  recommendation: string;
};

export default function OrgHREvaluationResults() {
  const [data, setData] = useState<EvaluationWorkspaceData>({
    employees: 0,
    employeeRows: [],
    kpis: [],
    periods: [],
    forms: [],
    latestRun: null,
    runHistory: [],
    latestResults: [],
    review360: {
      enabled: false,
      anonymousFeedback: true,
      selfReviewRequired: true,
      minPeerReviewers: 2,
      managerWeight: 50,
      peerWeight: 25,
      subordinateWeight: 15,
      selfWeight: 10,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingRun, setIsGeneratingRun] = useState(false);
  const [isSeedingBaseline, setIsSeedingBaseline] = useState(false);
  const [isScoringRun, setIsScoringRun] = useState(false);
  const [isPublishingRun, setIsPublishingRun] = useState(false);
  const [isArchivingRun, setIsArchivingRun] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedResults, setSelectedResults] = useState<EvaluationResultRow[]>([]);
  const [isLoadingSelectedResults, setIsLoadingSelectedResults] = useState(false);
  const [resultSearch, setResultSearch] = useState("");
  const [resultStatusFilter, setResultStatusFilter] = useState<"all" | EvaluationResultStatus>("all");
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<EvaluationResultRow | null>(null);
  const [editingValues, setEditingValues] = useState<EditableEvaluationResult>({
    finalScore: "",
    resultStatus: "draft",
    recommendation: "",
  });
  const [isSavingResult, setIsSavingResult] = useState(false);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/evaluation-results");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [employeesRes, employeeRowsRes, kpis, periods, forms, review360] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
        supabase
          .from("employees")
          .select("id, employee_category, golongan, created_at")
          .eq("tenant_id", tenantId)
          .eq("is_active", true),
        fetchTenantHrPerformanceKpis(tenantId),
        fetchTenantHrPerformancePeriods(tenantId),
        fetchTenantHrPerformanceForms(tenantId),
        fetchTenantHrReview360Settings(tenantId),
      ]);
      const latestRunRes = await supabase.rpc("get_hr_evaluation_results_summary" as never, { p_tenant_id: tenantId } as never);
      const runHistoryRes = await supabase
        .from("hr_evaluation_runs")
        .select("id, tenant_id, period_config_id, period_name, period_cycle, status, cohort_size, summary, published_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(12);

      if (employeesRes.error) throw employeesRes.error;
      if (employeeRowsRes.error) throw employeeRowsRes.error;

      const latestRunRows = latestRunRes.error
        ? []
        : ((latestRunRes.data as unknown as EvaluationRunSummary[] | null) ?? []);

      if (latestRunRes.error) {
        reportError(latestRunRes.error, "org.hr.evaluation_results.summary_rpc");
      }

      if (runHistoryRes.error) {
        reportError(runHistoryRes.error, "org.hr.evaluation_results.run_history");
      }

      const latestRun = latestRunRows[0] ?? null;
      const runHistory = ((runHistoryRes.data as Array<{
        id: string;
        tenant_id: string;
        period_config_id: string;
        period_name: string;
        period_cycle: string | null;
        status: EvaluationRunSummary["run_status"];
        cohort_size: number;
        summary: Record<string, unknown> | null;
        published_at: string | null;
        updated_at: string;
      }> | null) ?? []).map((row) => ({
        run_id: row.id,
        tenant_id: row.tenant_id,
        period_config_id: row.period_config_id,
        period_name: row.period_name,
        period_cycle: row.period_cycle,
        run_status: row.status,
        cohort_size: row.cohort_size,
        result_total: readSummaryNumber(row.summary, "result_total"),
        ready_total: readSummaryNumber(row.summary, "ready_total"),
        published_total: readSummaryNumber(row.summary, "published_total"),
        average_final_score: readSummaryNullableNumber(row.summary, "average_final_score"),
        top_score: readSummaryNullableNumber(row.summary, "top_score"),
        lowest_score: readSummaryNullableNumber(row.summary, "lowest_score"),
        published_at: row.published_at,
        updated_at: row.updated_at,
      }));
      let latestResults: EvaluationResultRow[] = [];

      if (latestRun?.run_id) {
        const latestResultsRes = await supabase
          .from("hr_evaluation_employee_results")
          .select("id, run_id, employee_id, employee_snapshot, final_score, score_band, result_status, recommendation, updated_at")
          .eq("tenant_id", tenantId)
          .eq("run_id", latestRun.run_id)
          .order("final_score", { ascending: false })
          .order("updated_at", { ascending: false });

        if (latestResultsRes.error) {
          reportError(latestResultsRes.error, "org.hr.evaluation_results.latest_results");
        } else {
          latestResults = ((latestResultsRes.data as EvaluationResultRow[] | null) ?? []).map((row) => ({
            ...row,
            employee_snapshot:
              typeof row.employee_snapshot === "object" && row.employee_snapshot !== null
                ? row.employee_snapshot
                : null,
          }));
        }
      }

      setData({
        employees: employeesRes.count || 0,
        employeeRows: employeeRowsRes.data || [],
        kpis,
        periods,
        forms,
        latestRun,
        runHistory,
        latestResults,
        review360,
      });
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.fetch");
      toast.error(appendErrorReference("Gagal memuat hasil evaluasi", ref));
      setData({
        employees: 0,
        employeeRows: [],
        kpis: [],
        periods: [],
        forms: [],
        latestRun: null,
        runHistory: [],
        latestResults: [],
        review360: {
          enabled: false,
          anonymousFeedback: true,
          selfReviewRequired: true,
          minPeerReviewers: 2,
          managerWeight: 50,
          peerWeight: 25,
          subordinateWeight: 15,
          selfWeight: 10,
        },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const availableRunIds = new Set<string>();
    if (data.latestRun?.run_id) availableRunIds.add(data.latestRun.run_id);
    data.runHistory.forEach((run) => availableRunIds.add(run.run_id));

    if (availableRunIds.size === 0) {
      setSelectedRunId(null);
      return;
    }

    setSelectedRunId((current) => {
      if (current && availableRunIds.has(current)) return current;
      return data.latestRun?.run_id ?? data.runHistory[0]?.run_id ?? null;
    });
  }, [data.latestRun, data.runHistory]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return data.latestRun;
    const runFromHistory = data.runHistory.find((run) => run.run_id === selectedRunId);
    if (runFromHistory) return runFromHistory;
    if (data.latestRun?.run_id === selectedRunId) return data.latestRun;
    return data.latestRun;
  }, [data.latestRun, data.runHistory, selectedRunId]);

  useEffect(() => {
    if (!selectedRun?.run_id) {
      setSelectedResults([]);
      setIsLoadingSelectedResults(false);
      return;
    }

    if (data.latestRun?.run_id === selectedRun.run_id) {
      setSelectedResults(data.latestResults);
      setIsLoadingSelectedResults(false);
      return;
    }

    let cancelled = false;

    const loadSelectedResults = async () => {
      setIsLoadingSelectedResults(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        const { data: results, error } = await supabase
          .from("hr_evaluation_employee_results")
          .select("id, run_id, employee_id, employee_snapshot, final_score, score_band, result_status, recommendation, updated_at")
          .eq("tenant_id", tenantId)
          .eq("run_id", selectedRun.run_id)
          .order("final_score", { ascending: false })
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        setSelectedResults(
          ((results as EvaluationResultRow[] | null) ?? []).map((row) => ({
            ...row,
            employee_snapshot:
              typeof row.employee_snapshot === "object" && row.employee_snapshot !== null
                ? row.employee_snapshot
                : null,
          })),
        );
      } catch (error) {
        if (!cancelled) {
          const ref = reportError(error, "org.hr.evaluation_results.selected_results");
          toast.error(appendErrorReference("Gagal memuat hasil pegawai untuk run terpilih", ref));
          setSelectedResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelectedResults(false);
        }
      }
    };

    void loadSelectedResults();

    return () => {
      cancelled = true;
    };
  }, [data.latestResults, data.latestRun, selectedRun]);

  const evaluationState = useMemo(() => {
    const activeKpis = data.kpis.filter((item) => item.isActive);
    const activePeriods = data.periods.filter((item) => item.status === "active");
    const closedPeriods = data.periods.filter((item) => item.status === "closed");
    const draftPeriods = data.periods.filter((item) => item.status === "draft");
    const activeForms = data.forms.filter((item) => item.isActive);
    const reviewWeightTotal =
      data.review360.managerWeight +
      data.review360.peerWeight +
      data.review360.subordinateWeight +
      data.review360.selfWeight;
    const kpiWeightTotal = activeKpis.reduce((sum, item) => sum + item.weight, 0);
    const questionCoverage = activeForms.reduce((sum, item) => sum + item.questionCount, 0);
    const commentRequiredForms = activeForms.filter((item) => item.requireComment).length;
    const dimensionWeightMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    const golonganMap = new Map<string, number>();
    const recentlyAddedEmployees = data.employeeRows.filter((item) => {
      if (!item.created_at) return false;
      const createdAt = new Date(item.created_at);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 90);
      return createdAt >= threshold;
    }).length;

    activeKpis.forEach((item) => {
      dimensionWeightMap.set(item.dimension, (dimensionWeightMap.get(item.dimension) || 0) + item.weight);
    });

    data.employeeRows.forEach((item) => {
      const category = (item.employee_category || "Belum Diisi").trim();
      const golongan = (item.golongan || "Belum Diisi").trim();
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      golonganMap.set(golongan, (golonganMap.get(golongan) || 0) + 1);
    });

    const topDimensions = Array.from(dimensionWeightMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([dimension, weight]) => ({ dimension, weight }));
    const topCategories = Array.from(categoryMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));
    const topGolongan = Array.from(golonganMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));

    const checks = [
      activeKpis.length > 0,
      activePeriods.length > 0,
      activeForms.length > 0,
      !data.review360.enabled || reviewWeightTotal === 100,
      kpiWeightTotal >= 90 && kpiWeightTotal <= 110,
    ];
    const readiness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    const currentPeriod = activePeriods[0] || draftPeriods[0] || closedPeriods[0] || null;

    const releaseStatus = activePeriods.length === 0
      ? "blocked"
      : activeKpis.length === 0 || activeForms.length === 0
        ? "partial"
        : !data.review360.enabled || reviewWeightTotal === 100
          ? "ready"
          : "partial";

    return {
      activeKpis,
      activePeriods,
      closedPeriods,
      draftPeriods,
      activeForms,
      reviewWeightTotal,
      kpiWeightTotal,
      questionCoverage,
      commentRequiredForms,
      topDimensions,
      topCategories,
      topGolongan,
      recentlyAddedEmployees,
      readiness,
      currentPeriod,
      releaseStatus,
    };
  }, [data]);

  const recommendations = useMemo(() => {
    const items: string[] = [];
    if (evaluationState.activeKpis.length === 0) items.push("Tambahkan minimal satu KPI aktif agar evaluasi punya baseline sasaran.");
    if (evaluationState.activePeriods.length === 0) items.push("Aktifkan satu periode penilaian agar siklus evaluasi bisa dijalankan.");
    if (evaluationState.activeForms.length === 0) items.push("Simpan minimal satu form penilaian aktif untuk evaluator.");
    if (evaluationState.kpiWeightTotal < 90 || evaluationState.kpiWeightTotal > 110) {
      items.push(`Bobot KPI aktif saat ini ${evaluationState.kpiWeightTotal}%. Rapikan mendekati 100% agar scoring akhir tidak timpang.`);
    }
    if (data.review360.enabled && evaluationState.reviewWeightTotal !== 100) {
      items.push("Sesuaikan bobot ulasan 360 hingga totalnya 100% agar scoring akhir konsisten.");
    }
    if (data.review360.enabled && data.review360.minPeerReviewers < 2) {
      items.push("Naikkan minimal reviewer peer menjadi setidaknya 2 agar hasil ulasan 360 tidak terlalu sempit.");
    }
    if (evaluationState.recentlyAddedEmployees > 0) {
      items.push(`${evaluationState.recentlyAddedEmployees} pegawai aktif bergabung dalam 90 hari terakhir. Tentukan apakah cohort baru ini langsung masuk evaluasi periode berjalan.`);
    }
    if (data.employees === 0) {
      items.push("Belum ada pegawai aktif yang bisa masuk batch evaluasi. Pastikan data pegawai tenant sudah siap lebih dulu.");
    }
    if (items.length === 0) {
      items.push("Konfigurasi evaluasi tenant sudah seimbang. Hasil evaluasi bisa dipublikasikan dengan pengawasan periodik.");
    }
    return items;
  }, [data, evaluationState]);

  const releaseBadge = useMemo(() => {
    if (evaluationState.releaseStatus === "ready") return { label: "Siap Rilis", variant: "default" as const };
    if (evaluationState.releaseStatus === "partial") return { label: "Perlu Rapikan", variant: "secondary" as const };
    return { label: "Tertahan", variant: "destructive" as const };
  }, [evaluationState.releaseStatus]);

  const filteredSelectedResults = useMemo(() => {
    const normalizedSearch = resultSearch.trim().toLowerCase();
    return selectedResults.filter((item) => {
      if (resultStatusFilter !== "all" && item.result_status !== resultStatusFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        item.employee_snapshot?.name,
        item.employee_snapshot?.email,
        item.employee_snapshot?.nip,
        item.score_band,
        item.recommendation,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [resultSearch, resultStatusFilter, selectedResults]);

  const handleGenerateRun = useCallback(async () => {
    if (!evaluationState.currentPeriod) {
      toast.error("Belum ada periode evaluasi yang bisa dipakai.");
      return;
    }
    if (evaluationState.activeKpis.length === 0) {
      toast.error("Minimal satu KPI aktif wajib tersedia sebelum membuat run evaluasi.");
      return;
    }
    if (evaluationState.activeForms.length === 0) {
      toast.error("Minimal satu form penilaian aktif wajib tersedia sebelum membuat run evaluasi.");
      return;
    }

    setIsGeneratingRun(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data: result, error } = await supabase.rpc(
        "create_hr_evaluation_run" as never,
        {
          p_tenant_id: tenantId,
          p_period_config_id: evaluationState.currentPeriod.id,
          p_period_name: evaluationState.currentPeriod.name,
          p_period_cycle: evaluationState.currentPeriod.cycle,
          p_kpi_snapshot: evaluationState.activeKpis,
          p_form_snapshot: evaluationState.activeForms,
          p_review360_snapshot: data.review360,
          p_notes: data.latestRun
            ? `Muat ulang run evaluasi dari halaman hasil evaluasi pada ${new Date().toISOString()}.`
            : `Run evaluasi awal dibuat dari halaman hasil evaluasi pada ${new Date().toISOString()}.`,
        } as never,
      );

      if (error) throw error;

      const run = Array.isArray(result) ? result[0] : result;
      toast.success(
        `${run?.action === "REFRESH_HR_EVALUATION_RUN" ? "Run evaluasi diperbarui" : "Run evaluasi dibuat"} untuk ${run?.cohort_size ?? data.employees} pegawai.`,
      );
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.generate_run");
      toast.error(appendErrorReference("Gagal membuat run evaluasi", ref));
    } finally {
      setIsGeneratingRun(false);
    }
  }, [data.employees, data.latestRun, data.review360, evaluationState.activeForms, evaluationState.activeKpis, evaluationState.currentPeriod, loadData]);

  const handleSeedBaseline = useCallback(async () => {
    setIsSeedingBaseline(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const quarterEnd = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0);
      const toYmd = (value: Date) => value.toISOString().slice(0, 10);

      const starterKpis: HrKpiItem[] = [
        {
          id: crypto.randomUUID(),
          name: "Disiplin Kehadiran",
          dimension: "Operasional",
          weight: 100,
          targetValue: "Minimal 95% hadir tepat waktu",
          ownerRole: "Admin Instansi",
          isActive: true,
          notes: "Baseline cepat otomatis dari halaman hasil evaluasi.",
        },
      ];

      const starterPeriods: HrPerformancePeriod[] = [
        {
          id: crypto.randomUUID(),
          name: `Evaluasi Triwulan ${currentQuarter + 1} ${now.getFullYear()}`,
          cycle: "quarterly",
          startDate: toYmd(quarterStart),
          endDate: toYmd(quarterEnd),
          status: "active",
        },
      ];

      const starterForms: HrPerformanceForm[] = [
        {
          id: crypto.randomUUID(),
          name: "Form Penilaian Inti",
          targetLevel: "Semua Level",
          questionCount: 6,
          scoringScale: "1-5",
          requireComment: true,
          isActive: true,
        },
      ];

      await Promise.all([
        saveTenantHrPerformanceKpis(tenantId, starterKpis),
        saveTenantHrPerformancePeriods(tenantId, starterPeriods),
        saveTenantHrPerformanceForms(tenantId, starterForms),
        saveTenantHrReview360Settings(tenantId, {
          ...DEFAULT_HR_REVIEW360_SETTINGS,
          enabled: false,
        }),
      ]);

      toast.success("Baseline kinerja cepat berhasil diaktifkan.");
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.seed_baseline");
      toast.error(appendErrorReference("Gagal mengaktifkan baseline cepat", ref));
    } finally {
      setIsSeedingBaseline(false);
    }
  }, [loadData]);

  const handleScoreRun = useCallback(async () => {
    if (!selectedRun?.run_id) {
      toast.error("Belum ada run evaluasi yang bisa dihitung.");
      return;
    }
    if (selectedRun.run_status === "archived" || selectedRun.run_status === "published") {
      toast.error("Run yang diarsipkan atau dipublikasikan tidak bisa dihitung ulang dari halaman ini.");
      return;
    }

    setIsScoringRun(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data: result, error } = await supabase.rpc(
        "score_hr_evaluation_run" as never,
        {
          p_run_id: selectedRun.run_id,
          p_tenant_id: tenantId,
          p_notes: `Skor awal dihitung dari halaman hasil evaluasi pada ${new Date().toISOString()}.`,
        } as never,
      );

      if (error) throw error;

      const scoredRun = Array.isArray(result) ? result[0] : result;
      toast.success(
        `Skor awal dihitung untuk ${scoredRun?.ready_total ?? selectedRun.cohort_size} pegawai.`,
      );
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.score_run");
      toast.error(appendErrorReference("Gagal menghitung skor awal evaluasi", ref));
    } finally {
      setIsScoringRun(false);
    }
  }, [loadData, selectedRun]);

  const handlePublishRun = useCallback(async () => {
    if (!selectedRun?.run_id) {
      toast.error("Belum ada run evaluasi yang bisa dipublikasikan.");
      return;
    }
    if (selectedRun.run_status === "archived") {
      toast.error("Run yang sudah diarsipkan tidak bisa dipublikasikan ulang dari halaman ini.");
      return;
    }

    setIsPublishingRun(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data: result, error } = await supabase.rpc(
        "publish_hr_evaluation_run" as never,
        {
          p_run_id: selectedRun.run_id,
          p_tenant_id: tenantId,
          p_notes: `Run dipublikasikan dari halaman hasil evaluasi pada ${new Date().toISOString()}.`,
        } as never,
      );

      if (error) throw error;

      const publishedRun = Array.isArray(result) ? result[0] : result;
      toast.success(`Run evaluasi dipublikasikan dengan ${publishedRun?.published_total ?? selectedRun.ready_total} hasil publish.`);
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.publish_run");
      toast.error(appendErrorReference("Gagal mempublikasikan run evaluasi", ref));
    } finally {
      setIsPublishingRun(false);
    }
  }, [loadData, selectedRun]);

  const handleArchiveRun = useCallback(async () => {
    if (!selectedRun?.run_id) {
      toast.error("Belum ada run evaluasi yang bisa diarsipkan.");
      return;
    }

    setIsArchivingRun(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data: result, error } = await supabase.rpc(
        "archive_hr_evaluation_run" as never,
        {
          p_run_id: selectedRun.run_id,
          p_tenant_id: tenantId,
          p_notes: `Run diarsipkan dari halaman hasil evaluasi pada ${new Date().toISOString()}.`,
        } as never,
      );

      if (error) throw error;

      const archivedRun = Array.isArray(result) ? result[0] : result;
      toast.success(`Run evaluasi diarsipkan dengan ${archivedRun?.published_total ?? selectedRun.published_total} hasil publish tersimpan.`);
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.archive_run");
      toast.error(appendErrorReference("Gagal mengarsipkan run evaluasi", ref));
    } finally {
      setIsArchivingRun(false);
    }
  }, [loadData, selectedRun]);

  const handleOpenEditResult = useCallback((row: EvaluationResultRow) => {
    setEditingResult(row);
    setEditingValues({
      finalScore: row.final_score !== null ? String(row.final_score) : "",
      resultStatus: row.result_status,
      recommendation: row.recommendation || "",
    });
  }, []);

  const handleSaveResultOverride = useCallback(async () => {
    if (!editingResult) return;

    const normalizedScore = editingValues.finalScore.trim();
    const parsedScore = normalizedScore === "" ? null : Number(normalizedScore);

    if (normalizedScore !== "" && (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100)) {
      toast.error("Skor akhir harus angka antara 0 sampai 100.");
      return;
    }

    setIsSavingResult(true);
    try {
      const updatePayload = {
        final_score: parsedScore,
        result_status: editingValues.resultStatus,
        score_band: deriveScoreBand(parsedScore),
        recommendation: editingValues.recommendation.trim() || null,
      };

      const { error } = await supabase
        .from("hr_evaluation_employee_results")
        .update(updatePayload)
        .eq("id", editingResult.id);

      if (error) throw error;

      toast.success(`Hasil ${editingResult.employee_snapshot?.name || "pegawai"} diperbarui.`);
      setEditingResult(null);
      await loadData();
    } catch (error) {
      const ref = reportError(error, "org.hr.evaluation_results.save_result_override");
      toast.error(appendErrorReference("Gagal menyimpan override hasil pegawai", ref));
    } finally {
      setIsSavingResult(false);
    }
  }, [editingResult, editingValues, loadData]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kinerja</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Hasil Evaluasi</h1>
          <p className="text-sm text-muted-foreground">
            Kendali hasil evaluasi tenant berdasarkan KPI aktif, periode berjalan, form penilaian, dan model ulasan 360 yang sedang berlaku.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard title="Skor Kesiapan" value={`${evaluationState.readiness}%`} icon={CheckCircle2} />
          <SummaryCard title="Pegawai Aktif" value={`${data.employees}`} icon={Users} />
          <SummaryCard title="KPI Aktif" value={`${evaluationState.activeKpis.length}`} icon={Gauge} />
          <SummaryCard title="Periode Aktif" value={`${evaluationState.activePeriods.length}`} icon={Clock3} />
          <SummaryCard title="Form Aktif" value={`${evaluationState.activeForms.length}`} icon={FileText} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Status Eksekusi Evaluasi</CardTitle>
                  <CardDescription>Ringkasan cepat apakah hasil evaluasi tenant sudah bisa dipakai sebagai output operasional.</CardDescription>
                </div>
                <Badge variant={releaseBadge.variant}>{releaseBadge.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <InfoRow
                label="Periode Acuan"
                value={selectedRun ? `${selectedRun.period_name} • ${formatRunStatus(selectedRun.run_status)}` : evaluationState.currentPeriod ? `${evaluationState.currentPeriod.name} • ${formatPeriodStatus(evaluationState.currentPeriod.status)}` : "Belum ada periode"}
              />
              <InfoRow
                label="Model Scoring"
                value={`${evaluationState.kpiWeightTotal}% bobot KPI${data.review360.enabled ? ` / ${evaluationState.reviewWeightTotal}% bobot 360` : ""}`}
              />
              <InfoRow
                label="Instrumen Aktif"
                value={`${evaluationState.activeForms.length} form / ${evaluationState.questionCoverage} pertanyaan aktif`}
              />
              <InfoRow
                label="Ulasan 360"
                value={
                  data.review360.enabled
                    ? `Aktif • minimal ${data.review360.minPeerReviewers} penilai rekan`
                    : "Nonaktif"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kontrol Rilis Hasil</CardTitle>
              <CardDescription>Checklist minimum sebelum hasil evaluasi dipakai sebagai dasar keputusan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ReadinessRow label="KPI aktif tersedia" ok={evaluationState.activeKpis.length > 0} note={`${evaluationState.activeKpis.length} KPI aktif`} />
              <ReadinessRow label="Periode penilaian aktif" ok={evaluationState.activePeriods.length > 0} note={`${evaluationState.activePeriods.length} periode aktif`} />
              <ReadinessRow label="Form penilaian aktif" ok={evaluationState.activeForms.length > 0} note={`${evaluationState.activeForms.length} form aktif`} />
              <ReadinessRow
                label="Bobot KPI seimbang"
                ok={evaluationState.kpiWeightTotal >= 90 && evaluationState.kpiWeightTotal <= 110}
                note={`${evaluationState.kpiWeightTotal}%`}
              />
              <ReadinessRow
                label="Bobot ulasan 360 valid"
                ok={!data.review360.enabled || evaluationState.reviewWeightTotal === 100}
                note={data.review360.enabled ? `${evaluationState.reviewWeightTotal}%` : "Tidak digunakan"}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Ringkasan Domain Penilaian</CardTitle>
              <CardDescription>Fokus dimensi KPI, cakupan form aktif, dan status periode yang saat ini membentuk hasil evaluasi.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <MetricPanel
                title="Dimensi KPI Teratas"
                icon={Scale}
                items={
                  evaluationState.topDimensions.length > 0
                    ? evaluationState.topDimensions.map((item) => `${item.dimension} • ${item.weight}%`)
                    : ["Belum ada KPI aktif"]
                }
              />
              <MetricPanel
                title="Periode"
                icon={CalendarRange}
                items={[
                  `${evaluationState.activePeriods.length} aktif`,
                  `${evaluationState.draftPeriods.length} draft`,
                  `${evaluationState.closedPeriods.length} ditutup`,
                ]}
              />
              <MetricPanel
                title="Instrumen"
                icon={FileSpreadsheet}
                items={[
                  `${evaluationState.activeForms.length} form aktif`,
                  `${evaluationState.commentRequiredForms} wajib komentar`,
                  `${evaluationState.questionCoverage} total pertanyaan`,
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aksi Cepat</CardTitle>
              <CardDescription>Buka area yang paling sering dipakai untuk merapikan hasil evaluasi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {access.canEdit && (evaluationState.activeKpis.length === 0 || evaluationState.activePeriods.length === 0 || evaluationState.activeForms.length === 0) ? (
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => void handleSeedBaseline()}
                  disabled={isSeedingBaseline || isLoading || isGeneratingRun}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {isSeedingBaseline ? "Menyiapkan Baseline..." : "Aktifkan Baseline Cepat"}
                </Button>
              ) : null}
              {access.canEdit ? (
                <Button className="w-full justify-start" onClick={() => void handleGenerateRun()} disabled={isGeneratingRun || isLoading || isSeedingBaseline || isScoringRun}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {data.latestRun ? "Muat Ulang Run Evaluasi" : "Buat Run Evaluasi"}
                </Button>
              ) : null}
              {access.canEdit && selectedRun && selectedRun.run_status !== "published" && selectedRun.run_status !== "archived" ? (
                <Button variant="outline" className="w-full justify-start" onClick={() => void handleScoreRun()} disabled={isScoringRun || isLoading || isGeneratingRun || isSeedingBaseline}>
                  <Gauge className="mr-2 h-4 w-4" />
                  {isScoringRun
                    ? "Menghitung Skor Awal..."
                    : selectedRun.run_status === "draft"
                      ? "Hitung Skor Awal"
                      : "Muat Ulang Skor Awal"}
                </Button>
              ) : null}
              {access.canEdit && selectedRun && selectedRun.run_status !== "published" && selectedRun.run_status !== "archived" ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsPublishConfirmOpen(true)}
                  disabled={
                    isPublishingRun ||
                    isLoading ||
                    isGeneratingRun ||
                    isSeedingBaseline ||
                    isScoringRun ||
                    selectedRun.ready_total === 0
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {isPublishingRun ? "Mempublikasikan Run..." : "Publikasikan Run"}
                </Button>
              ) : null}
              {access.canEdit && selectedRun?.run_status === "published" ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsArchiveConfirmOpen(true)}
                  disabled={isArchivingRun || isLoading || isGeneratingRun || isSeedingBaseline || isScoringRun || isPublishingRun}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {isArchivingRun ? "Mengarsipkan Run..." : "Arsipkan Run"}
                </Button>
              ) : null}
              <QuickLink to="/org/hr/kpi" label="Rapikan KPI aktif" />
              <QuickLink to="/org/hr/performance-periods" label="Atur periode penilaian" />
              <QuickLink to="/org/hr/performance-forms" label="Kelola form penilaian" />
                  <QuickLink to="/org/hr/review-360" label="Audit bobot ulasan 360" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Detail Run Dipilih</CardTitle>
              <CardDescription>Ringkasan run evaluasi yang sedang dibuka dari riwayat tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRun ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoRow label="Status Run" value={formatRunStatus(selectedRun.run_status)} />
                  <InfoRow label="Periode" value={selectedRun.period_name} />
                  <InfoRow label="Cohort" value={`${selectedRun.cohort_size} pegawai`} />
                  <InfoRow label="Hasil Tersimpan" value={`${selectedRun.result_total} hasil`} />
                  <InfoRow label="Siap / Publish" value={`${selectedRun.ready_total} siap • ${selectedRun.published_total} publish`} />
                  <InfoRow
                    label="Rata-rata Skor"
                    value={selectedRun.average_final_score !== null ? `${Number(selectedRun.average_final_score).toFixed(2)}` : "Belum ada skor"}
                  />
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Belum ada run evaluasi yang tersimpan. Backend hasil evaluasi sudah siap, tetapi batch penilaian pertama masih perlu dibuat.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rentang Skor</CardTitle>
              <CardDescription>Dipakai untuk membaca sebaran kualitas hasil sebelum dipublikasikan ke pimpinan atau evaluator.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PublicationRow
                label="Skor tertinggi"
                value={selectedRun?.top_score !== null && selectedRun?.top_score !== undefined ? Number(selectedRun.top_score).toFixed(2) : "Belum ada skor"}
                tone={selectedRun?.top_score !== null && selectedRun?.top_score !== undefined ? "good" : "warn"}
              />
              <PublicationRow
                label="Skor terendah"
                value={selectedRun?.lowest_score !== null && selectedRun?.lowest_score !== undefined ? Number(selectedRun.lowest_score).toFixed(2) : "Belum ada skor"}
                tone={selectedRun?.lowest_score !== null && selectedRun?.lowest_score !== undefined ? "good" : "warn"}
              />
              <PublicationRow
                label="Update terakhir"
                value={selectedRun?.updated_at ? formatDateTime(selectedRun.updated_at) : "Belum ada run"}
                tone={selectedRun ? "good" : "warn"}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Run Evaluasi</CardTitle>
            <CardDescription>
              Menampilkan run terbaru lintas status agar admin HR bisa membedakan draft, published, dan archived per periode tanpa mengandalkan satu ringkasan aktif saja.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.runHistory.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                Belum ada riwayat run evaluasi yang tersimpan.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cohort</TableHead>
                      <TableHead>Siap / Publish</TableHead>
                      <TableHead>Rata-rata</TableHead>
                      <TableHead>Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.runHistory.map((run) => {
                      const isCurrentSummary = data.latestRun?.run_id === run.run_id;
                      const isSelectedRun = selectedRun?.run_id === run.run_id;
                      return (
                        <TableRow key={run.run_id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{run.period_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {run.period_cycle || "cycle tidak diisi"}
                                {isCurrentSummary ? " • aktif di ringkasan" : ""}
                                {isSelectedRun ? " • sedang dibuka" : ""}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isSelectedRun ? "default" : isCurrentSummary ? "secondary" : "outline"}>{formatRunStatus(run.run_status)}</Badge>
                          </TableCell>
                          <TableCell>{run.cohort_size} pegawai</TableCell>
                          <TableCell>{run.ready_total} siap • {run.published_total} publish</TableCell>
                          <TableCell>{run.average_final_score !== null ? Number(run.average_final_score).toFixed(2) : "Belum ada skor"}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">{formatDateTime(run.updated_at)}</span>
                              <Button size="sm" variant={isSelectedRun ? "secondary" : "outline"} onClick={() => setSelectedRunId(run.run_id)}>
                                {isSelectedRun ? "Sedang Dibuka" : "Lihat Detail"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Cohort Evaluasi Aktif</CardTitle>
              <CardDescription>Distribusi pegawai aktif yang paling mungkin masuk hasil evaluasi pada periode acuan saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <MetricPanel
                title="Kategori Pegawai"
                icon={Users}
                items={
                  evaluationState.topCategories.length > 0
                    ? evaluationState.topCategories.map((item) => `${item.label} • ${item.count} pegawai`)
                    : ["Belum ada pegawai aktif"]
                }
              />
              <MetricPanel
                title="Golongan Dominan"
                icon={Scale}
                items={
                  evaluationState.topGolongan.length > 0
                    ? evaluationState.topGolongan.map((item) => `${item.label} • ${item.count} pegawai`)
                    : ["Belum ada golongan yang terisi"]
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kesiapan Publikasi</CardTitle>
              <CardDescription>Sinyal minimum sebelum hasil evaluasi dibagikan sebagai dasar tindak lanjut.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PublicationRow
                label="Cohort pegawai tersedia"
                value={`${data.employees} pegawai aktif`}
                tone={data.employees > 0 ? "good" : "warn"}
              />
              <PublicationRow
                label="Pegawai baru 90 hari"
                value={`${evaluationState.recentlyAddedEmployees} pegawai`}
                tone={evaluationState.recentlyAddedEmployees === 0 ? "good" : "warn"}
              />
              <PublicationRow
                label="KPI aktif vs pegawai"
                value={`${evaluationState.activeKpis.length} KPI untuk ${data.employees} pegawai`}
                tone={evaluationState.activeKpis.length > 0 ? "good" : "warn"}
              />
              <PublicationRow
                label="Form dengan komentar"
                value={`${evaluationState.commentRequiredForms} dari ${evaluationState.activeForms.length} form`}
                tone={evaluationState.commentRequiredForms > 0 ? "good" : "warn"}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Pegawai Run Dipilih</CardTitle>
            <CardDescription>Ringkasan hasil per pegawai dari run yang sedang dibuka di panel riwayat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={resultSearch}
                onChange={(event) => setResultSearch(event.target.value)}
                placeholder="Cari nama, email, NIP, score band, atau rekomendasi"
                className="md:max-w-sm"
              />
              <Select value={resultStatusFilter} onValueChange={(value) => setResultStatusFilter(value as "all" | EvaluationResultStatus)}>
                <SelectTrigger className="md:max-w-[220px]">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="draft">Draf</SelectItem>
                  <SelectItem value="ready">Siap</SelectItem>
                  <SelectItem value="published">Dipublikasikan</SelectItem>
                  <SelectItem value="excluded">Dikecualikan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRun ? (
              isLoadingSelectedResults ? (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Memuat hasil pegawai untuk run terpilih...
                </div>
              ) : filteredSelectedResults.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pegawai</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Skor Akhir</TableHead>
                        <TableHead>Band</TableHead>
                        <TableHead>Rekomendasi</TableHead>
                        <TableHead>Update</TableHead>
                        <TableHead className="w-[120px] text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSelectedResults.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{item.employee_snapshot?.name || "Pegawai Tanpa Nama"}</div>
                              <div className="text-xs text-muted-foreground">
                                {[item.employee_snapshot?.email, item.employee_snapshot?.nip].filter(Boolean).join(" • ") || "Identitas tambahan belum tersedia"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.result_status === "published" ? "default" : item.result_status === "ready" ? "secondary" : "outline"}>
                              {formatResultStatus(item.result_status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.final_score !== null ? Number(item.final_score).toFixed(2) : "Belum ada skor"}</TableCell>
                          <TableCell>{item.score_band || "-"}</TableCell>
                          <TableCell className="max-w-sm text-sm text-muted-foreground">{item.recommendation || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.updated_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditResult(item)}
                              disabled={!access.canEdit || selectedRun?.run_status === "published" || selectedRun?.run_status === "archived"}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Ubah
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Tidak ada hasil pegawai yang cocok dengan filter saat ini.
                </div>
              )
            ) : (
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                Daftar hasil pegawai akan muncul setelah run evaluasi pertama dibuat.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rekomendasi Tindak Lanjut</CardTitle>
            <CardDescription>Prioritas kerja yang paling berpengaruh pada kualitas hasil evaluasi tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : (
              recommendations.map((item) => (
                <div key={item} className="rounded-lg border bg-muted/20 p-4 text-sm">
                  {item}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <AlertDialog open={isPublishConfirmOpen} onOpenChange={setIsPublishConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publikasikan hasil evaluasi sekarang?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua hasil non-excluded pada run yang sedang dibuka akan berubah menjadi published. Gunakan override manual per pegawai lebih dulu jika masih ada skor atau rekomendasi yang perlu dirapikan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPublishingRun}>Batal</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPublishingRun}
                onClick={(event) => {
                  event.preventDefault();
                  void handlePublishRun().then(() => {
                    setIsPublishConfirmOpen(false);
                  });
                }}
              >
                {isPublishingRun ? "Mempublikasikan..." : "Ya, Publikasikan"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isArchiveConfirmOpen} onOpenChange={setIsArchiveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arsipkan run evaluasi ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Run yang sedang dibuka akan ditutup untuk perubahan operasional. Status hasil pegawai tetap tersimpan sebagai published dan run tidak akan dihitung ulang kecuali dibuka kembali lewat batch backend baru.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isArchivingRun}>Batal</AlertDialogCancel>
              <AlertDialogAction
                disabled={isArchivingRun}
                onClick={(event) => {
                  event.preventDefault();
                  void handleArchiveRun().then(() => {
                    setIsArchiveConfirmOpen(false);
                  });
                }}
              >
                {isArchivingRun ? "Mengarsipkan..." : "Ya, Arsipkan"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={Boolean(editingResult)} onOpenChange={(open) => !open && !isSavingResult && setEditingResult(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Override Hasil Pegawai</DialogTitle>
              <DialogDescription>
                Sesuaikan skor akhir, status hasil, dan rekomendasi sebelum run dipublikasikan final.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="font-medium">{editingResult?.employee_snapshot?.name || "Pegawai Tanpa Nama"}</div>
                <div className="text-xs text-muted-foreground">
                  {[editingResult?.employee_snapshot?.email, editingResult?.employee_snapshot?.nip].filter(Boolean).join(" • ") || "Identitas tambahan belum tersedia"}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Skor Akhir</div>
                  <Input
                    value={editingValues.finalScore}
                    onChange={(event) => setEditingValues((current) => ({ ...current, finalScore: event.target.value }))}
                    placeholder="0 - 100"
                    disabled={isSavingResult}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Status Hasil</div>
                  <Select
                    value={editingValues.resultStatus}
                    onValueChange={(value) => setEditingValues((current) => ({ ...current, resultStatus: value as EvaluationResultStatus }))}
                    disabled={isSavingResult}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draf</SelectItem>
                      <SelectItem value="ready">Siap</SelectItem>
                      <SelectItem value="excluded">Dikecualikan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Rekomendasi</div>
                <Textarea
                  value={editingValues.recommendation}
                  onChange={(event) => setEditingValues((current) => ({ ...current, recommendation: event.target.value }))}
                  placeholder="Catatan tindak lanjut atau alasan override"
                  disabled={isSavingResult}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingResult(null)} disabled={isSavingResult}>
                Batal
              </Button>
              <Button onClick={() => void handleSaveResultOverride()} disabled={isSavingResult}>
                {isSavingResult ? "Menyimpan..." : "Simpan Override"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Icon className="h-4 w-4 text-emerald-600" />
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white/70 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function ReadinessRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-white/70 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
    </div>
  );
}

function MetricPanel({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: React.ElementType;
  items: string[];
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-emerald-700" />
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg bg-background p-3 text-sm">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="outline" className="w-full justify-start">
      <OrgHRContextLink to={to}>
        <ListChecks className="mr-2 h-4 w-4" />
        {label}
      </OrgHRContextLink>
    </Button>
  );
}

function formatPeriodStatus(status: HrPerformancePeriod["status"]) {
  if (status === "active") return "Aktif";
  if (status === "closed") return "Ditutup";
  return "Draf";
}

function formatRunStatus(status: EvaluationRunSummary["run_status"]) {
  if (status === "published") return "Dipublikasikan";
  if (status === "in_review") return "Dalam Tinjau";
  if (status === "archived") return "Diarsipkan";
  return "Draf";
}

function readSummaryNumber(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readSummaryNullableNumber(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatResultStatus(status: EvaluationResultStatus) {
  if (status === "published") return "Dipublikasikan";
  if (status === "ready") return "Siap";
  if (status === "excluded") return "Dikecualikan";
  return "Draf";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deriveScoreBand(score: number | null) {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 90) return "Istimewa";
  if (score >= 80) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
}

function PublicationRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{value}</div>
        </div>
        <Badge variant={tone === "good" ? "default" : "secondary"}>{tone === "good" ? "Siap" : "Cek Lagi"}</Badge>
      </div>
    </div>
  );
}
