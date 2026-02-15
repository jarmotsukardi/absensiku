import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  CreditCard, 
  Search,
  Filter,
  Download,
  TrendingUp,
  Users,
  Building2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled";

interface Subscription {
  id: string;
  tenant_id: string;
  status: string | null;
  max_employees: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  tenant?: {
    name: string;
    code: string;
    organization_type: string | null;
  };
  employees_count?: number;
}

const statusLabels: Record<SubscriptionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial: { label: "Trial", variant: "secondary" },
  active: { label: "Aktif", variant: "default" },
  expired: { label: "Expired", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "outline" },
};

const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = "trial";

const isSubscriptionStatus = (status: string | null | undefined): status is SubscriptionStatus =>
  status === "trial" || status === "active" || status === "expired" || status === "cancelled";

export default function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    trial: 0,
    active: 0,
    expired: 0,
    totalRevenue: 0,
  });

  const fetchSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from("subscriptions")
        .select(`
          *,
          tenant:tenants(name, code, organization_type)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as SubscriptionStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch employee counts
      const subsWithCounts = await Promise.all(
        (data || []).map(async (sub: Subscription) => {
          const { count, error: countError } = await supabase
            .from("employees")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", sub.tenant_id);

          if (countError) {
            reportError(countError, "admin.subscriptions.fetch_employee_count", {
              subscription_id: sub.id,
              tenant_id: sub.tenant_id,
            });
          }

          return { ...sub, employees_count: countError ? 0 : count || 0 };
        })
      );

      setSubscriptions(subsWithCounts);

      // Calculate stats
      const allSubs = subsWithCounts;
      setStats({
        total: allSubs.length,
        trial: allSubs.filter((s) => s.status === "trial").length,
        active: allSubs.filter((s) => s.status === "active").length,
        expired: allSubs.filter((s) => s.status === "expired").length,
        totalRevenue: allSubs.filter((s) => s.status === "active").length * 500000,
      });
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.fetch", {
        status_filter: statusFilter,
      });
      toast.error(appendErrorReference("Gagal memuat data langganan", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  const updateSubscriptionStatus = async (subId: string, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .update({ status: newStatus as SubscriptionStatus })
        .eq("id", subId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        throw new Error("Status tidak berubah karena data tidak ditemukan atau akses ditolak");
      }

      toast.success("Status langganan berhasil diperbarui");
      await fetchSubscriptions();
    } catch (error) {
      const errorRef = reportError(error, "admin.subscriptions.update_status", {
        subscription_id: subId,
        next_status: newStatus,
      });
      toast.error(appendErrorReference("Gagal memperbarui status", errorRef));
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const tenantName = sub.tenant?.name?.toLowerCase() || "";
    const tenantCode = sub.tenant?.code?.toLowerCase() || "";
    const query = searchQuery.toLowerCase();
    return tenantName.includes(query) || tenantCode.includes(query);
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <SuperAdminLayout
      title="Manajemen Langganan"
      subtitle="Kelola subscription dan billing organisasi"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Langganan</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-sm text-muted-foreground">Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.trial}</p>
                  <p className="text-sm text-muted-foreground">Trial</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Est. Revenue/bulan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Langganan</CardTitle>
                <CardDescription>Kelola status dan detail langganan organisasi</CardDescription>
              </div>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari organisasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisasi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Pegawai</TableHead>
                      <TableHead className="text-center">Maks. Pegawai</TableHead>
                      <TableHead>Mulai</TableHead>
                      <TableHead>Berakhir</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Tidak ada data langganan
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSubscriptions.map((sub) => {
                        const normalizedStatus = isSubscriptionStatus(sub.status)
                          ? sub.status
                          : DEFAULT_SUBSCRIPTION_STATUS;
                        return (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sub.tenant?.name || "-"}</p>
                                <p className="text-sm text-muted-foreground">{sub.tenant?.code}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusLabels[normalizedStatus].variant}>
                                {statusLabels[normalizedStatus].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                {sub.employees_count}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{sub.max_employees || 2}</TableCell>
                            <TableCell>
                              {sub.start_date
                                ? format(new Date(sub.start_date), "d MMM yyyy", { locale: id })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {sub.end_date
                                ? format(new Date(sub.end_date), "d MMM yyyy", { locale: id })
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Select
                                value={normalizedStatus}
                                onValueChange={(value) => updateSubscriptionStatus(sub.id, value)}
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="trial">Trial</SelectItem>
                                  <SelectItem value="active">Aktif</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
