import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard } from "lucide-react";

interface BillingActivationOverlayProps {
  tenantId: string;
  employeeId: string;
  billingMode: string;
}

interface EmployeeInvoiceSnapshot {
  id: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  package_duration_months: number | null;
  metadata?: unknown;
}

const parseMetadataScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const raw = metadata as Record<string, unknown>;
  return raw.billing_scope === "individual" ? "individual" : "centralized";
};

const parseMetadataEmployeeId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = metadata as Record<string, unknown>;
  if (typeof raw.employee_id === "string" && raw.employee_id.trim().length > 0) {
    return raw.employee_id.trim();
  }
  return null;
};

const computeCoverageEnd = (paidInvoices: EmployeeInvoiceSnapshot[]): Date | null => {
  if (paidInvoices.length === 0) return null;

  const sorted = [...paidInvoices].sort((a, b) => {
    const aTime = Date.parse(a.paid_at || a.created_at);
    const bTime = Date.parse(b.paid_at || b.created_at);
    return aTime - bTime;
  });

  let coverageEnd: Date | null = null;
  for (const invoice of sorted) {
    const baseStart = new Date(invoice.paid_at || invoice.created_at);
    if (Number.isNaN(baseStart.getTime())) continue;
    const startAt =
      coverageEnd && coverageEnd.getTime() > baseStart.getTime() ? new Date(coverageEnd) : baseStart;
    const endAt = new Date(startAt);
    endAt.setMonth(endAt.getMonth() + Math.max(1, invoice.package_duration_months || 1));
    coverageEnd = endAt;
  }

  return coverageEnd;
};

export function BillingActivationOverlay({ tenantId, employeeId, billingMode }: BillingActivationOverlayProps) {
  const navigate = useNavigate();
  const [hasPaid, setHasPaid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkPaymentStatus = useCallback(async () => {
    if (billingMode !== "individual") {
      setHasPaid(true);
      setIsLoading(false);
      return;
    }

    const now = new Date();
    try {
      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, status, paid_at, created_at, package_duration_months, metadata")
        .eq("tenant_id", tenantId)
        .eq("metadata->>billing_scope", "individual")
        .eq("metadata->>employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (invoiceError) {
        const logId = `ERR-BILLING-OVERLAY-INV-${Date.now()}`;
        console.error(`[${logId}] Failed to load employee invoices`, invoiceError);
        setHasPaid(false);
        return;
      }

      const scopedInvoices = ((invoiceRows || []) as EmployeeInvoiceSnapshot[]).filter((invoice) => {
        return (
          parseMetadataScope(invoice.metadata) === "individual" &&
          parseMetadataEmployeeId(invoice.metadata) === employeeId
        );
      });
      const paidInvoices = scopedInvoices.filter((invoice) => (invoice.status || "").toUpperCase() === "PAID");
      const coverageEnd = computeCoverageEnd(paidInvoices);
      if (coverageEnd && coverageEnd.getTime() > now.getTime()) {
        setHasPaid(true);
        return;
      }

      // Fallback grace period to avoid hard lock while tenant is still in tracking/grace.
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
  }, [billingMode, employeeId, tenantId]);

  useEffect(() => {
    void checkPaymentStatus();
  }, [checkPaymentStatus]);

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
