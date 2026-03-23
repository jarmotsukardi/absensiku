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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Label } from "@/components/ui/label";
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
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { id } from "date-fns/locale";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
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
const SUBSCRIPTIONS_QUERY_TIMEOUT_MS = 12000;
const SUBSCRIPTIONS_QUERY_RETRY_MAX = 2;

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
  price_per_employee?: number | null;
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
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "amount" in raw) {
    const nested = (raw as Record<string, unknown>).amount;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [policyThreshold, setPolicyThreshold] = useState(30);
  const [policyGraceDays, setPolicyGraceDays] = useState(7);
  const [defaultPricePerEmployee, setDefaultPricePerEmployee] = useState(15000);
  const [isSyncingPolicy, setIsSyncingPolicy] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    trial: 0,
    active: 0,
    expired: 0,
    totalRevenue: 0,
  });

  const fetchSubscriptions = useCallback(async () => {
    setLoadError(null);
    try {
      setIsLoading(true);
      setIsRetrying(false);
      const { error: syncPolicyError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("sync_streak_subscription_status", {}),
            SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
            "admin.subscriptions.sync_policy_pre_fetch timeout"
          ),
        {
          maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (syncPolicyError) {
        reportError(syncPolicyError, "admin.subscriptions.sync_policy_status_pre_fetch");
      }
      let tenantIds: string[] | null = null;
      if (searchQuery.trim()) {
        const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
        const { data: tenantRows, error: tenantSearchError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("tenants")
                .select("id")
                .or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%`),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.search_tenants timeout"
            ),
          {
            maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
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

      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
            "admin.subscriptions.fetch_page timeout"
          ),
        {
          maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      setTotalCount(count || 0);

      const tenantIdsInPage = [...new Set((data || []).map((sub) => sub.tenant_id))];

      const [subsWithCounts, streakRes, settingsRes, billingPriceRes] = await Promise.all([
        Promise.all(
          (data || []).map(async (sub: Subscription) => {
            const { count, error: countError } = await withExponentialBackoff(
              () =>
                withTimeout(
                  supabase
                    .from("employees")
                    .select("*", { count: "exact", head: true })
                    .eq("tenant_id", sub.tenant_id),
                  SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
                  "admin.subscriptions.fetch_employee_count timeout"
                ),
              {
                maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              }
            );

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
          ? withExponentialBackoff(
              () =>
                withTimeout(
                  supabase
                    .from("stability_streaks")
                    .select("tenant_id, streak_count, status, reached_target, reached_target_at, grace_period_end")
                    .in("tenant_id", tenantIdsInPage),
                  SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
                  "admin.subscriptions.fetch_streaks timeout"
                ),
              {
                maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              }
            )
          : Promise.resolve({ data: [], error: null }),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("system_settings")
                .select("key, value")
                .in("key", ["streak_threshold", "streak_grace_period_days"]),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.fetch_streak_settings timeout"
            ),
          {
            maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("billing_settings")
                .select("setting_value")
                .eq("setting_key", "price_per_employee")
                .maybeSingle(),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.fetch_default_price timeout"
            ),
          {
            maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
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

      if (billingPriceRes.error) {
        reportError(billingPriceRes.error, "admin.subscriptions.fetch_default_price_per_employee");
      } else {
        const parsedDefault = Math.max(
          1,
          Math.floor(getNumericSettingValue((billingPriceRes.data as { setting_value?: unknown } | null)?.setting_value, 15000))
        );
        setDefaultPricePerEmployee(parsedDefault);
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
      const [{ count: total }, { count: trial }, { count: active }, { count: expired }] = await Promise.all([
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("subscriptions")
                .select("id", { count: "exact", head: true }),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.stats.total timeout"
            ),
          { maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("subscriptions")
                .select("id", { count: "exact", head: true })
                .eq("status", "trial"),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.stats.trial timeout"
            ),
          { maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("subscriptions")
                .select("id", { count: "exact", head: true })
                .eq("status", "active"),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.stats.active timeout"
            ),
          { maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("subscriptions")
                .select("id", { count: "exact", head: true })
                .eq("status", "expired"),
              SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
              "admin.subscriptions.stats.expired timeout"
            ),
          { maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX, shouldRetry: isRetryableError, onRetry: () => setIsRetrying(true) }
        ),
      ]);

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
      const message = appendErrorReference("Gagal memuat data langganan", errorRef);
      toast.error(message);
      setLoadError(message);
      setSubscriptions([]);
      setTotalCount(0);
      setStats({
        total: 0,
        trial: 0,
        active: 0,
        expired: 0,
        totalRevenue: 0,
      });
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

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalCount]);

  const updateSubscriptionStatus = async (
    subId: string,
    newStatus: string,
    options?: { silentSuccess?: boolean; silentError?: boolean }
  ) => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("subscriptions")
              .update({ status: newStatus as SubscriptionStatus })
              .eq("id", subId)
              .select("id")
              .maybeSingle(),
            SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
            "admin.subscriptions.update_status timeout"
          ),
        {
          maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

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

  const openPriceDialog = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    const currentPrice =
      typeof subscription.price_per_employee === "number" && subscription.price_per_employee > 0
        ? subscription.price_per_employee
        : defaultPricePerEmployee;
    setEditingPriceValue(String(Math.floor(currentPrice)));
    setPriceDialogOpen(true);
  };

  const saveNegotiatedPrice = async () => {
    if (!editingSubscription) return;

    const parsed = Number(editingPriceValue.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Harga per pegawai harus berupa angka lebih dari 0");
      return;
    }

    setIsSavingPrice(true);
    try {
      setIsRetrying(false);
      const normalized = Math.floor(parsed);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("subscriptions")
              .update({ price_per_employee: normalized })
              .eq("id", editingSubscription.id)
              .select("id")
              .maybeSingle(),
            SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
            "admin.subscriptions.save_negotiated_price timeout"
          ),
        {
          maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error || !data?.id) {
        throw error || new Error("Gagal menyimpan harga negosiasi");
      }

      toast.success("Harga negosiasi B2B berhasil disimpan");
      setPriceDialogOpen(false);
      setEditingSubscription(null);
      await fetchSubscriptions();
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.save_negotiated_price", {
        subscription_id: editingSubscription.id,
      });
      toast.error(appendErrorReference("Gagal menyimpan harga negosiasi", errorRef));
    } finally {
      setIsSavingPrice(false);
    }
  };

  const resetNegotiatedPrice = async () => {
    if (!editingSubscription) return;

    setIsSavingPrice(true);
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("subscriptions")
              .update({ price_per_employee: null })
              .eq("id", editingSubscription.id)
              .select("id")
              .maybeSingle(),
            SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
            "admin.subscriptions.reset_negotiated_price timeout"
          ),
        {
          maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error || !data?.id) {
        throw error || new Error("Gagal reset harga negosiasi");
      }

      toast.success("Harga negosiasi direset ke harga default");
      setPriceDialogOpen(false);
      setEditingSubscription(null);
      await fetchSubscriptions();
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.reset_negotiated_price", {
        subscription_id: editingSubscription.id,
      });
      toast.error(appendErrorReference("Gagal reset harga negosiasi", errorRef));
    } finally {
      setIsSavingPrice(false);
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
      setIsRetrying(false);
      const results = await Promise.allSettled(
        syncTargets.map(async (sub) => {
          const targetStatus = sub.recommended_status || DEFAULT_SUBSCRIPTION_STATUS;
          const { data, error } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("subscriptions")
                  .update({ status: targetStatus })
                  .eq("id", sub.id)
                  .select("id")
                  .maybeSingle(),
                SUBSCRIPTIONS_QUERY_TIMEOUT_MS,
                "admin.subscriptions.sync_streak_policy timeout"
              ),
            {
              maxRetries: SUBSCRIPTIONS_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          );

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
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const exportSubscriptionsCsv = () => {
    try {
      const headers = [
        "nama_organisasi",
        "kode_organisasi",
        "status_langganan",
        "kebijakan_streak",
        "pegawai",
        "harga_per_pegawai",
        "mulai",
        "berakhir",
      ];

      const rows = subscriptions.map((sub) => {
        const normalizedStatus = isSubscriptionStatus(sub.status) ? sub.status : DEFAULT_SUBSCRIPTION_STATUS;
        const streakLabel = streakPolicyLabels[sub.streak_policy_status || "unknown"].label;
        const startLabel = sub.start_date
          ? format(new Date(sub.start_date), "yyyy-MM-dd")
          : "-";
        const endLabel = getPolicyEndDateLabel(sub, policyGraceDays);

        return [
          sub.tenant?.name || "-",
          sub.tenant?.code || "-",
          statusLabels[normalizedStatus].label,
          streakLabel,
          String(sub.employees_count ?? 0),
          String(
            typeof sub.price_per_employee === "number" && sub.price_per_employee > 0
              ? Math.floor(sub.price_per_employee)
              : defaultPricePerEmployee
          ),
          startLabel,
          endLabel,
        ];
      });

      const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => csvEscape(cell)).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast.success(`Export berhasil (${rows.length} baris)`);
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.export_csv", {
        rows: subscriptions.length,
      });
      toast.error(appendErrorReference("Gagal export data langganan", errorRef));
    }
  };

  return (
    <SuperAdminLayout
      title="Manajemen Langganan"
      subtitle="Kelola subscription dan billing organisasi"
    >
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat data langganan...
          </div>
        )}
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
                <Button variant="outline" onClick={exportSubscriptionsCsv} disabled={isLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>{loadError}</span>
                <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchSubscriptions()}>
                  Coba Lagi
                </Button>
              </div>
            )}
            <div className="mb-6 rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari organisasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
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
                      <TableHead>Harga / Pegawai</TableHead>
                      <TableHead>Mulai</TableHead>
                      <TableHead>Berakhir</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Tidak ada data langganan
                        </TableCell>
                      </TableRow>
                    ) : (
                      subscriptions.map((sub) => {
                        const normalizedStatus = isSubscriptionStatus(sub.status)
                          ? sub.status
                          : DEFAULT_SUBSCRIPTION_STATUS;
                        const isCustomPrice =
                          typeof sub.price_per_employee === "number" &&
                          Number.isFinite(sub.price_per_employee) &&
                          sub.price_per_employee > 0;
                        const effectivePrice = isCustomPrice
                          ? Number(sub.price_per_employee)
                          : defaultPricePerEmployee;
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
                              <div className="space-y-1">
                                <p className="font-medium">{formatCurrency(effectivePrice)}</p>
                                <Badge variant={isCustomPrice ? "default" : "outline"}>
                                  {isCustomPrice ? "Negosiasi B2B" : "Default Global"}
                                </Badge>
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openPriceDialog(sub)}
                                >
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  Harga
                                </Button>
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
                <p className="mb-2 text-sm text-muted-foreground">
                  Menampilkan {totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} -{" "}
                  {Math.min(currentPage * PAGE_SIZE, totalCount)} dari {totalCount} langganan
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => {
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => {
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
        <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Harga Negosiasi B2B</DialogTitle>
              <DialogDescription>
                Atur harga per pegawai khusus tenant. Jika direset, sistem kembali memakai harga default global.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">{editingSubscription?.tenant?.name || "-"}</p>
                <p className="text-muted-foreground">{editingSubscription?.tenant?.code || "-"}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="negotiated-price">Harga per pegawai (IDR)</Label>
                <Input
                  id="negotiated-price"
                  inputMode="numeric"
                  value={editingPriceValue}
                  onChange={(event) => setEditingPriceValue(event.target.value)}
                  placeholder="contoh: 14000"
                />
                <p className="text-xs text-muted-foreground">
                  Default global saat ini: {formatCurrency(defaultPricePerEmployee)}
                </p>
              </div>
            </div>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Reset akan mengembalikan tenant ke harga default global.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto bg-white"
                  onClick={() => void resetNegotiatedPrice()}
                  disabled={isSavingPrice}
                >
                  Reset ke Default
                </Button>
                <Button className="w-full sm:w-auto sm:min-w-[170px]" onClick={() => void saveNegotiatedPrice()} disabled={isSavingPrice}>
                  {isSavingPrice ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Simpan Harga
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PageGlossarySection preset="admin_subscription_management" />
      </div>
    </SuperAdminLayout>
  );
}
