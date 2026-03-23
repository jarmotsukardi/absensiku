import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  CreditCard, 
  Calendar, 
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Save,
  Receipt
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, addYears } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface Subscription {
  id: string;
  tenant_id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface OrganizationSubscriptionProps {
  tenantId: string;
  organizationName: string;
}
const ORG_SUBSCRIPTION_READ_TIMEOUT_MS = 12000;
const ORG_SUBSCRIPTION_WRITE_TIMEOUT_MS = 15000;
const ORG_SUBSCRIPTION_MAX_RETRIES = 2;

export function OrganizationSubscription({ tenantId, organizationName }: OrganizationSubscriptionProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    status: "trial",
    duration: "1_month",
  });

  const fetchSubscription = useCallback(async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("subscriptions")
              .select("*")
              .eq("tenant_id", tenantId)
              .single(),
            ORG_SUBSCRIPTION_READ_TIMEOUT_MS,
            "Permintaan data langganan organisasi timeout."
          ),
        {
          maxRetries: ORG_SUBSCRIPTION_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        setSubscription(data);
        setFormData({
          status: data.status || "trial",
          duration: "1_month",
        });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_subscription.fetch", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal memuat langganan organisasi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const now = new Date();
      let endDate = now;

      switch (formData.duration) {
        case "1_month":
          endDate = addMonths(now, 1);
          break;
        case "3_months":
          endDate = addMonths(now, 3);
          break;
        case "6_months":
          endDate = addMonths(now, 6);
          break;
        case "1_year":
          endDate = addYears(now, 1);
          break;
      }

      const updateData = {
        status: formData.status as "trial" | "active" | "expired" | "cancelled",
        start_date: now.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
      };

      if (subscription) {
        const { error } = await withTimeout(
          supabase
            .from("subscriptions")
            .update(updateData)
            .eq("id", subscription.id),
          ORG_SUBSCRIPTION_WRITE_TIMEOUT_MS,
          "Perbarui langganan organisasi timeout."
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          supabase
            .from("subscriptions")
            .insert({ ...updateData, tenant_id: tenantId }),
          ORG_SUBSCRIPTION_WRITE_TIMEOUT_MS,
          "Tambah langganan organisasi timeout."
        );
        if (error) throw error;
      }

      toast.success("Langganan berhasil diperbarui");
      void fetchSubscription();
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_subscription.save", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal menyimpan langganan", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "trial":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "expired":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isRetrying && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Sedang mencoba ulang memuat data langganan...
        </div>
      )}
      {loadError && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void fetchSubscription()}>
            Coba Lagi
          </Button>
        </div>
      )}
      {/* Current Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Status Langganan
          </CardTitle>
          <CardDescription>Status langganan saat ini untuk {organizationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              {getStatusIcon(subscription?.status || "trial")}
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-semibold capitalize">{subscription?.status || "Trial"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Kebijakan Akses</p>
                <p className="font-semibold">Streak Monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Mulai</p>
                <p className="font-semibold">
                  {subscription?.start_date
                    ? format(new Date(subscription.start_date), "d MMM yyyy", { locale: id })
                    : "-"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Calendar className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Berakhir</p>
                <p className="font-semibold">
                  {subscription?.end_date
                    ? format(new Date(subscription.end_date), "d MMM yyyy", { locale: id })
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Update Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Perbarui Langganan</CardTitle>
          <CardDescription>Ubah paket atau perpanjang langganan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status Langganan</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Durasi</Label>
              <Select
                value={formData.duration}
                onValueChange={(value) => setFormData({ ...formData, duration: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1_month">1 Bulan</SelectItem>
                  <SelectItem value="3_months">3 Bulan</SelectItem>
                  <SelectItem value="6_months">6 Bulan</SelectItem>
                  <SelectItem value="1_year">1 Tahun</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Simpan Perubahan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Riwayat Pembayaran
          </CardTitle>
          <CardDescription>Histori transaksi langganan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada riwayat pembayaran</p>
            <p className="text-sm">Riwayat akan muncul setelah organisasi melakukan pembayaran</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
