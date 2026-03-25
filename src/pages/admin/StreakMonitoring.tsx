import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flame, CheckCircle2, Clock, Search, Loader2, Zap, AlertTriangle, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isActiveInvoiceStatus } from "@/lib/billingGuards";
import { toast } from "sonner";
import { getPurgeUrgency } from "@/lib/purgeUrgency";
import {
  getBillingSubscriptionJourneyFromInvoiceMetadata,
  getBillingSubscriptionJourneyFromNotes,
  type BillingSubscriptionJourney,
} from "@/lib/billingSubscriptionJourney";
import {
  getTrialSeriousnessSignal,
  getTrialSeriousnessStatusUi,
  TRIAL_SERIOUSNESS_ORDER,
  type TrialSeriousnessSignal,
} from "@/lib/trialSeriousness";

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
  status: string | null;
  created_at: string | null;
  payment_method: string | null;
  tenants?: { name: string } | null;
}

interface SubscriptionSnapshot {
  tenant_id: string;
  status: string | null;
  last_invoice_id: string | null;
  grace_period_end: string | null;
  end_date: string | null;
  notes: string | null;
}

interface InvoiceSnapshot {
  id: string;
  tenant_id: string;
  status: string;
  due_date: string;
  updated_at: string;
  metadata: unknown;
}

interface CleanupLifecycleSnapshot {
  tenant_id: string;
  status: string;
  purge_at: string;
  scheduled_at: string;
  purged_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

type NonActiveReason =
  | "suspended_unpaid"
  | "expired_unpaid"
  | "cancelled_subscription"
  | "scheduled_cleanup"
  | "purged_cleanup"
  | "inactive_unknown";

type NonActiveReasonFilter = "all" | NonActiveReason;

interface EnrichedStreakItem extends StreakItem {
  subscription_status: string | null;
  invoice_status: string | null;
  invoice_due_date: string | null;
  cleanup_status: string | null;
  purge_at: string | null;
  non_active_reason: NonActiveReason | null;
  is_non_active: boolean;
  billing_journey: BillingSubscriptionJourney;
  trial_signal: TrialSeriousnessSignal;
}

interface TenantActionSummary {
  action: "sync" | "remind";
  status: "success" | "error" | "info";
  message: string;
  at: string;
}

interface PendingTenantAction {
  action: "sync" | "remind";
  item: EnrichedStreakItem;
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

type StreakMonitoringTab = "active" | "near" | "non_active" | "payments";

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error("Terjadi kesalahan query Supabase.");
}

function ensureSupabaseSuccess<T extends { error?: unknown | null }>(result: T): T {
  if (result?.error) throw toError(result.error);
  return result;
}

function mapStatusParamToTab(statusParam: string | null): StreakMonitoringTab | null {
  if (!statusParam) return null;
  const normalized = statusParam.toLowerCase();
  if (normalized === "tracking") return "active";
  if (normalized === "ready_for_invoicing" || normalized === "grace_period") return "near";
  if (normalized === "suspended" || normalized === "expired" || normalized === "cancelled" || normalized === "non_active") {
    return "non_active";
  }
  if (normalized === "payments" || normalized === "payment_logs") return "payments";
  return null;
}

function mapTabParamToTab(tabParam: string | null): StreakMonitoringTab | null {
  if (!tabParam) return null;
  if (tabParam === "active" || tabParam === "near" || tabParam === "non_active" || tabParam === "payments" || tabParam === "suspended") {
    if (tabParam === "suspended") return "non_active";
    return tabParam;
  }
  return null;
}

function getPaymentStatusUi(status: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "verified" || normalized === "approved") return { label: "Terverifikasi", variant: "default" };
  if (normalized === "rejected") return { label: "Ditolak", variant: "destructive" };
  if (normalized === "pending" || normalized === "awaiting_verification") {
    return { label: "Menunggu Verifikasi", variant: "secondary" };
  }
  return { label: status || "-", variant: "outline" };
}

function getNonActiveReasonUi(reason: NonActiveReason | null): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (reason) {
    case "suspended_unpaid":
      return { label: "Ditangguhkan Belum Bayar", variant: "destructive" };
    case "expired_unpaid":
      return { label: "Berakhir Belum Bayar", variant: "destructive" };
    case "cancelled_subscription":
      return { label: "Langganan Dibatalkan", variant: "secondary" };
    case "scheduled_cleanup":
      return { label: "Terjadwal Pembersihan", variant: "secondary" };
    case "purged_cleanup":
      return { label: "Sudah Dipurge", variant: "outline" };
    case "inactive_unknown":
      return { label: "Non-Aktif", variant: "outline" };
    default:
      return { label: "-", variant: "outline" };
  }
}

function summarizeLifecycleActionResult(action: "sync" | "remind", payload: unknown): string {
  const base = action === "sync" ? "Sinkronisasi selesai" : "Reminder diproses";
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return base;

  const source = payload as Record<string, unknown>;
  const reason = typeof source.reason === "string" ? source.reason : "";
  if (action === "remind" && reason) {
    const reasonMessage: Record<string, string> = {
      sent: "Reminder terkirim",
      cleanup_disabled: "Cleanup non-bayar sedang nonaktif",
      lifecycle_not_found: "Lifecycle tenant belum tersedia",
      protected_tenant: "Tenant termasuk daftar terlindungi",
      not_scheduled: "Lifecycle tenant tidak berstatus scheduled",
      past_purge: "Tenggat purge sudah lewat",
      outside_schedule: "Di luar jadwal reminder otomatis",
      already_sent_today: "Reminder untuk hari ini sudah pernah dikirim",
      no_recipients: "Tidak ada penerima notifikasi",
    };
    if (reasonMessage[reason]) {
      return reasonMessage[reason];
    }
  }

  const countLabelMap: Record<string, string> = {
    updated_count: "diupdate",
    scheduled_count: "dijadwalkan",
    processed_count: "diproses",
    reminder_count: "reminder",
    cancelled_count: "dibatalkan",
    purged_count: "dipurge",
    skipped_count: "dilewati",
    success_count: "sukses",
    target_count: "target",
  };

  const details = Object.entries(countLabelMap)
    .map(([key, label]) => {
      const value = source[key];
      return typeof value === "number" ? `${label}: ${value}` : null;
    })
    .filter((part): part is string => Boolean(part));

  if (details.length === 0) return base;
  return `${base} (${details.join(", ")})`;
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
    title: "Notifikasi Masa Tenggang Bertahap",
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
    title: "Kontrol Masa Tenggang Berakhir",
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
    title: "Pemantauan dan Pemulihan",
    trigger: "Super admin memantau `Pemantauan Streak`, `Billing`, dan `Informasi Cron`.",
    systemAction:
      "Admin memantau kesehatan jadwal cron, log notifikasi billing, dan status pembayaran untuk percepatan pemulihan tenant.",
    dataState:
      "Data status tenant bergerak antar fase secara audit-able.",
    result: "Siklus streak -> billing -> payment -> pemulihan berjalan end-to-end.",
  },
];

