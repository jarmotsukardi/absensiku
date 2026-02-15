import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  CreditCard, 
  Search,
  Filter,
  Download,
  TrendingUp,
  Users,
  Building2,
  CheckCircle2,
  Clock,
  Flame,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { id } from "date-fns/locale";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled";
type StreakPolicyStatus = "tracking" | "near_suspension" | "suspended" | "invoiced" | "unknown";

interface StreakSnapshot {
  tenant_id: string;
  streak_count: number;
  status: string;
  reached_target: boolean | null;
  reached_target_at: string | null;
  grace_period_end: string | null;
}

interface Subscription {
  id: string;
  tenant_id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  tenant?: {
    name: string;
    code: string;
    organization_type: string | null;
  };
  employees_count?: number;
  streak?: StreakSnapshot | null;
  streak_policy_status?: StreakPolicyStatus;
  recommended_status?: SubscriptionStatus;
}

const statusLabels: Record<SubscriptionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial: { label: "Trial", variant: "secondary" },
  active: { label: "Aktif", variant: "default" },
  expired: { label: "Expired", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "outline" },
};

const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = "trial";

const isSubscriptionStatus = (status: string | null | undefined): status is SubscriptionStatus =>
  status === "trial" || status === "active" || status === "expired" || status === "cancelled";

const streakPolicyLabels: Record<StreakPolicyStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  tracking: { label: "Tracking", variant: "outline" },
  near_suspension: { label: "Near Suspension", variant: "secondary" },
  suspended: { label: "Suspended", variant: "destructive" },
  invoiced: { label: "Invoiced", variant: "default" },
  unknown: { label: "Belum Ada Data", variant: "outline" },
};

const getNumericSettingValue = (raw: unknown, fallback: number) => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "value" in raw) {
    const nested = (raw as Record<string, unknown>).value;
    return getNumericSettingValue(nested, fallback);
  }

  return fallback;
};

const getEffectiveGraceEndDate = (
  streak: StreakSnapshot | null | undefined,
  graceDays: number
) => {
  if (!streak) return null;

  if (streak.reached_target_at) {
    const reachedAt = new Date(streak.reached_target_at);
    reachedAt.setHours(0, 0, 0, 0);
    return addDays(reachedAt, Math.max(0, graceDays));
  }

  if (streak.grace_period_end) {
    return new Date(`${streak.grace_period_end}T00:00:00`);
  }

  return null;
};

const getStreakPolicyStatus = (
  streak: StreakSnapshot | null | undefined,
  threshold: number,
  graceDays: number
): StreakPolicyStatus => {
  if (!streak) return "unknown";
  if (streak.status === "invoiced") return "invoiced";

  const reachedTarget = streak.streak_count >= Math.max(1, threshold);
  if (!reachedTarget) return "tracking";

  const graceEnd = getEffectiveGraceEndDate(streak, graceDays);
  if (!graceEnd) return "near_suspension";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return graceEnd < today ? "suspended" : "near_suspension";
};

const getRecommendedStatusFromPolicy = (
  currentStatus: SubscriptionStatus,
  policyStatus: StreakPolicyStatus
): SubscriptionStatus => {
  if (currentStatus === "cancelled") return "cancelled";
  if (policyStatus === "suspended") return "expired";
  if (policyStatus === "invoiced") return "active";
  return currentStatus;
};

const getPolicyEndDateLabel = (subscription: Subscription, graceDays: number) => {
  const policyStatus = subscription.streak_policy_status || "unknown";

  if (policyStatus === "tracking" || policyStatus === "unknown") {
    return "Belum dimulai";
  }

  const effectiveGraceEnd = getEffectiveGraceEndDate(subscription.streak, graceDays);
  if (effectiveGraceEnd) {
    return format(effectiveGraceEnd, "d MMM yyyy", { locale: id });
  }

  if (subscription.end_date) {
    return format(new Date(subscription.end_date), "d MMM yyyy", { locale: id });
  }

  return "-";
};

