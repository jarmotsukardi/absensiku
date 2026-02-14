/**
 * attendanceStressTest.ts
 * 
 * Stress Test Engine untuk sistem absensi.
 * Mensimulasikan ribuan virtual user melakukan check-in/check-out bersamaan
 * tanpa menyentuh database (dry-run) - hanya menguji resilience layer.
 * 
 * Mode:
 * 1. DRY RUN (default) - Simulasi penuh tanpa database write
 * 2. LIVE TEST - Mengirim request nyata ke edge function (opsional)
 */

import {
  generateAdaptiveJitter,
  calculateBackoff,
  canMakeRequest,
  recordSuccess,
  recordFailure,
  getCircuitBreakerInfo,
  isPeakHours,
  isRetryableError,
} from './attendanceResilience';

// ==================== TYPES ====================

export interface StressTestConfig {
  totalUsers: number;
  rampUpSeconds: number;       // Waktu untuk menambah user secara bertahap
  testDurationSeconds: number; // Durasi total test
  scenario: 'burst' | 'gradual' | 'peak_simulation' | 'circuit_breaker';
  mode: 'dry_run' | 'live';   // dry_run = no DB writes
  concurrentBatchSize: number; // Berapa user per batch
  simulatedLatencyMs: number;  // Simulated server response time
  failureRate: number;         // 0-1, simulated failure percentage
}

export interface VirtualUser {
  id: string;
  name: string;
  status: 'waiting' | 'jitter' | 'requesting' | 'success' | 'failed' | 'circuit_blocked';
  startTime: number;
  endTime: number | null;
  jitterMs: number;
  latencyMs: number;
  retries: number;
  error: string | null;
}

export interface StressTestMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  circuitBreakerTrips: number;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  requestsPerSecond: number;
  activeUsers: number;
  completedUsers: number;
  avgJitterMs: number;
  totalRetries: number;
  elapsedSeconds: number;
  circuitBreakerStatus: string;
  throughputHistory: { time: number; rps: number; errors: number }[];
}

export interface StressTestState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'aborted';
  config: StressTestConfig;
  users: VirtualUser[];
  metrics: StressTestMetrics;
  logs: StressTestLog[];
}

export interface StressTestLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_CONFIGS: Record<string, StressTestConfig> = {
  burst: {
    totalUsers: 1000,
    rampUpSeconds: 0,
    testDurationSeconds: 60,
    scenario: 'burst',
    mode: 'dry_run',
    concurrentBatchSize: 100,
    simulatedLatencyMs: 200,
    failureRate: 0.05,
  },
  gradual: {
    totalUsers: 5000,
    rampUpSeconds: 30,
    testDurationSeconds: 120,
    scenario: 'gradual',
    mode: 'dry_run',
    concurrentBatchSize: 50,
    simulatedLatencyMs: 300,
    failureRate: 0.03,
  },
  peak_simulation: {
    totalUsers: 20000,
    rampUpSeconds: 60,
    testDurationSeconds: 180,
    scenario: 'peak_simulation',
    mode: 'dry_run',
    concurrentBatchSize: 200,
    simulatedLatencyMs: 500,
    failureRate: 0.1,
  },
  circuit_breaker: {
    totalUsers: 500,
    rampUpSeconds: 5,
    testDurationSeconds: 90,
    scenario: 'circuit_breaker',
    mode: 'dry_run',
    concurrentBatchSize: 100,
    simulatedLatencyMs: 100,
    failureRate: 0.8, // High failure to trigger circuit breaker
  },
  stage_10k: {
    totalUsers: 10000,
    rampUpSeconds: 45,
    testDurationSeconds: 180,
    scenario: 'gradual',
    mode: 'dry_run',
    concurrentBatchSize: 150,
    simulatedLatencyMs: 350,
    failureRate: 0.03,
  },
  stage_50k: {
    totalUsers: 50000,
    rampUpSeconds: 90,
    testDurationSeconds: 240,
    scenario: 'peak_simulation',
    mode: 'dry_run',
    concurrentBatchSize: 250,
    simulatedLatencyMs: 450,
    failureRate: 0.05,
  },
  stage_100k: {
    totalUsers: 100000,
    rampUpSeconds: 120,
    testDurationSeconds: 300,
    scenario: 'peak_simulation',
    mode: 'dry_run',
    concurrentBatchSize: 350,
    simulatedLatencyMs: 550,
    failureRate: 0.08,
  },
  stage_500k: {
    totalUsers: 500000,
    rampUpSeconds: 180,
    testDurationSeconds: 420,
    scenario: 'peak_simulation',
    mode: 'dry_run',
    concurrentBatchSize: 500,
    simulatedLatencyMs: 700,
    failureRate: 0.1,
  },
};

