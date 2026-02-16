import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";

interface BillingActivationOverlayProps {
  tenantId: string;
  employeeId: string;
  billingMode: string;
}

export function BillingActivationOverlay({ tenantId, employeeId, billingMode }: BillingActivationOverlayProps) {
  const navigate = useNavigate();
  const [hasPaid, setHasPaid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (billingMode === "individual") {
      checkPaymentStatus();
    } else {
      setHasPaid(true);
      setIsLoading(false);
    }
  }, [billingMode, employeeId, checkPaymentStatus]);

  const checkPaymentStatus = useCallback(async () => {
    const now = new Date();
    try {
      // Check latest subscription snapshot first.
      const { data: subscription, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select("status, end_date, grace_period_end")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) {
        const logId = `ERR-BILLING-OVERLAY-SUB-${Date.now()}`;
        console.error(`[${logId}] Failed to load subscription`, subscriptionError);
        setHasPaid(false);
        return;
      }

      if (subscription?.status === "expired" || subscription?.status === "cancelled") {
        setHasPaid(false);
        return;
      }

      if (subscription?.status === "active" && subscription?.end_date) {
        const endDate = new Date(subscription.end_date);
        if (endDate > now) {
          setHasPaid(true);
          return;
        }
      }

      // Check streak status as fallback.
      const { data: streak, error: streakError } = await supabase
        .from("stability_streaks")
        .select("status, reached_target, grace_period_end")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (streakError) {
        const logId = `ERR-BILLING-OVERLAY-STREAK-${Date.now()}`;
        console.error(`[${logId}] Failed to load streak`, streakError);
        setHasPaid(false);
        return;
      }

      if (streak?.status === "tracking" || !streak?.reached_target) {
        setHasPaid(true); // Still in free/tracking period
      } else if (streak?.grace_period_end) {
        setHasPaid(new Date(streak.grace_period_end) > now);
      } else {
        setHasPaid(false);
      }
    } catch (error) {
      const logId = `ERR-BILLING-OVERLAY-UNEXPECTED-${Date.now()}`;
      console.error(`[${logId}] Error checking payment`, error);
      setHasPaid(false);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  if (isLoading || hasPaid !== false) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 border-destructive/50 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto p-4 rounded-full bg-destructive/10 w-fit mb-3">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-destructive text-lg">
            Akses Terkunci
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Organisasi Anda menggunakan sistem <strong>Billing Mandiri</strong>.
            Anda perlu melakukan pembayaran untuk mengakses dashboard.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Status Pembayaran</span>
            </div>
            <Badge variant="destructive">Belum Dibayar</Badge>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            <p>Hubungi admin organisasi Anda atau lakukan pembayaran melalui menu Aktivasi untuk membuka akses.</p>
          </div>

          <Button
            className="w-full"
            onClick={() => {
              navigate("/employee/dashboard?tab=activation", { replace: true });
            }}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Lakukan Pembayaran
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
