import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  Activity,
  Zap,
  Shield,
  Clock,
  Server,
  Users,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  TrendingUp,
  Timer,
  RefreshCw,
  Database,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ScalabilityTier,
  type ScalabilityProfile,
  getAllProfiles,
  getRecommendedTier,
  saveScalabilityConfig,
  loadScalabilityConfig,
  calculateThroughput,
} from "@/lib/scalabilityConfig";

type ScalabilityMode = "manual" | "auto";

type AttendanceScalabilitySetting = {
  mode?: ScalabilityMode;
  tier?: ScalabilityTier;
  effective_tier?: ScalabilityTier;
  measured_active_employees?: number;
  measured_at?: string;
  updated_at?: string;
};

const SCALABILITY_KEY = "attendance_scalability";
const VALID_TIERS: ScalabilityTier[] = ["small", "medium", "large", "enterprise"];
const SCALABILITY_OP_RETRY_MAX = 1;

const isValidTier = (value: unknown): value is ScalabilityTier => {
  return typeof value === "string" && VALID_TIERS.includes(value as ScalabilityTier);
};

type CapacityThresholds = {
  utilizationWarn: number;
  utilizationCritical: number;
  queueWarn: number;
  queueCritical: number;
  p95Warn: number;
  p95Critical: number;
  pendingWarn: number;
  pendingCritical: number;
};

const BASE_THRESHOLDS_BY_TIER: Record<ScalabilityTier, CapacityThresholds> = {
  small: {
    utilizationWarn: 75,
    utilizationCritical: 90,
    queueWarn: 500,
    queueCritical: 1500,
    p95Warn: 30,
    p95Critical: 90,
    pendingWarn: 300,
    pendingCritical: 900,
  },
  medium: {
    utilizationWarn: 80,
    utilizationCritical: 92,
    queueWarn: 1500,
    queueCritical: 5000,
    p95Warn: 60,
    p95Critical: 150,
    pendingWarn: 420,
    pendingCritical: 1200,
  },
  large: {
    utilizationWarn: 85,
    utilizationCritical: 95,
    queueWarn: 4000,
    queueCritical: 12000,
    p95Warn: 90,
    p95Critical: 240,
    pendingWarn: 600,
    pendingCritical: 1500,
  },
  enterprise: {
    utilizationWarn: 88,
    utilizationCritical: 96,
    queueWarn: 10000,
    queueCritical: 30000,
    p95Warn: 120,
    p95Critical: 300,
    pendingWarn: 900,
    pendingCritical: 2400,
  },
};

