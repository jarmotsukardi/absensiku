import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE,
  LATE_PERMISSION_REASON_PREFIX,
  isAutoCanceledLatePermissionRejectionReason,
  parseLatePermissionReason,
} from "@/lib/latePermissionRequest";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

interface LatePermissionRequestRow {
  id: string;
  start_date: string;
  reason: string;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

interface LatePermissionRequestListProps {
  employeeId: string;
  refreshTrigger?: number;
}

export function LatePermissionRequestList({ employeeId, refreshTrigger }: LatePermissionRequestListProps) {
  const [requests, setRequests] = useState<LatePermissionRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, start_date, reason, status, rejection_reason, created_at")
        .eq("employee_id", employeeId)
        .eq("leave_type", "izin")
        .ilike("reason", `${LATE_PERMISSION_REASON_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setRequests((data ?? []) as LatePermissionRequestRow[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "employee.late_permission.fetch", {
        employee_id: employeeId,
      });
      toast.error(appendErrorReference("Gagal memuat riwayat izin terlambat", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, refreshTrigger]);

  const renderStatusBadge = (status: string | null, rejectionReason: string | null) => {
    if (status === "disetujui") {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-300">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Disetujui
        </Badge>
      );
    }
    if (status === "ditolak") {
      if (isAutoCanceledLatePermissionRejectionReason(rejectionReason)) {
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300">
            <XCircle className="mr-1 h-3 w-3" />
            Batal Otomatis
          </Badge>
        );
      }
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
        <CardContent className="py-8 text-center text-muted-foreground">Memuat riwayat izin terlambat...</CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Riwayat Izin Terlambat
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center text-muted-foreground">Belum ada pengajuan izin terlambat</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Riwayat Izin Terlambat
        </CardTitle>
        <CardDescription>{requests.length} pengajuan terakhir</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((request) => {
          const parsedReason = parseLatePermissionReason(request.reason);
          return (
            <div key={request.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {format(new Date(request.start_date), "EEEE, dd MMM yyyy", { locale: localeId })}
                </p>
                {renderStatusBadge(request.status, request.rejection_reason)}
              </div>
              <p className="text-xs text-muted-foreground">
                Estimasi tiba: {parsedReason.estimatedArrivalTime ?? "-"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{parsedReason.reason || "-"}</p>
              {request.status === "ditolak" && request.rejection_reason && (
                <p
                  className={`mt-1 text-xs ${
                    isAutoCanceledLatePermissionRejectionReason(request.rejection_reason)
                      ? "text-amber-700"
                      : "text-red-500"
                  }`}
                >
                  {isAutoCanceledLatePermissionRejectionReason(request.rejection_reason)
                    ? `Keterangan: ${AUTO_CANCEL_ON_TIME_REJECTION_MESSAGE}`
                    : `Alasan ditolak: ${request.rejection_reason}`}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
