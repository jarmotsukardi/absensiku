import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  UserPlus, 
  Building2, 
  CreditCard, 
  Settings,
  LogIn,
  FileText,
  CheckCircle,
  XCircle,
  Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  created_at: string;
  employee: {
    name: string;
  } | null;
}

const actionIcons: Record<string, typeof Activity> = {
  INSERT: UserPlus,
  UPDATE: Settings,
  DELETE: XCircle,
};

const tableLabels: Record<string, string> = {
  tenants: "Organisasi",
  employees: "Pegawai",
  subscriptions: "Langganan",
  leave_requests: "Pengajuan Cuti",
  attendance_records: "Absensi",
  attendance_records_partitioned: "Absensi",
  offices: "Kantor",
  holidays: "Hari Libur",
  cron_job_logs: "Cron Job",
  invoices: "Invoice",
  feedback_reports: "Feedback",
};

const actionLabels: Record<string, string> = {
  INSERT: "Menambahkan",
  UPDATE: "Mengubah",
  DELETE: "Menghapus",
};
const RECENT_ACTIVITY_READ_TIMEOUT_MS = 12000;
const RECENT_ACTIVITY_MAX_RETRIES = 2;

export function RecentActivity() {
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("audit_logs")
              .select(`
                id,
                action,
                table_name,
                created_at,
                employee:employees!audit_logs_employee_id_fkey(name)
              `)
              .order("created_at", { ascending: false })
              .limit(10),
            RECENT_ACTIVITY_READ_TIMEOUT_MS,
            "Permintaan aktivitas terkini timeout."
          ),
        {
          maxRetries: RECENT_ACTIVITY_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setActivities((data as unknown as AuditLog[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.dashboard.recent_activity.fetch");
      const message = appendErrorReference("Gagal memuat aktivitas terkini", errorRef);
      setLoadError(message);
      toast.error(message);
      setActivities([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aktivitas Terkini</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-48"></div>
                  <div className="h-3 bg-muted rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Aktivitas Terkini</CardTitle>
          <Badge variant="outline">{activities.length} log</Badge>
        </div>
        <CardDescription>Log aktivitas sistem terbaru</CardDescription>
      </CardHeader>
      <CardContent>
        {loadError && (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchActivities()}>
              Coba Lagi
            </Button>
          </div>
        )}
        {isRetrying && (
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang memuat aktivitas...
          </div>
        )}
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada aktivitas</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2.5">
              {activities.map((activity) => {
                const Icon = actionIcons[activity.action] || Activity;
                const actionColor = 
                  activity.action === "INSERT" ? "text-green-500 bg-green-500/10" :
                  activity.action === "DELETE" ? "text-red-500 bg-red-500/10" :
                  "text-blue-500 bg-blue-500/10";
                const actionBadgeVariant =
                  activity.action === "DELETE"
                    ? "destructive"
                    : activity.action === "INSERT"
                      ? "default"
                      : "secondary";

                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                    <div className={`p-2 rounded-full ${actionColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {activity.employee?.name || "System"}
                        </span>
                        {" "}
                        <span className="text-muted-foreground">
                          {actionLabels[activity.action]?.toLowerCase() || activity.action}
                        </span>
                        {" "}
                        <span className="font-medium">
                          {tableLabels[activity.table_name] || activity.table_name}
                        </span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={actionBadgeVariant} className="text-[10px]">
                          {activity.action}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {tableLabels[activity.table_name] || activity.table_name}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.created_at), {
                            addSuffix: true,
                            locale: id,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
