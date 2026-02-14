import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  FileText,
  Home,
  Timer,
  UserCog,
  MapPinOff,
  X,
} from "lucide-react";
import { differenceInHours } from "date-fns";

interface OverdueItem {
  type: "leave" | "overtime" | "wfh" | "flexible" | "mutation";
  count: number;
  oldestHours: number;
  path: string;
  label: string;
  icon: React.ElementType;
}

const OVERDUE_THRESHOLD_HOURS = 48; // 2 hari

export function OverdueRequestsOverlay({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const [overdueItems, setOverdueItems] = useState<OverdueItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (tenantId) {
      checkOverdueRequests();
    }
  }, [tenantId]);

  const checkOverdueRequests = async () => {
    const now = new Date();
    const items: OverdueItem[] = [];

    try {
      // Cek leave requests menunggu
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("id, created_at")
        .eq("status", "menunggu");

      if (leaves && leaves.length > 0) {
        const overdue = leaves.filter(
          (l) => differenceInHours(now, new Date(l.created_at)) >= OVERDUE_THRESHOLD_HOURS
        );
        if (overdue.length > 0) {
          const oldestHours = Math.max(
            ...overdue.map((l) => differenceInHours(now, new Date(l.created_at)))
          );
          items.push({
            type: "leave",
            count: overdue.length,
            oldestHours,
            path: "/org/leave/requests",
            label: "Pengajuan Cuti/Izin",
            icon: FileText,
          });
        }
      }

      // Cek overtime requests menunggu
      const { data: overtimes } = await supabase
        .from("overtime_requests")
        .select("id, created_at")
        .eq("status", "menunggu");

      if (overtimes && overtimes.length > 0) {
        const overdue = overtimes.filter(
          (o) => differenceInHours(now, new Date(o.created_at)) >= OVERDUE_THRESHOLD_HOURS
        );
        if (overdue.length > 0) {
          const oldestHours = Math.max(
            ...overdue.map((o) => differenceInHours(now, new Date(o.created_at)))
          );
          items.push({
            type: "overtime",
            count: overdue.length,
            oldestHours,
            path: "/org/leave/overtime",
            label: "Pengajuan Lembur",
            icon: Timer,
          });
        }
      }

      // Cek WFH requests menunggu
      const { data: wfhs } = await supabase
        .from("wfh_requests")
        .select("id, created_at")
        .eq("status", "menunggu");

      if (wfhs && wfhs.length > 0) {
        const overdue = wfhs.filter(
          (w) => differenceInHours(now, new Date(w.created_at)) >= OVERDUE_THRESHOLD_HOURS
        );
        if (overdue.length > 0) {
          const oldestHours = Math.max(
            ...overdue.map((w) => differenceInHours(now, new Date(w.created_at)))
          );
          items.push({
            type: "wfh",
            count: overdue.length,
            oldestHours,
            path: "/org/leave/wfh",
            label: "Pengajuan WFH",
            icon: Home,
          });
        }
      }

      // Cek mutation requests menunggu
      const { data: mutations } = await supabase
        .from("mutation_requests")
        .select("id, created_at")
        .eq("status", "menunggu")
        .eq("tenant_id", tenantId);

      if (mutations && mutations.length > 0) {
        const overdue = mutations.filter(
          (m) => differenceInHours(now, new Date(m.created_at)) >= OVERDUE_THRESHOLD_HOURS
        );
        if (overdue.length > 0) {
          const oldestHours = Math.max(
            ...overdue.map((m) => differenceInHours(now, new Date(m.created_at)))
          );
          items.push({
            type: "mutation",
            count: overdue.length,
            oldestHours,
            path: "/org/employees/mutations",
            label: "Permohonan Mutasi",
            icon: UserCog,
          });
        }
      }

      setOverdueItems(items);
      setIsVisible(items.length > 0);
    } catch (error) {
      console.error("Error checking overdue requests:", error);
    }
  };

  if (!isVisible || overdueItems.length === 0) return null;

  const totalOverdue = overdueItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg mx-4 border-destructive/50 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-destructive/10 animate-pulse">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-lg text-destructive">
                {totalOverdue} Pengajuan Membutuhkan Tindakan!
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Pengajuan berikut telah melewati batas waktu 48 jam tanpa tindakan.
                Harap segera approve atau tolak.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {overdueItems.map((item) => (
            <button
              key={item.type}
              onClick={() => {
                setIsVisible(false);
                navigate(item.path);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
            >
              <item.icon className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  Tertunda {Math.floor(item.oldestHours / 24)} hari {item.oldestHours % 24} jam
                </p>
              </div>
              <Badge variant="destructive" className="flex-shrink-0">
                {item.count}
              </Badge>
            </button>
          ))}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground text-center mb-3">
              Overlay ini akan hilang setelah semua pengajuan overdue ditindaklanjuti.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsVisible(false)}
            >
              <Clock className="h-4 w-4 mr-2" />
              Tindaklanjuti Nanti (overlay akan muncul kembali)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
