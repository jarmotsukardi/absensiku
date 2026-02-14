import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  BarChart3,
  Loader2,
  Play
} from "lucide-react";

interface PartitionStat {
  partition_name: string;
  row_count: number;
  total_size: string;
  index_size: string;
  table_size: string;
  date_range: string;
}

interface CleanupLog {
  id: string;
  executed_at: string;
  cutoff_date: string;
  total_cleaned: number;
  partitions_processed: unknown;
}

interface PartitionCreationLog {
  id: string;
  created_at: string;
  partition_name: string;
  start_date: string;
  end_date: string;
}

const PartitionMonitoring = () => {
  const [partitionStats, setPartitionStats] = useState<PartitionStat[]>([]);
  const [cleanupLogs, setCleanupLogs] = useState<CleanupLog[]>([]);
  const [partitionLogs, setPartitionLogs] = useState<PartitionCreationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch partition stats
      const { data: stats, error: statsError } = await supabase
        .rpc('get_partition_stats');
      
      if (statsError) {
        console.error('Error fetching partition stats:', statsError);
      } else {
        setPartitionStats(stats || []);
      }

      // Fetch cleanup logs
      const { data: cleanup, error: cleanupError } = await supabase
        .rpc('get_gps_cleanup_logs', { limit_count: 10 });
      
      if (cleanupError) {
        console.error('Error fetching cleanup logs:', cleanupError);
      } else {
        setCleanupLogs(cleanup || []);
      }

      // Fetch partition creation logs
      const { data: creation, error: creationError } = await supabase
        .rpc('get_partition_creation_logs', { limit_count: 10 });
      
      if (creationError) {
        console.error('Error fetching partition logs:', creationError);
      } else {
        setPartitionLogs(creation || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Gagal memuat data monitoring');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runMaintenance = async (action: 'all' | 'cleanup_gps' | 'create_partition' | 'analyze' | 'cleanup_audit') => {
    setIsRunningMaintenance(true);
    try {
      const { data, error } = await supabase.functions.invoke('partition-maintenance', {
        body: { action }
      });

      if (error) throw error;

      const actionLabels: Record<string, string> = {
        all: 'Semua maintenance',
        cleanup_gps: 'Cleanup GPS',
        create_partition: 'Buat partisi',
        analyze: 'VACUUM ANALYZE',
        cleanup_audit: 'Cleanup audit log'
      };

      toast.success(`${actionLabels[action]} berhasil dijalankan`, {
        description: data.success ? 'Proses selesai tanpa error' : 'Selesai dengan beberapa warning'
      });

      // Refresh data
      await fetchData();
    } catch (error: any) {
      console.error('Maintenance error:', error);
      toast.error('Gagal menjalankan maintenance', {
        description: error.message
      });
    } finally {
      setIsRunningMaintenance(false);
    }
  };

  // Calculate totals
  const totalRows = partitionStats.reduce((acc, p) => acc + (p.row_count || 0), 0);

  if (isLoading) {
    return (
      <SuperAdminLayout title="Monitoring Partisi" subtitle="Status tabel absensi partitioned dan log maintenance">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout title="Monitoring Partisi" subtitle="Status tabel absensi partitioned dan log maintenance">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <span className="text-lg font-medium">Database Partitions</span>
          </div>
          <Button variant="outline" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Partisi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partitionStats.length}</div>
            <p className="text-xs text-muted-foreground">Partisi aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRows.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Data absensi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cleanup Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cleanupLogs[0]?.total_cleaned?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {cleanupLogs[0]?.executed_at 
                ? format(new Date(cleanupLogs[0].executed_at), 'dd MMM yyyy HH:mm', { locale: idLocale })
                : 'Belum pernah'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Partisi Baru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {partitionLogs[0]?.partition_name?.replace('attendance_records_p', '') || '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {partitionLogs[0]?.created_at 
                ? format(new Date(partitionLogs[0].created_at), 'dd MMM yyyy', { locale: idLocale })
                : 'Belum ada'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aksi Maintenance</CardTitle>
          <CardDescription>
            Jalankan maintenance manual (normalnya berjalan otomatis via cron job)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={() => runMaintenance('cleanup_gps')} 
              disabled={isRunningMaintenance}
              variant="outline"
              size="sm"
            >
              {isRunningMaintenance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Cleanup GPS
            </Button>
            <Button 
              onClick={() => runMaintenance('analyze')} 
              disabled={isRunningMaintenance}
              variant="outline"
              size="sm"
            >
              {isRunningMaintenance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              VACUUM ANALYZE
            </Button>
            <Button 
              onClick={() => runMaintenance('create_partition')} 
              disabled={isRunningMaintenance}
              variant="outline"
              size="sm"
            >
              {isRunningMaintenance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
              Buat Partisi
            </Button>
            <Button 
              onClick={() => runMaintenance('cleanup_audit')} 
              disabled={isRunningMaintenance}
              variant="outline"
              size="sm"
            >
              {isRunningMaintenance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Cleanup Audit Log
            </Button>
            <Button 
              onClick={() => runMaintenance('all')} 
              disabled={isRunningMaintenance}
              size="sm"
            >
              {isRunningMaintenance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Jalankan Semua
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Partition Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Statistik Partisi
          </CardTitle>
          <CardDescription>
            Ukuran dan jumlah data per partisi bulanan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partisi</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead className="text-right">Jumlah Record</TableHead>
                <TableHead className="text-right">Ukuran Tabel</TableHead>
                <TableHead className="text-right">Ukuran Index</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partitionStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Belum ada data partisi
                  </TableCell>
                </TableRow>
              ) : (
                partitionStats.map((partition) => (
                  <TableRow key={partition.partition_name}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">
                        {partition.partition_name.replace('attendance_records_p', 'P')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {partition.date_range?.replace('FOR VALUES FROM', '').replace(' TO ', ' s/d ').replace(/[()'"]/g, '')}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(partition.row_count || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {partition.table_size}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {partition.index_size}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {partition.total_size}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Logs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cleanup Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Log Cleanup GPS
            </CardTitle>
            <CardDescription>
              Riwayat pembersihan data GPS &gt; 7 hari
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cleanupLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Belum ada log cleanup
              </div>
            ) : (
              <div className="space-y-3">
                {cleanupLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {log.total_cleaned.toLocaleString()} record dibersihkan
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Cutoff: {format(new Date(log.cutoff_date), 'dd MMM yyyy', { locale: idLocale })}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {format(new Date(log.executed_at), 'dd MMM yyyy', { locale: idLocale })}
                      <br />
                      {format(new Date(log.executed_at), 'HH:mm', { locale: idLocale })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Partition Creation Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Log Pembuatan Partisi
            </CardTitle>
            <CardDescription>
              Riwayat pembuatan partisi otomatis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {partitionLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Belum ada log pembuatan partisi
              </div>
            ) : (
              <div className="space-y-3">
                {partitionLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        <Badge variant="secondary">
                          {log.partition_name.replace('attendance_records_p', '')}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(log.start_date), 'dd MMM', { locale: idLocale })} - {format(new Date(log.end_date), 'dd MMM yyyy', { locale: idLocale })}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {format(new Date(log.created_at), 'dd MMM yyyy', { locale: idLocale })}
                      <br />
                      {format(new Date(log.created_at), 'HH:mm', { locale: idLocale })}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SuperAdminLayout>
  );
};

export default PartitionMonitoring;
