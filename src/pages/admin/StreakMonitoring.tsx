import { useCallback, useEffect, useState } from "react";
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
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

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

interface WorkflowStep {
  id: string;
  title: string;
  trigger: string;
  systemAction: string;
  dataState: string;
  result: string;
}

interface StreakGlossaryItem {
  term: string;
  description: string;
  reference: string;
}

const STREAK_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "capture-activity",
    title: "Aktivitas Harian Tercatat",
    trigger: "Pegawai melakukan aktivitas absensi pada hari kerja tenant.",
    systemAction:
      "Sistem mencatat aktivitas, lalu menyiapkan evaluasi streak tenant pada hari tersebut.",
    dataState:
      "Data absensi tersimpan, lalu evaluasi streak mengacu ke status kerja + kalender tenant/libur nasional.",
    result: "Hari tersebut dihitung valid untuk mempertahankan/menambah streak.",
  },
  {
    id: "streak-evaluation-and-threshold",
    title: "Evaluasi Streak dan Ambang Billing",
    trigger: "Trigger absensi memanggil SQL `update_tenant_streak(tenant_id)`.",
    systemAction:
      "Fungsi mengecualikan weekend + libur nasional + libur organisasi, lalu menghitung streak terhadap `streak_threshold`.",
    dataState:
      "Tabel `stability_streaks` diupdate (`streak_count`, `status`, `reached_target`, `grace_period_end`).",
    result: "Streak naik/reset; saat threshold tercapai tenant masuk fase `ready_for_invoicing`.",
  },
  {
    id: "auto-invoice",
    title: "Invoice Otomatis Dibuat",
    trigger: "Tenant masuk fase `ready_for_invoicing` dan belum punya invoice terbuka.",
    systemAction:
      "Fungsi `create_pending_streak_invoice()` membuat invoice `PENDING` (manual transfer) berdasar jumlah pegawai aktif + tarif billing.",
    dataState:
      "Tabel `invoices` bertambah, `subscriptions.last_invoice_id` diperbarui ke invoice terbaru.",
    result: "Tagihan resmi tersedia untuk proses pembayaran.",
  },
  {
    id: "grace-notification",
    title: "Notifikasi Grace Period Bertahap",
    trigger: "Cron `billing-grace-notifier-10m` berjalan setiap 10 menit.",
    systemAction:
      "Edge Function `billing-grace-notifier` mengambil tenant grace period + invoice pending, lalu mengirim reminder email/WhatsApp sesuai fase.",
    dataState:
      "Tabel `billing_notification_logs` diisi (`SENT/FAILED`) dengan metadata reason bertahap (`GRACE_PERIOD_ENTERED`, `GRACE_PERIOD_REMINDER`, `GRACE_PERIOD_LAST_DAY`, `GRACE_PERIOD_EXPIRED`) + anti-duplicate per channel/reason.",
    result: "Tenant menerima pengingat awal, berkala, hari terakhir, dan pasca grace berakhir hingga invoice diselesaikan.",
  },
  {
    id: "payment-channel-routing",
    title: "Routing Kanal Pembayaran",
    trigger: "Tenant membuka invoice dan memilih kanal pembayaran.",
    systemAction:
      "Tenant B2B dengan billing terpusat (pegawai >= ambang B2B atau harga negosiasi aktif) wajib manual transfer. Tenant billing mandiri/non-B2B dapat memakai Xendit jika aktif, atau manual transfer jika Xendit nonaktif.",
    dataState:
      "Invoice tetap terpusat di `invoices`, dengan `payment_method_type` sesuai kanal (XENDIT / MANUAL_TRANSFER) dan guard backend mencegah Xendit untuk tenant B2B billing terpusat.",
    result: "Satu alur data invoice tetap konsisten meskipun kanal pembayaran berbeda.",
  },
  {
    id: "payment-verification",
    title: "Verifikasi Pembayaran",
    trigger: "Pembayaran masuk dari webhook Xendit atau verifikasi admin billing untuk transfer manual.",
    systemAction:
      "Sistem mengubah invoice menjadi `PAID` (atau status gagal), mencatat event pembayaran, dan menyiapkan sinkron langganan.",
    dataState:
      "Update pada `invoices`, `payment_logs` (Xendit), dan/atau `manual_payments` (manual transfer).",
    result: "Status pembayaran menjadi final dan siap dieksekusi ke aktivasi tenant.",
  },
  {
    id: "post-payment-sync",
    title: "Sinkron Pasca Pembayaran",
    trigger: "Invoice tervalidasi `PAID`.",
    systemAction:
      "Sistem mengaktifkan/perpanjang subscription, catat transaksi di `financial_ledger`, dan panggil `mark_streak_invoiced()`.",
    dataState:
      "Streak menjadi `invoiced`, `subscriptions.status=active`, `grace_period_end` dibersihkan.",
    result: "Tenant keluar dari risiko suspend dan kembali normal.",
  },
  {
    id: "grace-expiry-control",
    title: "Kontrol Grace Period Berakhir",
    trigger: "Cron `streak-subscription-sync-daily` (harian) atau sinkron manual dari halaman subscription dijalankan.",
    systemAction:
      "Fungsi `sync_streak_subscription_status()` menandai subscription `expired` untuk tenant yang belum `invoiced`.",
    dataState:
      "Tabel `subscriptions.status` berubah ke `expired` bila melewati tenggat, sementara invoice tetap `PENDING/AWAITING_VERIFICATION` sampai dibayar.",
    result: "Akses tenant terkunci sampai pembayaran diselesaikan.",
  },
  {
    id: "unpaid-cleanup-lifecycle",
    title: "Lifecycle Cleanup Tenant/User Tidak Bayar",
    trigger: "Tenant tetap `expired` dengan invoice belum lunas, lalu lifecycle cleanup aktif.",
    systemAction:
      "Sistem menjadwalkan purge (`tenant_cleanup_lifecycle`) + mengirim reminder bertahap (H-14/H-7/H-3/H-1) berisi tanggal purge.",
    dataState:
      "Status lifecycle berpindah `scheduled` -> `cancelled` (jika sudah bayar) atau `purged` (jika melewati purge_at tanpa pembayaran).",
    result: "Akses tenant/user non-bayar dibersihkan otomatis untuk menghemat resource dan kuota akun.",
  },
  {
    id: "grace-unpaid-regression-test",
    title: "Uji Regresi: Tidak Bayar Sampai Grace Berakhir",
    trigger: "Tim ops menjalankan `npm run streak:test-grace-expired` saat validasi kebijakan billing.",
    systemAction:
      "Script menyiapkan tenant grace expired + invoice pending, menjalankan dry-run notifier, lalu mengeksekusi `sync_streak_subscription_status()` untuk verifikasi enforcement.",
    dataState:
      "Hasil uji mengembalikan `trace_id` test dan `trace_id` notifier; assertion utama: `invoice_still_unpaid=true`, `subscription_expired_after_sync=true`, `notifier_reason_expired=true`.",
    result: "Kebijakan suspend otomatis + reminder email/WhatsApp terverifikasi end-to-end sebelum dipakai operasional.",
  },
  {
    id: "monitoring-and-recovery",
    title: "Monitoring dan Recovery",
    trigger: "Super admin memantau `Streak Monitoring`, `Billing`, dan `Informasi Cron`.",
    systemAction:
      "Admin memantau health jadwal cron, log notifikasi billing, dan status pembayaran untuk percepatan recovery tenant.",
    dataState:
      "Data status tenant bergerak antar fase secara audit-able.",
    result: "Siklus streak -> billing -> payment -> pemulihan berjalan end-to-end.",
  },
];

