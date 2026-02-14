import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Flame, CheckCircle2, Clock, Search, Loader2, Zap, AlertTriangle, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface StreakItem {
  id: string;
  tenant_id: string;
  streak_count: number;
  status: string;
  reached_target: boolean;
  reached_target_at: string | null;
  grace_period_end: string | null;
  last_activity_date: string | null;
  tenants?: { name: string } | null;
}

interface PaymentLog {
  id: string;
  tenant_id: string;
  amount: number;
  status: string;
  created_at: string;
  payment_method: string | null;
  tenants?: { name: string } | null;
}

export default function StreakMonitoring() {
  const [streaks, setStreaks] = useState<StreakItem[]>([]);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [streakThreshold, setStreakThreshold] = useState(30);

  useEffect(() => {
    fetchStreaks();
    fetchPayments();
    fetchThreshold();
  }, []);

  const fetchThreshold = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "streak_threshold")
        .maybeSingle();
      if (data) setStreakThreshold((data.value as any)?.value ?? 30);
    } catch {}
  };

  const fetchStreaks = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("stability_streaks")
        .select("*, tenants(name)")
        .order("streak_count", { ascending: false });
      setStreaks((data || []) as StreakItem[]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const { data } = await supabase
        .from("manual_payments")
        .select("id, tenant_id, amount, status, created_at, payment_method, tenants:tenant_id(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      setPayments((data || []) as any[]);
    } catch {}
  };

  const filtered = streaks.filter(s =>
    !searchQuery || s.tenants?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeStreaks = filtered.filter(s => s.streak_count > 0 && !s.reached_target && s.status === "tracking");
  const nearSuspension = filtered.filter(s => s.status === "ready_for_invoicing" || s.status === "grace_period");
  const suspended = filtered.filter(s => s.status === "suspended" || s.status === "expired");

  const totalCount = streaks.length;
  const activeCount = streaks.filter(s => s.streak_count > 0 && !s.reached_target).length;
  const readyCount = streaks.filter(s => s.status === "ready_for_invoicing").length;
  const suspendedCount = streaks.filter(s => s.status === "suspended" || s.status === "expired").length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "ready_for_invoicing": return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ready</Badge>;
      case "grace_period": return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Grace Period</Badge>;
      case "invoiced": return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Invoiced</Badge>;
      case "suspended": case "expired": return <Badge variant="destructive">Suspended</Badge>;
      default: return <Badge variant="outline">Tracking</Badge>;
    }
  };

  const renderTable = (data: StreakItem[]) => (
    data.length === 0 ? (
      <p className="text-center text-muted-foreground py-8">Tidak ada data</p>
    ) : (
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisasi</TableHead>
              <TableHead>Streak</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aktivitas Terakhir</TableHead>
              <TableHead>Grace Period</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.tenants?.name || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Flame className={cn("w-4 h-4", s.streak_count >= streakThreshold - 5 ? "text-orange-500" : "text-muted-foreground")} />
                    <span className="font-bold">{s.streak_count}</span>
                    <span className="text-xs text-muted-foreground">/{streakThreshold}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-[120px]">
                  <Progress value={Math.min((s.streak_count / streakThreshold) * 100, 100)} className="h-2" />
                </TableCell>
                <TableCell>{statusBadge(s.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {s.last_activity_date ? format(new Date(s.last_activity_date), "dd MMM yyyy", { locale: idLocale }) : "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {s.grace_period_end ? format(new Date(s.grace_period_end), "dd MMM yyyy", { locale: idLocale }) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  );

  return (
    <SuperAdminLayout title="Streak Monitoring" subtitle="Pantau stabilitas penggunaan per tenant">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Zap className="w-5 h-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{totalCount}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><Flame className="w-5 h-5 text-orange-500" /></div>
          <div><p className="text-2xl font-bold">{activeCount}</p><p className="text-xs text-muted-foreground">Aktif</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="w-5 h-5 text-green-500" /></div>
          <div><p className="text-2xl font-bold">{readyCount}</p><p className="text-xs text-muted-foreground">Ready</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
          <div><p className="text-2xl font-bold">{suspendedCount}</p><p className="text-xs text-muted-foreground">Suspended</p></div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-64 mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari tenant..." className="pl-10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active" className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="near" className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Near Suspension
          </TabsTrigger>
          <TabsTrigger value="suspended" className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Suspended
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" /> Payment Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Streaks</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tenant yang sedang dalam proses akumulasi streak. Streak bertambah setiap hari kerja jika ada aktivitas absensi.
                Hari libur dan weekend tidak dihitung. Reset ke 1 jika terputus.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(activeStreaks)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="near">
          <Card>
            <CardHeader>
              <CardTitle>Near Suspension</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tenant yang sudah mencapai target streak dan memasuki masa tenggang pembayaran.
                Jika tidak membayar sebelum grace period berakhir, akses akan dikunci otomatis.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(nearSuspension)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspended">
          <Card>
            <CardHeader>
              <CardTitle>Suspended</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tenant yang masa tenggangnya sudah berakhir tanpa pembayaran. Fitur absensi dan pengajuan dikunci,
                namun data tetap tersimpan aman. Akses akan dipulihkan setelah pembayaran diterima.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(suspended)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Logs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Riwayat pembayaran manual dari seluruh tenant. Status: pending (menunggu verifikasi),
                approved (terverifikasi), rejected (ditolak).
              </p>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Belum ada riwayat pembayaran</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organisasi</TableHead>
                        <TableHead>Jumlah</TableHead>
                        <TableHead>Metode</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tanggal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{(p.tenants as any)?.name || "-"}</TableCell>
                          <TableCell>Rp {Number(p.amount).toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-sm">{p.payment_method || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}>
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(p.created_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </SuperAdminLayout>
  );
}
