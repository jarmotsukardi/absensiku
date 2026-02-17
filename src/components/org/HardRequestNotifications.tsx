import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  BellRing,
  Briefcase,
  CalendarCheck2,
  FileText,
  Home,
  Loader2,
  MapPinOff,
  RefreshCw,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { getTenantEmployeeIds } from "@/lib/orgTenantContext";

type RequestType = "leave" | "wfh" | "overtime" | "flexible" | "mutation";

interface PendingCounts {
  leave: number;
  wfh: number;
  overtime: number;
  flexible: number;
  mutation: number;
}

interface RecentSubmission {
  id: string;
  employee_id: string | null;
  created_at: string;
  requestType: RequestType;
}

interface RecentSubmissionView extends RecentSubmission {
  employee_name: string;
}

interface RequestMeta {
  label: string;
  path: string;
  icon: React.ElementType;
}

const REQUEST_ORDER: RequestType[] = ["leave", "wfh", "overtime", "flexible", "mutation"];

const REQUEST_META: Record<RequestType, RequestMeta> = {
  leave: {
    label: "Izin/Cuti",
    path: "/org/leave/requests",
    icon: FileText,
  },
  wfh: {
    label: "WFH",
    path: "/org/leave/wfh",
    icon: Home,
  },
  overtime: {
    label: "Lembur",
    path: "/org/leave/overtime",
    icon: Briefcase,
  },
  flexible: {
    label: "Absensi Khusus",
    path: "/org/leave/flexible",
    icon: MapPinOff,
  },
  mutation: {
    label: "Mutasi/Perubahan Data",
    path: "/org/employees/mutations",
    icon: UserCog,
  },
};

const EMPTY_COUNTS: PendingCounts = {
  leave: 0,
  wfh: 0,
  overtime: 0,
  flexible: 0,
  mutation: 0,
};

const DAILY_SESSION_KEY_PREFIX = "org:hard-request-notif:seen";
const FETCH_ERROR_SESSION_KEY_PREFIX = "org:hard-request-notif:fetch-error";
const REALTIME_ERROR_SESSION_KEY_PREFIX = "org:hard-request-notif:realtime-error";

function showToastOncePerSession(
  sessionKey: string,
  cb: () => void,
) {
  try {
    if (sessionStorage.getItem(sessionKey) === "1") return;
    cb();
    sessionStorage.setItem(sessionKey, "1");
  } catch {
    cb();
  }
}

