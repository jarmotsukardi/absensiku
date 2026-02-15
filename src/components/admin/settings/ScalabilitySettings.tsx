import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Zap,
  Shield,
  Clock,
  Server,
  Users,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  TrendingUp,
  Timer,
  RefreshCw,
  Database,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ScalabilityTier,
  type ScalabilityProfile,
  getAllProfiles,
  getRecommendedTier,
  saveScalabilityConfig,
  loadScalabilityConfig,
  calculateThroughput,
} from "@/lib/scalabilityConfig";

export function ScalabilitySettings() {
  const { toast } = useToast();
  const [activeProfile, setActiveProfile] = useState<ScalabilityProfile>(loadScalabilityConfig());
  const [estimatedUsers, setEstimatedUsers] = useState<string>(String(activeProfile.maxUsers));
  const [isSaving, setIsSaving] = useState(false);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [ingestHealth, setIngestHealth] = useState<{
    queue_depth: number;
    processing_count: number;
    failed_count: number;
    dead_count: number;
    processed_last_5m: number;
    avg_lag_seconds: number;
    p95_lag_seconds: number;
    max_pending_age_seconds: number;
  } | null>(null);
  const profiles = getAllProfiles();

  const recommendedTier = getRecommendedTier(parseInt(estimatedUsers) || 0);
  const throughput = calculateThroughput(activeProfile);

  const loadIngestHealth = useCallback(async () => {
    setIsHealthLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_attendance_ingest_health");
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return;

      setIngestHealth({
        queue_depth: Number(row.queue_depth) || 0,
        processing_count: Number(row.processing_count) || 0,
        failed_count: Number(row.failed_count) || 0,
        dead_count: Number(row.dead_count) || 0,
        processed_last_5m: Number(row.processed_last_5m) || 0,
        avg_lag_seconds: Number(row.avg_lag_seconds) || 0,
        p95_lag_seconds: Number(row.p95_lag_seconds) || 0,
        max_pending_age_seconds: Number(row.max_pending_age_seconds) || 0,
      });
    } catch (error) {
      console.error("Error loading ingest health:", error);
    } finally {
      setIsHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadGlobalScalability = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "attendance_scalability")
          .maybeSingle();

        if (error) throw error;

        const value = data?.value as { tier?: ScalabilityTier } | null;
        if (!value?.tier) return;

        const profile = getAllProfiles().find((p) => p.tier === value.tier);
        if (!profile) return;

        setActiveProfile(profile);
        setEstimatedUsers(String(profile.maxUsers));
        saveScalabilityConfig(profile.tier);
      } catch (error) {
        console.error("Error loading global scalability settings:", error);
      }
    };

    loadGlobalScalability();
  }, []);

  useEffect(() => {
    loadIngestHealth();
    const interval = window.setInterval(loadIngestHealth, 20000);
    return () => window.clearInterval(interval);
  }, [loadIngestHealth]);

  const handleApplyProfile = async (tier: ScalabilityTier) => {
    const profile = profiles.find(p => p.tier === tier)!;
    setActiveProfile(profile);
    saveScalabilityConfig(tier);

    setIsSaving(true);
    try {
      const payload = {
        tier,
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: existingError } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "attendance_scalability")
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from("system_settings")
          .update({ value: payload, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_settings")
          .insert({
            key: "attendance_scalability",
            value: payload,
            description: "Konfigurasi skalabilitas absensi untuk sinkronisasi local-first",
          });
        if (error) throw error;
      }

      toast({
        title: "Profil Skalabilitas Diterapkan",
        description: `Konfigurasi "${profile.label}" aktif dan tersimpan global.`,
      });
    } catch (error) {
      console.error("Error saving scalability settings:", error);
      toast({
        title: "Gagal Menyimpan Profil",
        description: "Profil lokal tetap aktif, tetapi sinkronisasi global gagal.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const tierColors: Record<ScalabilityTier, string> = {
    small: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
    medium: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
    large: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    enterprise: "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400",
  };

  const tierBadgeColors: Record<ScalabilityTier, string> = {
    small: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    large: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    enterprise: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };

  const formatMs = (ms: number) => {
    if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`;
    return `${ms}ms`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Pengaturan Skalabilitas
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Konfigurasi otomatis parameter resiliensi berdasarkan estimasi jumlah pengguna.
          </p>
        </div>
        <Badge className={tierBadgeColors[activeProfile.tier]}>
          {activeProfile.label}
        </Badge>
      </div>
      {isSaving && (
        <p className="text-xs text-muted-foreground">Menyimpan konfigurasi skalabilitas global...</p>
      )}

      {/* Ingestion Queue Health */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Health Ingestion Queue
            </span>
            <Button variant="outline" size="sm" onClick={loadIngestHealth} disabled={isHealthLoading}>
              <RefreshCw className={cn("h-3 w-3 mr-1", isHealthLoading && "animate-spin")} />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Monitoring antrean sinkronisasi absensi real-time untuk deteksi bottleneck.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ingestHealth ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Queue Depth</p>
                <p className="text-lg font-semibold">{ingestHealth.queue_depth.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Processing</p>
                <p className="text-lg font-semibold">{ingestHealth.processing_count.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Failed / Dead</p>
                <p className="text-lg font-semibold">
                  {ingestHealth.failed_count.toLocaleString()} / {ingestHealth.dead_count.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Processed 5m</p>
                <p className="text-lg font-semibold">{ingestHealth.processed_last_5m.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">Avg Lag</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.avg_lag_seconds)}s</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-xs text-muted-foreground">P95 Lag</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.p95_lag_seconds)}s</p>
              </div>
              <div className="p-3 rounded-md bg-muted/40 col-span-2">
                <p className="text-xs text-muted-foreground">Max Pending Age</p>
                <p className="text-lg font-semibold">{Math.round(ingestHealth.max_pending_age_seconds)}s</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada data health queue.</p>
          )}
        </CardContent>
      </Card>

      {/* Estimasi User Input */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">Estimasi Total Pegawai:</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={estimatedUsers}
                onChange={(e) => setEstimatedUsers(e.target.value)}
                min={1}
                max={500000}
                className="w-32 px-3 py-2 rounded-md border bg-background text-foreground text-sm"
              />
              <span className="text-sm text-muted-foreground">user</span>
              {recommendedTier !== activeProfile.tier && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApplyProfile(recommendedTier)}
                  className="flex items-center gap-1"
                >
                  <Zap className="h-3 w-3" />
                  Terapkan Rekomendasi
                </Button>
              )}
            </div>
          </div>
          {recommendedTier !== activeProfile.tier && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Berdasarkan estimasi <strong>{parseInt(estimatedUsers).toLocaleString()}</strong> user, 
                kami merekomendasikan profil <strong>{profiles.find(p => p.tier === recommendedTier)?.label}</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profiles.map((profile) => {
          const isActive = activeProfile.tier === profile.tier;
          const isRecommended = recommendedTier === profile.tier;
          const pt = calculateThroughput(profile);

          return (
            <Card
              key={profile.tier}
              className={cn(
                "relative transition-all cursor-pointer hover:shadow-md",
                isActive && "ring-2 ring-primary shadow-md",
                tierColors[profile.tier]
              )}
              onClick={() => handleApplyProfile(profile.tier)}
            >
              {isRecommended && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Rekomendasi
                  </Badge>
                </div>
              )}
              {isActive && (
                <div className="absolute -top-2 -left-2 z-10">
                  <Badge className="bg-green-600 text-white text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Aktif
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{profile.label}</CardTitle>
                <CardDescription className="text-xs">{profile.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3 w-3 opacity-60" />
                    <span>Jitter: 0–{formatMs(profile.jitterPeakMaxMs)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 opacity-60" />
                    <span>Retry: {profile.backoffMaxRetries}x</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 opacity-60" />
                    <span>CB: {profile.cbFailureThreshold} fail</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 opacity-60" />
                    <span>Batch: {profile.batchSize}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>Timeout: {formatMs(profile.rpcTimeoutBaseMs)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 opacity-60" />
                    <span>~{pt.peakReqPerSec} req/s</span>
                  </div>
                </div>
                {profile.showQueueMessage && (
                  <div className="mt-2 p-2 rounded bg-background/50 text-xs flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 opacity-60 flex-shrink-0" />
                    <span>Pesan antrean aktif (estimasi {profile.estimatedQueueSeconds}s)</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* Active Config Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Detail Konfigurasi Aktif: {activeProfile.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Jitter */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-blue-500" />
                Adaptive Jitter
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Peak (06-09, 15-18)</span>
                  <span className="font-mono font-medium text-foreground">0–{formatMs(activeProfile.jitterPeakMaxMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Off-Peak</span>
                  <span className="font-mono font-medium text-foreground">0–{formatMs(activeProfile.jitterOffpeakMaxMs)}</span>
                </div>
              </div>
            </div>

            {/* Backoff */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                Exponential Backoff
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Delay</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.backoffBaseMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Delay</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.backoffMaxMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Retries</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.backoffMaxRetries}x</span>
                </div>
              </div>
            </div>

            {/* Circuit Breaker */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Circuit Breaker
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Failure Threshold</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.cbFailureThreshold} kali</span>
                </div>
                <div className="flex justify-between">
                  <span>Recovery Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.cbRecoveryTimeoutMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success to Close</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.cbSuccessThreshold} kali</span>
                </div>
              </div>
            </div>

            {/* Timeout */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-green-500" />
                RPC Timeout
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.rpcTimeoutBaseMs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Timeout</span>
                  <span className="font-mono font-medium text-foreground">{formatMs(activeProfile.rpcTimeoutMaxMs)}</span>
                </div>
              </div>
            </div>

            {/* Batch & Buffer */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-500" />
                Batch & Buffer
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Batch Size</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.batchSize} entries</span>
                </div>
                <div className="flex justify-between">
                  <span>Buffer Expiry</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.bufferExpiryDays} hari</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Sync Attempts</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.maxSyncAttempts}x</span>
                </div>
              </div>
            </div>

            {/* Throughput */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                Estimasi Throughput
              </h4>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Peak Req/s</span>
                  <span className="font-mono font-medium text-foreground">~{throughput.peakReqPerSec}</span>
                </div>
                <div className="flex justify-between">
                  <span>Off-peak Req/s</span>
                  <span className="font-mono font-medium text-foreground">~{throughput.offpeakReqPerSec}</span>
                </div>
                <div className="flex justify-between">
                  <span>Queue Message</span>
                  <span className="font-mono font-medium text-foreground">{activeProfile.showQueueMessage ? 'Aktif' : 'Nonaktif'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Queue Message Preview */}
          {activeProfile.showQueueMessage && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-2">Preview Pesan Antrean (tampil di aplikasi pegawai):</h4>
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-blue-700 dark:text-blue-300">
                      Antrean sistem sedang padat
                    </p>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
                      Data Anda telah tersimpan di perangkat dan sedang mengantre untuk dikirim 
                      (Estimasi: {activeProfile.estimatedQueueSeconds} detik). Jangan tutup aplikasi Anda.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Glossary - Penjelasan Istilah & Mekanisme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Penjelasan Istilah & Mekanisme Skalabilitas
          </CardTitle>
          <CardDescription>
            Panduan lengkap mengenai istilah teknis dan cara kerja sistem resiliensi pada halaman ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Arsitektur Umum */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Arsitektur Offline-First & Resiliensi
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sistem absensi menggunakan pendekatan <strong>Offline-First</strong>: setiap data absen disimpan secara instan ke perangkat pengguna (IndexedDB) terlebih dahulu, lalu disinkronkan ke server di latar belakang. 
              Jika server sedang sibuk atau koneksi putus, data tetap aman di perangkat dan akan otomatis dikirim ulang saat kondisi memungkinkan. 
              Strategi ini memastikan pengalaman pengguna tetap lancar meskipun terjadi lonjakan trafik hingga ratusan ribu pengguna bersamaan.
            </p>
          </div>

          {/* Istilah-istilah */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Adaptive Jitter */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4 text-blue-500" />
                Adaptive Jitter
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Jitter</strong> adalah penundaan acak (random delay) yang ditambahkan sebelum data dikirim ke server. 
                Tujuannya untuk mencegah fenomena <em>"Thundering Herd"</em> — situasi di mana ribuan perangkat mengirim data secara bersamaan dan membuat server kewalahan. 
                Delay ini bersifat <strong>adaptif</strong>: lebih besar di jam sibuk (pagi 06-09 & sore 15-18) dan minimal di luar jam puncak. 
                Contoh: Pada tier Enterprise, setiap perangkat menunggu acak antara 0–120 detik sebelum mengirim data, sehingga beban server tersebar merata.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Peak:</strong> Jam masuk/pulang kerja &nbsp;|&nbsp; <strong>Off-Peak:</strong> Di luar jam tersebut
              </div>
            </div>

            {/* Exponential Backoff */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                Exponential Backoff
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Strategi pengiriman ulang (retry) ketika request gagal. Setiap percobaan ulang memiliki jeda yang semakin panjang secara eksponensial: 
                percobaan ke-1 menunggu 1 detik, ke-2 menunggu 2 detik, ke-3 menunggu 4 detik, dst. 
                Hal ini mencegah server dibanjiri retry secara bersamaan saat terjadi gangguan.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Base Delay:</strong> Jeda awal percobaan ulang &nbsp;|&nbsp; 
                <strong>Max Delay:</strong> Batas maksimum jeda &nbsp;|&nbsp; 
                <strong>Max Retries:</strong> Jumlah percobaan ulang maksimal
              </div>
            </div>

            {/* Circuit Breaker */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-500" />
                Circuit Breaker
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Mekanisme pemutus sirkuit yang melindungi server dari overload. Memiliki 3 status: 
                <strong> Closed</strong> (normal, request dikirim), 
                <strong> Open</strong> (server bermasalah, request dihentikan sementara), dan 
                <strong> Half-Open</strong> (percobaan kirim sebagian untuk mengecek apakah server pulih). 
                Jika kegagalan beruntun mencapai threshold, circuit breaker berpindah ke status Open dan menghentikan semua pengiriman selama periode pemulihan.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Failure Threshold:</strong> Jumlah gagal sebelum "Open" &nbsp;|&nbsp; 
                <strong>Recovery Timeout:</strong> Waktu tunggu sebelum coba lagi &nbsp;|&nbsp; 
                <strong>Success to Close:</strong> Sukses berturut-turut untuk kembali "Closed"
              </div>
            </div>

            {/* RPC Timeout */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-500" />
                RPC Timeout
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>RPC (Remote Procedure Call)</strong> adalah panggilan fungsi ke server database. 
                Timeout menentukan berapa lama sistem menunggu respons server sebelum menganggap request gagal. 
                Timeout yang terlalu pendek menyebabkan banyak gagal palsu; terlalu panjang membuat pengguna menunggu lama. 
                Nilai timeout bersifat <strong>adaptif</strong>: bertambah setiap kali percobaan ulang untuk mengantisipasi server yang sedang lambat.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Base:</strong> Timeout percobaan pertama &nbsp;|&nbsp; 
                <strong>Max:</strong> Batas maksimum timeout
              </div>
            </div>

            {/* Batch & Buffer */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-500" />
                Batch & Buffer (IndexedDB)
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Buffer</strong> adalah penyimpanan lokal di perangkat pengguna menggunakan IndexedDB (database browser) 
                yang menyimpan data absen secara instan (&lt;5ms) bahkan saat offline. Data dienkripsi sederhana (XOR + Base64) untuk mencegah manipulasi. 
                <strong> Batching</strong> adalah proses mengirim data secara berkelompok (bukan satu per satu) ke server, 
                sehingga mengurangi jumlah koneksi dan meningkatkan efisiensi sinkronisasi.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Batch Size:</strong> Jumlah data per kelompok kirim &nbsp;|&nbsp; 
                <strong>Buffer Expiry:</strong> Lama data disimpan di perangkat &nbsp;|&nbsp; 
                <strong>Max Sync Attempts:</strong> Percobaan sinkronisasi maksimal
              </div>
            </div>

            {/* Throughput */}
            <div className="p-4 rounded-lg border space-y-2">
              <h5 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                Estimasi Throughput
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Throughput</strong> adalah estimasi jumlah request yang dapat diproses server per detik. 
                Dihitung berdasarkan jumlah pengguna dan jitter window: semakin besar jitter, semakin tersebar beban, 
                sehingga request per detik ke server semakin rendah dan stabil. 
                <strong> Queue Message</strong> adalah pesan informatif yang ditampilkan kepada pegawai saat jitter melebihi 5 detik, 
                memberitahu bahwa data aman dan sedang mengantre.
              </p>
              <div className="text-xs p-2 rounded bg-muted/50">
                <strong>Peak Req/s:</strong> Request/detik di jam sibuk &nbsp;|&nbsp; 
                <strong>Off-peak Req/s:</strong> Request/detik di luar jam sibuk
              </div>
            </div>
          </div>

          {/* Alur Kerja */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Alur Kerja Sistem Saat Pegawai Menekan Tombol Absen
            </h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
              <li><strong>Simpan Instan:</strong> Data absen (timestamp, GPS, jarak) langsung disimpan ke IndexedDB di perangkat. Status: <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">Pending</Badge></li>
              <li><strong>Adaptive Jitter:</strong> Sistem menghitung delay acak berdasarkan tier dan jam saat ini, lalu menunggu selama delay tersebut.</li>
              <li><strong>Cek Circuit Breaker:</strong> Jika status "Open" (server bermasalah), data tetap di antrean lokal. Jika "Closed", lanjut kirim.</li>
              <li><strong>Kirim ke Server (RPC):</strong> Data dikirim via fungsi database atomik. Jika gagal, masuk mekanisme Exponential Backoff.</li>
              <li><strong>Sinkronisasi Berhasil:</strong> Status diperbarui menjadi <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-700 dark:text-green-300">Synced</Badge>. Data aman di server.</li>
              <li><strong>Re-hydration:</strong> Jika aplikasi/HP mati mendadak, saat dibuka kembali sistem memulihkan data "stuck" dari IndexedDB dan melanjutkan sinkronisasi.</li>
            </ol>
          </div>

          {/* Tier Explanation */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Tentang Tier Skalabilitas
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Setiap tier dirancang untuk kapasitas pengguna tertentu. Semakin besar tier, semakin agresif strategi distribusi beban (jitter lebih besar, batch lebih banyak, retry lebih sabar). 
              Pilih tier sesuai estimasi jumlah pegawai aktif yang akan melakukan absensi bersamaan. 
              Sistem akan memberikan rekomendasi otomatis berdasarkan angka yang Anda masukkan.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-green-500/10 text-center">
                <p className="font-semibold text-green-700 dark:text-green-300">Small</p>
                <p className="text-muted-foreground">≤5.000 user</p>
                <p className="text-muted-foreground">Delay minimal</p>
              </div>
              <div className="p-2 rounded bg-blue-500/10 text-center">
                <p className="font-semibold text-blue-700 dark:text-blue-300">Medium</p>
                <p className="text-muted-foreground">5K–20K user</p>
                <p className="text-muted-foreground">Jitter moderat</p>
              </div>
              <div className="p-2 rounded bg-amber-500/10 text-center">
                <p className="font-semibold text-amber-700 dark:text-amber-300">Large</p>
                <p className="text-muted-foreground">20K–100K user</p>
                <p className="text-muted-foreground">Batching agresif</p>
              </div>
              <div className="p-2 rounded bg-purple-500/10 text-center">
                <p className="font-semibold text-purple-700 dark:text-purple-300">Enterprise</p>
                <p className="text-muted-foreground">100K–500K user</p>
                <p className="text-muted-foreground">Jitter 0–120s</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
