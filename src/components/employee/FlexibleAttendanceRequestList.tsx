import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPinOff, Clock, CheckCircle2, XCircle, Car, Users, MapPin, Briefcase, Building2 } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

// Mapping ikon untuk jenis alasan
const REASON_ICONS: Record<string, React.ElementType> = {
  dinas_luar: Car,
  rapat_eksternal: Users,
  kunjungan_lapangan: MapPin,
  tugas_pimpinan: Briefcase,
  kegiatan_instansi: Building2,
};

const REASON_LABELS: Record<string, string> = {
  dinas_luar: "Dinas Luar",
  rapat_eksternal: "Rapat Eksternal",
  kunjungan_lapangan: "Kunjungan Lapangan",
  tugas_pimpinan: "Tugas Pimpinan",
  kegiatan_instansi: "Kegiatan Instansi",
};

interface FlexibleAttendanceRequest {
  id: string;
  request_date: string;
  reason_type: string;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

interface FlexibleAttendanceRequestListProps {
  employeeId: string;
  refreshTrigger?: number;
}

export function FlexibleAttendanceRequestList({ employeeId, refreshTrigger }: FlexibleAttendanceRequestListProps) {
  const [requests, setRequests] = useState<FlexibleAttendanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flexible_attendance_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests, refreshTrigger]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-300">
            <Clock className="h-3 w-3 mr-1" />
            Menunggu
          </Badge>
        );
      case "disetujui":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Disetujui
          </Badge>
        );
      case "ditolak":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Ditolak
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Memuat permohonan...
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPinOff className="h-4 w-4" />
            Permohonan Absensi Khusus
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-4">
          Belum ada permohonan absensi khusus
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPinOff className="h-4 w-4" />
          Permohonan Absensi Khusus
        </CardTitle>
        <CardDescription>
          {requests.length} permohonan terakhir
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((request) => {
          const Icon = REASON_ICONS[request.reason_type] || MapPinOff;
          return (
            <div
              key={request.id}
              className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {format(new Date(request.request_date), "EEEE, dd MMM yyyy", { locale: localeId })}
                    </span>
                    {getStatusBadge(request.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {REASON_LABELS[request.reason_type] || request.reason_type}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {request.reason}
                  </p>
                  {request.status === "ditolak" && request.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1">
                      Alasan ditolak: {request.rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