export function ScalabilitySettings() {
  const { toast } = useToast();
  const [activeProfile, setActiveProfile] = useState<ScalabilityProfile>(loadScalabilityConfig());
  const [estimatedUsers, setEstimatedUsers] = useState<string>(String(activeProfile.maxUsers));
  const [activeTab, setActiveTab] = useState<"konfigurasi" | "kesehatan-kapasitas">("konfigurasi");
  const [scalabilityMode, setScalabilityMode] = useState<ScalabilityMode>("manual");
  const [activeEmployeesCount, setActiveEmployeesCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [ingestHealth, setIngestHealth] = useState<{
    queue_depth: number;
    processing_count: number;
    failed_count: number;
    dead_count: number;
    processed_last_5m: number;
    avg_lag_seconds: number;
    p95_lag_seconds: number;
    max_pending_age_seconds: number;
  } | null>(null);
  const profiles = useMemo(() => getAllProfiles(), []);

  const recommendedTier = getRecommendedTier(parseInt(estimatedUsers) || 0);
  const throughput = calculateThroughput(activeProfile);
  const estimatedUsersNumber = Math.max(0, parseInt(estimatedUsers) || 0);
  const measuredUsers = (activeEmployeesCount ?? estimatedUsersNumber) || activeProfile.maxUsers;
  const capacityThresholds = useMemo(() => {
    const base = BASE_THRESHOLDS_BY_TIER[activeProfile.tier];
    const processedLast5m = Math.max(0, ingestHealth?.processed_last_5m ?? 0);

    // Adaptif: threshold queue menyesuaikan throughput aktual 5 menit terakhir.
    const dynamicQueueWarn = Math.max(base.queueWarn, Math.round(processedLast5m * 0.8));
    const dynamicQueueCritical = Math.max(base.queueCritical, Math.round(processedLast5m * 1.8));

    // Adaptif: threshold lag mengikuti ekspektasi antrean tier aktif.
    const dynamicP95Warn = Math.max(base.p95Warn, Math.round(activeProfile.estimatedQueueSeconds * 0.8));
    const dynamicP95Critical = Math.max(base.p95Critical, Math.round(activeProfile.estimatedQueueSeconds * 2));
    const dynamicPendingWarn = Math.max(base.pendingWarn, Math.round(activeProfile.estimatedQueueSeconds * 3));
    const dynamicPendingCritical = Math.max(base.pendingCritical, Math.round(activeProfile.estimatedQueueSeconds * 8));

    return {
      utilizationWarn: base.utilizationWarn,
      utilizationCritical: base.utilizationCritical,
      queueWarn: dynamicQueueWarn,
      queueCritical: Math.max(dynamicQueueCritical, dynamicQueueWarn + 500),
      p95Warn: dynamicP95Warn,
      p95Critical: Math.max(dynamicP95Critical, dynamicP95Warn + 30),
      pendingWarn: dynamicPendingWarn,
      pendingCritical: Math.max(dynamicPendingCritical, dynamicPendingWarn + 120),
    };
  }, [activeProfile.estimatedQueueSeconds, activeProfile.tier, ingestHealth?.processed_last_5m]);

  const capacityHealth = useMemo(() => {
    const maxUsers = Math.max(1, activeProfile.maxUsers);
    const userUtilization = Math.min(999, Math.round((measuredUsers / maxUsers) * 100));
    const queueDepth = ingestHealth?.queue_depth ?? 0;
    const p95Lag = Math.round(ingestHealth?.p95_lag_seconds ?? 0);
    const maxPendingAge = Math.round(ingestHealth?.max_pending_age_seconds ?? 0);
    const failedCount = ingestHealth?.failed_count ?? 0;
    const deadCount = ingestHealth?.dead_count ?? 0;
    const processedLast5m = ingestHealth?.processed_last_5m ?? 0;

    let score = 100;
    const findings: string[] = [];
    const recommendations: string[] = [];

    if (userUtilization >= capacityThresholds.utilizationCritical) {
      score -= 35;
      findings.push(`Pemakaian kapasitas user sudah >${capacityThresholds.utilizationCritical}% dari tier aktif.`);
      recommendations.push("Naikkan tier sekarang atau aktifkan mode otomatis.");
    } else if (userUtilization >= capacityThresholds.utilizationWarn) {
      score -= 20;
      findings.push(`Pemakaian kapasitas user mendekati batas aman (>${capacityThresholds.utilizationWarn}%).`);
      recommendations.push("Siapkan kenaikan tier sebelum jam puncak.");
    } else if (userUtilization <= 55) {
      findings.push("Headroom kapasitas masih longgar.");
    }

    if (queueDepth >= capacityThresholds.queueCritical) {
      score -= 25;
      findings.push(`Queue depth sangat tinggi (>=${capacityThresholds.queueCritical.toLocaleString()}).`);
      recommendations.push("Naikkan tier + periksa worker/cron pemroses queue.");
    } else if (queueDepth >= capacityThresholds.queueWarn) {
      score -= 12;
      findings.push(`Queue depth mulai padat (>=${capacityThresholds.queueWarn.toLocaleString()}).`);
      recommendations.push("Pantau backlog dan jalankan sync health lebih sering.");
    }

    if (p95Lag >= capacityThresholds.p95Critical) {
      score -= 20;
      findings.push(`P95 lag >${capacityThresholds.p95Critical} detik, sinkronisasi melambat.`);
      recommendations.push("Kurangi burst (jitter lebih besar) dan cek performa DB.");
    } else if (p95Lag >= capacityThresholds.p95Warn) {
      score -= 10;
      findings.push(`P95 lag >${capacityThresholds.p95Warn} detik, mulai ada antrian sinkronisasi.`);
    }

    if (maxPendingAge >= capacityThresholds.pendingCritical) {
      score -= 12;
      findings.push(`Umur pending tertua >${capacityThresholds.pendingCritical} detik.`);
      recommendations.push("Investigasi worker stuck atau error pada batch-attendance.");
    } else if (maxPendingAge >= capacityThresholds.pendingWarn) {
      score -= 6;
      findings.push(`Umur pending tertua >${capacityThresholds.pendingWarn} detik.`);
    }

    if (deadCount > 0) {
      score -= 15;
      findings.push(`Ditemukan dead queue (${deadCount} item).`);
      recommendations.push("Jalankan cleanup/retry dead queue.");
    } else if (failedCount > 0) {
      score -= 8;
      findings.push(`Terdapat failed queue (${failedCount} item).`);
    }

    if (!ingestHealth) {
      score -= 10;
      findings.push("Data health queue belum tersedia dari RPC.");
      recommendations.push("Pastikan migration/RPC get_attendance_ingest_health aktif.");
    }

    score = Math.max(0, Math.min(100, score));

    const status = score >= 80 ? "Siap" : score >= 60 ? "Waspada" : "Kritis";
    const statusTone =
      status === "Siap"
        ? "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300"
        : status === "Waspada"
          ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
          : "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300";

    const suggestedTier = getRecommendedTier(Math.max(1, measuredUsers));
    const peakCapacityEstimate = Math.max(1, throughput.peakReqPerSec);
    const offpeakCapacityEstimate = Math.max(1, throughput.offpeakReqPerSec);
    const queuePressure =
      queueDepth === 0
        ? "Rendah"
        : queueDepth < capacityThresholds.queueWarn
          ? "Normal"
          : queueDepth < capacityThresholds.queueCritical
            ? "Tinggi"
            : "Sangat Tinggi";
    const queuePressureTone =
      queueDepth < capacityThresholds.queueWarn
        ? "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300"
        : queueDepth < capacityThresholds.queueCritical
          ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
          : "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300";

    return {
      score,
      status,
      statusTone,
      userUtilization,
      measuredUsers,
      queueDepth,
      queuePressure,
      queuePressureTone,
      p95Lag,
      maxPendingAge,
      failedCount,
      deadCount,
      processedLast5m,
      suggestedTier,
      peakCapacityEstimate,
      offpeakCapacityEstimate,
      thresholds: capacityThresholds,
      findings,
      recommendations,
    };
  }, [
    activeProfile.maxUsers,
    capacityThresholds,
    ingestHealth,
    measuredUsers,
    throughput.offpeakReqPerSec,
    throughput.peakReqPerSec,
  ]);

  const loadActiveEmployeesCount = useCallback(async (): Promise<number> => {
    const { count, error } = await withTimeout(
      () =>
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      10000,
      "Load active employees timeout"
    );

    if (error) throw error;
    return count ?? 0;
  }, []);

  const upsertScalabilitySetting = useCallback(async (value: AttendanceScalabilitySetting) => {
    const { data: existing, error: existingError } = await withTimeout(
      () =>
        supabase
          .from("system_settings")
          .select("id")
          .eq("key", SCALABILITY_KEY)
          .maybeSingle(),
      10000,
      "Load scalability setting timeout"
    );

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .update({ value, updated_at: new Date().toISOString() })
            .eq("id", existing.id),
        10000,
        "Update scalability setting timeout"
      );
      if (error) throw error;
      return;
    }

    const { error } = await withTimeout(
      () =>
        supabase
          .from("system_settings")
          .insert({
            key: SCALABILITY_KEY,
            value,
            description: "Konfigurasi skalabilitas absensi untuk sinkronisasi local-first",
          }),
      10000,
      "Insert scalability setting timeout"
    );
    if (error) throw error;
  }, []);

  const loadIngestHealth = useCallback(async () => {
      setIsHealthLoading(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () => supabase.rpc("get_attendance_ingest_health"),
            10000,
            "Load ingest health timeout"
          ),
        {
          maxRetries: SCALABILITY_OP_RETRY_MAX,
          shouldRetry: isRetryableError,
        }
      );
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return;

      setIngestHealth({
        queue_depth: Number(row.queue_depth) || 0,
        processing_count: Number(row.processing_count) || 0,
        failed_count: Number(row.failed_count) || 0,
        dead_count: Number(row.dead_count) || 0,
        processed_last_5m: Number(row.processed_last_5m) || 0,
        avg_lag_seconds: Number(row.avg_lag_seconds) || 0,
        p95_lag_seconds: Number(row.p95_lag_seconds) || 0,
        max_pending_age_seconds: Number(row.max_pending_age_seconds) || 0,
      });
    } catch (error) {
      reportError(error, "admin.settings.scalability.load_ingest_health");
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  const syncAutoScalability = useCallback(
    async (forcePersist: boolean = false) => {
      setIsAutoSyncing(true);
      try {
        const count = await loadActiveEmployeesCount();
        const nextTier = getRecommendedTier(count);
        const nextProfile = profiles.find((p) => p.tier === nextTier) ?? activeProfile;

        setActiveEmployeesCount(count);
        setEstimatedUsers(String(count));
        setActiveProfile(nextProfile);
        setScalabilityMode("auto");
        saveScalabilityConfig(nextProfile.tier);

        const shouldPersist =
          forcePersist ||
          scalabilityMode !== "auto" ||
          activeProfile.tier !== nextProfile.tier ||
          activeEmployeesCount !== count;

        if (shouldPersist) {
          const now = new Date().toISOString();
          await upsertScalabilitySetting({
            mode: "auto",
            tier: nextTier,
            effective_tier: nextTier,
            measured_active_employees: count,
            measured_at: now,
            updated_at: now,
          });
        }
      } finally {
        setIsAutoSyncing(false);
      }
    },
    [
      activeEmployeesCount,
      activeProfile,
      loadActiveEmployeesCount,
      profiles,
      scalabilityMode,
      upsertScalabilitySetting,
    ]
  );

  const handleModeToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        setScalabilityMode("auto");
        setIsSaving(true);
        try {
          await syncAutoScalability(true);
          toast({
            title: "Mode Otomatis Aktif",
            description: "Tier akan menyesuaikan jumlah pegawai aktif.",
          });
        } catch (error) {
          const errorRef = reportError(error, "admin.settings.scalability.enable_auto");
          toast({
            title: "Gagal Mengaktifkan Mode Otomatis",
            description: appendErrorReference("Periksa koneksi database lalu coba lagi.", errorRef),
            variant: "destructive",
          });
        } finally {
          setIsSaving(false);
        }
        return;
      }

      setScalabilityMode("manual");
      setIsSaving(true);
      try {
        const now = new Date().toISOString();
        await upsertScalabilitySetting({
          mode: "manual",
          tier: activeProfile.tier,
          effective_tier: activeProfile.tier,
          measured_active_employees: activeEmployeesCount ?? undefined,
          measured_at: activeEmployeesCount !== null ? now : undefined,
          updated_at: now,
        });
        toast({
          title: "Mode Manual Aktif",
          description: `Tier dikunci ke ${activeProfile.label}.`,
        });
      } catch (error) {
        const errorRef = reportError(error, "admin.settings.scalability.enable_manual");
        toast({
          title: "Gagal Menyimpan Mode Manual",
          description: appendErrorReference("Perubahan mode belum tersimpan di server.", errorRef),
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [activeEmployeesCount, activeProfile, syncAutoScalability, toast, upsertScalabilitySetting]
  );

  useEffect(() => {
    const loadGlobalScalability = async () => {
      try {
        const { data, error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", SCALABILITY_KEY)
              .maybeSingle(),
          10000,
          "Load global scalability timeout"
        );

        if (error) throw error;

        const value = data?.value as AttendanceScalabilitySetting | null;
        const savedMode = value?.mode === "auto" ? "auto" : "manual";
        const resolvedTier = isValidTier(value?.effective_tier)
          ? value.effective_tier
          : isValidTier(value?.tier)
            ? value.tier
            : null;
        if (!resolvedTier) return;

        const profile = getAllProfiles().find((p) => p.tier === resolvedTier);
        if (!profile) return;

        setActiveProfile(profile);
        setScalabilityMode(savedMode);
        if (typeof value?.measured_active_employees === "number") {
          setActiveEmployeesCount(value.measured_active_employees);
          setEstimatedUsers(String(value.measured_active_employees));
        } else {
          setEstimatedUsers(String(profile.maxUsers));
        }
        saveScalabilityConfig(profile.tier);
      } catch (error) {
        const errorRef = reportError(error, "admin.settings.scalability.load_global");
        toast({
          title: "Gagal Memuat Skalabilitas Global",
          description: appendErrorReference("Pengaturan global tidak dapat dimuat, memakai konfigurasi lokal.", errorRef),
          variant: "destructive",
        });
      }
    };

    loadGlobalScalability();
  }, [toast]);

  useEffect(() => {
    loadIngestHealth();
    const interval = window.setInterval(loadIngestHealth, 20000);
    return () => window.clearInterval(interval);
  }, [loadIngestHealth]);

  useEffect(() => {
    if (scalabilityMode !== "auto") return;

    let cancelled = false;
    const run = async () => {
      try {
        await syncAutoScalability(false);
      } catch (error) {
        if (!cancelled) {
          reportError(error, "admin.settings.scalability.refresh_auto");
        }
      }
    };

    run();
    const interval = window.setInterval(run, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scalabilityMode, syncAutoScalability]);

  const handleApplyProfile = async (tier: ScalabilityTier) => {
    const profile = profiles.find(p => p.tier === tier)!;
    setScalabilityMode("manual");
    setActiveProfile(profile);
    saveScalabilityConfig(tier);

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        mode: "manual" as ScalabilityMode,
        tier,
        effective_tier: tier,
        measured_active_employees: activeEmployeesCount ?? undefined,
        measured_at: activeEmployeesCount !== null ? now : undefined,
        updated_at: now,
      };
      await upsertScalabilitySetting(payload);

      toast({
        title: "Profil Skalabilitas Diterapkan",
        description: `Konfigurasi "${profile.label}" aktif (mode manual).`,
      });
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.scalability.apply_profile", { tier });
      toast({
        title: "Gagal Menyimpan Profil",
        description: appendErrorReference(
          "Profil lokal tetap aktif, tetapi sinkronisasi global gagal.",
          errorRef
        ),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const tierColors: Record<ScalabilityTier, string> = {
    small: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
    medium: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
    large: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    enterprise: "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400",
  };

  const tierBadgeColors: Record<ScalabilityTier, string> = {
    small: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    large: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    enterprise: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };

  const formatMs = (ms: number) => {
    if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`;
    return `${ms}ms`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Pengaturan Skalabilitas
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Konfigurasi otomatis parameter resiliensi berdasarkan estimasi jumlah pengguna.
          </p>
        </div>
        <Badge className={tierBadgeColors[activeProfile.tier]}>
          {activeProfile.label}
        </Badge>
      </div>
      {isSaving && (
        <p className="text-xs text-muted-foreground">Menyimpan konfigurasi skalabilitas global...</p>
      )}
      {isAutoSyncing && (
        <p className="text-xs text-muted-foreground">Mode otomatis sedang menghitung jumlah pegawai aktif...</p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "konfigurasi" | "kesehatan-kapasitas")}
        className="space-y-6"
      >
        <TabsList className="h-auto w-full max-w-md justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <TabsTrigger value="konfigurasi" className="whitespace-nowrap">Konfigurasi</TabsTrigger>
          <TabsTrigger value="kesehatan-kapasitas" className="whitespace-nowrap">Kesehatan Kapasitas</TabsTrigger>
        </TabsList>

        <TabsContent value="konfigurasi" className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Penyesuaian Otomatis Tier
            </span>
            <Switch
              checked={scalabilityMode === "auto"}
              onCheckedChange={(checked) => {
                void handleModeToggle(checked);
              }}
              disabled={isSaving || isAutoSyncing}
            />
          </CardTitle>
          <CardDescription>
            Jika aktif, sistem menghitung jumlah pegawai aktif dan memilih tier terbaik secara otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">
              Mode: {scalabilityMode === "auto" ? "Otomatis" : "Manual"}
            </Badge>
            {activeEmployeesCount !== null && (
              <Badge variant="outline">
                Pegawai aktif terhitung: {activeEmployeesCount.toLocaleString()}
              </Badge>
            )}
            <Badge variant="outline">
              Tier efektif: {activeProfile.label}
            </Badge>
          </div>
          {scalabilityMode === "auto" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void syncAutoScalability(true);
              }}
              disabled={isSaving || isAutoSyncing}
            >
              Sinkronkan Ulang Sekarang
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Ingestion Queue Health */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Health Ingestion Queue
            </span>
            <Button variant="outline" size="sm" onClick={loadIngestHealth} disabled={isHealthLoading}>
              <RefreshCw className={cn("h-3 w-3 mr-1", isHealthLoading && "animate-spin")} />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Monitoring antrean sinkronisasi absensi real-time untuk deteksi bottleneck.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ingestHealth ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Queue Depth</p>
                <p className="text-lg font-semibold">{ingestHealth.queue_depth.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Processing</p>
                <p className="text-lg font-semibold">{ingestHealth.processing_count.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Failed / Dead</p>
                <p className="text-lg font-semibold">
                  {ingestHealth.failed_count.toLocaleString()} / {ingestHealth.dead_count.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Processed 5m</p>
                <p className="text-lg font-semibold">{ingestHealth.processed_last_5m.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Avg Lag</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.avg_lag_seconds)}s</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">P95 Lag</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.p95_lag_seconds)}s</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40 col-span-2">
                <p className="text-xs text-muted-foreground">Max Pending Age</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.max_pending_age_seconds)}s</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada data health queue.</p>
          )}
        </CardContent>
      </Card>

      {/* Estimasi User Input */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">Estimasi Total Pegawai:</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={estimatedUsers}
                onChange={(e) => setEstimatedUsers(e.target.value)}
                min={1}
                max={500000}
                className="w-32 px-3 py-2 rounded-md border bg-background text-foreground text-sm"
              />
              <span className="text-sm text-muted-foreground">user</span>
              {recommendedTier !== activeProfile.tier && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApplyProfile(recommendedTier)}
                  className="flex items-center gap-1"
                >
                  <Zap className="h-3 w-3" />
                  Terapkan Rekomendasi
                </Button>
              )}
            </div>
          </div>
          {recommendedTier !== activeProfile.tier && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Berdasarkan estimasi <strong>{parseInt(estimatedUsers).toLocaleString()}</strong> user, 
                kami merekomendasikan profil <strong>{profiles.find(p => p.tier === recommendedTier)?.label}</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfile.tier === profile.tier;
          const isRecommended = recommendedTier === profile.tier;
          const pt = calculateThroughput(profile);

          return (
            <Card
              key={profile.tier}
              className={cn(
                "relative transition-all cursor-pointer hover:shadow-md",
                isActive && "ring-2 ring-primary shadow-md",
                tierColors[profile.tier]
              )}
              onClick={() => handleApplyProfile(profile.tier)}
            >
              {isRecommended && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Rekomendasi
                  </Badge>
                </div>
              )}
              {isActive && (
                <div className="absolute -top-2 -left-2 z-10">
                  <Badge className="bg-green-600 text-white text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Aktif
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{profile.label}</CardTitle>
                <CardDescription className="text-xs">{profile.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3 w-3 opacity-60" />
                    <span>Jitter: 0–{formatMs(profile.jitterPeakMaxMs)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 opacity-60" />
                    <span>Retry: {profile.backoffMaxRetries}x</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 opacity-60" />
                    <span>CB: {profile.cbFailureThreshold} fail</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 opacity-60" />
                    <span>Batch: {profile.batchSize}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>Timeout: {formatMs(profile.rpcTimeoutBaseMs)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 opacity-60" />
                    <span>~{pt.peakReqPerSec} req/s</span>
                  </div>
                </div>
                {profile.showQueueMessage && (
                  <div className="mt-2 p-2 rounded bg-background/50 text-xs flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 opacity-60 flex-shrink-0" />
                    <span>Pesan antrean aktif (estimasi {profile.estimatedQueueSeconds}s)</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* Active Config Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Detail Konfigurasi Aktif: {activeProfile.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Jitter */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-blue-500" />
                Adaptive Jitter
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Peak (06-09, 15-18)</span>
                  <span className="font-mono font-medium text-foreground">0–{formatMs(activeProfile.jitterPeakMaxMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Off-Peak</span>
                  <span className="font-mono font-medium text-foreground">0–{formatMs(activeProfile.jitterOffpeakMaxMs)}</span>
                </div>
              </div>
            </div>

            {/* Backoff */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                Exponential Backoff
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Delay</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.backoffBaseMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Delay</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.backoffMaxMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Retries</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.backoffMaxRetries}x</span>
                </div>
              </div>
            </div>

            {/* Circuit Breaker */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Circuit Breaker
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Failure Threshold</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.cbFailureThreshold} kali</span>
                </div>
                <div className="flex justify-between">
                  <span>Recovery Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.cbRecoveryTimeoutMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success to Close</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.cbSuccessThreshold} kali</span>
                </div>
              </div>
            </div>

            {/* Timeout */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-green-500" />
                RPC Timeout
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.rpcTimeoutBaseMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.rpcTimeoutMaxMs)}</span>
                </div>
              </div>
            </div>

            {/* Batch & Buffer */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-500" />
                Batch & Buffer
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Batch Size</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.batchSize} entries</span>
                </div>
                <div className="flex justify-between">
                  <span>Buffer Expiry</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.bufferExpiryDays} hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Sync Attempts</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.maxSyncAttempts}x</span>
                </div>
              </div>
            </div>

            {/* Throughput */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                Estimasi Throughput
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Peak Req/s</span>
                  <span className="font-mono font-medium text-foreground">~{throughput.peakReqPerSec}</span>
                </div>
                <div className="flex justify-between">
                  <span>Off-peak Req/s</span>
                  <span className="font-mono font-medium text-foreground">~{throughput.offpeakReqPerSec}</span>
                </div>
                <div className="flex justify-between">
                  <span>Queue Message</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.showQueueMessage ? 'Aktif' : 'Nonaktif'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Queue Message Preview */}
          {activeProfile.showQueueMessage && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-2">Preview Pesan Antrean (tampil di aplikasi pegawai):</h4>
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-blue-700 dark:text-blue-300">
                      Antrean sistem sedang padat
                    </p>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
                      Data Anda telah tersimpan di perangkat dan sedang mengantre untuk dikirim 
                      (Estimasi: {activeProfile.estimatedQueueSeconds} detik). Jangan tutup aplikasi Anda.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Glossary - Penjelasan Istilah & Mekanisme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Penjelasan Istilah, Konfigurasi, & Kesehatan Kapasitas
          </CardTitle>
          <CardDescription>
            Panduan istilah teknis, mode pengaturan, dan cara membaca tab baru Kesehatan Kapasitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Arsitektur Umum */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Arsitektur Offline-First & Resiliensi
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sistem absensi menggunakan pendekatan <strong>Offline-First</strong>: setiap data absen disimpan secara instan ke perangkat pengguna (IndexedDB) terlebih dahulu, lalu disinkronkan ke server di latar belakang. 
              Jika server sedang sibuk atau koneksi putus, data tetap aman di perangkat dan akan otomatis dikirim ulang saat kondisi memungkinkan. 
              Strategi ini memastikan pengalaman pengguna tetap lancar meskipun terjadi lonjakan trafik hingga ratusan ribu pengguna bersamaan. 
              Dengan pembaruan terbaru, sistem juga mendukung <strong>Mode Otomatis</strong> dan laporan <strong>Kesehatan Kapasitas</strong> agar penyesuaian tier lebih adaptif.
            </p>
          </div>

          {/* Istilah-istilah */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Adaptive Jitter */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4 text-blue-500" />
                Adaptive Jitter
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Jitter</strong> adalah penundaan acak (random delay) yang ditambahkan sebelum data dikirim ke server. 
                Tujuannya untuk mencegah fenomena <em>"Thundering Herd"</em> — situasi di mana ribuan perangkat mengirim data secara bersamaan dan membuat server kewalahan. 
                Delay ini bersifat <strong>adaptif</strong>: lebih besar di jam sibuk (pagi 06-09 & sore 15-18) dan minimal di luar jam puncak. 
                Contoh: Pada tier Enterprise, setiap perangkat menunggu acak antara 0–120 detik sebelum mengirim data, sehingga beban server tersebar merata.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Peak:</strong> Jam masuk/pulang kerja &nbsp;|&nbsp; <strong>Off-Peak:</strong> Di luar jam tersebut
              </div>
            </div>

            {/* Exponential Backoff */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                Exponential Backoff
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Strategi pengiriman ulang (retry) ketika request gagal. Setiap percobaan ulang memiliki jeda yang semakin panjang secara eksponensial: 
                percobaan ke-1 menunggu 1 detik, ke-2 menunggu 2 detik, ke-3 menunggu 4 detik, dst. 
                Hal ini mencegah server dibanjiri retry secara bersamaan saat terjadi gangguan.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Base Delay:</strong> Jeda awal percobaan ulang &nbsp;|&nbsp; 
                <strong>Max Delay:</strong> Batas maksimum jeda &nbsp;|&nbsp; 
                <strong>Max Retries:</strong> Jumlah percobaan ulang maksimal
              </div>
            </div>

            {/* Circuit Breaker */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-500" />
                Circuit Breaker
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Mekanisme pemutus sirkuit yang melindungi server dari overload. Memiliki 3 status: 
                <strong> Closed</strong> (normal, request dikirim), 
                <strong> Open</strong> (server bermasalah, request dihentikan sementara), dan 
                <strong> Half-Open</strong> (percobaan kirim sebagian untuk mengecek apakah server pulih). 
                Jika kegagalan beruntun mencapai threshold, circuit breaker berpindah ke status Open dan menghentikan semua pengiriman selama periode pemulihan.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Failure Threshold:</strong> Jumlah gagal sebelum "Open" &nbsp;|&nbsp; 
                <strong>Recovery Timeout:</strong> Waktu tunggu sebelum coba lagi &nbsp;|&nbsp; 
                <strong>Success to Close:</strong> Sukses berturut-turut untuk kembali "Closed"
              </div>
            </div>

            {/* RPC Timeout */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-500" />
                RPC Timeout
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>RPC (Remote Procedure Call)</strong> adalah panggilan fungsi ke server database. 
                Timeout menentukan berapa lama sistem menunggu respons server sebelum menganggap request gagal. 
                Timeout yang terlalu pendek menyebabkan banyak gagal palsu; terlalu panjang membuat pengguna menunggu lama. 
                Nilai timeout bersifat <strong>adaptif</strong>: bertambah setiap kali percobaan ulang untuk mengantisipasi server yang sedang lambat.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Base:</strong> Timeout percobaan pertama &nbsp;|&nbsp; 
                <strong>Max:</strong> Batas maksimum timeout
              </div>
            </div>

            {/* Batch & Buffer */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-500" />
                Batch & Buffer (IndexedDB)
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Buffer</strong> adalah penyimpanan lokal di perangkat pengguna menggunakan IndexedDB (database browser) 
                yang menyimpan data absen secara instan (&lt;5ms) bahkan saat offline. Data dienkripsi sederhana (XOR + Base64) untuk mencegah manipulasi. 
                <strong> Batching</strong> adalah proses mengirim data secara berkelompok (bukan satu per satu) ke server, 
                sehingga mengurangi jumlah koneksi dan meningkatkan efisiensi sinkronisasi.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Batch Size:</strong> Jumlah data per kelompok kirim &nbsp;|&nbsp; 
                <strong>Buffer Expiry:</strong> Lama data disimpan di perangkat &nbsp;|&nbsp; 
                <strong>Max Sync Attempts:</strong> Percobaan sinkronisasi maksimal
              </div>
            </div>

            {/* Throughput */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                Estimasi Throughput
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Throughput</strong> adalah estimasi jumlah request yang dapat diproses server per detik. 
                Dihitung berdasarkan jumlah pengguna dan jitter window: semakin besar jitter, semakin tersebar beban, 
                sehingga request per detik ke server semakin rendah dan stabil. 
                <strong> Queue Message</strong> adalah pesan informatif yang ditampilkan kepada pegawai saat jitter melebihi 5 detik, 
                memberitahu bahwa data aman dan sedang mengantre.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Peak Req/s:</strong> Request/detik di jam sibuk &nbsp;|&nbsp; 
                <strong>Off-peak Req/s:</strong> Request/detik di luar jam sibuk
              </div>
            </div>

            {/* Auto vs Manual Mode */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-indigo-500" />
                Mode Otomatis vs Manual
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Mode Manual</strong> berarti admin memilih tier sendiri dan sistem mengikuti pilihan itu. 
                <strong> Mode Otomatis</strong> berarti sistem menghitung jumlah pegawai aktif, lalu memilih tier yang paling sesuai secara berkala. 
                Mode otomatis cocok saat jumlah pegawai berubah cepat agar kapasitas tetap proporsional.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Manual:</strong> kontrol penuh admin &nbsp;|&nbsp; <strong>Auto:</strong> tier adaptif berdasarkan data real
              </div>
            </div>

            {/* Capacity Health Score */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-500" />
                Skor Kesehatan Kapasitas
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tab <strong>Kesehatan Kapasitas</strong> merangkum kondisi sistem dalam skor 0-100. 
                Skor dihitung dari utilisasi tier, queue depth, P95 lag, pending age, serta failed/dead queue. 
                Status dibagi menjadi <strong>Siap</strong>, <strong>Waspada</strong>, dan <strong>Kritis</strong> untuk memudahkan keputusan operasional.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Siap:</strong> skor &gt;= 80 &nbsp;|&nbsp; <strong>Waspada:</strong> 60-79 &nbsp;|&nbsp; <strong>Kritis:</strong> &lt; 60
              </div>
            </div>

            {/* Dynamic Thresholds */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Threshold Dinamis
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ambang <em>warning/critical</em> tidak lagi statis. Nilai threshold kini menyesuaikan tier aktif dan trafik aktual (misalnya processed 5 menit terakhir). 
                Artinya, standar penilaian ikut berubah sesuai skala operasional, bukan satu angka tetap untuk semua kondisi.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                Contoh: threshold queue untuk Enterprise otomatis lebih longgar dibanding Small, namun tetap adaptif terhadap beban real.
              </div>
            </div>
          </div>

          {/* Alur Kerja */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Alur Kerja Sistem Saat Pegawai Menekan Tombol Absen
            </h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
              <li><strong>Simpan Instan:</strong> Data absen (timestamp, GPS, jarak) langsung disimpan ke IndexedDB di perangkat. Status: <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">Pending</Badge></li>
              <li><strong>Adaptive Jitter:</strong> Sistem menghitung delay acak berdasarkan tier dan jam saat ini, lalu menunggu selama delay tersebut.</li>
              <li><strong>Cek Circuit Breaker:</strong> Jika status "Open" (server bermasalah), data tetap di antrean lokal. Jika "Closed", lanjut kirim.</li>
              <li><strong>Kirim ke Server (RPC):</strong> Data dikirim via fungsi database atomik. Jika gagal, masuk mekanisme Exponential Backoff.</li>
              <li><strong>Sinkronisasi Berhasil:</strong> Status diperbarui menjadi <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-700 dark:text-green-300">Synced</Badge>. Data aman di server.</li>
              <li><strong>Re-hydration:</strong> Jika aplikasi/HP mati mendadak, saat dibuka kembali sistem memulihkan data "stuck" dari IndexedDB dan melanjutkan sinkronisasi.</li>
            </ol>
          </div>

          {/* Cara Baca Tab Baru */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Cara Membaca Tab Kesehatan Kapasitas
            </h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
              <li>Lihat <strong>Status & Skor</strong> untuk indikator cepat apakah sistem aman atau perlu tindakan.</li>
              <li>Cek <strong>Indikator Operasional</strong> (Queue Depth, P95 Lag, Pending Age) untuk menemukan bottleneck utama.</li>
              <li>Gunakan panel <strong>Saran Tier</strong> jika jumlah pegawai atau antrian sudah melewati batas aman.</li>
              <li>Periksa <strong>Threshold Dinamis Aktif</strong> agar keputusan tuning sesuai konteks trafik saat ini.</li>
              <li>Eksekusi rekomendasi pada blok <strong>Temuan & Tindakan</strong>, lalu refresh metrik untuk validasi.</li>
            </ol>
          </div>

          {/* Tier Explanation */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Tentang Tier Skalabilitas
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Setiap tier dirancang untuk kapasitas pengguna tertentu. Semakin besar tier, semakin agresif strategi distribusi beban (jitter lebih besar, batch lebih banyak, retry lebih sabar). 
              Pilih tier sesuai estimasi jumlah pegawai aktif yang akan melakukan absensi bersamaan. 
              Sistem akan memberikan rekomendasi otomatis berdasarkan angka yang Anda masukkan.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-green-500/10 text-center">
                <p className="font-semibold text-green-700 dark:text-green-300">Small</p>
                <p className="text-muted-foreground">≤5.000 user</p>
                <p className="text-muted-foreground">Delay minimal</p>
              </div>
              <div className="p-2 rounded bg-blue-500/10 text-center">
                <p className="font-semibold text-blue-700 dark:text-blue-300">Medium</p>
                <p className="text-muted-foreground">5K–20K user</p>
                <p className="text-muted-foreground">Jitter moderat</p>
              </div>
              <div className="p-2 rounded bg-amber-500/10 text-center">
                <p className="font-semibold text-amber-700 dark:text-amber-300">Large</p>
                <p className="text-muted-foreground">20K–100K user</p>
                <p className="text-muted-foreground">Batching agresif</p>
              </div>
              <div className="p-2 rounded bg-purple-500/10 text-center">
                <p className="font-semibold text-purple-700 dark:text-purple-300">Enterprise</p>
                <p className="text-muted-foreground">100K–500K user</p>
                <p className="text-muted-foreground">Jitter 0–120s</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="kesehatan-kapasitas" className="space-y-6">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Ringkasan Kesehatan Kapasitas
                </span>
                <Badge className={cn("border", capacityHealth.statusTone)}>
                  {capacityHealth.status} ({capacityHealth.score}/100)
                </Badge>
              </CardTitle>
              <CardDescription>
                Laporan kemampuan sistem absensi berdasarkan tier aktif, jumlah pegawai, dan kesehatan queue real-time.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Pegawai Terukur</p>
                <p className="text-lg font-semibold">{capacityHealth.measuredUsers.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Utilisasi Tier</p>
                <p className="text-lg font-semibold">{capacityHealth.userUtilization}%</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Kapasitas Peak (estimasi)</p>
                <p className="text-lg font-semibold">~{capacityHealth.peakCapacityEstimate.toLocaleString()} req/s</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Kapasitas Off-Peak</p>
                <p className="text-lg font-semibold">~{capacityHealth.offpeakCapacityEstimate.toLocaleString()} req/s</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Indikator Operasional</CardTitle>
                <CardDescription>
                  Membaca tekanan antrean sinkronisasi saat ini dan efeknya ke user.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Queue Depth</p>
                  <p className="text-lg font-semibold">{capacityHealth.queueDepth.toLocaleString()}</p>
                  <Badge className={cn("mt-2 border", capacityHealth.queuePressureTone)}>
                    Tekanan: {capacityHealth.queuePressure}
                  </Badge>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Processed 5 Menit</p>
                  <p className="text-lg font-semibold">{capacityHealth.processedLast5m.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">P95 Lag</p>
                  <p className="text-lg font-semibold">{capacityHealth.p95Lag}s</p>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Pending Tertua</p>
                  <p className="text-lg font-semibold">{capacityHealth.maxPendingAge}s</p>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Failed Queue</p>
                  <p className="text-lg font-semibold">{capacityHealth.failedCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Dead Queue</p>
                  <p className="text-lg font-semibold">{capacityHealth.deadCount.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Saran Tier</CardTitle>
                <CardDescription>
                  Rekomendasi otomatis berdasarkan jumlah pegawai terukur.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Tier Aktif</p>
                  <p className="font-semibold">{activeProfile.label}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/40">
                  <p className="text-xs text-muted-foreground">Tier Disarankan</p>
                  <p className="font-semibold">{profiles.find((p) => p.tier === capacityHealth.suggestedTier)?.label}</p>
                </div>
                {capacityHealth.suggestedTier !== activeProfile.tier && (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      void handleApplyProfile(capacityHealth.suggestedTier);
                    }}
                  >
                    Terapkan Tier Disarankan
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Threshold Dinamis Aktif</CardTitle>
              <CardDescription>
                Ambang skor dituning berdasarkan tier aktif dan trafik aktual.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Utilisasi</p>
                <p className="font-semibold">
                  Warn {capacityHealth.thresholds.utilizationWarn}% / Critical {capacityHealth.thresholds.utilizationCritical}%
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Queue Depth</p>
                <p className="font-semibold">
                  Warn {capacityHealth.thresholds.queueWarn.toLocaleString()} / Critical {capacityHealth.thresholds.queueCritical.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">P95 Lag</p>
                <p className="font-semibold">
                  Warn {capacityHealth.thresholds.p95Warn}s / Critical {capacityHealth.thresholds.p95Critical}s
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Max Pending Age</p>
                <p className="font-semibold">
                  Warn {capacityHealth.thresholds.pendingWarn}s / Critical {capacityHealth.thresholds.pendingCritical}s
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Temuan & Rekomendasi</CardTitle>
              <CardDescription>
                Catatan otomatis untuk membantu admin mengambil tindakan cepat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Temuan</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {capacityHealth.findings.length === 0 ? (
                    <li>Belum ada anomali berarti. Sistem terpantau stabil.</li>
                  ) : (
                    capacityHealth.findings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Tindakan Disarankan</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {capacityHealth.recommendations.length === 0 ? (
                    <li>Pertahankan konfigurasi sekarang dan lanjutkan monitoring rutin.</li>
                  ) : (
                    capacityHealth.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