const STREAK_GLOSSARY: StreakGlossaryItem[] = [
  { term: "Stability Streak", description: "Hitungan hari kerja berurutan saat tenant aktif menggunakan sistem absensi.", reference: "Table: `stability_streaks.streak_count`" },
  { term: "Streak Threshold", description: "Batas minimal streak sebelum tenant masuk fase billing streak.", reference: "Setting: `system_settings.key=streak_threshold`" },
  { term: "Grace Period", description: "Masa tenggang setelah target tercapai sebelum tenant dinyatakan expired/suspend.", reference: "Setting: `streak_grace_period_days`, field `grace_period_end`" },
  { term: "Unpaid Cleanup Lifecycle", description: "Mekanisme otomatis untuk tenant non-bayar: jadwal purge, reminder, dan cleanup ketika melewati tenggat.", reference: "Table: `tenant_cleanup_lifecycle`" },
  { term: "Purge Date", description: "Tanggal/waktu final penghapusan akses tenant/user non-bayar jika belum ada pembayaran tervalidasi.", reference: "Field: `tenant_cleanup_lifecycle.purge_at`" },
  { term: "Purge Reminder", description: "Pengingat H-14/H-7/H-3/H-1 sebelum purge berisi countdown dan tanggal purge.", reference: "Setting: `unpaid_cleanup_reminder_days`, log: `reminder_history`" },
  { term: "Grace Notifier Cron", description: "Cron pengingat invoice grace period yang mengirim email + WhatsApp otomatis.", reference: "Job: `billing-grace-notifier-10m` -> Edge Function `billing-grace-notifier`" },
  { term: "Grace Notification Reason", description: "Kode fase notifikasi yang dicatat untuk menghindari duplikasi dan menandai konteks pengingat.", reference: "Metadata: `billing_notification_logs.metadata.reason`" },
  { term: "GRACE_PERIOD_ENTERED", description: "Notifikasi awal ketika tenant masuk fase grace period.", reference: "Reason: `GRACE_PERIOD_ENTERED`" },
  { term: "GRACE_PERIOD_REMINDER", description: "Pengingat berkala selama grace period berjalan dan belum dibayar.", reference: "Reason: `GRACE_PERIOD_REMINDER`" },
  { term: "GRACE_PERIOD_LAST_DAY", description: "Pengingat khusus pada hari terakhir grace period.", reference: "Reason: `GRACE_PERIOD_LAST_DAY`" },
  { term: "GRACE_PERIOD_EXPIRED", description: "Pengingat setelah grace period lewat sebelum/selama enforcement suspend.", reference: "Reason: `GRACE_PERIOD_EXPIRED`" },
  { term: "Reminder Interval", description: "Jeda pengiriman ulang reminder berkala agar tidak spam.", reference: "Env: `BILLING_NOTIFIER_REMINDER_HOURS`" },
  { term: "Retry Cooldown", description: "Jeda retry jika pengiriman notifikasi gagal atau baru saja dicoba.", reference: "Env: `BILLING_NOTIFIER_RETRY_MINUTES`" },
  { term: "Notifier Trace ID", description: "ID jejak error/log dari eksekusi Edge Function notifier.", reference: "Response: `billing-grace-notifier.trace_id`" },
  { term: "Tracking", description: "Status streak normal ketika tenant belum mencapai target.", reference: "Status: `stability_streaks.status=tracking`" },
  { term: "Ready for Invoicing", description: "Status saat target streak tercapai dan siap ditagih.", reference: "Status: `stability_streaks.status=ready_for_invoicing`" },
  { term: "Invoiced", description: "Status streak setelah pembayaran tervalidasi; tenant dianggap telah menyelesaikan kewajiban streak billing.", reference: "Status: `stability_streaks.status=invoiced`" },
  { term: "Suspended (Operasional)", description: "Kondisi operasional tenant ketika grace period habis tanpa pembayaran valid.", reference: "Derived UI: `reached_target && !invoiced && grace expired`" },
  { term: "Auto Invoice Streak", description: "Invoice otomatis yang dibuat sistem saat tenant mencapai target streak.", reference: "Function: `create_pending_streak_invoice()`" },
  { term: "Invoice Pending", description: "Tagihan sudah dibuat tetapi belum lunas/diverifikasi.", reference: "Table: `invoices.status=PENDING/AWAITING_VERIFICATION`" },
  { term: "Invoice Paid", description: "Tagihan telah dibayar dan tervalidasi.", reference: "Table: `invoices.status=PAID`" },
  { term: "Manual Transfer", description: "Pembayaran via transfer bank yang butuh verifikasi admin.", reference: "Field: `invoices.payment_method_type=MANUAL_TRANSFER`" },
  { term: "Xendit Payment", description: "Pembayaran online melalui payment gateway Xendit.", reference: "Edge Function: `create-xendit-invoice`, `xendit-webhook`" },
  { term: "B2B Manual-Only", description: "Tenant B2B dengan billing terpusat tidak boleh checkout via Xendit; wajib transfer manual.", reference: "Guard: `create-xendit-invoice` menolak tenant B2B billing terpusat (HTTP 403)" },
  { term: "Fallback Manual Billing", description: "Mode saat Xendit belum aktif: invoice tetap dibuat, pembayaran dilakukan via transfer manual.", reference: "Flow: `invoices` + `manual_payments` + verifikasi admin billing" },
  { term: "Payment Verification", description: "Tahap validasi pembayaran oleh sistem/webhook/admin sebelum aktivasi final.", reference: "UI Billing + Edge/Webhook flow" },
  { term: "Financial Ledger", description: "Catatan transaksi keuangan final setelah pembayaran sukses.", reference: "Table: `financial_ledger`" },
  { term: "Subscription Active", description: "Status langganan tenant aktif dan dapat mengakses fitur sesuai kebijakan.", reference: "Table: `subscriptions.status=active`" },
  { term: "Subscription Expired", description: "Status langganan tenant berakhir karena melewati grace tanpa pembayaran.", reference: "Table: `subscriptions.status=expired`" },
  { term: "Last Invoice ID", description: "Referensi invoice terakhir yang terkait status subscription tenant.", reference: "Field: `subscriptions.last_invoice_id`" },
  { term: "Sync Subscription Status", description: "Fungsi sinkronisasi untuk mengeksekusi kebijakan expiry berbasis streak + grace.", reference: "Function: `sync_streak_subscription_status()`" },
  { term: "Policy Sync Cron", description: "Jadwal enforcement otomatis untuk mengecek grace period harian.", reference: "Job: `streak-subscription-sync-daily`" },
  { term: "Mark Streak Invoiced", description: "Fungsi sinkron final pasca pembayaran untuk menutup siklus streak.", reference: "Function: `mark_streak_invoiced()`" },
  { term: "Hari Kerja Valid", description: "Hari kerja yang diperhitungkan untuk streak setelah mengecualikan weekend/libur.", reference: "Logic: `update_tenant_streak()`" },
  { term: "Libur Nasional", description: "Hari libur nasional yang tidak memutus streak.", reference: "Table: `national_holidays`" },
  { term: "Libur Organisasi", description: "Hari libur khusus tenant yang tidak memutus streak.", reference: "Table: `work_holidays`" },
  { term: "Near Suspension", description: "Tenant sudah target tercapai namun belum bayar dan masih dalam grace.", reference: "Derived UI: `reached_target && !invoiced && !grace expired`" },
  { term: "Payment Logs", description: "Riwayat aktivitas pembayaran untuk audit dan monitoring tindak lanjut.", reference: "Tab: `Payment Logs` pada halaman ini" },
  { term: "Regression Test Unpaid Grace", description: "Skenario uji otomatis untuk memastikan tenant non-bayar benar-benar masuk `expired` setelah grace berakhir.", reference: "Script: `npm run streak:test-grace-expired`" },
];
const STREAK_ITEMS_PER_PAGE = 10;
const PAYMENTS_PER_PAGE = 10;
const GLOSSARY_PER_PAGE = 10;
const STREAK_MONITORING_QUERY_TIMEOUT_MS = 12000;
const STREAK_MONITORING_QUERY_RETRY_MAX = 2;