// ==================== METRICS HELPERS ====================

function getEmptyMetrics(): StressTestMetrics {
  return {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    circuitBreakerTrips: 0,
    avgResponseTime: 0,
    p50ResponseTime: 0,
    p95ResponseTime: 0,
    p99ResponseTime: 0,
    maxResponseTime: 0,
    minResponseTime: Infinity,
    requestsPerSecond: 0,
    activeUsers: 0,
    completedUsers: 0,
    avgJitterMs: 0,
    totalRetries: 0,
    elapsedSeconds: 0,
    circuitBreakerStatus: 'closed',
    throughputHistory: [],
  };
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ==================== STRESS TEST ENGINE ====================

export class StressTestEngine {
  private config: StressTestConfig;
  private users: VirtualUser[] = [];
  private metrics: StressTestMetrics;
  private logs: StressTestLog[] = [];
  private responseTimes: number[] = [];
  private jitterTimes: number[] = [];
  private abortController: AbortController | null = null;
  private startTime: number = 0;
  private onUpdate: (state: StressTestState) => void;
  private status: StressTestState['status'] = 'idle';
  private throughputWindow: { time: number; success: boolean; weight: number }[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private userScaleFactor = 1;

  constructor(config: StressTestConfig, onUpdate: (state: StressTestState) => void) {
    this.config = config;
    this.metrics = getEmptyMetrics();
    this.onUpdate = onUpdate;
  }

  private log(level: StressTestLog['level'], message: string) {
    const entry: StressTestLog = { timestamp: Date.now(), level, message };
    this.logs.push(entry);
    // Keep only last 500 logs
    if (this.logs.length > 500) this.logs = this.logs.slice(-500);
  }

  private emitUpdate() {
    // Calculate current metrics
    const elapsed = (Date.now() - this.startTime) / 1000;
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const scaledActiveUsers = this.users.filter(u => u.status === 'jitter' || u.status === 'requesting').length * this.userScaleFactor;
    const scaledCompletedUsers = this.users.filter(u => u.status === 'success' || u.status === 'failed' || u.status === 'circuit_blocked').length * this.userScaleFactor;

    this.metrics.elapsedSeconds = Math.round(elapsed);
    this.metrics.activeUsers = Math.min(this.config.totalUsers, scaledActiveUsers);
    this.metrics.completedUsers = Math.min(this.config.totalUsers, scaledCompletedUsers);
    this.metrics.avgResponseTime = sortedTimes.length > 0 ? Math.round(sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length) : 0;
    this.metrics.p50ResponseTime = calculatePercentile(sortedTimes, 50);
    this.metrics.p95ResponseTime = calculatePercentile(sortedTimes, 95);
    this.metrics.p99ResponseTime = calculatePercentile(sortedTimes, 99);
    this.metrics.maxResponseTime = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0;
    this.metrics.minResponseTime = sortedTimes.length > 0 ? sortedTimes[0] : 0;
    this.metrics.requestsPerSecond = elapsed > 0 ? Math.round(this.metrics.totalRequests / elapsed * 10) / 10 : 0;
    this.metrics.avgJitterMs = this.jitterTimes.length > 0 ? Math.round(this.jitterTimes.reduce((a, b) => a + b, 0) / this.jitterTimes.length) : 0;
    this.metrics.circuitBreakerStatus = getCircuitBreakerInfo().status;

    // Throughput history (1-second windows)
    const now = Date.now();
    this.throughputWindow = this.throughputWindow.filter(e => now - e.time < 60000);
    const oneSecAgo = now - 1000;
    const recentRequests = this.throughputWindow.filter(e => e.time >= oneSecAgo);
    const recentRps = recentRequests.reduce((acc, item) => acc + item.weight, 0);
    const recentErrors = recentRequests
      .filter(e => !e.success)
      .reduce((acc, item) => acc + item.weight, 0);
    if (elapsed > 0 && this.metrics.totalRequests > 0) {
      this.metrics.throughputHistory.push({
        time: Math.round(elapsed),
        rps: recentRps,
        errors: recentErrors,
      });
      // Keep last 180 entries
      if (this.metrics.throughputHistory.length > 180) {
        this.metrics.throughputHistory = this.metrics.throughputHistory.slice(-180);
      }
    }

    this.onUpdate({
      status: this.status,
      config: this.config,
      users: this.users.slice(0, 100), // Limit to 100 for UI performance
      metrics: { ...this.metrics },
      logs: this.logs.slice(-50),
    });
  }

  private createVirtualUser(index: number): VirtualUser {
    return {
      id: `user_${index.toString().padStart(5, '0')}`,
      name: `Pegawai #${index + 1}`,
      status: 'waiting',
      startTime: 0,
      endTime: null,
      jitterMs: 0,
      latencyMs: 0,
      retries: 0,
      error: null,
    };
  }

  private async simulateRequest(user: VirtualUser): Promise<void> {
    user.startTime = Date.now();

    // 1. Adaptive Jitter
    user.status = 'jitter';
    const jitter = generateAdaptiveJitter(user.retries);
    user.jitterMs = jitter;
    this.jitterTimes.push(jitter);

    // Scale jitter down for simulation speed (1/10th)
    const scaledJitter = Math.min(jitter / 10, 3000);
    await new Promise(r => setTimeout(r, scaledJitter));

    if (this.abortController?.signal.aborted) return;

    // 2. Circuit Breaker Check
    const cbCheck = canMakeRequest();
    if (!cbCheck.allowed) {
      user.status = 'circuit_blocked';
      user.error = 'Circuit breaker open';
      user.endTime = Date.now();
      this.metrics.circuitBreakerTrips++;
      this.log('warn', `${user.id}: Diblokir circuit breaker`);
      return;
    }

    // 3. Simulate Request
    user.status = 'requesting';

    // Simulated latency with variance
    const baseLatency = this.config.simulatedLatencyMs;
    const variance = baseLatency * 0.5 * (Math.random() * 2 - 1);
    const latency = Math.max(50, Math.round(baseLatency + variance));

    await new Promise(r => setTimeout(r, Math.min(latency / 5, 1000))); // Scale down

    if (this.abortController?.signal.aborted) return;

    // 4. Simulate Success/Failure
    const shouldFail = Math.random() < this.config.failureRate;

    if (shouldFail) {
      user.status = 'failed';
      user.error = 'Simulated server error (503)';
      user.latencyMs = latency;
      user.endTime = Date.now();
      this.responseTimes.push(latency);
      this.metrics.failureCount += this.userScaleFactor;
      this.metrics.totalRequests += this.userScaleFactor;
      this.throughputWindow.push({ time: Date.now(), success: false, weight: this.userScaleFactor });
      recordFailure();

      // Retry logic simulation
      if (user.retries < 3 && isRetryableError({ status: 503 })) {
        user.retries++;
        this.metrics.totalRetries++;
        const backoff = calculateBackoff(user.retries);
        await new Promise(r => setTimeout(r, Math.min(backoff / 10, 2000)));
        if (!this.abortController?.signal.aborted) {
          await this.simulateRequest(user);
        }
      }
    } else {
      user.status = 'success';
      user.latencyMs = latency;
      user.endTime = Date.now();
      this.responseTimes.push(latency);
      this.metrics.successCount += this.userScaleFactor;
      this.metrics.totalRequests += this.userScaleFactor;
      this.throughputWindow.push({ time: Date.now(), success: true, weight: this.userScaleFactor });
      recordSuccess();
    }
  }

  async start(): Promise<void> {
    this.status = 'running';
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.metrics = getEmptyMetrics();
    this.responseTimes = [];
    this.jitterTimes = [];
    this.throughputWindow = [];
    this.logs = [];
    this.users = [];
    this.userScaleFactor = 1;

    const maxSimulatedUsers = this.config.mode === 'live' ? 5000 : 30000;
    if (this.config.totalUsers > maxSimulatedUsers) {
      this.userScaleFactor = Math.ceil(this.config.totalUsers / maxSimulatedUsers);
      this.log(
        'warn',
        `Sampling aktif: simulasi ${Math.ceil(this.config.totalUsers / this.userScaleFactor).toLocaleString()} user virtual merepresentasikan ${this.config.totalUsers.toLocaleString()} user (x${this.userScaleFactor})`
      );
    }

    // Create all virtual users
    const simulatedUsers = Math.ceil(this.config.totalUsers / this.userScaleFactor);
    for (let i = 0; i < simulatedUsers; i++) {
      this.users.push(this.createVirtualUser(i));
    }

    this.log('info', `🚀 Stress test dimulai: ${this.config.totalUsers} user, skenario: ${this.config.scenario}`);
    this.log('info', `Mode: ${this.config.mode === 'dry_run' ? 'DRY RUN (tanpa DB)' : 'LIVE TEST'}`);
    this.log('info', `Peak hours: ${isPeakHours() ? 'YA (jitter 0-30s)' : 'TIDAK (jitter 0-5s)'}`);

    // Periodic metrics update
    this.intervalId = setInterval(() => this.emitUpdate(), 500);

    try {
      if (this.config.scenario === 'burst') {
        await this.runBurst();
      } else if (this.config.scenario === 'gradual') {
        await this.runGradual();
      } else if (this.config.scenario === 'peak_simulation') {
        await this.runPeakSimulation();
      } else if (this.config.scenario === 'circuit_breaker') {
        await this.runCircuitBreakerTest();
      }

      if (!this.abortController.signal.aborted) {
        this.status = 'completed';
        this.log('success', `✅ Test selesai! ${this.metrics.successCount}/${this.metrics.totalRequests} berhasil`);
      }
    } catch (err) {
      this.status = 'aborted';
      this.log('error', `❌ Test dibatalkan: ${(err as Error).message}`);
    } finally {
      if (this.intervalId) clearInterval(this.intervalId);
      this.emitUpdate();
    }
  }

  private async processBatch(startIdx: number, batchSize: number): Promise<void> {
    const endIdx = Math.min(startIdx + batchSize, this.users.length);
    const batch = this.users.slice(startIdx, endIdx);
    await Promise.all(batch.map(user => this.simulateRequest(user)));
  }

  private async runBurst(): Promise<void> {
    this.log('warn', '⚡ BURST MODE: Semua user sekaligus!');
    const batchSize = this.config.concurrentBatchSize;
    for (let i = 0; i < this.users.length; i += batchSize) {
      if (this.abortController?.signal.aborted) break;
      await this.processBatch(i, batchSize);
      this.log('info', `Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(this.users.length / batchSize)} selesai`);
    }
  }

  private async runGradual(): Promise<void> {
    this.log('info', `📈 GRADUAL MODE: Ramp-up ${this.config.rampUpSeconds}s`);
    const totalBatches = Math.ceil(this.users.length / this.config.concurrentBatchSize);
    const delayBetweenBatches = (this.config.rampUpSeconds * 1000) / totalBatches;

    for (let i = 0; i < this.users.length; i += this.config.concurrentBatchSize) {
      if (this.abortController?.signal.aborted) break;
      await this.processBatch(i, this.config.concurrentBatchSize);

      if (i + this.config.concurrentBatchSize < this.users.length) {
        await new Promise(r => setTimeout(r, Math.max(delayBetweenBatches, 100)));
      }
    }
  }

  private async runPeakSimulation(): Promise<void> {
    this.log('warn', '🔥 PEAK SIMULATION: Mensimulasikan 20.000 user pada jam sibuk');
    this.log('info', 'Fase 1: Ramp-up (0-60s) — user bertambah bertahap');
    this.log('info', 'Fase 2: Peak (60-120s) — beban penuh');
    this.log('info', 'Fase 3: Cool-down (120-180s) — beban menurun');

    const totalUsers = this.users.length;
    const rampUsers = Math.floor(totalUsers * 0.4);
    const peakUsers = Math.floor(totalUsers * 0.4);
    const cooldownUsers = totalUsers - rampUsers - peakUsers;
    const batchSize = this.config.concurrentBatchSize;

    // Phase 1: Ramp-up
    let processed = 0;
    for (let i = 0; i < rampUsers; i += batchSize) {
      if (this.abortController?.signal.aborted) return;
      await this.processBatch(processed, batchSize);
      processed += batchSize;
      await new Promise(r => setTimeout(r, 200));
    }
    this.log('info', '📈 Fase 1 selesai (ramp-up)');

    // Phase 2: Peak
    for (let i = 0; i < peakUsers; i += batchSize) {
      if (this.abortController?.signal.aborted) return;
      await this.processBatch(processed, batchSize);
      processed += batchSize;
      await new Promise(r => setTimeout(r, 50));
    }
    this.log('warn', '🔥 Fase 2 selesai (peak load)');

    // Phase 3: Cooldown
    for (let i = 0; i < cooldownUsers; i += batchSize) {
      if (this.abortController?.signal.aborted) return;
      await this.processBatch(processed, batchSize);
      processed += batchSize;
      await new Promise(r => setTimeout(r, 300));
    }
    this.log('info', '📉 Fase 3 selesai (cool-down)');
  }

  private async runCircuitBreakerTest(): Promise<void> {
    this.log('warn', '🔌 CIRCUIT BREAKER TEST: Failure rate tinggi untuk trigger CB');
    const batchSize = this.config.concurrentBatchSize;

    for (let i = 0; i < this.users.length; i += batchSize) {
      if (this.abortController?.signal.aborted) break;
      await this.processBatch(i, batchSize);

      const cbInfo = getCircuitBreakerInfo();
      if (cbInfo.status === 'open') {
        this.log('error', `🔴 Circuit Breaker OPEN! Menunggu recovery (30s)...`);
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s in simulation
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.status = 'aborted';
    if (this.intervalId) clearInterval(this.intervalId);
    this.log('warn', '⏹️ Test dibatalkan oleh user');
    this.emitUpdate();
  }

  getState(): StressTestState {
    return {
      status: this.status,
      config: this.config,
      users: this.users.slice(0, 100),
      metrics: { ...this.metrics },
      logs: this.logs.slice(-50),
    };
  }
}
