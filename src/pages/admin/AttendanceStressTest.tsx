import { useState, useRef, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import {
  Play,
  Square,
  Zap,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Activity,
  BarChart3,
  ServerCrash,
  Timer,
  Gauge,
  ArrowUpDown,
} from "lucide-react";
import {
  StressTestEngine,
  StressTestState,
  DEFAULT_CONFIGS,
  type StressTestConfig,
} from "@/lib/attendanceStressTest";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function AttendanceStressTest() {
  const { toast } = useToast();
  const [scenario, setScenario] = useState<string>("gradual");
  const [config, setConfig] = useState<StressTestConfig>(DEFAULT_CONFIGS.gradual);
  const [testState, setTestState] = useState<StressTestState | null>(null);
  const engineRef = useRef<StressTestEngine | null>(null);

  const handleConfigChange = <K extends keyof StressTestConfig>(
    key: K,
    value: StressTestConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleScenarioChange = (val: string) => {
    setScenario(val);
    if (DEFAULT_CONFIGS[val]) {
      setConfig(DEFAULT_CONFIGS[val]);
    }
  };

  const handleStart = useCallback(() => {
    if (config.mode === "live" && config.totalUsers > 5000) {
      toast({
        title: "Uji Langsung Dibatasi",
        description: "Untuk keamanan, mode uji langsung dibatasi maksimal 5.000 pengguna virtual per eksekusi.",
        variant: "destructive",
      });
      return;
    }

    const engine = new StressTestEngine(config, setTestState);
    engineRef.current = engine;
    engine.start();
  }, [config, toast]);

  const handleStop = useCallback(() => {
    engineRef.current?.abort();
  }, []);

  const isRunning = testState?.status === 'running';
  const isCompleted = testState?.status === 'completed' || testState?.status === 'aborted';
  const metrics = testState?.metrics;
  const progress = metrics ? Math.round((metrics.completedUsers / config.totalUsers) * 100) : 0;

  const successRate = metrics && metrics.totalRequests > 0
    ? Math.round((metrics.successCount / metrics.totalRequests) * 100 * 10) / 10
    : 0;

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Uji Beban Absensi
          </h1>
          <p className="text-muted-foreground mt-1">
            Simulasi beban tinggi untuk menguji resiliensi sistem sebelum deployment produksi
          </p>
        </div>

        {/* Config Panel */}
        {!isRunning && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Konfigurasi Uji
              </CardTitle>
              <CardDescription>
                Pilih skenario dan sesuaikan parameter simulasi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Scenario Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'burst', icon: Zap, title: 'Burst', desc: '1.000 user sekaligus', color: 'text-yellow-500' },
                  { key: 'gradual', icon: TrendingUp, title: 'Gradual', desc: '5.000 user bertahap', color: 'text-blue-500' },
                  { key: 'peak_simulation', icon: Users, title: 'Peak 20K', desc: '20.000 user simulasi', color: 'text-red-500' },
                  { key: 'circuit_breaker', icon: Shield, title: 'Circuit Breaker', desc: 'Uji circuit breaker', color: 'text-purple-500' },
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => handleScenarioChange(s.key)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      scenario === s.key
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <s.icon className={`h-5 w-5 mb-2 ${s.color}`} />
                    <div className="font-semibold text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Uji Beban Bertahap (Rekomendasi Produksi)</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "stage_10k", label: "Tahap 10K" },
                    { key: "stage_50k", label: "Tahap 50K" },
                    { key: "stage_100k", label: "Tahap 100K" },
                    { key: "stage_500k", label: "Tahap 500K" },
                  ].map((stage) => (
                    <Button
                      key={stage.key}
                      variant={scenario === stage.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleScenarioChange(stage.key)}
                    >
                      {stage.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Jalankan bertahap: 10K → 50K → 100K → 500K, evaluasi latensi p95 dan tingkat galat di tiap tahap.
                </p>
              </div>

              <Separator />

              {/* Parameters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Total Pengguna Virtual</Label>
                  <Input
                    type="number"
                    value={config.totalUsers}
                    onChange={e => handleConfigChange('totalUsers', parseInt(e.target.value) || 100)}
                    min={10}
                    max={500000}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ramp-up (detik)</Label>
                  <Input
                    type="number"
                    value={config.rampUpSeconds}
                    onChange={e => handleConfigChange('rampUpSeconds', parseInt(e.target.value) || 0)}
                    min={0}
                    max={300}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ukuran Batch</Label>
                  <Input
                    type="number"
                    value={config.concurrentBatchSize}
                    onChange={e => handleConfigChange('concurrentBatchSize', parseInt(e.target.value) || 10)}
                    min={1}
                    max={500}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Latensi Simulasi (ms)</Label>
                  <Input
                    type="number"
                    value={config.simulatedLatencyMs}
                    onChange={e => handleConfigChange('simulatedLatencyMs', parseInt(e.target.value) || 100)}
                    min={50}
                    max={5000}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tingkat Kegagalan (%)</Label>
                  <Input
                    type="number"
                    value={Math.round(config.failureRate * 100)}
                    onChange={e => handleConfigChange('failureRate', (parseInt(e.target.value) || 0) / 100)}
                    min={0}
                    max={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mode</Label>
                  <Select value={config.mode} onValueChange={v => handleConfigChange('mode', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dry_run">Simulasi Kering (tanpa DB)</SelectItem>
                      <SelectItem value="live">Uji Langsung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Start Button */}
              <div className="flex gap-3">
                <Button onClick={handleStart} size="lg" className="gap-2">
                  <Play className="h-4 w-4" />
                  Mulai Uji Beban
                </Button>
                {config.mode === 'live' && (
                  <Badge variant="destructive" className="self-center">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Mode uji langsung — akan mengirim permintaan ke server
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Running / Results */}
        {testState && (
          <>
            {/* Progress Bar */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={isRunning ? 'default' : isCompleted ? 'secondary' : 'outline'}>
                      {testState.status === 'running' && '🔄 Berjalan'}
                      {testState.status === 'completed' && '✅ Selesai'}
                      {testState.status === 'aborted' && '⏹️ Dibatalkan'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {metrics?.completedUsers ?? 0} / {config.totalUsers} pengguna
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ⏱️ {metrics?.elapsedSeconds ?? 0}s
                    </span>
                  </div>
                  {isRunning && (
                    <Button onClick={handleStop} variant="destructive" size="sm" className="gap-1">
                      <Square className="h-3 w-3" />
                      Hentikan
                    </Button>
                  )}
                  {!isRunning && (
                    <Button onClick={handleStart} size="sm" className="gap-1">
                      <Play className="h-3 w-3" />
                      Jalankan Ulang
                    </Button>
                  )}
                </div>
                <Progress value={progress} className="h-3" />
              </CardContent>
            </Card>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard
                icon={BarChart3}
                label="Total Permintaan"
                value={metrics?.totalRequests ?? 0}
                color="text-blue-500"
              />
              <MetricCard
                icon={CheckCircle2}
                label="Berhasil"
                value={metrics?.successCount ?? 0}
                suffix={`(${successRate}%)`}
                color="text-green-500"
              />
              <MetricCard
                icon={XCircle}
                label="Gagal"
                value={metrics?.failureCount ?? 0}
                color="text-red-500"
              />
              <MetricCard
                icon={Gauge}
                label="Req/s"
                value={metrics?.requestsPerSecond ?? 0}
                color="text-purple-500"
              />
              <MetricCard
                icon={Timer}
                label="Rata-rata Respons"
                value={`${metrics?.avgResponseTime ?? 0}ms`}
                color="text-orange-500"
              />
              <MetricCard
                icon={Shield}
                label="Trip CB"
                value={metrics?.circuitBreakerTrips ?? 0}
                suffix={metrics?.circuitBreakerStatus}
                color="text-pink-500"
              />
            </div>

            {/* Tabs: Charts / Latency / Users / Logs */}
            <Tabs defaultValue="charts" className="w-full">
              <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                <TabsTrigger value="charts" className="whitespace-nowrap">📊 Throughput</TabsTrigger>
                <TabsTrigger value="latency" className="whitespace-nowrap">⏱️ Latensi</TabsTrigger>
                <TabsTrigger value="users" className="whitespace-nowrap">👥 Pengguna</TabsTrigger>
                <TabsTrigger value="logs" className="whitespace-nowrap">📝 Log</TabsTrigger>
              </TabsList>

              {/* Throughput Chart */}
              <TabsContent value="charts">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Throughput & Tingkat Galat (per detik)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metrics?.throughputHistory ?? []}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" className="text-xs" label={{ value: 'Detik', position: 'insideBottom', offset: -5 }} />
                          <YAxis className="text-xs" />
                          <Tooltip />
                          <Area type="monotone" dataKey="rps" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" name="Req/s" />
                          <Area type="monotone" dataKey="errors" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive)/0.2)" name="Galat" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Latency Distribution */}
              <TabsContent value="latency">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Distribusi Latensi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { label: 'Min', value: metrics?.minResponseTime === Infinity ? 0 : metrics?.minResponseTime ?? 0 },
                        { label: 'P50 (Median)', value: metrics?.p50ResponseTime ?? 0 },
                        { label: 'P95', value: metrics?.p95ResponseTime ?? 0 },
                        { label: 'P99', value: metrics?.p99ResponseTime ?? 0 },
                        { label: 'Max', value: metrics?.maxResponseTime ?? 0 },
                      ].map(item => (
                        <div key={item.label} className="text-center p-4 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{item.value}ms</div>
                          <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="p-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground">Jitter Rata-rata:</span>{' '}
                        <span className="font-semibold">{metrics?.avgJitterMs ?? 0}ms</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground">Total Coba Ulang:</span>{' '}
                        <span className="font-semibold">{metrics?.totalRetries ?? 0}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <span className="text-muted-foreground">Pengguna Aktif:</span>{' '}
                        <span className="font-semibold">{metrics?.activeUsers ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Virtual Users Table */}
              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Pengguna Virtual (100 teratas)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-72">
                      <div className="space-y-1">
                        <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground px-2 pb-2">
                          <div>ID</div>
                          <div>Status</div>
                          <div>Jitter</div>
                          <div>Latency</div>
                          <div>Retries</div>
                          <div>Error</div>
                        </div>
                        {(testState.users ?? []).map(user => (
                          <div
                            key={user.id}
                            className="grid grid-cols-6 gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50"
                          >
                            <div className="font-mono truncate">{user.id}</div>
                            <div>
                              <UserStatusBadge status={user.status} />
                            </div>
                            <div>{user.jitterMs}ms</div>
                            <div>{user.latencyMs}ms</div>
                            <div>{user.retries}</div>
                            <div className="text-destructive truncate">{user.error || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Logs */}
              <TabsContent value="logs">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Log Peristiwa (50 terakhir)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-72">
                      <div className="space-y-1 font-mono text-xs">
                        {(testState.logs ?? []).map((log, i) => (
                          <div
                            key={i}
                            className={`px-2 py-1 rounded ${
                              log.level === 'error' ? 'text-destructive bg-destructive/5' :
                              log.level === 'warn' ? 'text-yellow-600 bg-yellow-500/5' :
                              log.level === 'success' ? 'text-green-600 bg-green-500/5' :
                              'text-muted-foreground'
                            }`}
                          >
                            <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                            {log.message}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Summary Card (after completion) */}
            {isCompleted && metrics && (
              <Card className={successRate >= 95 ? 'border-green-500/50' : successRate >= 80 ? 'border-yellow-500/50' : 'border-destructive/50'}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {successRate >= 95 ? (
                      <><CheckCircle2 className="h-5 w-5 text-green-500" /> Sistem SIAP Produksi</>
                    ) : successRate >= 80 ? (
                      <><AlertTriangle className="h-5 w-5 text-yellow-500" /> Perlu Optimisasi</>
                    ) : (
                      <><ServerCrash className="h-5 w-5 text-destructive" /> Tidak Siap Produksi</>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Tingkat Keberhasilan:</span>
                      <div className="text-2xl font-bold">{successRate}%</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Throughput:</span>
                      <div className="text-2xl font-bold">{metrics.requestsPerSecond} req/s</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Latensi P95:</span>
                      <div className="text-2xl font-bold">{metrics.p95ResponseTime}ms</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Trip CB:</span>
                      <div className="text-2xl font-bold">{metrics.circuitBreakerTrips}</div>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>📌 <strong>Rekomendasi:</strong></p>
                    {successRate < 95 && <p>• Tingkatkan failure rate tolerance atau tambah server capacity</p>}
                    {(metrics.p95ResponseTime ?? 0) > 1000 && <p>• P95 latensi tinggi — optimalkan query atau tambah replica</p>}
                    {metrics.circuitBreakerTrips > 0 && <p>• Circuit breaker tertriger — periksa koneksi database</p>}
                    {metrics.totalRetries > metrics.totalRequests * 0.1 && <p>• Retry rate tinggi ({metrics.totalRetries}) — pertimbangkan backoff yang lebih agresif</p>}
                    {successRate >= 95 && (metrics.p95ResponseTime ?? 0) < 1000 && metrics.circuitBreakerTrips === 0 && (
                      <p>✅ Semua metrik dalam batas aman. Sistem siap untuk beban {config.totalUsers} user bersamaan.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
        <PageGlossarySection preset="admin_stress_test" />
      </div>
    </SuperAdminLayout>
  );
}

// ==================== SUB-COMPONENTS ====================

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  suffix?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-xl font-bold">{value}</div>
        {suffix && <div className="text-xs text-muted-foreground">{suffix}</div>}
      </CardContent>
    </Card>
  );
}

function UserStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    waiting: { variant: 'outline', label: '⏳' },
    jitter: { variant: 'secondary', label: '🔄' },
    requesting: { variant: 'default', label: '📡' },
    success: { variant: 'secondary', label: '✅' },
    failed: { variant: 'destructive', label: '❌' },
    circuit_blocked: { variant: 'destructive', label: '🔌' },
  };
  const v = variants[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={v.variant} className="text-[10px] px-1">{v.label}</Badge>;
}
