import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Flame, CheckCircle2, Clock, Zap, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ManualPaymentFlow } from "@/components/org/ManualPaymentFlow";

interface StabilityStreakWidgetProps {
  tenantId: string;
  tenantName?: string;
  currentEmployeeCount?: number;
  subscriptionId?: string;
}

interface StreakData {
  streak_count: number;
  status: string;
  reached_target: boolean;
  grace_period_end: string | null;
  last_activity_date: string | null;
}

export function StabilityStreakWidget({ tenantId, tenantName, currentEmployeeCount, subscriptionId }: StabilityStreakWidgetProps) {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [streakThreshold, setStreakThreshold] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  useEffect(() => {
    const fetchStreakAndThreshold = async () => {
      const [streakRes, thresholdRes] = await Promise.all([
        supabase
          .from("stability_streaks")
          .select("streak_count, status, reached_target, grace_period_end, last_activity_date")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "streak_threshold")
          .maybeSingle(),
      ]);

      setStreak(streakRes.data);

      const rawThreshold = (thresholdRes.data?.value as { value?: unknown } | null)?.value;
      const parsedThreshold = Math.floor(Number(rawThreshold));
      if (Number.isFinite(parsedThreshold) && parsedThreshold > 0) {
        setStreakThreshold(parsedThreshold);
      }

      setIsLoading(false);
    };

    if (tenantId) fetchStreakAndThreshold();
  }, [tenantId]);

  if (isLoading || !streak) return null;

  const safeThreshold = streakThreshold > 0 ? streakThreshold : 30;
  const progress = Math.min((streak.streak_count / safeThreshold) * 100, 100);
  const isComplete = streak.reached_target;
  const isGracePeriod = streak.status === "ready_for_invoicing" || streak.status === "grace_period";
  const showPayButton = isComplete || isGracePeriod;

  return (
    <>
      <Card className={cn(
        "border-l-4 transition-all",
        isComplete ? "border-l-green-500" : "border-l-primary"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Flame className={cn("w-5 h-5", streak.streak_count > 0 ? "text-orange-500" : "text-muted-foreground")} />
              )}
              <h4 className="font-semibold text-sm">Stability Streak</h4>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-lg font-bold text-primary">{streak.streak_count}</span>
              <span className="text-xs text-muted-foreground">/ {safeThreshold} hari</span>
            </div>
          </div>

          <Progress value={progress} className="h-2 mb-2" />

          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {isComplete
                ? "🎉 Target tercapai! Silakan lakukan pembayaran."
                : isGracePeriod
                ? "Dalam masa tenggang pembayaran"
                : streak.streak_count === 0
                ? "Mulai gunakan absensi untuk memulai streak"
                : `${Math.max(safeThreshold - streak.streak_count, 0)} hari lagi untuk aktivasi`}
            </p>
            {isGracePeriod && streak.grace_period_end && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Clock className="w-3 h-3" />
                <span>s.d. {new Date(streak.grace_period_end).toLocaleDateString("id-ID")}</span>
              </div>
            )}
          </div>

          {showPayButton && (
            <Button
              className="w-full mt-3"
              size="sm"
              onClick={() => setShowPaymentDialog(true)}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Bayar Langganan
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pembayaran Langganan</DialogTitle>
            <DialogDescription>
              Pilih paket dan lakukan pembayaran manual via transfer bank
            </DialogDescription>
          </DialogHeader>
          <ManualPaymentFlow
            tenantId={tenantId}
            tenantName={tenantName || ""}
            currentEmployeeCount={currentEmployeeCount || 5}
            subscriptionId={subscriptionId}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