export default function SubscriptionManagement() {
  const PAGE_SIZE = 20;
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [policyThreshold, setPolicyThreshold] = useState(30);
  const [policyGraceDays, setPolicyGraceDays] = useState(7);
  const [isSyncingPolicy, setIsSyncingPolicy] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    trial: 0,
    active: 0,
    expired: 0,
    totalRevenue: 0,
  });

  const fetchSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      const { error: syncPolicyError } = await supabase.rpc("sync_streak_subscription_status", {});
      if (syncPolicyError) {
        reportError(syncPolicyError, "admin.subscriptions.sync_policy_status_pre_fetch");
      }
      let tenantIds: string[] | null = null;
      if (searchQuery.trim()) {
        const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
        const { data: tenantRows, error: tenantSearchError } = await supabase
          .from("tenants")
          .select("id")
          .or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
        if (tenantSearchError) throw tenantSearchError;
        tenantIds = (tenantRows || []).map((t) => t.id);
        if (tenantIds.length === 0) {
          setSubscriptions([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }
      }

      let query = supabase
        .from("subscriptions")
        .select(`
          *,
          tenant:tenants(name, code, organization_type)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as SubscriptionStatus);
      }
      if (tenantIds) {
        query = query.in("tenant_id", tenantIds);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalCount(count || 0);

      const tenantIdsInPage = [...new Set((data || []).map((sub) => sub.tenant_id))];

      const [
        subsWithCounts,
        streakRes,
        settingsRes,
      ] = await Promise.all([
        Promise.all(
          (data || []).map(async (sub: Subscription) => {
            const { count, error: countError } = await supabase
              .from("employees")
              .select("*", { count: "exact", head: true })
              .eq("tenant_id", sub.tenant_id);

            if (countError) {
              reportError(countError, "admin.subscriptions.fetch_employee_count", {
                subscription_id: sub.id,
                tenant_id: sub.tenant_id,
              });
            }

            return { ...sub, employees_count: countError ? 0 : count || 0 };
          })
        ),
        tenantIdsInPage.length > 0
          ? supabase
              .from("stability_streaks")
              .select("tenant_id, streak_count, status, reached_target, reached_target_at, grace_period_end")
              .in("tenant_id", tenantIdsInPage)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["streak_threshold", "streak_grace_period_days"]),
      ]);

      let effectiveThreshold = policyThreshold;
      let effectiveGraceDays = policyGraceDays;

      if (streakRes.error) {
        reportError(streakRes.error, "admin.subscriptions.fetch_streaks", {
          tenant_ids_count: tenantIdsInPage.length,
        });
      }

      if (settingsRes.error) {
        reportError(settingsRes.error, "admin.subscriptions.fetch_streak_settings");
      } else if (settingsRes.data) {
        const thresholdRaw = settingsRes.data.find((item) => item.key === "streak_threshold")?.value;
        const graceRaw = settingsRes.data.find((item) => item.key === "streak_grace_period_days")?.value;
        effectiveThreshold = Math.max(1, Math.floor(getNumericSettingValue(thresholdRaw, 30)));
        effectiveGraceDays = Math.max(0, Math.floor(getNumericSettingValue(graceRaw, 7)));
        setPolicyThreshold(effectiveThreshold);
        setPolicyGraceDays(effectiveGraceDays);
      }

      const streakByTenant = new Map(
        (streakRes.data || []).map((item) => [item.tenant_id, item as StreakSnapshot])
      );

      const subscriptionsWithPolicy = subsWithCounts.map((sub) => {
        const normalizedStatus = isSubscriptionStatus(sub.status)
          ? sub.status
          : DEFAULT_SUBSCRIPTION_STATUS;
        const streak = streakByTenant.get(sub.tenant_id) || null;
        const policyStatus = getStreakPolicyStatus(streak, effectiveThreshold, effectiveGraceDays);
        const recommendedStatus = getRecommendedStatusFromPolicy(normalizedStatus, policyStatus);
        return {
          ...sub,
          streak,
          streak_policy_status: policyStatus,
          recommended_status: recommendedStatus,
        };
      });

      setSubscriptions(subscriptionsWithPolicy);

      // Calculate stats (global, not affected by pagination)
      const { count: total } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true });
      const { count: trial } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "trial");
      const { count: active } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      const { count: expired } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired");

      setStats({
        total: total || 0,
        trial: trial || 0,
        active: active || 0,
        expired: expired || 0,
        totalRevenue: (active || 0) * 500000,
      });
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.fetch", {
        status_filter: statusFilter,
      });
      toast.error(appendErrorReference("Gagal memuat data langganan", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter, policyThreshold, policyGraceDays]);

  useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const updateSubscriptionStatus = async (
    subId: string,
    newStatus: string,
    options?: { silentSuccess?: boolean; silentError?: boolean }
  ) => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .update({ status: newStatus as SubscriptionStatus })
        .eq("id", subId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        throw new Error("Status tidak berubah karena data tidak ditemukan atau akses ditolak");
      }

      if (!options?.silentSuccess) {
        toast.success("Status langganan berhasil diperbarui");
      }
      await fetchSubscriptions();
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.update_status", {
        subscription_id: subId,
        next_status: newStatus,
      });
      if (!options?.silentError) {
        toast.error(appendErrorReference("Gagal memperbarui status", errorRef));
      }
    }
  };

  const syncWithStreakPolicy = async () => {
    const syncTargets = subscriptions.filter((sub) => {
      const currentStatus = isSubscriptionStatus(sub.status)
        ? sub.status
        : DEFAULT_SUBSCRIPTION_STATUS;
      return sub.recommended_status && sub.recommended_status !== currentStatus;
    });

    if (syncTargets.length === 0) {
      toast.info("Semua data langganan pada halaman ini sudah sesuai kebijakan streak");
      return;
    }

    setIsSyncingPolicy(true);
    try {
      const results = await Promise.allSettled(
        syncTargets.map(async (sub) => {
          const targetStatus = sub.recommended_status || DEFAULT_SUBSCRIPTION_STATUS;
          const { data, error } = await supabase
            .from("subscriptions")
            .update({ status: targetStatus })
            .eq("id", sub.id)
            .select("id")
            .maybeSingle();

          if (error || !data?.id) {
            throw error || new Error("Update tidak berhasil");
          }

          return sub.id;
        })
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      if (failedCount === 0) {
        toast.success(`Sinkronisasi kebijakan streak berhasil (${successCount} data)`);
      } else {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            reportError(result.reason, "admin.subscriptions.sync_streak_policy", {
              subscription_id: syncTargets[index]?.id,
              tenant_id: syncTargets[index]?.tenant_id,
            });
          }
        });
        toast.error(`Sinkronisasi selesai dengan sebagian gagal`, {
          description: `${successCount}/${results.length} data berhasil disinkronkan`,
        });
      }

      await fetchSubscriptions();
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.sync_streak_policy_fatal");
      toast.error(appendErrorReference("Gagal sinkronisasi kebijakan streak", errorRef));
    } finally {
      setIsSyncingPolicy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <SuperAdminLayout
      title="Manajemen Langganan"
      subtitle="Kelola subscription dan billing organisasi"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Langganan</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-sm text-muted-foreground">Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.trial}</p>
                  <p className="text-sm text-muted-foreground">Trial</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Est. Revenue/bulan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Langganan</CardTitle>
                <CardDescription>
                  Kelola status dan detail langganan organisasi. Kebijakan streak aktif: target {policyThreshold} hari, grace period {policyGraceDays} hari.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void syncWithStreakPolicy()}
                  disabled={isSyncingPolicy || isLoading}
                >
                  {isSyncingPolicy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Flame className="h-4 w-4 mr-2" />
                  )}
                  Sinkron Kebijakan Streak
                </Button>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari organisasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisasi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kebijakan Streak</TableHead>
                      <TableHead className="text-center">Pegawai</TableHead>
                      <TableHead>Mulai</TableHead>
                      <TableHead>Berakhir</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Tidak ada data langganan
                        </TableCell>
                      </TableRow>
                    ) : (
                      subscriptions.map((sub) => {
                        const normalizedStatus = isSubscriptionStatus(sub.status)
                          ? sub.status
                          : DEFAULT_SUBSCRIPTION_STATUS;
                        return (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sub.tenant?.name || "-"}</p>
                                <p className="text-sm text-muted-foreground">{sub.tenant?.code}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusLabels[normalizedStatus].variant}>
                                {statusLabels[normalizedStatus].label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant={streakPolicyLabels[sub.streak_policy_status || "unknown"].variant}>
                                  {streakPolicyLabels[sub.streak_policy_status || "unknown"].label}
                                </Badge>
                                {sub.recommended_status && sub.recommended_status !== normalizedStatus && (
                                  <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Saran: {statusLabels[sub.recommended_status].label}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                {sub.employees_count}
                              </div>
                            </TableCell>
                            <TableCell>
                              {sub.start_date
                                ? format(new Date(sub.start_date), "d MMM yyyy", { locale: id })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {getPolicyEndDateLabel(sub, policyGraceDays)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Select
                                  value={normalizedStatus}
                                  onValueChange={(value) => void updateSubscriptionStatus(sub.id, value)}
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="trial">Trial</SelectItem>
                                    <SelectItem value="active">Aktif</SelectItem>
                                    <SelectItem value="expired">Expired</SelectItem>
                                    <SelectItem value="cancelled">Dibatalkan</SelectItem>
                                  </SelectContent>
                                </Select>
                                {sub.recommended_status && sub.recommended_status !== normalizedStatus && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void updateSubscriptionStatus(sub.id, sub.recommended_status as string)}
                                  >
                                    Terapkan
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
