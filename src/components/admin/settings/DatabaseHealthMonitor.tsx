import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Activity,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  HardDrive,
  Database,
  Loader2,
  TrendingUp,
  Clock
} from "lucide-react";

interface PartitionStat {
  partition_name: string;
  row_count: number;
  total_size: string;
  index_size: string;
  table_size: string;
  date_range: string;
}

interface HealthCheck {
  name: string;
  status: "healthy" | "warning" | "critical";
  message: string;
  value?: string | number;
}

export function DatabaseHealthMonitor() {
  const [isLoading, setIsLoading] = useState(false);
  const [partitionStats, setPartitionStats] = useState<PartitionStat[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runHealthCheck = async () => {
    setIsLoading(true);
    const checks: HealthCheck[] = [];

    try {
      // 1. Check partition stats
      const { data: partitions, error: partitionError } = await supabase.rpc("get_partition_stats");
      
      if (partitionError) {
        checks.push({
          name: "Partisi Database",
          status: "warning",
          message: "Tidak dapat mengambil statistik partisi: " + partitionError.message
        });
      } else if (partitions && Array.isArray(partitions)) {
        setPartitionStats(partitions as PartitionStat[]);
        const totalRows = partitions.reduce((sum, p) => sum + (p.row_count || 0), 0);
        checks.push({
          name: "Partisi Database",
          status: "healthy",
          message: `${partitions.length} partisi aktif`,
          value: `${totalRows.toLocaleString()} total records`
        });
      }

      // 2. Check employee count vs subscription limits
      const { count: employeeCount } = await supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      const { count: tenantCount } = await supabase
        .from("tenants")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      checks.push({
        name: "Data Pegawai",
        status: "healthy",
        message: `${employeeCount?.toLocaleString() || 0} pegawai aktif`,
        value: `${tenantCount || 0} organisasi`
      });

      // 3. Check for orphaned records
      const { data: orphanedEmployees } = await supabase
        .from("employees")
        .select("id")
        .is("office_id", null)
        .eq("is_active", true);

      if (orphanedEmployees && orphanedEmployees.length > 0) {
        checks.push({
          name: "Integritas Data",
          status: "warning",
          message: `${orphanedEmployees.length} pegawai aktif tanpa kantor`
        });
      } else {
        checks.push({
          name: "Integritas Data",
          status: "healthy",
          message: "Tidak ada pegawai orphan"
        });
      }

      // 4. Check recent attendance activity
      const today = new Date().toISOString().split("T")[0];
      const { count: todayAttendance } = await supabase
        .from("attendance_records_partitioned")
        .select("*", { count: "exact", head: true })
        .eq("date", today);

      checks.push({
        name: "Aktivitas Hari Ini",
        status: "healthy",
        message: `${todayAttendance?.toLocaleString() || 0} record absensi hari ini`
      });

      // 5. Check subscription status
      const { data: expiredSubs } = await supabase
        .from("subscriptions")
        .select("id")
        .lt("end_date", today)
        .eq("status", "active");

      if (expiredSubs && expiredSubs.length > 0) {
        checks.push({
          name: "Subscription",
          status: "warning",
          message: `${expiredSubs.length} subscription perlu diperpanjang`
        });
      } else {
        checks.push({
          name: "Subscription",
          status: "healthy",
          message: "Semua subscription aktif"
        });
      }

      // 6. Check GPS cleanup logs
      const { data: cleanupLogs } = await supabase.rpc("get_gps_cleanup_logs", { limit_count: 1 });
      
      if (cleanupLogs && cleanupLogs.length > 0) {
        const lastCleanup = new Date(cleanupLogs[0].executed_at);
        const daysSinceCleanup = Math.floor((Date.now() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24));
        
        checks.push({
          name: "GPS Cleanup",
          status: daysSinceCleanup > 7 ? "warning" : "healthy",
          message: daysSinceCleanup > 7 
            ? `Cleanup terakhir ${daysSinceCleanup} hari lalu` 
            : `Cleanup terakhir ${daysSinceCleanup} hari lalu`,
          value: `${cleanupLogs[0].total_cleaned || 0} records dibersihkan`
        });
      } else {
        checks.push({
          name: "GPS Cleanup",
          status: "warning",
          message: "Belum ada riwayat cleanup GPS"
        });
      }

      setHealthChecks(checks);
      setLastChecked(new Date());
      toast.success("Health check selesai");
    } catch (error) {
      console.error("Health check error:", error);
      toast.error("Gagal menjalankan health check");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: HealthCheck["status"]) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Sehat</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />Peringatan</Badge>;
      case "critical":
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Kritis</Badge>;
    }
  };

  const overallHealth = healthChecks.length === 0 
    ? null 
    : healthChecks.every(c => c.status === "healthy") 
      ? "healthy" 
      : healthChecks.some(c => c.status === "critical") 
        ? "critical" 
        : "warning";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Database Health Monitor
          </CardTitle>
          <CardDescription>
            Pantau kesehatan dan performa database secara real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Button onClick={runHealthCheck} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isLoading ? "Memeriksa..." : "Jalankan Health Check"}
            </Button>
            
            {lastChecked && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Terakhir: {lastChecked.toLocaleTimeString("id-ID")}
              </div>
            )}
          </div>

          {overallHealth && (
            <Alert className={
              overallHealth === "healthy" ? "border-green-500 bg-green-50 dark:bg-green-950" :
              overallHealth === "warning" ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950" :
              "border-red-500 bg-red-50 dark:bg-red-950"
            }>
              {overallHealth === "healthy" ? <CheckCircle className="h-4 w-4 text-green-600" /> : 
               <AlertTriangle className="h-4 w-4 text-yellow-600" />}
              <AlertTitle>
                Status Database: {overallHealth === "healthy" ? "Sehat" : overallHealth === "warning" ? "Ada Peringatan" : "Perlu Perhatian"}
              </AlertTitle>
              <AlertDescription>
                {healthChecks.filter(c => c.status !== "healthy").length === 0 
                  ? "Semua komponen database berjalan dengan baik"
                  : `${healthChecks.filter(c => c.status !== "healthy").length} item memerlukan perhatian`}
              </AlertDescription>
            </Alert>
          )}

          {healthChecks.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {healthChecks.map((check, index) => (
                <Card key={index} className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-sm">{check.name}</span>
                      {getStatusBadge(check.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{check.message}</p>
                    {check.value && (
                      <p className="text-xs text-muted-foreground mt-1">{check.value}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partition Statistics */}
      {partitionStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Statistik Partisi
            </CardTitle>
            <CardDescription>
              Detail ukuran dan performa setiap partisi attendance_records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partisi</TableHead>
                    <TableHead className="text-right">Jumlah Record</TableHead>
                    <TableHead className="text-right">Ukuran Tabel</TableHead>
                    <TableHead className="text-right">Ukuran Index</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partitionStats.map((partition) => (
                    <TableRow key={partition.partition_name}>
                      <TableCell className="font-mono text-sm">{partition.partition_name}</TableCell>
                      <TableCell className="text-right">{partition.row_count?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-right">{partition.table_size || "-"}</TableCell>
                      <TableCell className="text-right">{partition.index_size || "-"}</TableCell>
                      <TableCell className="text-right font-medium">{partition.total_size || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
