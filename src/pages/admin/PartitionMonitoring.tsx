import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
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
  Play,
  BookOpen
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

interface GlossaryItem {
  term: string;
  description: string;
  category: "Konsep" | "Aksi" | "Ukuran" | "Log" | "Keandalan";
}

type MaintenanceAction = 'all' | 'cleanup_gps' | 'create_partition' | 'analyze' | 'cleanup_audit';

const actionLabels: Record<MaintenanceAction, string> = {
  all: 'Semua maintenance',
  cleanup_gps: 'Cleanup GPS',
  create_partition: 'Buat partisi',
  analyze: 'VACUUM ANALYZE',
  cleanup_audit: 'Cleanup audit log',
};

const extractFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const fallback = typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string"
    ? ((error as { message: string }).message || "Terjadi kesalahan")
    : "Terjadi kesalahan tidak dikenal";

  const maybeContext = (error as { context?: Response })?.context;
  if (!maybeContext) return fallback;

  let detailed = fallback;
  try {
    const raw = await maybeContext.clone().text();
    if (raw) {
      try {
        const json = JSON.parse(raw) as { error?: string; message?: string; trace_id?: string };
        const errMsg = json.error || json.message;
        if (errMsg) detailed = `${fallback} - ${errMsg}`;
        if (json.trace_id) detailed = `${detailed} [trace: ${json.trace_id}]`;
      } catch {
        detailed = `${fallback} - ${raw}`;
      }
    }
  } catch {
    // ignore read-body errors and use fallback
  }

  if (maybeContext.status === 401 || maybeContext.status === 403) {
    return `${detailed} (Sesi login tidak valid/kedaluwarsa. Silakan login ulang.)`;
  }

  return `${detailed} [HTTP ${maybeContext.status}]`;
};

const isJwtAuthError = (message?: string | null) =>
  Boolean(message) && /(invalid jwt|jwt expired|token.*expired|invalid token|401)/i.test(message);