const STREAK_GLOSSARY: StreakGlossaryItem[] = [
  { term: "Streak Stabilitas", description: "Hitungan hari kerja berurutan saat tenant aktif menggunakan sistem absensi.", reference: "Tabel: `stability_streaks.streak_count`" },
  { term: "Ambang Streak", description: "Batas minimal streak sebelum tenant masuk fase penagihan berbasis streak.", reference: "Pengaturan: `system_settings.key=streak_threshold`" },
  { term: "Masa Tenggang", description: "Masa tenggang setelah target tercapai sebelum tenant dinyatakan kedaluwarsa/ditangguhkan.", reference: "Pengaturan: `streak_grace_period_days`, kolom `grace_period_end`" },
  { term: "Siklus Pembersihan Non-Bayar", description: "Mekanisme otomatis untuk tenant non-bayar: jadwal hapus, pengingat, dan pembersihan ketika melewati tenggat.", reference: "Tabel: `tenant_cleanup_lifecycle`" },
  { term: "Tanggal Hapus Final", description: "Tanggal/waktu final penghapusan akses tenant/pengguna non-bayar jika belum ada pembayaran tervalidasi.", reference: "Kolom: `tenant_cleanup_lifecycle.purge_at`" },
  { term: "Pengingat Hapus", description: "Pengingat H-14/H-7/H-3/H-1 sebelum penghapusan berisi hitung mundur dan tanggal hapus.", reference: "Pengaturan: `unpaid_cleanup_reminder_days`, log: `reminder_history`" },
  { term: "Cron Notifikasi Masa Tenggang", description: "Cron pengingat tagihan masa tenggang yang mengirim email + WhatsApp otomatis.", reference: "Job: `billing-grace-notifier-10m` -> Fungsi Edge `billing-grace-notifier`" },
  { term: "Alasan Notifikasi Masa Tenggang", description: "Kode fase notifikasi yang dicatat untuk menghindari duplikasi dan menandai konteks pengingat.", reference: "Metadata: `billing_notification_logs.metadata.reason`" },
  { term: "GRACE_PERIOD_ENTERED", description: "Notifikasi awal ketika tenant masuk fase masa tenggang.", reference: "Alasan: `GRACE_PERIOD_ENTERED`" },
  { term: "GRACE_PERIOD_REMINDER", description: "Pengingat berkala selama masa tenggang berjalan dan belum dibayar.", reference: "Alasan: `GRACE_PERIOD_REMINDER`" },
  { term: "GRACE_PERIOD_LAST_DAY", description: "Pengingat khusus pada hari terakhir masa tenggang.", reference: "Alasan: `GRACE_PERIOD_LAST_DAY`" },
  { term: "GRACE_PERIOD_EXPIRED", description: "Pengingat setelah masa tenggang lewat sebelum/selama penangguhan diberlakukan.", reference: "Alasan: `GRACE_PERIOD_EXPIRED`" },
  { term: "Interval Pengingat", description: "Jeda pengiriman ulang pengingat berkala agar tidak spam.", reference: "Variabel lingkungan: `BILLING_NOTIFIER_REMINDER_HOURS`" },
  { term: "Jeda Coba Ulang", description: "Jeda coba ulang jika pengiriman notifikasi gagal atau baru saja dicoba.", reference: "Variabel lingkungan: `BILLING_NOTIFIER_RETRY_MINUTES`" },
  { term: "ID Jejak Notifikasi", description: "ID jejak error/log dari eksekusi fungsi edge notifier.", reference: "Respons: `billing-grace-notifier.trace_id`" },
  { term: "Pelacakan", description: "Status streak normal ketika tenant belum mencapai target.", reference: "Status: `stability_streaks.status=tracking`" },
  { term: "Siap Ditagihkan", description: "Status saat target streak tercapai dan siap ditagih.", reference: "Status: `stability_streaks.status=ready_for_invoicing`" },
  { term: "Sudah Ditagihkan", description: "Status streak setelah pembayaran tervalidasi; tenant dianggap telah menyelesaikan kewajiban tagihan streak.", reference: "Status: `stability_streaks.status=invoiced`" },
  { term: "Ditangguhkan (Operasional)", description: "Kondisi operasional tenant ketika masa tenggang habis tanpa pembayaran valid.", reference: "Turunan UI: `reached_target && !invoiced && grace expired`" },
  { term: "Tagihan Otomatis Streak", description: "Tagihan otomatis yang dibuat sistem saat tenant mencapai target streak.", reference: "Fungsi: `create_pending_streak_invoice()`" },
  { term: "Tagihan Menunggu Pembayaran", description: "Tagihan sudah dibuat tetapi belum lunas/diverifikasi.", reference: "Tabel: `invoices.status=PENDING/AWAITING_VERIFICATION`" },
  { term: "Tagihan Lunas", description: "Tagihan telah dibayar dan tervalidasi.", reference: "Tabel: `invoices.status=PAID`" },
  { term: "Transfer Manual", description: "Pembayaran via transfer bank yang butuh verifikasi admin.", reference: "Kolom: `invoices.payment_method_type=MANUAL_TRANSFER`" },
  { term: "Pembayaran Xendit", description: "Pembayaran online melalui gerbang pembayaran Xendit.", reference: "Fungsi Edge: `create-xendit-invoice`, `xendit-webhook`" },
  { term: "B2B Khusus Transfer Manual", description: "Tenant B2B dengan tagihan terpusat tidak boleh checkout via Xendit; wajib transfer manual.", reference: "Penjaga: `create-xendit-invoice` menolak tenant B2B tagihan terpusat (HTTP 403)" },
  { term: "Cadangan Tagihan Manual", description: "Mode saat Xendit belum aktif: tagihan tetap dibuat, pembayaran dilakukan via transfer manual.", reference: "Alur: `invoices` + `manual_payments` + verifikasi admin tagihan" },
  { term: "Verifikasi Pembayaran", description: "Tahap validasi pembayaran oleh sistem/webhook/admin sebelum aktivasi final.", reference: "UI Tagihan + alur Edge/Webhook" },
  { term: "Buku Besar Keuangan", description: "Catatan transaksi keuangan final setelah pembayaran sukses.", reference: "Tabel: `financial_ledger`" },
  { term: "Langganan Aktif", description: "Status langganan tenant aktif dan dapat mengakses fitur sesuai kebijakan.", reference: "Tabel: `subscriptions.status=active`" },
  { term: "Langganan Kedaluwarsa", description: "Status langganan tenant berakhir karena melewati masa tenggang tanpa pembayaran.", reference: "Tabel: `subscriptions.status=expired`" },
  { term: "ID Tagihan Terakhir", description: "Referensi tagihan terakhir yang terkait status langganan tenant.", reference: "Kolom: `subscriptions.last_invoice_id`" },
  { term: "Sinkronisasi Status Langganan", description: "Fungsi sinkronisasi untuk mengeksekusi kebijakan kedaluwarsa berbasis streak + masa tenggang.", reference: "Fungsi: `sync_streak_subscription_status()`" },
  { term: "Cron Sinkronisasi Kebijakan", description: "Jadwal penegakan otomatis untuk mengecek masa tenggang harian.", reference: "Job: `streak-subscription-sync-daily`" },
  { term: "Tandai Streak Ditagihkan", description: "Fungsi sinkron final pasca pembayaran untuk menutup siklus streak.", reference: "Fungsi: `mark_streak_invoiced()`" },
  { term: "Hari Kerja Valid", description: "Hari kerja yang diperhitungkan untuk streak setelah mengecualikan akhir pekan/libur.", reference: "Logika: `update_tenant_streak()`" },
  { term: "Libur Nasional", description: "Hari libur nasional yang tidak memutus streak.", reference: "Tabel: `national_holidays`" },
  { term: "Libur Organisasi", description: "Hari libur khusus tenant yang tidak memutus streak.", reference: "Tabel: `work_holidays`" },
  { term: "Mendekati Penangguhan", description: "Tenant sudah target tercapai namun belum bayar dan masih dalam masa tenggang.", reference: "Turunan UI: `reached_target && !invoiced && !grace expired`" },
  { term: "Log Pembayaran", description: "Riwayat aktivitas pembayaran untuk audit dan monitoring tindak lanjut.", reference: "Tab: `Payment Logs` pada halaman ini" },
  { term: "Uji Regresi Masa Tenggang Non-Bayar", description: "Skenario uji otomatis untuk memastikan tenant non-bayar benar-benar masuk `expired` setelah masa tenggang berakhir.", reference: "Skrip: `npm run streak:test-grace-expired`" },
];
const STREAK_ITEMS_PER_PAGE = 10;
const PAYMENTS_PER_PAGE = 10;
const GLOSSARY_PER_PAGE = 10;
const STREAK_MONITORING_QUERY_TIMEOUT_MS = 12000;
const STREAK_MONITORING_QUERY_RETRY_MAX = 2;