async function fetchPendingCount(tenantId: string, requestType: RequestType, employeeIds: string[]): Promise<number> {
  switch (requestType) {
    case "leave": {
      if (employeeIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .in("employee_id", employeeIds)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    case "wfh": {
      if (employeeIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("wfh_requests")
        .select("id", { count: "exact", head: true })
        .in("employee_id", employeeIds)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    case "overtime": {
      const { count, error } = await supabase
        .from("overtime_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "menunggu"]);
      if (error) throw error;
      return count || 0;
    }
    case "flexible": {
      const { count, error } = await supabase
        .from("flexible_attendance_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    case "mutation": {
      const { count, error } = await supabase
        .from("mutation_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu");
      if (error) throw error;
      return count || 0;
    }
    default:
      return 0;
  }
}

async function fetchLatestSubmissions(tenantId: string, requestType: RequestType, employeeIds: string[]): Promise<RecentSubmission[]> {
  switch (requestType) {
    case "leave": {
      if (employeeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, employee_id, created_at")
        .in("employee_id", employeeIds)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "wfh": {
      if (employeeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("wfh_requests")
        .select("id, employee_id, created_at")
        .in("employee_id", employeeIds)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "overtime": {
      const { data, error } = await supabase
        .from("overtime_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "menunggu"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "flexible": {
      const { data, error } = await supabase
        .from("flexible_attendance_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    case "mutation": {
      const { data, error } = await supabase
        .from("mutation_requests")
        .select("id, employee_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "menunggu")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row) => ({ ...row, requestType }));
    }
    default:
      return [];
  }
}

export function HardRequestNotifications({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [recentItems, setRecentItems] = useState<RecentSubmissionView[]>([]);

  const totalPending = useMemo(
    () => counts.leave + counts.wfh + counts.overtime + counts.flexible + counts.mutation,
    [counts]
  );

  const fetchAlerts = useCallback(
    async (opts?: { forceOpen?: boolean }) => {
      if (!tenantId) {
        setCounts(EMPTY_COUNTS);
        setRecentItems([]);
        setIsBootstrapped(true);
        return;
      }

      setIsLoading(true);
      try {
        let employeeIds: string[] = [];
        try {
          employeeIds = await getTenantEmployeeIds(tenantId);
        } catch (employeeIdError) {
          reportError(employeeIdError, "org.hard_request_notifications.fetch_employee_ids", {
            tenant_id: tenantId,
          });
          employeeIds = [];
        }

        const perType = await Promise.all(
          REQUEST_ORDER.map(async (type) => {
            const [countResult, latestResult] = await Promise.allSettled([
              fetchPendingCount(tenantId, type, employeeIds),
              fetchLatestSubmissions(tenantId, type, employeeIds),
            ]);

            if (countResult.status === "rejected") {
              reportError(countResult.reason, "org.hard_request_notifications.fetch_count", {
                tenant_id: tenantId,
                request_type: type,
              });
            }
            if (latestResult.status === "rejected") {
              reportError(latestResult.reason, "org.hard_request_notifications.fetch_latest", {
                tenant_id: tenantId,
                request_type: type,
              });
            }

            return {
              type,
              count: countResult.status === "fulfilled" ? countResult.value || 0 : 0,
              latest: latestResult.status === "fulfilled" ? latestResult.value || [] : [],
              hasError: countResult.status === "rejected" || latestResult.status === "rejected",
            };
          })
        );

        const nextCounts: PendingCounts = {
          leave: perType.find((item) => item.type === "leave")?.count || 0,
          wfh: perType.find((item) => item.type === "wfh")?.count || 0,
          overtime: perType.find((item) => item.type === "overtime")?.count || 0,
          flexible: perType.find((item) => item.type === "flexible")?.count || 0,
          mutation: perType.find((item) => item.type === "mutation")?.count || 0,
        };

        const merged = perType
          .flatMap((item) => item.latest)
          .flat()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20);

        const mergedEmployeeIds = Array.from(new Set(merged.map((row) => row.employee_id).filter(Boolean))) as string[];
        const employeeNameMap = new Map<string, string>();

        if (mergedEmployeeIds.length > 0) {
          const { data: employees, error: employeesError } = await supabase
            .from("employees")
            .select("id, name")
            .in("id", mergedEmployeeIds);
          if (employeesError) throw employeesError;
          (employees || []).forEach((row) => {
            employeeNameMap.set(row.id, row.name || "Pegawai");
          });
        }

        const viewItems: RecentSubmissionView[] = merged.map((row) => ({
          ...row,
          employee_name: (row.employee_id && employeeNameMap.get(row.employee_id)) || "Pegawai",
        }));

        const nextTotal =
          nextCounts.leave +
          nextCounts.wfh +
          nextCounts.overtime +
          nextCounts.flexible +
          nextCounts.mutation;

        setCounts(nextCounts);
        setRecentItems(viewItems);

        const todayKey = `${DAILY_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
        if (!isBootstrapped) {
          setIsBootstrapped(true);
          try {
            const alreadySeen = sessionStorage.getItem(todayKey) === "1";
            if (nextTotal > 0 && !alreadySeen) {
              setIsOpen(true);
              sessionStorage.setItem(todayKey, "1");
            }
          } catch {
            if (nextTotal > 0) setIsOpen(true);
          }
        }

        if (opts?.forceOpen && nextTotal > 0) {
          setIsOpen(true);
        }

        const partialFailures = perType.filter((item) => item.hasError);
        if (partialFailures.length > 0) {
          const errorRef = reportError(new Error("Sebagian sumber notifikasi pengajuan gagal dimuat"), "org.hard_request_notifications.partial_failure", {
            tenant_id: tenantId,
            failed_types: partialFailures.map((item) => item.type),
          });
          showToastOncePerSession(
            `${FETCH_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
            () =>
              toast.warning(
                appendErrorReference(
                  "Sebagian notifikasi pengajuan tidak dapat dimuat. Data yang tersedia tetap ditampilkan.",
                  errorRef
                )
              )
          );
        }
      } catch (error) {
        const errorRef = reportError(error, "org.hard_request_notifications.fetch", {
          tenant_id: tenantId,
        });
        showToastOncePerSession(
          `${FETCH_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
          () => toast.error(appendErrorReference("Gagal memuat notifikasi pengajuan keras", errorRef))
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isBootstrapped, tenantId]
  );

  useEffect(() => {
    setIsBootstrapped(false);
    void fetchAlerts();
  }, [tenantId, fetchAlerts]);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase.channel(`org-hard-request-alert-${tenantId}`);
    const register = (table: string, requestType: RequestType) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          void fetchAlerts({ forceOpen: payload.eventType === "INSERT" });
          if (payload.eventType === "INSERT") {
            const meta = REQUEST_META[requestType];
            toast.warning(`Pengajuan baru: ${meta.label}`, {
              description: "Perlu verifikasi Admin Organisasi.",
              duration: 5000,
            });
          }
        }
      );
    };

    register("leave_requests", "leave");
    register("wfh_requests", "wfh");
    register("overtime_requests", "overtime");
    register("flexible_attendance_requests", "flexible");
    register("mutation_requests", "mutation");

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        const errorRef = reportError(new Error("Realtime channel error"), "org.hard_request_notifications.realtime", {
          tenant_id: tenantId,
        });
        showToastOncePerSession(
          `${REALTIME_ERROR_SESSION_KEY_PREFIX}:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
          () =>
            toast.warning(
              appendErrorReference(
                "Realtime notifikasi pengajuan bermasalah. Silakan gunakan tombol Refresh sementara.",
                errorRef
              )
            )
        );
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts, tenantId]);

  if (!tenantId) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-12 rounded-full px-4 shadow-lg"
        variant={totalPending > 0 ? "destructive" : "default"}
      >
        <BellRing className="mr-2 h-4 w-4" />
        Alert Pengajuan
        <Badge className="ml-2 bg-white/20 text-white border-none">{totalPending}</Badge>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-3xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Notifikasi Keras Pengajuan/Permohonan
            </DialogTitle>
            <DialogDescription>
              Monitor seluruh pengajuan aktif yang perlu tindakan admin organisasi secepatnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {REQUEST_ORDER.map((type) => {
                const meta = REQUEST_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate(meta.path);
                    }}
                    className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Badge variant={counts[type] > 0 ? "destructive" : "secondary"}>{counts[type]}</Badge>
                    </div>
                    <p className="text-xs font-medium leading-tight">{meta.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
                Total pending: <span className="text-foreground">{totalPending}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchAlerts()}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>

            <div className="rounded-lg border">
              <div className="border-b px-3 py-2 text-sm font-medium">Pengajuan Terbaru</div>
              <ScrollArea className="h-72">
                <div className="divide-y">
                  {recentItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Tidak ada pengajuan pending saat ini.</p>
                  ) : (
                    recentItems.map((row) => {
                      const meta = REQUEST_META[row.requestType];
                      return (
                        <div key={`${row.requestType}-${row.id}`} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.employee_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {meta.label} •{" "}
                              {formatDistanceToNow(new Date(row.created_at), {
                                addSuffix: true,
                                locale: localeId,
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsOpen(false);
                              navigate(meta.path);
                            }}
                          >
                            Buka
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setIsOpen(false)}>
                Saya Mengerti
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
