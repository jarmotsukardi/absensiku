import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  Briefcase,
  Heart,
  Plane,
} from "lucide-react";

type LeaveRequest = Tables<"leave_requests">;

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  isLoading: boolean;
  onCancel: (id: string) => Promise<{ success: boolean; message: string }>;
}

const leaveTypeLabels: Record<string, { label: string; icon: React.ElementType }> = {
  izin: { label: "Izin", icon: FileText },
  cuti_tahunan: { label: "Cuti Tahunan", icon: Plane },
  cuti_penting: { label: "Cuti Penting", icon: Heart },
  cuti_lainnya: { label: "Cuti Lainnya", icon: Calendar },
  sakit: { label: "Sakit", icon: Heart },
  tugas_luar: { label: "Tugas Luar", icon: Briefcase },
};

export function LeaveRequestList({ requests, isLoading, onCancel }: LeaveRequestListProps) {
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    await onCancel(id);
    setCancelingId(null);
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { label: string; class: string; icon: React.ElementType }> = {
      menunggu: { label: "Menunggu", class: "bg-warning/10 text-warning border-warning/20", icon: Clock },
      disetujui: { label: "Disetujui", class: "status-hadir", icon: CheckCircle2 },
      ditolak: { label: "Ditolak", class: "status-tidak-hadir", icon: XCircle },
    };

    const { label, class: className, icon: Icon } = statusMap[status || "menunggu"] || statusMap.menunggu;

    return (
      <Badge variant="outline" className={className}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    );
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (startDate === endDate) {
      return format(start, "dd MMMM yyyy", { locale: id });
    }
    
    return `${format(start, "dd MMM", { locale: id })} - ${format(end, "dd MMM yyyy", { locale: id })}`;
  };

  const getDaysCount = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Riwayat Pengajuan</CardTitle>
          <CardDescription>Daftar pengajuan izin dan cuti</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-4 rounded-lg bg-muted/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                    <div className="h-3 w-32 bg-muted rounded" />
                  </div>
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Riwayat Pengajuan</CardTitle>
        <CardDescription>Daftar pengajuan izin dan cuti</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada pengajuan</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const typeInfo = leaveTypeLabels[request.leave_type] || leaveTypeLabels.izin;
              const Icon = typeInfo.icon;
              const daysCount = getDaysCount(request.start_date, request.end_date);

              return (
                <div
                  key={request.id}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-foreground">{typeInfo.label}</p>
                          {request.is_half_day && (
                            <Badge variant="secondary" className="text-xs">
                              Setengah Hari
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {formatDateRange(request.start_date, request.end_date)}
                          <span className="mx-1">•</span>
                          {daysCount} hari
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {request.reason}
                        </p>
                        {request.rejection_reason && (
                          <p className="text-sm text-destructive mt-1">
                            Alasan ditolak: {request.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(request.status)}
                      {request.status === "menunggu" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={cancelingId === request.id}
                            >
                              {cancelingId === request.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Batalkan"
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Batalkan Pengajuan?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Apakah Anda yakin ingin membatalkan pengajuan ini? Tindakan ini tidak dapat dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Tidak</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleCancel(request.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Ya, Batalkan
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
