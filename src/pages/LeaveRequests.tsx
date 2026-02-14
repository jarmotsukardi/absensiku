import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEmployee } from "@/hooks/useEmployee";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { LeaveRequestForm } from "@/components/employee/LeaveRequestForm";
import { LeaveRequestList } from "@/components/employee/LeaveRequestList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, Clock, CheckCircle2, XCircle, MapPin } from "lucide-react";

const LeaveRequestsPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    <div className="min-h-screen bg-background pb-20">
      <header className="glass sticky top-0 z-50 h-16 flex items-center px-4 lg:px-8">
        <Link to="/employee/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span>Kembali</span>
        </Link>
        <div className="flex items-center gap-2 mx-auto">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="font-bold">Pengajuan Izin & Cuti</h1>
        </div>
        <div className="w-24" />
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
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

        <div className="mb-6">
          <LeaveRequestForm onSubmit={createLeaveRequest} isSubmitting={isSubmitting} />
        </div>

        <LeaveRequestList requests={leaveRequests} isLoading={requestsLoading} onCancel={cancelLeaveRequest} />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 md:hidden">
        <div className="flex items-center justify-around h-16">
          <Link to="/employee/dashboard" className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors">
            <MapPin className="w-5 h-5" />
            <span className="text-xs">Absen</span>
          </Link>
          <Link to="/attendance-history" className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors">
            <Clock className="w-5 h-5" />
            <span className="text-xs">Riwayat</span>
          </Link>
          <Link to="/leave-requests" className="flex flex-col items-center justify-center gap-1 text-primary">
            <FileText className="w-5 h-5" />
            <span className="text-xs">Pengajuan</span>
          </Link>
        </div>
      </nav>
    </div>
  );
};

export default LeaveRequestsPage;
