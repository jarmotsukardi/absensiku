import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CheckCircle2, Clock, LogOut, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { EARLY_LEAVE_PERMISSION_REASON_PREFIX, parseEarlyLeavePermissionReason } from "@/lib/latePermissionRequest";

interface EarlyLeavePermissionRequestRow {
  id: string;
  start_date: string;
  reason: string;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

interface EarlyLeavePermissionRequestListProps {
  employeeId: string;
  refreshTrigger?: number;
}

export function EarlyLeavePermissionRequestList({ employeeId, refreshTrigger }: EarlyLeavePermissionRequestListProps) {
  const [requests, setRequests] = useState<EarlyLeavePermissionRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, start_date, reason, status, rejection_reason, created_at")
        .eq("employee_id", employeeId)
        .eq("leave_type", "izin")
        .ilike("reason", `${EARLY_LEAVE_PERMISSION_REASON_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setRequests((data ?? []) as EarlyLeavePermissionRequestRow[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "employee.early_leave_permission.fetch", {
        employee_id: employeeId,
      });
      toast.error(appendErrorReference("Gagal memuat riwayat izin pulang cepat", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, refreshTrigger]);

  const renderStatusBadge = (status: string | null) => {
    if (status === "disetujui") {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-300">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Disetujui
        </Badge>
      );
    }
    if (status === "ditolak") {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-300">
          <XCircle className="mr-1 h-3 w-3" />
          Ditolak
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-300">
        <Clock className="mr-1 h-3 w-3" />
        Menunggu
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Memuat riwayat izin pulang cepat...</CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Riwayat Izin Pulang Cepat
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center text-muted-foreground">Belum ada pengajuan izin pulang cepat</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LogOut className="h-4 w-4" />
          Riwayat Izin Pulang Cepat
        </CardTitle>
        <CardDescription>{requests.length} pengajuan terakhir</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((request) => {
          const parsedReason = parseEarlyLeavePermissionReason(request.reason);
          return (
            <div key={request.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {format(new Date(request.start_date), "EEEE, dd MMM yyyy", { locale: localeId })}
                </p>
                {renderStatusBadge(request.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                Rencana pulang: {parsedReason.plannedLeaveTime ?? "-"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{parsedReason.reason || "-"}</p>
              {request.status === "ditolak" && request.rejection_reason && (
                <p className="mt-1 text-xs text-red-500">Alasan ditolak: {request.rejection_reason}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
