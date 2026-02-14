import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, Calendar, XCircle, Briefcase, Heart } from "lucide-react";

interface AttendanceStatsProps {
  stats: {
    hadir: number;
    terlambat: number;
    izin: number;
    cuti: number;
    sakit: number;
    tidak_hadir: number;
    tugas_luar: number;
  };
}

export function AttendanceStats({ stats }: AttendanceStatsProps) {
  const statItems = [
    {
      label: "Hari Hadir",
      value: stats.hadir,
      icon: CheckCircle2,
      bgClass: "bg-success/10",
      iconClass: "text-success",
    },
    {
      label: "Terlambat",
      value: stats.terlambat,
      icon: Clock,
      bgClass: "bg-warning/10",
      iconClass: "text-warning",
    },
    {
      label: "Izin/Cuti",
      value: stats.izin + stats.cuti,
      icon: Calendar,
      bgClass: "bg-info/10",
      iconClass: "text-info",
    },
    {
      label: "Sakit",
      value: stats.sakit,
      icon: Heart,
      bgClass: "bg-destructive/10",
      iconClass: "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
  );
}
