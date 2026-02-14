import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEmployee } from "@/hooks/useEmployee";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { LeaveRequestForm } from "@/components/employee/LeaveRequestForm";
import { LeaveRequestList } from "@/components/employee/LeaveRequestList";
import { FlexibleAttendanceRequestForm } from "@/components/employee/FlexibleAttendanceRequestForm";
import { FlexibleAttendanceRequestList } from "@/components/employee/FlexibleAttendanceRequestList";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle2, XCircle, MapPin, FileText, MapPinOff } from "lucide-react";

export default function DashboardLeaveRequests() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshFlexible, setRefreshFlexible] = useState(0);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (!session?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const { employee } = useEmployee(user);
  const { leaveRequests, stats, isLoading: requestsLoading, isSubmitting, createLeaveRequest, cancelLeaveRequest } = useLeaveRequests(employee?.id || null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <MapPin className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  const statItems = [
    { label: "Menunggu", value: stats.pending, icon: Clock, bgClass: "bg-warning/10", iconClass: "text-warning" },
    { label: "Disetujui", value: stats.approved, icon: CheckCircle2, bgClass: "bg-success/10", iconClass: "text-success" },
    { label: "Ditolak", value: stats.rejected, icon: XCircle, bgClass: "bg-destructive/10", iconClass: "text-destructive" },
  ];

  return (
    <DashboardLayout title="Pengajuan Izin & Cuti" subtitle="Buat dan kelola pengajuan Anda">
      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="leave" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="leave" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Izin/Cuti
            </TabsTrigger>
            <TabsTrigger value="flexible" className="flex items-center gap-2">
              <MapPinOff className="h-4 w-4" />
              Absensi Khusus
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leave" className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {statItems.map((item, index) => (
                <Card key={index} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${item.bgClass} flex items-center justify-center`}>
                        <item.icon className={`w-5 h-5 ${item.iconClass}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{item.value}</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              <LeaveRequestForm onSubmit={createLeaveRequest} isSubmitting={isSubmitting} />
            </div>

            <LeaveRequestList requests={leaveRequests} isLoading={requestsLoading} onCancel={cancelLeaveRequest} />
          </TabsContent>

          <TabsContent value="flexible" className="space-y-6">
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <MapPinOff className="h-5 w-5 text-primary" />
                      Absensi Khusus
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ajukan permohonan untuk absensi dari lokasi manapun (tanpa geofence) untuk tugas dinas, rapat eksternal, atau kunjungan lapangan.
                    </p>
                  </div>
                  {employee?.id && employee?.tenant_id && (
                    <FlexibleAttendanceRequestForm 
                      employeeId={employee.id} 
                      tenantId={employee.tenant_id}
                      onSuccess={() => setRefreshFlexible(prev => prev + 1)}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {employee?.id && (
              <FlexibleAttendanceRequestList 
                employeeId={employee.id}
                refreshTrigger={refreshFlexible}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