export default function StreakMonitoring() {
  const [streaks, setStreaks] = useState<StreakItem[]>([]);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [streakThreshold, setStreakThreshold] = useState(30);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [nearPage, setNearPage] = useState(1);
  const [suspendedPage, setSuspendedPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [glossaryPage, setGlossaryPage] = useState(1);

  const fetchThreshold = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", "streak_threshold")
              .maybeSingle(),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.threshold.fetch timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!data?.value) return;

      const rawValue = (data.value as { value?: unknown })?.value;
      const parsedValue = Math.floor(Number(rawValue));
      if (Number.isFinite(parsedValue) && parsedValue > 0) {
        setStreakThreshold(parsedValue);
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.threshold.fetch");
      setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat threshold streak", errorRef));
    }
  }, []);

  const fetchStreaks = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const { data } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("stability_streaks")
              .select("*, tenants(name)")
              .order("streak_count", { ascending: false }),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.items.fetch timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      setStreaks((data || []) as StreakItem[]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.items.fetch");
      const message = appendErrorReference("Gagal memuat data streak monitoring", errorRef);
      setLoadError(message);
      setStreaks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      setIsRetrying(false);
      const { data } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("manual_payments")
              .select("id, tenant_id, amount, status, created_at, payment_method, tenants:tenant_id(name)")
              .order("created_at", { ascending: false })
              .limit(50),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.payment_logs.fetch timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      setPayments((data as PaymentLog[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.payment_logs.fetch");
      setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat payment logs streak", errorRef));
      setPayments([]);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchStreaks(), fetchPayments(), fetchThreshold()]);
  }, [fetchStreaks, fetchPayments, fetchThreshold]);

  const filtered = streaks.filter(s =>
    !searchQuery || s.tenants?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isGraceExpired = (item: StreakItem): boolean => {
    if (!item.grace_period_end) return false;
    const graceEndDate = new Date(`${item.grace_period_end}T00:00:00`);
    return graceEndDate < today;
  };

  const isSuspended = (item: StreakItem): boolean =>
    Boolean(item.reached_target) && item.status !== "invoiced" && isGraceExpired(item);

  const isNearSuspension = (item: StreakItem): boolean =>
    Boolean(item.reached_target) && item.status !== "invoiced" && !isGraceExpired(item);

  const isActiveTracking = (item: StreakItem): boolean =>
    item.status === "tracking" && !item.reached_target;

  const activeStreaks = filtered.filter(isActiveTracking);
  const nearSuspension = filtered.filter(isNearSuspension);
  const suspended = filtered.filter(isSuspended);

  const totalCount = streaks.length;
  const activeCount = streaks.filter(isActiveTracking).length;
  const readyCount = streaks.filter(isNearSuspension).length;
  const suspendedCount = streaks.filter(isSuspended).length;

  const statusBadge = (item: StreakItem) => {
    if (isSuspended(item)) {
      return <Badge variant="destructive">Suspended</Badge>;
    }

    switch (item.status) {
      case "ready_for_invoicing": return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ready</Badge>;
      case "grace_period": return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Grace Period</Badge>;
      case "invoiced": return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Invoiced</Badge>;
      default: return <Badge variant="outline">Tracking</Badge>;
    }
  };

  const safeThreshold = streakThreshold > 0 ? streakThreshold : 30;
  const filteredGlossary = STREAK_GLOSSARY.filter((item) => {
    if (!glossaryQuery.trim()) return true;
    const q = glossaryQuery.toLowerCase();
    return (
      item.term.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.reference.toLowerCase().includes(q)
    );
  });
  const activeTotalPages = Math.max(1, Math.ceil(activeStreaks.length / STREAK_ITEMS_PER_PAGE));
  const paginatedActiveStreaks = activeStreaks.slice(
    (activePage - 1) * STREAK_ITEMS_PER_PAGE,
    activePage * STREAK_ITEMS_PER_PAGE
  );
  const nearTotalPages = Math.max(1, Math.ceil(nearSuspension.length / STREAK_ITEMS_PER_PAGE));
  const paginatedNearSuspension = nearSuspension.slice(
    (nearPage - 1) * STREAK_ITEMS_PER_PAGE,
    nearPage * STREAK_ITEMS_PER_PAGE
  );
  const suspendedTotalPages = Math.max(1, Math.ceil(suspended.length / STREAK_ITEMS_PER_PAGE));
  const paginatedSuspended = suspended.slice(
    (suspendedPage - 1) * STREAK_ITEMS_PER_PAGE,
    suspendedPage * STREAK_ITEMS_PER_PAGE
  );
  const paymentsTotalPages = Math.max(1, Math.ceil(payments.length / PAYMENTS_PER_PAGE));
  const paginatedPayments = payments.slice(
    (paymentsPage - 1) * PAYMENTS_PER_PAGE,
    paymentsPage * PAYMENTS_PER_PAGE
  );
  const glossaryTotalPages = Math.max(1, Math.ceil(filteredGlossary.length / GLOSSARY_PER_PAGE));
  const paginatedGlossary = filteredGlossary.slice(
    (glossaryPage - 1) * GLOSSARY_PER_PAGE,
    glossaryPage * GLOSSARY_PER_PAGE
  );

  useEffect(() => {
    setActivePage(1);
    setNearPage(1);
    setSuspendedPage(1);
  }, [searchQuery, streaks.length]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [payments.length]);

  useEffect(() => {
    setGlossaryPage(1);
  }, [glossaryQuery]);

  const renderTable = (
    data: StreakItem[],
    currentPage: number,
    totalPages: number,
    onPageChange: React.Dispatch<React.SetStateAction<number>>
  ) => (
    data.length === 0 ? (
      <p className="text-center text-muted-foreground py-8">Tidak ada data</p>
    ) : (
      <div>
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
                      <Flame className={cn("w-4 h-4", s.streak_count >= Math.max(safeThreshold - 5, 1) ? "text-orange-500" : "text-muted-foreground")} />
                      <span className="font-bold">{s.streak_count}</span>
                      <span className="text-xs text-muted-foreground">/{safeThreshold}</span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <Progress value={Math.min((s.streak_count / safeThreshold) * 100, 100)} className="h-2" />
                  </TableCell>
                  <TableCell>{statusBadge(s)}</TableCell>
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
        <div className="mt-4 flex items-center justify-between">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
            onClick={() => onPageChange((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Sebelumnya
          </button>
          <span className="text-sm text-muted-foreground">
            Halaman {currentPage} dari {totalPages}
          </span>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
            onClick={() => onPageChange((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Berikutnya
          </button>
        </div>
      </div>
    )
  );

  return (
    <SuperAdminLayout title="Streak Monitoring" subtitle="Pantau stabilitas penggunaan per tenant">
      {isRetrying && (
        <div className="mb-6 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sedang mencoba ulang memuat data streak monitoring...
        </div>
      )}
      {loadError && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{loadError}</span>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs text-foreground"
            onClick={() => void Promise.all([fetchStreaks(), fetchPayments(), fetchThreshold()])}
          >
            Coba Lagi
          </button>
        </div>
      )}
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
          <div><p className="text-2xl font-bold">{readyCount}</p><p className="text-xs text-muted-foreground">Near Suspension</p></div>
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
        <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <TabsTrigger value="active" className="flex items-center gap-1 whitespace-nowrap">
            <Flame className="w-3.5 h-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="near" className="flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" /> Near Suspension
          </TabsTrigger>
          <TabsTrigger value="suspended" className="flex items-center gap-1 whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" /> Suspended
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1 whitespace-nowrap">
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
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(paginatedActiveStreaks, activePage, activeTotalPages, setActivePage)}
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
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(paginatedNearSuspension, nearPage, nearTotalPages, setNearPage)}
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
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(paginatedSuspended, suspendedPage, suspendedTotalPages, setSuspendedPage)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Logs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Riwayat pembayaran manual dari seluruh tenant. Untuk kanal Xendit, jejak event pembayaran
                dan webhook dipantau pada modul Billing & Payment.
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
                      {paginatedPayments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.tenants?.name || "-"}</TableCell>
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
              {payments.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
                    onClick={() => setPaymentsPage((prev) => Math.max(1, prev - 1))}
                    disabled={paymentsPage === 1}
                  >
                    Sebelumnya
                  </button>
                  <span className="text-sm text-muted-foreground">
                    Halaman {paymentsPage} dari {paymentsTotalPages}
                  </span>
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
                    onClick={() => setPaymentsPage((prev) => Math.min(paymentsTotalPages, prev + 1))}
                    disabled={paymentsPage === paymentsTotalPages}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Mekanisme Streak Hingga Pembayaran</CardTitle>
            <p className="text-sm text-muted-foreground">
              Alur kerja backend dan operasional dari aktivitas absensi tenant sampai status pembayaran final.
              Setiap tahap di bawah menunjukkan pemicu, proses sistem, perubahan data, dan hasil bisnisnya.
              Mekanisme ini diselaraskan dengan cron scheduler terbaru di <span className="font-mono">/admin/cron-jobs</span>.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {STREAK_WORKFLOW_STEPS.map((step, index) => (
              <div key={step.id} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    Tahap {index + 1}
                  </Badge>
                  <h4 className="font-semibold">{step.title}</h4>
                </div>
                <div className="grid gap-2 text-sm">
                  <p><span className="font-medium">Pemicu:</span> {step.trigger}</p>
                  <p><span className="font-medium">Aksi Sistem:</span> {step.systemAction}</p>
                  <p><span className="font-medium">Perubahan Data:</span> {step.dataState}</p>
                  <p><span className="font-medium">Hasil:</span> {step.result}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Glosarium Lengkap Streak, Billing, dan Payment</CardTitle>
            <p className="text-sm text-muted-foreground">
              Daftar istilah teknis yang dipakai di modul streak monitoring beserta referensi tabel/fungsi sumber datanya.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={glossaryQuery}
                onChange={(e) => setGlossaryQuery(e.target.value)}
                placeholder="Cari istilah, deskripsi, atau referensi..."
                className="pl-10"
              />
            </div>

            {filteredGlossary.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Istilah tidak ditemukan.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[240px]">Istilah</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="w-[280px]">Referensi Data/Fungsi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedGlossary.map((item) => (
                      <TableRow key={item.term}>
                        <TableCell className="font-medium">{item.term}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{item.reference}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {filteredGlossary.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
                  onClick={() => setGlossaryPage((prev) => Math.max(1, prev - 1))}
                  disabled={glossaryPage === 1}
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-muted-foreground">
                  Halaman {glossaryPage} dari {glossaryTotalPages}
                </span>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
                  onClick={() => setGlossaryPage((prev) => Math.min(glossaryTotalPages, prev + 1))}
                  disabled={glossaryPage === glossaryTotalPages}
                >
                  Berikutnya
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