export default function StreakMonitoring() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [streaks, setStreaks] = useState<StreakItem[]>([]);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<StreakMonitoringTab>("active");
  const [streakThreshold, setStreakThreshold] = useState(30);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [subscriptionsByTenant, setSubscriptionsByTenant] = useState<Record<string, SubscriptionSnapshot>>({});
  const [invoicesById, setInvoicesById] = useState<Record<string, InvoiceSnapshot>>({});
  const [latestInvoicesByTenant, setLatestInvoicesByTenant] = useState<Record<string, InvoiceSnapshot>>({});
  const [cleanupByTenant, setCleanupByTenant] = useState<Record<string, CleanupLifecycleSnapshot>>({});
  const [activePage, setActivePage] = useState(1);
  const [nearPage, setNearPage] = useState(1);
  const [nonActivePage, setNonActivePage] = useState(1);
  const [nonActiveReasonFilter, setNonActiveReasonFilter] = useState<NonActiveReasonFilter>("all");
  const [tenantActionLoading, setTenantActionLoading] = useState<Record<string, "sync" | "remind" | undefined>>({});
  const [tenantActionSummaries, setTenantActionSummaries] = useState<Record<string, TenantActionSummary>>({});
  const [pendingTenantAction, setPendingTenantAction] = useState<PendingTenantAction | null>(null);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalCount, setPaymentsTotalCount] = useState(0);
  const [glossaryPage, setGlossaryPage] = useState(1);

  const fetchThreshold = useCallback(async () => {
    try {
      setIsRetrying(false);
      const response = await withExponentialBackoff(
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
      const { data } = ensureSupabaseSuccess(response);
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

  const fetchLifecycleSnapshots = useCallback(async (tenantIds: string[]) => {
    if (tenantIds.length === 0) {
      setSubscriptionsByTenant({});
      setInvoicesById({});
      setLatestInvoicesByTenant({});
      setCleanupByTenant({});
      return;
    }

    try {
      setIsRetrying(false);
      const [subscriptionsRes, cleanupRes] = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              Promise.all([
                supabase
                  .from("subscriptions")
                  .select("tenant_id, status, last_invoice_id, grace_period_end, end_date, notes")
                  .in("tenant_id", tenantIds),
                supabase
                  .from("tenant_cleanup_lifecycle")
                  .select("tenant_id, status, purge_at, scheduled_at, purged_at, cancelled_at, updated_at")
                  .in("tenant_id", tenantIds),
              ]),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.lifecycle.fetch timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const { data: subscriptionsRows } = ensureSupabaseSuccess(subscriptionsRes);
      const { data: cleanupRows } = ensureSupabaseSuccess(cleanupRes);

      const nextSubscriptions: Record<string, SubscriptionSnapshot> = {};
      const invoiceIds = new Set<string>();
      const fallbackInvoiceTenantIds = new Set<string>(tenantIds);
      (subscriptionsRows || []).forEach((row) => {
        nextSubscriptions[row.tenant_id] = {
          tenant_id: row.tenant_id,
          status: row.status || null,
          last_invoice_id: row.last_invoice_id || null,
          grace_period_end: row.grace_period_end || null,
          end_date: row.end_date || null,
          notes: row.notes || null,
        };
        if (row.last_invoice_id) {
          invoiceIds.add(row.last_invoice_id);
          fallbackInvoiceTenantIds.delete(row.tenant_id);
        }
      });

      const nextCleanup: Record<string, CleanupLifecycleSnapshot> = {};
      (cleanupRows || []).forEach((row) => {
        const current = nextCleanup[row.tenant_id];
        if (!current || new Date(row.updated_at).getTime() > new Date(current.updated_at).getTime()) {
          nextCleanup[row.tenant_id] = {
            tenant_id: row.tenant_id,
            status: row.status,
            purge_at: row.purge_at,
            scheduled_at: row.scheduled_at,
            purged_at: row.purged_at,
            cancelled_at: row.cancelled_at,
            updated_at: row.updated_at,
          };
        }
      });

      let nextInvoices: Record<string, InvoiceSnapshot> = {};
      const nextLatestInvoicesByTenant: Record<string, InvoiceSnapshot> = {};
      if (invoiceIds.size > 0) {
        const invoicesRes = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("invoices")
                .select("id, tenant_id, status, due_date, updated_at, metadata")
                .in("id", Array.from(invoiceIds)),
              STREAK_MONITORING_QUERY_TIMEOUT_MS,
              "admin.streak.lifecycle_invoices.fetch timeout"
            ),
          {
            maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        const { data: invoicesRows } = ensureSupabaseSuccess(invoicesRes);
        nextInvoices = (invoicesRows || []).reduce<Record<string, InvoiceSnapshot>>((acc, row) => {
          acc[row.id] = {
            id: row.id,
            tenant_id: row.tenant_id,
            status: row.status,
            due_date: row.due_date,
            updated_at: row.updated_at,
            metadata: row.metadata ?? null,
          };
          return acc;
        }, {});

        Object.values(nextSubscriptions).forEach((subscription) => {
          if (subscription.last_invoice_id && !nextInvoices[subscription.last_invoice_id]) {
            fallbackInvoiceTenantIds.add(subscription.tenant_id);
          }
        });
      }

      if (fallbackInvoiceTenantIds.size > 0) {
        const fallbackInvoicesRes = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("invoices")
                .select("id, tenant_id, status, due_date, updated_at, created_at, metadata")
                .in("tenant_id", Array.from(fallbackInvoiceTenantIds))
                .order("updated_at", { ascending: false })
                .order("created_at", { ascending: false }),
              STREAK_MONITORING_QUERY_TIMEOUT_MS,
              "admin.streak.lifecycle_invoices_fallback.fetch timeout"
            ),
          {
            maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        const { data: fallbackInvoicesRows } = ensureSupabaseSuccess(fallbackInvoicesRes);
        (fallbackInvoicesRows || []).forEach((row) => {
          if (!nextLatestInvoicesByTenant[row.tenant_id]) {
            nextLatestInvoicesByTenant[row.tenant_id] = {
              id: row.id,
              tenant_id: row.tenant_id,
              status: row.status,
              due_date: row.due_date,
              updated_at: row.updated_at,
              metadata: row.metadata ?? null,
            };
          }
        });
      }

      setSubscriptionsByTenant(nextSubscriptions);
      setInvoicesById(nextInvoices);
      setLatestInvoicesByTenant(nextLatestInvoicesByTenant);
      setCleanupByTenant(nextCleanup);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.lifecycle.fetch");
      setLoadError((prev) =>
        prev ?? appendErrorReference("Data lifecycle non-aktif belum lengkap. Menampilkan status dasar streak.", errorRef)
      );
      setSubscriptionsByTenant({});
      setInvoicesById({});
      setLatestInvoicesByTenant({});
      setCleanupByTenant({});
    }
  }, []);

  const fetchStreaks = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const response = await withExponentialBackoff(
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
      const { data } = ensureSupabaseSuccess(response);
      const streakRows = (data || []) as StreakItem[];
      setStreaks(streakRows);
      const tenantIds = Array.from(new Set(streakRows.map((row) => row.tenant_id).filter(Boolean)));
      await fetchLifecycleSnapshots(tenantIds);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.items.fetch");
      const message = appendErrorReference("Gagal memuat data streak monitoring", errorRef);
      setLoadError(message);
      setStreaks([]);
      setSubscriptionsByTenant({});
      setInvoicesById({});
      setLatestInvoicesByTenant({});
      setCleanupByTenant({});
    } finally {
      setIsLoading(false);
    }
  }, [fetchLifecycleSnapshots]);

  const fetchPayments = useCallback(async (page: number) => {
    const start = Math.max(0, (page - 1) * PAYMENTS_PER_PAGE);
    const end = start + PAYMENTS_PER_PAGE - 1;
    setIsLoadingPayments(true);
    try {
      setIsRetrying(false);
      const response = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("manual_payments")
              .select("id, tenant_id, amount, status, created_at, payment_method, tenants:tenant_id(name)", { count: "exact" })
              .order("created_at", { ascending: false })
              .range(start, end),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.payment_logs.fetch timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      const { data, count } = ensureSupabaseSuccess(response);
      const totalCount = Number(count || 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / PAYMENTS_PER_PAGE));
      if (page > totalPages) {
        setPaymentsPage(totalPages);
        return;
      }
      setPayments((data as PaymentLog[]) || []);
      setPaymentsTotalCount(totalCount);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.payment_logs.fetch");
      setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat payment logs streak", errorRef));
      setPayments([]);
      setPaymentsTotalCount(0);
    } finally {
      setIsLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchStreaks(), fetchThreshold()]);
  }, [fetchStreaks, fetchThreshold]);

  useEffect(() => {
    void fetchPayments(paymentsPage);
  }, [fetchPayments, paymentsPage]);

  useEffect(() => {
    const nextTab = mapTabParamToTab(searchParams.get("tab")?.toLowerCase() || null)
      ?? mapStatusParamToTab(searchParams.get("status"));
    if (nextTab) {
      setActiveTab(nextTab);
    }
  }, [searchParams]);

  const filtered = streaks.filter((s) =>
    !searchQuery || s.tenants?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const safeThreshold = streakThreshold > 0 ? streakThreshold : 30;

  const isGraceExpired = (item: StreakItem): boolean => {
    if (!item.grace_period_end) return false;
    const graceEndDate = new Date(`${item.grace_period_end}T00:00:00`);
    return graceEndDate < today;
  };

  const toDateLabel = (value: string | null): string =>
    value ? format(new Date(value), "dd MMM yyyy", { locale: idLocale }) : "-";

  const buildEnrichedStreak = (item: StreakItem): EnrichedStreakItem => {
    const subscription = subscriptionsByTenant[item.tenant_id];
    const cleanup = cleanupByTenant[item.tenant_id];
    const fallbackInvoice = latestInvoicesByTenant[item.tenant_id];
    const invoice = subscription?.last_invoice_id
      ? (invoicesById[subscription.last_invoice_id] || fallbackInvoice)
      : fallbackInvoice;
    const normalizedSubscriptionStatus = (subscription?.status || "").toLowerCase();
    const normalizedCleanupStatus = (cleanup?.status || "").toLowerCase();
    const normalizedInvoiceStatus = (invoice?.status || "").toUpperCase();
    const hasUnpaidInvoice = isActiveInvoiceStatus(normalizedInvoiceStatus) || normalizedInvoiceStatus === "OVERDUE";
    const invoiceJourney = getBillingSubscriptionJourneyFromInvoiceMetadata(invoice?.metadata ?? null);
    const subscriptionJourney = getBillingSubscriptionJourneyFromNotes(subscription?.notes);
    const billingJourney = invoiceJourney !== "unknown" ? invoiceJourney : subscriptionJourney;

    let nonActiveReason: NonActiveReason | null = null;
    if (normalizedCleanupStatus === "purged") {
      nonActiveReason = "purged_cleanup";
    } else if (normalizedCleanupStatus === "scheduled") {
      nonActiveReason = "scheduled_cleanup";
    } else if (normalizedSubscriptionStatus === "cancelled") {
      nonActiveReason = "cancelled_subscription";
    } else if (normalizedSubscriptionStatus === "expired" && hasUnpaidInvoice) {
      nonActiveReason = "expired_unpaid";
    } else if (Boolean(item.reached_target) && item.status !== "invoiced" && isGraceExpired(item)) {
      nonActiveReason = "suspended_unpaid";
    } else if (normalizedSubscriptionStatus === "expired") {
      nonActiveReason = "inactive_unknown";
    }

    const trialSignal = getTrialSeriousnessSignal({
      streakCount: item.streak_count,
      streakThreshold: safeThreshold,
      streakStatus: item.status,
      reachedTarget: Boolean(item.reached_target),
      lastActivityDate: item.last_activity_date,
      subscriptionStatus: subscription?.status || null,
      invoiceStatus: invoice?.status || null,
      billingJourney,
      isNonActive: nonActiveReason !== null,
    });

    return {
      ...item,
      subscription_status: subscription?.status || null,
      invoice_status: invoice?.status || null,
      invoice_due_date: invoice?.due_date || null,
      cleanup_status: cleanup?.status || null,
      purge_at: cleanup?.purge_at || null,
      non_active_reason: nonActiveReason,
      is_non_active: nonActiveReason !== null,
      billing_journey: billingJourney,
      trial_signal: trialSignal,
    };
  };

  const filteredEnriched = filtered.map(buildEnrichedStreak);
  const allEnriched = streaks.map(buildEnrichedStreak);

  const isActiveTracking = (item: EnrichedStreakItem): boolean =>
    item.status === "tracking" && !item.reached_target && !item.is_non_active;

  const isNearSuspension = (item: EnrichedStreakItem): boolean =>
    Boolean(item.reached_target) && item.status !== "invoiced" && !isGraceExpired(item) && !item.is_non_active;

  const isNonActive = (item: EnrichedStreakItem): boolean => item.is_non_active;

  const activeStreaks = filteredEnriched.filter(isActiveTracking);
  const nearSuspension = filteredEnriched.filter(isNearSuspension);
  const nonActive = filteredEnriched.filter(isNonActive);
  const nonActiveSorted = [...nonActive].sort((a, b) => {
    const urgencyA = getPurgeUrgency(a.purge_at).sortKey;
    const urgencyB = getPurgeUrgency(b.purge_at).sortKey;
    if (urgencyA !== urgencyB) return urgencyA - urgencyB;
    const dueA = a.invoice_due_date ? new Date(a.invoice_due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.invoice_due_date ? new Date(b.invoice_due_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return (a.tenants?.name || "").localeCompare(b.tenants?.name || "");
  });
  const nonActiveFiltered = nonActiveReasonFilter === "all"
    ? nonActiveSorted
    : nonActiveSorted.filter((item) => item.non_active_reason === nonActiveReasonFilter);

  const totalCount = streaks.length;
  const activeCount = allEnriched.filter(isActiveTracking).length;
  const readyCount = allEnriched.filter(isNearSuspension).length;
  const nonActiveCount = allEnriched.filter(isNonActive).length;
  const nonActiveReasonCounts = nonActive.reduce<Record<NonActiveReason, number>>(
    (acc, item) => {
      if (item.non_active_reason) {
        acc[item.non_active_reason] = (acc[item.non_active_reason] || 0) + 1;
      }
      return acc;
    },
    {
      suspended_unpaid: 0,
      expired_unpaid: 0,
      cancelled_subscription: 0,
      scheduled_cleanup: 0,
      purged_cleanup: 0,
      inactive_unknown: 0,
    }
  );
  const nonActiveReasonFilters: Array<{ value: NonActiveReasonFilter; label: string; count: number }> = [
    { value: "all", label: "Semua", count: nonActive.length },
    {
      value: "expired_unpaid",
      label: getNonActiveReasonUi("expired_unpaid").label,
      count: nonActiveReasonCounts.expired_unpaid,
    },
    {
      value: "suspended_unpaid",
      label: getNonActiveReasonUi("suspended_unpaid").label,
      count: nonActiveReasonCounts.suspended_unpaid,
    },
    {
      value: "scheduled_cleanup",
      label: getNonActiveReasonUi("scheduled_cleanup").label,
      count: nonActiveReasonCounts.scheduled_cleanup,
    },
    {
      value: "cancelled_subscription",
      label: getNonActiveReasonUi("cancelled_subscription").label,
      count: nonActiveReasonCounts.cancelled_subscription,
    },
    {
      value: "purged_cleanup",
      label: getNonActiveReasonUi("purged_cleanup").label,
      count: nonActiveReasonCounts.purged_cleanup,
    },
    {
      value: "inactive_unknown",
      label: getNonActiveReasonUi("inactive_unknown").label,
      count: nonActiveReasonCounts.inactive_unknown,
    },
  ];

  const trialSignalCandidates = allEnriched.filter(
    (item) => !item.is_non_active && (item.status !== "invoiced" || item.billing_journey === "activation_early")
  );
  const trialSignalSummaries = TRIAL_SERIOUSNESS_ORDER.map((status) => ({
    status,
    count: trialSignalCandidates.filter((item) => item.trial_signal.status === status).length,
    ...getTrialSeriousnessStatusUi(status),
  }));

  const statusBadge = (item: EnrichedStreakItem) => {
    if (item.is_non_active) {
      return <Badge variant="destructive">Non-Aktif</Badge>;
    }

    if (Boolean(item.reached_target) && item.status !== "invoiced" && isGraceExpired(item)) {
      return <Badge variant="destructive">Ditangguhkan</Badge>;
    }

    switch (item.status) {
      case "ready_for_invoicing":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Siap Ditagih</Badge>;
      case "grace_period":
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Masa Tenggang</Badge>;
      case "invoiced":
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Sudah Ditagih</Badge>;
      default:
        return <Badge variant="outline">Pemantauan</Badge>;
    }
  };
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
  const nonActiveTotalPages = Math.max(1, Math.ceil(nonActiveFiltered.length / STREAK_ITEMS_PER_PAGE));
  const paginatedNonActive = nonActiveFiltered.slice(
    (nonActivePage - 1) * STREAK_ITEMS_PER_PAGE,
    nonActivePage * STREAK_ITEMS_PER_PAGE
  );
  const paymentsTotalPages = Math.max(1, Math.ceil(paymentsTotalCount / PAYMENTS_PER_PAGE));
  const paginatedPayments = payments;
  const glossaryTotalPages = Math.max(1, Math.ceil(filteredGlossary.length / GLOSSARY_PER_PAGE));
  const paginatedGlossary = filteredGlossary.slice(
    (glossaryPage - 1) * GLOSSARY_PER_PAGE,
    glossaryPage * GLOSSARY_PER_PAGE
  );

  useEffect(() => {
    setActivePage(1);
    setNearPage(1);
    setNonActivePage(1);
  }, [searchQuery, streaks.length]);

  useEffect(() => {
    setNonActivePage(1);
  }, [nonActiveReasonFilter]);

  useEffect(() => {
    setGlossaryPage(1);
  }, [glossaryQuery]);

  const paymentsSummaryText = useMemo(() => {
    if (paymentsTotalCount === 0) return "Belum ada riwayat pembayaran";
    const from = ((paymentsPage - 1) * PAYMENTS_PER_PAGE) + 1;
    const to = Math.min(paymentsTotalCount, from + Math.max(0, payments.length - 1));
    return `Menampilkan ${from}-${to} dari ${paymentsTotalCount} riwayat pembayaran`;
  }, [payments.length, paymentsPage, paymentsTotalCount]);

  const setTenantActionState = useCallback((tenantId: string, action: "sync" | "remind" | undefined) => {
    setTenantActionLoading((prev) => {
      if (action) return { ...prev, [tenantId]: action };
      const next = { ...prev };
      delete next[tenantId];
      return next;
    });
  }, []);

  const setTenantActionSummary = useCallback((tenantId: string, summary: TenantActionSummary) => {
    setTenantActionSummaries((prev) => ({
      ...prev,
      [tenantId]: summary,
    }));
  }, []);

  const handleSyncTenantLifecycle = useCallback(async (item: EnrichedStreakItem) => {
    setTenantActionState(item.tenant_id, "sync");
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () => supabase.rpc("sync_unpaid_cleanup_schedules", { p_tenant_id: item.tenant_id }),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.non_active.sync_tenant timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      await fetchStreaks();
      const summaryMessage = summarizeLifecycleActionResult("sync", data);
      setTenantActionSummary(item.tenant_id, {
        action: "sync",
        status: "success",
        message: summaryMessage,
        at: new Date().toISOString(),
      });
      toast.success(`${item.tenants?.name || "Tenant"}: ${summaryMessage}`);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.non_active.sync_tenant", { tenant_id: item.tenant_id });
      const errorMessage = appendErrorReference("Gagal sinkron lifecycle tenant", errorRef);
      setTenantActionSummary(item.tenant_id, {
        action: "sync",
        status: "error",
        message: errorMessage,
        at: new Date().toISOString(),
      });
      toast.error(errorMessage);
    } finally {
      setTenantActionState(item.tenant_id, undefined);
    }
  }, [fetchStreaks, setTenantActionState, setTenantActionSummary]);

  const handleSendCleanupReminder = useCallback(async (item: EnrichedStreakItem) => {
    const cleanupStatus = (item.cleanup_status || "").toLowerCase();
    const urgency = getPurgeUrgency(item.purge_at);
    if (cleanupStatus !== "scheduled" || urgency.daysLeft === null || urgency.daysLeft < 0) {
      toast.info("Reminder manual hanya tersedia untuk tenant dengan cleanup terjadwal yang belum melewati tenggat purge.");
      return;
    }

    setTenantActionState(item.tenant_id, "remind");
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase.rpc("send_unpaid_cleanup_reminder", {
                p_tenant_id: item.tenant_id,
                p_force: true,
              }),
            STREAK_MONITORING_QUERY_TIMEOUT_MS,
            "admin.streak.non_active.send_reminder timeout"
          ),
        {
          maxRetries: STREAK_MONITORING_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      await fetchStreaks();
      const summaryMessage = summarizeLifecycleActionResult("remind", data);
      const payload = (typeof data === "object" && data !== null) ? (data as Record<string, unknown>) : null;
      const isOk = payload && typeof payload.ok === "boolean" ? payload.ok : true;
      const summaryStatus: TenantActionSummary["status"] = isOk ? "success" : "info";
      setTenantActionSummary(item.tenant_id, {
        action: "remind",
        status: summaryStatus,
        message: summaryMessage,
        at: new Date().toISOString(),
      });
      if (isOk) {
        toast.success(`${item.tenants?.name || "Tenant"}: ${summaryMessage}`);
      } else {
        toast.info(`${item.tenants?.name || "Tenant"}: ${summaryMessage}`);
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.streak.non_active.send_reminder", { tenant_id: item.tenant_id });
      const errorMessage = appendErrorReference("Gagal memproses reminder cleanup", errorRef);
      setTenantActionSummary(item.tenant_id, {
        action: "remind",
        status: "error",
        message: errorMessage,
        at: new Date().toISOString(),
      });
      toast.error(errorMessage);
    } finally {
      setTenantActionState(item.tenant_id, undefined);
    }
  }, [fetchStreaks, setTenantActionState, setTenantActionSummary]);

  const handleOpenTenantBilling = useCallback((item: EnrichedStreakItem) => {
    navigate(`/admin/billing?tab=invoices&tenantId=${encodeURIComponent(item.tenant_id)}`);
  }, [navigate]);

  const handleConfirmTenantAction = useCallback(async () => {
    if (!pendingTenantAction) return;
    const selected = pendingTenantAction;
    setPendingTenantAction(null);
    if (selected.action === "sync") {
      await handleSyncTenantLifecycle(selected.item);
      return;
    }
    await handleSendCleanupReminder(selected.item);
  }, [handleSendCleanupReminder, handleSyncTenantLifecycle, pendingTenantAction]);

  const renderTable = (
    data: EnrichedStreakItem[],
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
                <TableHead className="min-w-[240px]">Sinyal Trial</TableHead>
                <TableHead>Aktivitas Terakhir</TableHead>
                <TableHead>Masa Tenggang</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
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
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <Badge variant="outline" className={s.trial_signal.badgeClassName}>
                        {s.trial_signal.label}
                      </Badge>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {s.trial_signal.description}
                      </p>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Skor indikator: {s.trial_signal.score}/100
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{toDateLabel(s.last_activity_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{toDateLabel(s.grace_period_end)}</TableCell>
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

  const renderNonActiveTable = (
    data: EnrichedStreakItem[],
    currentPage: number,
    totalPages: number,
    onPageChange: React.Dispatch<React.SetStateAction<number>>
  ) => (
    data.length === 0 ? (
      <p className="text-center text-muted-foreground py-8">
        {nonActiveReasonFilter === "all" ? "Belum ada tenant non-aktif" : "Tidak ada tenant untuk alasan yang dipilih"}
      </p>
    ) : (
      <div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisasi</TableHead>
                <TableHead>Alasan Non-Aktif</TableHead>
                <TableHead>Status Langganan</TableHead>
                <TableHead>Status Tagihan</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                <TableHead>Target Purge</TableHead>
                <TableHead>Urgensi</TableHead>
                <TableHead className="min-w-[230px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => {
                const reasonUi = getNonActiveReasonUi(item.non_active_reason);
                const purgeUrgency = getPurgeUrgency(item.purge_at);
                const actionState = tenantActionLoading[item.tenant_id];
                const actionSummary = tenantActionSummaries[item.tenant_id];
                const cleanupStatus = (item.cleanup_status || "").toLowerCase();
                const canSendReminder = cleanupStatus === "scheduled" && purgeUrgency.daysLeft !== null && purgeUrgency.daysLeft >= 0;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.tenants?.name || "-"}</TableCell>
                    <TableCell><Badge variant={reasonUi.variant}>{reasonUi.label}</Badge></TableCell>
                    <TableCell className="text-sm uppercase">{item.subscription_status || "-"}</TableCell>
                    <TableCell className="text-sm uppercase">{item.invoice_status || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{toDateLabel(item.invoice_due_date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{toDateLabel(item.purge_at)}</TableCell>
                    <TableCell><Badge variant={purgeUrgency.variant}>{purgeUrgency.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs disabled:opacity-50"
                          onClick={() => setPendingTenantAction({ action: "remind", item })}
                          disabled={actionState === "sync" || actionState === "remind" || !canSendReminder}
                          title={canSendReminder ? "Kirim reminder cleanup untuk tenant ini" : "Reminder hanya tersedia saat cleanup berstatus scheduled dan belum melewati tenggat purge"}
                        >
                          {actionState === "remind" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Kirim Reminder"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs disabled:opacity-50"
                          onClick={() => setPendingTenantAction({ action: "sync", item })}
                          disabled={actionState === "sync" || actionState === "remind"}
                          title="Sinkronkan status lifecycle tenant"
                        >
                          {actionState === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sinkronkan Lifecycle"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs"
                          onClick={() => handleOpenTenantBilling(item)}
                          title="Buka halaman billing untuk tenant ini"
                        >
                          Buka Tagihan
                        </button>
                      </div>
                      {actionSummary ? (
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            actionSummary.status === "error"
                              ? "text-destructive"
                              : actionSummary.status === "info"
                                ? "text-amber-700"
                                : "text-muted-foreground"
                          )}
                        >
                          {actionSummary.action === "sync" ? "Sinkronkan" : "Pengingat"}{" "}
                          {format(new Date(actionSummary.at), "dd MMM HH:mm", { locale: idLocale })}: {actionSummary.message}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
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
    <SuperAdminLayout title="Pemantauan Streak" subtitle="Pantau stabilitas penggunaan per tenant">
      {isRetrying && (
        <div className="mb-6 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sedang mencoba ulang memuat data pemantauan streak...
        </div>
      )}
      {loadError && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{loadError}</span>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs text-foreground"
            onClick={() => void Promise.all([fetchStreaks(), fetchPayments(paymentsPage), fetchThreshold()])}
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
          <div><p className="text-2xl font-bold">{readyCount}</p><p className="text-xs text-muted-foreground">Mendekati Suspensi</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
          <div><p className="text-2xl font-bold">{nonActiveCount}</p><p className="text-xs text-muted-foreground">Non-Aktif</p></div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-64 mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari tenant..." className="pl-10" />
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Sinyal Cepat Trial</CardTitle>
          <p className="text-sm text-muted-foreground">
            Ini adalah indikator cepat berbasis streak, invoice, status langganan, dan aktivitas terakhir.
            Gunakan untuk triase awal. Kesiapan data pegawai, kualitas follow-up, dan sinyal komersial manual belum ikut dihitung di sini.
          </p>
        </CardHeader>
        <CardContent>
          {trialSignalCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada tenant trial aktif yang cukup relevan untuk dinilai saat ini.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {trialSignalSummaries.map((item) => (
                <div key={item.status} className={cn("rounded-lg border p-3", item.cardClassName)}>
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline" className={item.badgeClassName}>
                      {item.label}
                    </Badge>
                    <span className="text-2xl font-bold">{item.count}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(mapTabParamToTab(value) ?? "active")}>
        <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <TabsTrigger value="active" className="flex items-center gap-1 whitespace-nowrap">
            <Flame className="w-3.5 h-3.5" /> Aktif
          </TabsTrigger>
          <TabsTrigger value="near" className="flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" /> Mendekati Suspensi
          </TabsTrigger>
          <TabsTrigger value="non_active" className="flex items-center gap-1 whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" /> Non-Aktif
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1 whitespace-nowrap">
            <CreditCard className="w-3.5 h-3.5" /> Log Pembayaran
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
              <CardTitle>Hampir Ditangguhkan</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tenant yang sudah mencapai target streak dan memasuki masa tenggang pembayaran.
                Jika tidak membayar sebelum masa tenggang berakhir, akses akan dikunci otomatis.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderTable(paginatedNearSuspension, nearPage, nearTotalPages, setNearPage)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="non_active">
          <Card>
            <CardHeader>
              <CardTitle>Non-Aktif</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tenant yang tidak melanjutkan pembayaran setelah fase streak/trial dikumpulkan di sini.
                Alasan non-aktif ditentukan dari kombinasi status streak, langganan, invoice terakhir, dan lifecycle cleanup.
                Daftar diurutkan dari urgensi purge paling dekat.
              </p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                {nonActiveReasonFilters.map((filter) => {
                  const isActive = nonActiveReasonFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setNonActiveReasonFilter(filter.value)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
                        isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      <span>{filter.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{filter.count}</span>
                    </button>
                  );
                })}
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                renderNonActiveTable(paginatedNonActive, nonActivePage, nonActiveTotalPages, setNonActivePage)
              )}
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
              <p className="text-xs text-muted-foreground">{paymentsSummaryText}</p>
            </CardHeader>
            <CardContent>
              {isLoadingPayments ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : payments.length === 0 ? (
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
                      {paginatedPayments.map((p) => {
                        const statusUi = getPaymentStatusUi(p.status);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.tenants?.name || "-"}</TableCell>
                            <TableCell>Rp {Number(p.amount).toLocaleString("id-ID")}</TableCell>
                            <TableCell className="text-sm">{p.payment_method || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={statusUi.variant}>{statusUi.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {p.created_at ? format(new Date(p.created_at), "dd MMM yyyy HH:mm", { locale: idLocale }) : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!isLoadingPayments && paymentsTotalCount > 0 && (
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
            <CardTitle>Glosarium Lengkap Streak, Tagihan, dan Pembayaran</CardTitle>
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

      <AlertDialog
        open={Boolean(pendingTenantAction)}
        onOpenChange={(open) => {
          if (!open) setPendingTenantAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTenantAction?.action === "sync" ? "Konfirmasi Sinkronisasi Lifecycle" : "Konfirmasi Kirim Pengingat"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTenantAction?.action === "sync"
                ? `Sinkronisasi lifecycle akan dijalankan untuk tenant ${pendingTenantAction.item.tenants?.name || "-"}. Lanjutkan proses?`
                : `Reminder manual akan dikirim untuk tenant ${pendingTenantAction?.item.tenants?.name || "-"}. Aksi ini memakai RPC reminder khusus (bukan lifecycle runner umum). Lanjutkan proses?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmTenantAction();
              }}
            >
              Ya, Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
}
