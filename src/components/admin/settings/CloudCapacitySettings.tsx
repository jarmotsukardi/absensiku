import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { AlertTriangle, CloudCog, Database, HardDrive, RefreshCw, Rocket, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";

type PlanTier = "free" | "pro" | "team" | "enterprise";
type ProviderKey = "supabase" | "vercel";

type MetricKey =
  | "database_size_bytes"
  | "storage_size_bytes"
  | "bandwidth_gb"
  | "active_users"
  | "edge_invocations";

interface MetricLimits {
  database_size_bytes: number;
  storage_size_bytes: number;
  bandwidth_gb: number;
  active_users: number;
  edge_invocations: number;
}

interface ProviderConfig {
  plan: PlanTier;
  warning_percent: number;
  enabled: boolean;
  plan_limits: Record<PlanTier, MetricLimits>;
  manual_current: MetricLimits;
}

interface CloudCapacityConfig {
  supabase: ProviderConfig;
  vercel: ProviderConfig;
  updated_at?: string;
}

interface UsageSnapshot {
  generated_at: string | null;
  database_size_bytes: number | null;
  storage_size_bytes: number | null;
  active_users_30d: number | null;
}

const SETTING_KEY = "cloud_platform_capacity_monitor";
const ONE_GB = 1024 * 1024 * 1024;
const ONE_MB = 1024 * 1024;

const defaultLimits = (provider: ProviderKey): Record<PlanTier, MetricLimits> =>
  provider === "supabase"
    ? {
        free: {
          database_size_bytes: 500 * ONE_MB,
          storage_size_bytes: 1 * ONE_GB,
          bandwidth_gb: 5,
          active_users: 50000,
          edge_invocations: 500000,
        },
        pro: {
          database_size_bytes: 8 * ONE_GB,
          storage_size_bytes: 100 * ONE_GB,
          bandwidth_gb: 250,
          active_users: 100000,
          edge_invocations: 2000000,
        },
        team: {
          database_size_bytes: 50 * ONE_GB,
          storage_size_bytes: 500 * ONE_GB,
          bandwidth_gb: 1000,
          active_users: 500000,
          edge_invocations: 10000000,
        },
        enterprise: {
          database_size_bytes: 200 * ONE_GB,
          storage_size_bytes: 2048 * ONE_GB,
          bandwidth_gb: 5000,
          active_users: 2000000,
          edge_invocations: 50000000,
        },
      }
    : {
        free: {
          database_size_bytes: 0,
          storage_size_bytes: 1 * ONE_GB,
          bandwidth_gb: 100,
          active_users: 20000,
          edge_invocations: 1000000,
        },
        pro: {
          database_size_bytes: 0,
          storage_size_bytes: 20 * ONE_GB,
          bandwidth_gb: 1000,
          active_users: 100000,
          edge_invocations: 10000000,
        },
        team: {
          database_size_bytes: 0,
          storage_size_bytes: 200 * ONE_GB,
          bandwidth_gb: 5000,
          active_users: 500000,
          edge_invocations: 50000000,
        },
        enterprise: {
          database_size_bytes: 0,
          storage_size_bytes: 1024 * ONE_GB,
          bandwidth_gb: 20000,
          active_users: 2000000,
          edge_invocations: 200000000,
        },
      };

const defaultProvider = (provider: ProviderKey): ProviderConfig => ({
  plan: "free",
  warning_percent: 80,
  enabled: true,
  plan_limits: defaultLimits(provider),
  manual_current: {
    database_size_bytes: 0,
    storage_size_bytes: 0,
    bandwidth_gb: 0,
    active_users: 0,
    edge_invocations: 0,
  },
});

const defaultConfig: CloudCapacityConfig = {
  supabase: defaultProvider("supabase"),
  vercel: defaultProvider("vercel"),
};

const mergeProvider = (provider: ProviderConfig, patch: Partial<ProviderConfig> | null | undefined): ProviderConfig => {
  if (!patch) return provider;
  return {
    ...provider,
    ...patch,
    plan_limits: {
      ...provider.plan_limits,
      ...(patch.plan_limits || {}),
    },
    manual_current: {
      ...provider.manual_current,
      ...(patch.manual_current || {}),
    },
  };
};

const mergeConfig = (raw: unknown): CloudCapacityConfig => {
  if (!raw || typeof raw !== "object") return defaultConfig;
  const cfg = raw as Partial<CloudCapacityConfig>;
  return {
    supabase: mergeProvider(defaultProvider("supabase"), cfg.supabase),
    vercel: mergeProvider(defaultProvider("vercel"), cfg.vercel),
    updated_at: cfg.updated_at,
  };
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("id-ID");
};

const metricLabel: Record<MetricKey, string> = {
  database_size_bytes: "Ukuran Database",
  storage_size_bytes: "File Storage",
  bandwidth_gb: "Bandwidth Bulanan",
  active_users: "Active Users (30 hari)",
  edge_invocations: "Edge Function Invocation",
};

const buildCurrentMetrics = (provider: ProviderKey, cfg: ProviderConfig, snapshot: UsageSnapshot | null): MetricLimits => {
  if (provider === "supabase") {
    return {
      database_size_bytes: snapshot?.database_size_bytes ?? cfg.manual_current.database_size_bytes,
      storage_size_bytes: snapshot?.storage_size_bytes ?? cfg.manual_current.storage_size_bytes,
      bandwidth_gb: cfg.manual_current.bandwidth_gb,
      active_users: snapshot?.active_users_30d ?? cfg.manual_current.active_users,
      edge_invocations: cfg.manual_current.edge_invocations,
    };
  }

  return { ...cfg.manual_current };
};

const toDisplay = (metric: MetricKey, value: number) => {
  if (metric === "database_size_bytes" || metric === "storage_size_bytes") return formatBytes(value);
  if (metric === "bandwidth_gb") return `${formatNumber(value)} GB`;
  return formatNumber(value);
};

const getUtilization = (current: number, limit: number) => {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(999, Math.round((current / limit) * 100)));
};