const ensureValidFunctionAccessToken = async (): Promise<string> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Gagal memeriksa sesi login: ${sessionError.message}`);
  }

  const currentSession = sessionData.session;
  if (!currentSession?.access_token) {
    throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  }

  let accessToken = currentSession.access_token;

  const validateToken = async (token: string) => {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    return { isValid: Boolean(userData.user && !userError), errorMessage: userError?.message };
  };

  // 1) Validasi token ke Auth server (bukan hanya baca dari local storage)
  const firstValidation = await validateToken(accessToken);
  if (firstValidation.isValid) {
    return accessToken;
  }

  // 2) Jika invalid/expired, coba refresh session sekali
  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    if (isJwtAuthError(firstValidation.errorMessage)) {
      await supabase.auth.signOut();
      throw new Error("Sesi login tidak valid/kedaluwarsa. Silakan login ulang.");
    }
    throw new Error(refreshError?.message || "Sesi login kedaluwarsa. Silakan login ulang lalu coba lagi.");
  }

  accessToken = refreshedData.session.access_token;

  // 3) Validasi ulang token hasil refresh
  const secondValidation = await validateToken(accessToken);
  if (!secondValidation.isValid) {
    await supabase.auth.signOut();
    throw new Error("Sesi login tidak valid/kedaluwarsa. Silakan login ulang.");
  }

  return accessToken;
};

const PARTITION_GLOSSARY: GlossaryItem[] = [
  { term: "Partitioned Table", description: "Tabel induk yang datanya dipecah menjadi beberapa partisi agar query lebih cepat dan maintenance lebih ringan.", category: "Konsep" },
  { term: "Partisi Bulanan", description: "Pemisahan data absensi per bulan (contoh: attendance_records_p2026_02) untuk mengurangi beban scan data.", category: "Konsep" },
  { term: "Partition Pruning", description: "Optimasi database yang hanya membaca partisi relevan sesuai filter tanggal.", category: "Konsep" },
  { term: "Parent Table", description: "Tabel utama (attendance_records_partitioned) tempat semua partisi ditautkan.", category: "Konsep" },
  { term: "Buat Partisi", description: "Aksi membuat partisi bulan berikutnya agar insert absensi tidak gagal saat pergantian bulan.", category: "Aksi" },
  { term: "Cleanup GPS", description: "Aksi menghapus kolom/jejak lokasi lama (di atas batas retensi) agar ukuran tabel tetap terkendali.", category: "Aksi" },
  { term: "VACUUM ANALYZE", description: "Perintah optimasi untuk merapikan storage dan memperbarui statistik query planner.", category: "Aksi" },
  { term: "Cleanup Audit Log", description: "Aksi pembersihan log audit lama sesuai retensi hot 60 hari untuk menekan pertumbuhan data historis.", category: "Aksi" },
  { term: "Jalankan Semua", description: "Menjalankan seluruh aksi maintenance berurutan: cleanup GPS, create partition, analyze, cleanup audit.", category: "Aksi" },
  { term: "Row Count", description: "Jumlah baris data pada suatu partisi.", category: "Ukuran" },
  { term: "Table Size", description: "Ukuran fisik data utama tabel (tanpa index).", category: "Ukuran" },
  { term: "Index Size", description: "Ukuran total seluruh index pada partisi.", category: "Ukuran" },
  { term: "Total Size", description: "Akumulasi ukuran tabel + index + overhead storage.", category: "Ukuran" },
  { term: "Date Range", description: "Rentang tanggal yang dicakup oleh sebuah partisi.", category: "Ukuran" },
  { term: "Cleanup Log", description: "Riwayat eksekusi cleanup GPS beserta total record yang dibersihkan.", category: "Log" },
  { term: "Partition Creation Log", description: "Riwayat partisi yang berhasil dibuat otomatis/manual.", category: "Log" },
  { term: "Cutoff Date", description: "Batas tanggal untuk menentukan data lama yang akan dibersihkan.", category: "Log" },
  { term: "Edge Function", description: "Fungsi backend Supabase yang mengeksekusi maintenance terjadwal/ manual.", category: "Keandalan" },
  { term: "RPC (Remote Procedure Call)", description: "Pemanggilan fungsi SQL di database dari aplikasi (mis. get_partition_stats).", category: "Keandalan" },
  { term: "Cron Job", description: "Jadwal otomatis yang mengeksekusi maintenance tanpa intervensi manual.", category: "Keandalan" },
  { term: "Warning Partial", description: "Status ketika sebagian langkah maintenance berhasil, tetapi ada langkah yang gagal.", category: "Keandalan" },
];
const PARTITIONS_PER_PAGE = 10;
const CLEANUP_LOGS_PER_PAGE = 5;
const CREATION_LOGS_PER_PAGE = 5;
const GLOSSARY_PER_PAGE = 10;

export default function PartitionMonitoring({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [partitionStats, setPartitionStats] = useState<PartitionStat[]>([]);
  const [cleanupLogs, setCleanupLogs] = useState<CleanupLog[]>([]);
  const [partitionLogs, setPartitionLogs] = useState<PartitionCreationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [partitionPage, setPartitionPage] = useState(1);
  const [cleanupPage, setCleanupPage] = useState(1);
  const [creationPage, setCreationPage] = useState(1);
  const [glossaryPage, setGlossaryPage] = useState(1);

  const filteredGlossary = useMemo(() => {
    if (!glossaryQuery.trim()) return PARTITION_GLOSSARY;
    const q = glossaryQuery.toLowerCase();
    return PARTITION_GLOSSARY.filter((item) =>
      item.term.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
  }, [glossaryQuery]);
  const partitionTotalPages = Math.max(1, Math.ceil(partitionStats.length / PARTITIONS_PER_PAGE));
  const paginatedPartitionStats = partitionStats.slice(
    (partitionPage - 1) * PARTITIONS_PER_PAGE,
    partitionPage * PARTITIONS_PER_PAGE
  );
  const cleanupTotalPages = Math.max(1, Math.ceil(cleanupLogs.length / CLEANUP_LOGS_PER_PAGE));
  const paginatedCleanupLogs = cleanupLogs.slice(
    (cleanupPage - 1) * CLEANUP_LOGS_PER_PAGE,
    cleanupPage * CLEANUP_LOGS_PER_PAGE
  );
  const creationTotalPages = Math.max(1, Math.ceil(partitionLogs.length / CREATION_LOGS_PER_PAGE));
  const paginatedPartitionLogs = partitionLogs.slice(
    (creationPage - 1) * CREATION_LOGS_PER_PAGE,
    creationPage * CREATION_LOGS_PER_PAGE
  );
  const glossaryTotalPages = Math.max(1, Math.ceil(filteredGlossary.length / GLOSSARY_PER_PAGE));
  const paginatedGlossary = filteredGlossary.slice(
    (glossaryPage - 1) * GLOSSARY_PER_PAGE,
    glossaryPage * GLOSSARY_PER_PAGE
  );

  useEffect(() => {
    setPartitionPage(1);
  }, [partitionStats.length]);

  useEffect(() => {
    setCleanupPage(1);
  }, [cleanupLogs.length]);

  useEffect(() => {
    setCreationPage(1);
  }, [partitionLogs.length]);

  useEffect(() => {
    setGlossaryPage(1);
  }, [glossaryQuery, filteredGlossary.length]);

  const runMaintenanceViaRpc = async (action: Exclude<MaintenanceAction, "all">) => {
    if (action === "cleanup_gps") {
      const { data, error } = await supabase.rpc("cleanup_gps_data_partitioned");
      if (error) throw new Error(`RPC cleanup_gps_data_partitioned gagal: ${error.message}`);
      return { success: true, data };
    }

    if (action === "create_partition") {
      const { error } = await supabase.rpc("create_next_month_partition");
      if (error) throw new Error(`RPC create_next_month_partition gagal: ${error.message}`);
      return { success: true, data: { success: true, message: "Next month partition ensured" } };
    }

    if (action === "analyze") {
      const { data, error } = await supabase.rpc("analyze_attendance_partitions");
      if (error) throw new Error(`RPC analyze_attendance_partitions gagal: ${error.message}`);
      return { success: true, data };
    }

    const { data, error } = await supabase.rpc("cleanup_old_audit_logs");
    if (error) throw new Error(`RPC cleanup_old_audit_logs gagal: ${error.message}`);
    return { success: true, data };
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      // Fetch partition stats
      const { data: stats, error: statsError } = await supabase
        .rpc('get_partition_stats');
      
      if (statsError) {
        const errorRef = reportError(statsError, "admin.partition_monitoring.partition_stats.fetch");
        setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat statistik partisi", errorRef));
      } else {
        setPartitionStats(stats || []);
      }

      // Fetch cleanup logs
      const { data: cleanup, error: cleanupError } = await supabase
        .rpc('get_gps_cleanup_logs', { limit_count: 10 });
      
      if (cleanupError) {
        const errorRef = reportError(cleanupError, "admin.partition_monitoring.cleanup_logs.fetch");
        setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat log cleanup GPS", errorRef));
      } else {
        setCleanupLogs(cleanup || []);
      }

      // Fetch partition creation logs
      const { data: creation, error: creationError } = await supabase
        .rpc('get_partition_creation_logs', { limit_count: 10 });
      
      if (creationError) {
        const errorRef = reportError(creationError, "admin.partition_monitoring.partition_logs.fetch");
        setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat log pembuatan partisi", errorRef));
      } else {
        setPartitionLogs(creation || []);
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.partition_monitoring.fetch");
      const message = appendErrorReference("Gagal memuat data monitoring", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runSingleMaintenance = async (action: Exclude<MaintenanceAction, 'all'>) => {
    const accessToken = await ensureValidFunctionAccessToken();
    const { data, error } = await supabase.functions.invoke('partition-maintenance', {
      body: { action },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      const detailed = await extractFunctionErrorMessage(error);
      if (isJwtAuthError(detailed)) {
        // Fallback ke jalur RPC agar tetap bisa maintenance saat gateway function menolak JWT.
        const rpcResult = await runMaintenanceViaRpc(action);
        return {
          success: rpcResult.success,
          data: rpcResult.data,
          errorMessage: null,
        };
      }
      throw new Error(detailed);
    }

    const success = data?.success !== false;
    return {
      success,
      data,
      errorMessage: success ? null : 'Selesai dengan warning',
    };
  };

  const runMaintenance = async (action: MaintenanceAction) => {
    const forceReauth = async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore sign out errors
      }

      // Bersihkan token Supabase yang mungkin stale di browser
      if (typeof window !== "undefined") {
        const keysToClear: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.startsWith("sb-") || key.includes("supabase.auth")) {
            keysToClear.push(key);
          }
        }
        keysToClear.forEach((key) => localStorage.removeItem(key));
      }

      navigate("/admin/login", { replace: true });
    };

    setIsRunningMaintenance(true);
    try {
      if (action === 'all') {
        const steps: Array<Exclude<MaintenanceAction, 'all'>> = [
          'cleanup_gps',
          'create_partition',
          'analyze',
          'cleanup_audit',
        ];

        let successCount = 0;
        const failedSteps: string[] = [];
        let authInvalid = false;

        for (const step of steps) {
          try {
            const result = await runSingleMaintenance(step);
            if (result.success) {
              successCount += 1;
            } else {
              failedSteps.push(actionLabels[step]);
            }
          } catch (stepError) {
            const stepMessage = stepError instanceof Error ? stepError.message : 'Terjadi kesalahan';
            failedSteps.push(`${actionLabels[step]} (${stepMessage})`);

            if (isJwtAuthError(stepMessage)) {
              authInvalid = true;
              break;
            }
          }
        }

        if (authInvalid) {
          toast.error("Sesi login tidak valid/kedaluwarsa", {
            description: "Anda akan diarahkan ke halaman login untuk autentikasi ulang.",
          });
          await forceReauth();
          return;
        }

        if (failedSteps.length === 0) {
          toast.success(`${actionLabels[action]} berhasil dijalankan`, {
            description: `${successCount}/${steps.length} aksi selesai tanpa error`
          });
        } else {
          toast.error(`${actionLabels[action]} selesai dengan sebagian gagal`, {
            description: `${successCount}/${steps.length} aksi berhasil. Gagal: ${failedSteps.join('; ')}`
          });
        }
      } else {
        const result = await runSingleMaintenance(action);
        if (result.success) {
          toast.success(`${actionLabels[action]} berhasil dijalankan`, {
            description: 'Proses selesai tanpa error'
          });
        } else {
          toast.error(`${actionLabels[action]} selesai dengan warning`, {
            description: result.errorMessage || 'Periksa log maintenance'
          });
        }
      }

      // Refresh data
      await fetchData();
    } catch (error: unknown) {
      const baseMessage = error instanceof Error ? error.message : "Terjadi kesalahan";
      const errorRef = reportError(error, "admin.partition_monitoring.maintenance", { action });
      const message = appendErrorReference(baseMessage, errorRef);

      if (isJwtAuthError(message)) {
        await forceReauth();
        return;
      }

      setLoadError((prev) => prev ?? message);

      toast.error('Gagal menjalankan maintenance', {
        description: message
      });
    } finally {
      setIsRunningMaintenance(false);
    }
  };

  // Calculate totals
  const totalRows = partitionStats.reduce((acc, p) => acc + (p.row_count || 0), 0);

  const loadingContent = (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );

  if (isLoading) {
    if (embedded) return loadingContent;
    return (
      <SuperAdminLayout title="Monitoring Partisi" subtitle="Status tabel absensi partitioned dan log maintenance">
        {loadingContent}
      </SuperAdminLayout>
    );
  }

  const pageContent = (
    <>
      <div className="space-y-6">
        {loadError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
          </Card>
        )}
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
                paginatedPartitionStats.map((partition) => (
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
          {partitionStats.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                Halaman {partitionPage} dari {partitionTotalPages}
              </span>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (partitionPage > 1) {
                          setPartitionPage((page) => page - 1);
                        }
                      }}
                      className={partitionPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      isActive
                      onClick={(event) => event.preventDefault()}
                    >
                      {partitionPage}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (partitionPage < partitionTotalPages) {
                          setPartitionPage((page) => page + 1);
                        }
                      }}
                      className={partitionPage === partitionTotalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
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
                {paginatedCleanupLogs.map((log) => (
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
            {cleanupLogs.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCleanupPage((prev) => Math.max(1, prev - 1))}
                  disabled={cleanupPage === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground">
                  Halaman {cleanupPage} dari {cleanupTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCleanupPage((prev) => Math.min(cleanupTotalPages, prev + 1))}
                  disabled={cleanupPage === cleanupTotalPages}
                >
                  Berikutnya
                </Button>
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
                {paginatedPartitionLogs.map((log) => (
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
            {partitionLogs.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreationPage((prev) => Math.max(1, prev - 1))}
                  disabled={creationPage === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground">
                  Halaman {creationPage} dari {creationTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreationPage((prev) => Math.min(creationTotalPages, prev + 1))}
                  disabled={creationPage === creationTotalPages}
                >
                  Berikutnya
                </Button>
              </div>
            )}
            </CardContent>
          </Card>
        </div>

      {/* Glossary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Glosarium Monitoring Partisi
          </CardTitle>
          <CardDescription>
            Penjelasan istilah teknis dan operasional agar proses monitoring serta maintenance lebih mudah dipahami.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Input
              value={glossaryQuery}
              onChange={(e) => setGlossaryQuery(e.target.value)}
              placeholder="Cari istilah glosarium..."
              className="pl-9"
            />
            <BookOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Istilah</TableHead>
                  <TableHead className="w-[130px]">Kategori</TableHead>
                  <TableHead>Penjelasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGlossary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                      Istilah tidak ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedGlossary.map((item) => (
                    <TableRow key={item.term}>
                      <TableCell className="font-medium">{item.term}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredGlossary.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGlossaryPage((prev) => Math.max(1, prev - 1))}
                disabled={glossaryPage === 1}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {glossaryPage} dari {glossaryTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGlossaryPage((prev) => Math.min(glossaryTotalPages, prev + 1))}
                disabled={glossaryPage === glossaryTotalPages}
              >
                Berikutnya
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
  if (embedded) return pageContent;
  return (
    <SuperAdminLayout title="Monitoring Partisi" subtitle="Status tabel absensi partitioned dan log maintenance">
      {pageContent}
    </SuperAdminLayout>
  );
}
