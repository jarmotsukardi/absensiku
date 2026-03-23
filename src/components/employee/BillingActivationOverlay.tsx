import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, Loader2, X } from "lucide-react";
import { hasActiveIndividualBillingCoverage } from "@/lib/employeeBillingCoverage";

interface BillingActivationOverlayProps {
  tenantId: string;
  employeeId: string;
  billingMode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingActivationOverlay({
  tenantId,
  employeeId,
  billingMode,
  open,
  onOpenChange,
}: BillingActivationOverlayProps) {
  const navigate = useNavigate();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const checkPaymentStatus = useCallback(async () => {
    if (!open) return;
    setIsLoading(true);
    try {
      const hasAccess = await hasActiveIndividualBillingCoverage({
        tenantId,
        employeeId,
        billingMode,
      });
      if (hasAccess) {
        setIsBlocked(false);
        onOpenChange(false);
        return;
      }
      setIsBlocked(true);
    } catch (error) {
      const logId = `ERR-BILLING-OVERLAY-CHECK-${Date.now()}`;
      console.error(`[${logId}] Error checking payment`, error);
      setIsBlocked(true);
    } finally {
      setIsLoading(false);
    }
  }, [billingMode, employeeId, onOpenChange, open, tenantId]);

  useEffect(() => {
    void checkPaymentStatus();
  }, [checkPaymentStatus]);

  if (!open) return null;
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <Card className="w-full max-w-md mx-4 shadow-2xl">
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Memeriksa status pembayaran...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!isBlocked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 border-destructive/50 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="text-center pb-3 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Tutup overlay billing"
          >
            <X className="h-4 w-4" />
          </Button>
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
            <p>Silakan lanjut pembayaran lewat menu Billing. Anda tetap bisa menutup popup ini dulu.</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                navigate("/employee/billing", { replace: true });
              }}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Lakukan Pembayaran
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
