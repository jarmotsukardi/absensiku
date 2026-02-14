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
import { format, formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

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
  offices: "Kantor",
  holidays: "Hari Libur",
};

const actionLabels: Record<string, string> = {
  INSERT: "Menambahkan",
  UPDATE: "Mengubah",
  DELETE: "Menghapus",
};

export function RecentActivity() {
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id,
          action,
          table_name,
          created_at,
          employee:employees!audit_logs_employee_id_fkey(name)
        `)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setActivities((data as unknown as AuditLog[]) || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
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
      <CardHeader>
        <CardTitle className="text-base">Aktivitas Terkini</CardTitle>
        <CardDescription>Log aktivitas sistem terbaru</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada aktivitas</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = actionIcons[activity.action] || Activity;
                const actionColor = 
                  activity.action === "INSERT" ? "text-green-500 bg-green-500/10" :
                  activity.action === "DELETE" ? "text-red-500 bg-red-500/10" :
                  "text-blue-500 bg-blue-500/10";

                return (
                  <div key={activity.id} className="flex items-start gap-3">
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
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(activity.created_at), { 
                          addSuffix: true, 
                          locale: id 
                        })}
                      </p>
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