const metricIcon: Record<MetricKey, ComponentType<{ className?: string }>> = {
  database_size_bytes: Database,
  storage_size_bytes: HardDrive,
  bandwidth_gb: Wifi,
  active_users: Users,
  edge_invocations: Rocket,
};

const getPlanBadge = (plan: PlanTier) => {
  if (plan === "free") return "bg-amber-500/15 text-amber-700 border-amber-300";
  if (plan === "pro") return "bg-sky-500/15 text-sky-700 border-sky-300";
  if (plan === "team") return "bg-indigo-500/15 text-indigo-700 border-indigo-300";
  return "bg-emerald-500/15 text-emerald-700 border-emerald-300";
};

export function CloudCapacitySettings() {
  const [config, setConfig] = useState<CloudCapacityConfig>(defaultConfig);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [snapshotMode, setSnapshotMode] = useState<"rpc" | "fallback">("rpc");
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseSnapshotPayload = (data: unknown): UsageSnapshot | null => {
    if (!data || typeof data !== "object") return null;
    const parsed = data as Record<string, unknown>;
    return {
      generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
      database_size_bytes:
        typeof parsed.database_size_bytes === "number" ? parsed.database_size_bytes : Number(parsed.database_size_bytes || 0),
      storage_size_bytes:
        typeof parsed.storage_size_bytes === "number" ? parsed.storage_size_bytes : Number(parsed.storage_size_bytes || 0),
      active_users_30d:
        typeof parsed.active_users_30d === "number" ? parsed.active_users_30d : Number(parsed.active_users_30d || 0),
    };
  };

  const isMissingRpcError = (error: unknown) => {
    const message = String((error as { message?: string })?.message || error || "").toLowerCase();
    return message.includes("get_platform_usage_snapshot") || message.includes("42883") || message.includes("does not exist");
  };

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [settingRes, snapshotRes] = await Promise.all([
        withTimeout(
          () => supabase.from("system_settings").select("value").eq("key", SETTING_KEY).maybeSingle(),
          10000,
          "Load cloud capacity settings timeout"
        ),
        withTimeout(
          () =>
            (supabase as unknown as {
              rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
            }).rpc("get_platform_usage_snapshot"),
          12000,
          "Load cloud usage snapshot timeout"
        ),
      ]);

      if (settingRes.error) throw settingRes.error;
      setConfig(mergeConfig(settingRes.data?.value));

      if (snapshotRes.error) {
        const ref = reportError(snapshotRes.error, "admin.cloud_capacity.snapshot_rpc");
        setSnapshotMode("fallback");
        if (isMissingRpcError(snapshotRes.error)) {
          setSnapshotNotice(
            `Mode fallback aktif: RPC snapshot cloud belum tersedia. Jalankan migration terbaru lalu refresh halaman. (Ref: ${ref})`
          );
        } else {
          setSnapshotNotice(`Snapshot otomatis belum tersedia saat ini, sistem memakai mode manual. (Ref: ${ref})`);
        }
      } else {
        const parsed = parseSnapshotPayload(snapshotRes.data);
        if (parsed) {
          setSnapshot(parsed);
          setSnapshotMode("rpc");
          setSnapshotNotice(null);
        }
      }
    } catch (error) {
      const ref = reportError(error, "admin.cloud_capacity.load");
      toast.error(`Gagal memuat pengaturan kapasitas cloud (Ref: ${ref})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const updateProvider = <K extends keyof ProviderConfig>(provider: ProviderKey, key: K, value: ProviderConfig[K]) => {
    setConfig((prev) => ({ ...prev, [provider]: { ...prev[provider], [key]: value } }));
  };

  const updateProviderLimit = (provider: ProviderKey, plan: PlanTier, metric: MetricKey, value: number) => {
    setConfig((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        plan_limits: {
          ...prev[provider].plan_limits,
          [plan]: {
            ...prev[provider].plan_limits[plan],
            [metric]: value,
          },
        },
      },
    }));
  };

  const updateProviderManual = (provider: ProviderKey, metric: MetricKey, value: number) => {
    setConfig((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        manual_current: {
          ...prev[provider].manual_current,
          [metric]: value,
        },
      },
    }));
  };

  const evaluateFreePlanAlerts = useCallback(
    async (configToCheck: CloudCapacityConfig, snapshotToCheck: UsageSnapshot | null) => {
      const providers: ProviderKey[] = ["supabase", "vercel"];
      const superAdminRes = await withTimeout(
        () => supabase.from("user_roles").select("user_id").eq("role", "super_admin"),
        10000,
        "Load super admin users timeout"
      );
      if (superAdminRes.error) throw superAdminRes.error;
      const superAdminIds = Array.from(new Set((superAdminRes.data || []).map((r) => r.user_id).filter(Boolean)));
      if (superAdminIds.length === 0) return;

      for (const provider of providers) {
        const providerCfg = configToCheck[provider];
        if (!providerCfg.enabled || providerCfg.plan !== "free") continue;

        const current = buildCurrentMetrics(provider, providerCfg, snapshotToCheck);
        const limits = providerCfg.plan_limits.free;
        const hotMetrics = (Object.keys(metricLabel) as MetricKey[])
          .map((metric) => ({
            metric,
            utilization: getUtilization(current[metric], limits[metric]),
            current: current[metric],
            limit: limits[metric],
          }))
          .filter((item) => item.limit > 0 && item.utilization >= providerCfg.warning_percent)
          .sort((a, b) => b.utilization - a.utilization);

        if (hotMetrics.length === 0) continue;

        const top = hotMetrics[0];
        const alertKey = `platform_capacity_${provider}_free_${top.metric}`;
        const title = `Peringatan ${provider === "supabase" ? "Supabase" : "Vercel"} Free`;
        const message = `${metricLabel[top.metric]} mencapai ${top.utilization}% (${toDisplay(top.metric, top.current)} dari limit ${toDisplay(
          top.metric,
          top.limit
        )}). Siapkan upgrade paket Pro/Team/Enterprise.`;

        for (const userId of superAdminIds) {
          const dedupeRes = await withTimeout(
            () =>
              supabase
                .from("notifications")
                .select("id")
                .eq("user_id", userId)
                .contains("metadata", { alert_key: alertKey })
                .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .limit(1),
            10000,
            "Check notification dedupe timeout"
          );

          if (dedupeRes.error) {
            const dedupeRef = reportError(dedupeRes.error, "admin.cloud_capacity.notification_dedupe", {
              provider,
              user_id: userId,
              alert_key: alertKey,
            });
            toast.warning(`Validasi dedupe notifikasi gagal (Ref: ${dedupeRef})`);
            continue;
          }

          if ((dedupeRes.data || []).length > 0) continue;

          const insertRes = await withTimeout(
            () =>
              supabase.from("notifications").insert({
                user_id: userId,
                title,
                message,
                type: "warning",
                is_read: false,
                link: "/admin/settings",
                metadata: {
                  source: "cloud_capacity_monitor",
                  provider,
                  plan: "free",
                  metric: top.metric,
                  utilization: top.utilization,
                  alert_key: alertKey,
                },
              }),
            10000,
            "Insert capacity warning notification timeout"
          );

          if (insertRes.error) {
            const insertRef = reportError(insertRes.error, "admin.cloud_capacity.notification_insert", {
              provider,
              user_id: userId,
              alert_key: alertKey,
            });
            toast.warning(`Gagal kirim notifikasi peringatan kapasitas (Ref: ${insertRef})`);
          }
        }
      }
    },
    []
  );

  const saveConfig = async () => {
    setSaving(true);
    try {
      const payload: CloudCapacityConfig = {
        ...config,
        updated_at: new Date().toISOString(),
      };

      const { error } = await withTimeout(
        () =>
          supabase.from("system_settings").upsert(
            {
              key: SETTING_KEY,
              value: payload,
              description:
                "Monitoring kapasitas Supabase & Vercel (plan, limit, usage, dan warning threshold untuk antisipasi upgrade paket).",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          ),
        10000,
        "Save cloud capacity settings timeout"
      );

      if (error) throw error;

      await evaluateFreePlanAlerts(payload, snapshot);
      toast.success("Pengaturan kapasitas cloud berhasil disimpan");
    } catch (error) {
      const ref = reportError(error, "admin.cloud_capacity.save");
      toast.error(`Gagal menyimpan pengaturan kapasitas cloud (Ref: ${ref})`);
    } finally {
      setSaving(false);
    }
  };

  const refreshSnapshot = async () => {
    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        () =>
          (supabase as unknown as {
            rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
          }).rpc("get_platform_usage_snapshot"),
        12000,
        "Refresh cloud usage snapshot timeout"
      );

      if (error) {
        const ref = reportError(error, "admin.cloud_capacity.refresh_rpc");
        setSnapshotMode("fallback");
        if (isMissingRpcError(error)) {
          setSnapshotNotice(
            `Mode fallback aktif: RPC snapshot cloud belum tersedia. Jalankan migration terbaru lalu refresh halaman. (Ref: ${ref})`
          );
        } else {
          setSnapshotNotice(`Snapshot otomatis belum tersedia saat ini, sistem memakai mode manual. (Ref: ${ref})`);
        }
        toast.warning("Refresh snapshot otomatis belum tersedia. Data manual tetap bisa dipakai.");
        return;
      }
      const nextSnapshot = parseSnapshotPayload(data);
      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
        setSnapshotMode("rpc");
        setSnapshotNotice(null);
        await evaluateFreePlanAlerts(config, nextSnapshot);
        toast.success("Snapshot usage cloud berhasil diperbarui");
      }
    } catch (error) {
      const ref = reportError(error, "admin.cloud_capacity.refresh");
      toast.error(`Gagal refresh snapshot usage cloud (Ref: ${ref})`);
    } finally {
      setLoading(false);
    }
  };

  const providerRender = useMemo(() => {
    const providers: { key: ProviderKey; title: string; desc: string }[] = [
      {
        key: "supabase",
        title: "Supabase",
        desc: "Metrik real-time DB/storage/users dari RPC, plus input manual untuk bandwidth dan edge invocations.",
      },
      {
        key: "vercel",
        title: "Vercel",
        desc: "Metrik saat ini diisi manual dari dashboard Vercel sampai integrasi API usage diaktifkan.",
      },
    ];

    return providers.map((item) => {
      const providerCfg = config[item.key];
      const currentMetrics = buildCurrentMetrics(item.key, providerCfg, snapshot);
      const limits = providerCfg.plan_limits[providerCfg.plan];

      return (
        <Card key={item.key}>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CloudCog className="h-4 w-4" />
                  {item.title}
                </CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </div>
              <Badge variant="outline" className={getPlanBadge(providerCfg.plan)}>
                Paket {providerCfg.plan.toUpperCase()}
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Paket aktif</Label>
                <Select value={providerCfg.plan} onValueChange={(value) => updateProvider(item.key, "plan", value as PlanTier)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Warning threshold (%)</Label>
                <Input
                  type="number"
                  min={50}
                  max={99}
                  value={providerCfg.warning_percent}
                  onChange={(event) =>
                    updateProvider(item.key, "warning_percent", Math.max(50, Math.min(99, Number(event.target.value) || 80)))
                  }
                />
              </div>
              <div className="space-y-2 flex items-end gap-3">
                <Switch checked={providerCfg.enabled} onCheckedChange={(checked) => updateProvider(item.key, "enabled", checked)} />
                <Label>Aktifkan monitoring provider ini</Label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {(Object.keys(metricLabel) as MetricKey[]).map((metric) => {
                const Icon = metricIcon[metric];
                const current = currentMetrics[metric];
                const limit = limits[metric];
                const utilization = getUtilization(current, limit);
                const tone =
                  limit <= 0
                    ? "secondary"
                    : utilization >= providerCfg.warning_percent
                      ? "destructive"
                      : utilization >= providerCfg.warning_percent - 15
                        ? "outline"
                        : "secondary";
                return (
                  <div key={`${item.key}-${metric}`} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        <span>{metricLabel[metric]}</span>
                      </div>
                      <Badge variant={tone}>{limit <= 0 ? "N/A" : `${utilization}%`}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Current: {toDisplay(metric, current)} | Limit: {limit <= 0 ? "N/A" : toDisplay(metric, limit)}
                    </div>
                    <Progress value={Math.min(100, utilization)} className="h-2" />
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Edit limit paket {providerCfg.plan.toUpperCase()}</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Limit Database (MB)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(providerCfg.plan_limits[providerCfg.plan].database_size_bytes / ONE_MB)}
                    onChange={(event) =>
                      updateProviderLimit(
                        item.key,
                        providerCfg.plan,
                        "database_size_bytes",
                        Math.max(0, Number(event.target.value) || 0) * ONE_MB
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limit File Storage (GB)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(providerCfg.plan_limits[providerCfg.plan].storage_size_bytes / ONE_GB)}
                    onChange={(event) =>
                      updateProviderLimit(
                        item.key,
                        providerCfg.plan,
                        "storage_size_bytes",
                        Math.max(0, Number(event.target.value) || 0) * ONE_GB
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limit Bandwidth (GB/bulan)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.plan_limits[providerCfg.plan].bandwidth_gb}
                    onChange={(event) =>
                      updateProviderLimit(item.key, providerCfg.plan, "bandwidth_gb", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limit Active Users</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.plan_limits[providerCfg.plan].active_users}
                    onChange={(event) =>
                      updateProviderLimit(item.key, providerCfg.plan, "active_users", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limit Edge Invocations / bulan</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.plan_limits[providerCfg.plan].edge_invocations}
                    onChange={(event) =>
                      updateProviderLimit(item.key, providerCfg.plan, "edge_invocations", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Input current usage manual ({item.title})</h4>
              <p className="text-xs text-muted-foreground">
                Dipakai untuk metrik yang belum tersedia otomatis dari API provider. Supabase otomatis mengisi DB, storage, dan active users.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Database (MB)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(providerCfg.manual_current.database_size_bytes / ONE_MB)}
                    onChange={(event) =>
                      updateProviderManual(item.key, "database_size_bytes", Math.max(0, Number(event.target.value) || 0) * ONE_MB)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current File Storage (GB)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(providerCfg.manual_current.storage_size_bytes / ONE_GB)}
                    onChange={(event) =>
                      updateProviderManual(item.key, "storage_size_bytes", Math.max(0, Number(event.target.value) || 0) * ONE_GB)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current Bandwidth (GB/bulan)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.manual_current.bandwidth_gb}
                    onChange={(event) =>
                      updateProviderManual(item.key, "bandwidth_gb", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current Active Users</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.manual_current.active_users}
                    onChange={(event) =>
                      updateProviderManual(item.key, "active_users", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current Edge Invocations / bulan</Label>
                  <Input
                    type="number"
                    min={0}
                    value={providerCfg.manual_current.edge_invocations}
                    onChange={(event) =>
                      updateProviderManual(item.key, "edge_invocations", Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    });
  }, [config, snapshot]);

  return (
    <div className="space-y-6">
      <Card className="border-amber-300/60 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Monitoring Paket Supabase & Vercel
          </CardTitle>
          <CardDescription>
            Tab ini membantu superadmin memantau kapasitas layanan cloud (free/pro/team/enterprise), mendeteksi risiko limit,
            dan mengirim notifikasi dini saat paket free mendekati batas.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Metrik otomatis saat ini: <strong>ukuran database, ukuran file storage, active users 30 hari</strong> (Supabase).
          </p>
          <p>
            Metrik lain seperti <strong>bandwidth dan edge invocation</strong> dapat diinput manual dari dashboard provider
            sampai integrasi API usage resmi diaktifkan.
          </p>
          {snapshot?.generated_at ? (
            <p>Snapshot terakhir: {new Date(snapshot.generated_at).toLocaleString("id-ID")}</p>
          ) : null}
          <div className="pt-1">
            <Badge variant="outline" className={snapshotMode === "rpc" ? "text-emerald-700 border-emerald-300" : "text-amber-700 border-amber-300"}>
              Mode snapshot: {snapshotMode === "rpc" ? "RPC otomatis" : "Fallback manual"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {snapshotNotice ? (
        <Card className="border-amber-300/70 bg-amber-50/60">
          <CardContent className="pt-6 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{snapshotNotice}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={refreshSnapshot} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Snapshot + Evaluasi Notifikasi
        </Button>
        <Button onClick={saveConfig} variant="secondary" disabled={saving}>
          Simpan Pengaturan Kapasitas
        </Button>
      </div>

      {providerRender}

      <PageGlossarySection preset="settings_cloud_capacity" />
    </div>
  );
}
