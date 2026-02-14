import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, FileText, Calendar, Clock } from "lucide-react";
import { Link } from "react-router-dom";

interface QuickActionsCardProps {
  pendingRequests: number;
}

export function QuickActionsCard({ pendingRequests }: QuickActionsCardProps) {
  const actions = [
    {
      label: "Ajukan Izin",
      description: "Izin, sakit, atau keperluan lain",
      icon: FileText,
      href: "/dashboard/leave-requests",
      bgClass: "bg-info/10",
      iconClass: "text-info",
    },
    {
      label: "Ajukan Cuti",
      description: "Cuti tahunan atau cuti penting",
      icon: Calendar,
      href: "/dashboard/leave-requests",
      bgClass: "bg-accent/20",
      iconClass: "text-accent-foreground",
    },
    {
      label: "Riwayat Lengkap",
      description: "Lihat semua riwayat kehadiran",
      icon: Clock,
      href: "/dashboard/attendance-history",
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
    },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Aksi Cepat</CardTitle>
            <CardDescription>Ajukan izin, cuti, atau lihat riwayat</CardDescription>
          </div>
          {pendingRequests > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-warning/10 text-warning text-sm">
              <Clock className="w-4 h-4" />
              <span>{pendingRequests} menunggu</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action, index) => (
          <Link key={index} to={action.href}>
            <Button variant="outline" className="w-full justify-start h-auto py-4 hover:bg-muted/50">
              <div className={`w-10 h-10 rounded-xl ${action.bgClass} flex items-center justify-center mr-4`}>
                <action.icon className={`w-5 h-5 ${action.iconClass}`} />
              </div>
              <div className="text-left">
                <p className="font-semibold">{action.label}</p>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 ml-auto text-muted-foreground" />
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
