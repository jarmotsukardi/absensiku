import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmployeeFloatingWhatsApp } from "@/components/employee/EmployeeFloatingWhatsApp";
import { ReadonlyHomeTab } from "@/components/dashboard/readonly/ReadonlyHomeTab";
import { ReadonlyHistoryTab } from "@/components/dashboard/readonly/ReadonlyHistoryTab";
import { ReadonlyHelpTab } from "@/components/dashboard/readonly/ReadonlyHelpTab";
import { ReadonlyNotificationsTab } from "@/components/dashboard/readonly/ReadonlyNotificationsTab";
import { ReadonlyActivationTab } from "@/components/dashboard/readonly/ReadonlyActivationTab";
import { ReadonlyRequestsTab } from "@/components/dashboard/readonly/ReadonlyRequestsTab";
import { ReadonlyProfileTab } from "@/components/dashboard/readonly/ReadonlyProfileTab";
import EmployeeNewsArticles from "@/pages/employee/EmployeeNewsArticles";
import EmployeeAnnouncements from "@/pages/employee/EmployeeAnnouncements";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import {
  Bell,
  FileClock,
  FileText,
  HelpCircle,
  History,
  Home,
  LogOut,
  Megaphone,
  Newspaper,
  ShieldCheck,
  User2,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

type DashboardTab = "home" | "history" | "requests" | "news" | "articles" | "announcements" | "notifications" | "help" | "profile" | "activation";

interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  nik?: string | null;
  nip?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  gender?: string | null;
  golongan?: string | null;
  employee_category?: string | null;
  position?: string | null;
  is_active?: boolean | null;
  tenant_id?: string | null;
  user_id?: string | null;
  office_id?: string | null;
  opd_id?: string | null;
  work_unit_id?: string | null;
  offices?: { id?: string | null; name?: string | null; address?: string | null } | null;
  opd?: { id?: string | null; name?: string | null; code?: string | null } | null;
  work_unit?: { id?: string | null; name?: string | null } | null;
}

interface TenantProfile {
  id: string;
  name: string;
  logo_url?: string | null;
  timezone?: string | null;
  billing_mode?: string | null;
}

interface AttendanceItem {
  id: string;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
}

interface ReqItem {
  id: string;
  type: string;
  date: string;
  status: string;
  reason?: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface HomeNews {
  id: string;
  title: string;
  created_at: string;
  source: "news" | "article";
}

const DEFAULT_HELP_FAQS: Array<{ id: string; question: string; answer?: string | null }> = [
  {
    id: "default-help-1",
    question: "Bagaimana cara melakukan absensi?",
    answer: "Absensi dilakukan melalui aplikasi mobile di /employee/dashboard. Pastikan GPS aktif dan perangkat terdaftar.",
  },
  {
    id: "default-help-2",
    question: "Bagaimana cara mengajukan izin/cuti?",
    answer: "Buka tab Pengajuan, pilih jenis pengajuan, isi tanggal dan alasan, lalu kirim untuk diproses atasan.",
  },
  {
    id: "default-help-3",
    question: "Apa yang harus dilakukan jika lupa password?",
    answer: "Gunakan menu ganti/reset password pada halaman autentikasi, atau hubungi admin organisasi.",
  },
  {
    id: "default-help-4",
    question: "Mengapa pilihan golongan di perubahan profil berbeda dengan yang saya harapkan?",
    answer:
      "Pilihan golongan mengikuti master data aktif organisasi. Hubungi admin organisasi agar golongan yang dibutuhkan ditambahkan atau diaktifkan.",
  },
];

type WfhRequestRow = Tables<"wfh_requests">;
type OvertimeSettingsRow = Tables<"overtime_settings">;

const TABS: Array<{ id: DashboardTab; label: string; icon: React.ElementType }> = [
  { id: "home", label: "Beranda", icon: Home },
  { id: "history", label: "Riwayat", icon: History },
  { id: "requests", label: "Pengajuan", icon: FileText },
  { id: "news", label: "Berita", icon: Newspaper },
  { id: "articles", label: "Artikel", icon: FileClock },
  { id: "announcements", label: "Pengumuman", icon: Megaphone },
  { id: "notifications", label: "Notifikasi", icon: Bell },
  { id: "activation", label: "Aktivasi", icon: Zap },
  { id: "help", label: "Bantuan", icon: HelpCircle },
  { id: "profile", label: "Profil", icon: User2 },
];

const MONTH_OPTIONS = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

export default function EmployeeDashboardReadonly() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");

  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [historyItems, setHistoryItems] = useState<AttendanceItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(() => {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
  const [requestItems, setRequestItems] = useState<ReqItem[]>([]);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [newsItems, setNewsItems] = useState<HomeNews[]>([]);
  const [faqItems, setFaqItems] = useState<Array<{ id: string; question: string; answer?: string | null }>>([]);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [showNotificationOverlay, setShowNotificationOverlay] = useState(false);
  const [activeRequestType, setActiveRequestType] = useState<"leave" | "wfh" | "overtime" | "flexible">("leave");
  const [wfhRequests, setWfhRequests] = useState<WfhRequestRow[]>([]);
  const [isWfhLoading, setIsWfhLoading] = useState(false);
  const [overtimeSettings, setOvertimeSettings] = useState<OvertimeSettingsRow | null>(null);
  const [refreshFlexible, setRefreshFlexible] = useState(0);
  const { leaveRequests, isLoading: leaveLoading, isSubmitting: leaveSubmitting, createLeaveRequest, cancelLeaveRequest, refetch: refetchLeave } = useLeaveRequests(employee?.id || null);

  useEffect(() => {
    const tab = (new URLSearchParams(location.search).get("tab") || "home") as DashboardTab;
    const allowed = new Set<DashboardTab>(TABS.map((t) => t.id));
    setActiveTab(allowed.has(tab) ? tab : "home");
  }, [location.search]);

  const setTab = useCallback(
    (tab: DashboardTab) => {
      const params = new URLSearchParams(location.search);
      if (tab === "home") params.delete("tab");
      else params.set("tab", tab);
      const next = params.toString();
      navigate({ pathname: "/dashboard", search: next ? `?${next}` : "" }, { replace: true });
    },
    [location.search, navigate]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate("/auth", { replace: true });
        return;
      }

      const uid = session.user.id;

      const { data: empRows } = await supabase
        .from("employees")
        .select("id,name,email,nik,nip,phone,whatsapp,address,gender,golongan,employee_category,position,is_active,tenant_id,user_id,office_id,opd_id,work_unit_id,offices:office_id(id,name,address),opd(id,name,code),work_unit:work_unit_id(id,name)")
        .eq("user_id", uid)
        .limit(1);

      const emp = empRows?.[0] || null;
      setEmployee(emp || null);

      if (!emp?.tenant_id) {
        setAttendanceItems([]);
        setRequestItems([]);
        setNotificationItems([]);
        setNewsItems([]);
        setFaqItems([]);
        return;
      }

      const [tenantRes, attendanceRes, leaveRes, wfhRes, overtimeRes, flexibleRes, notifRes, articleRes, annRes, faqRes] = await Promise.allSettled([
        supabase.from("tenants").select("id,name,logo_url,timezone,billing_mode").eq("id", emp.tenant_id).maybeSingle(),
        supabase
          .from("attendance_records")
          .select("id,date,check_in_time,check_out_time,status")
          .eq("employee_id", emp.id)
          .order("date", { ascending: false })
          .limit(31),
        supabase
          .from("leave_requests")
          .select("id,created_at,status,reason")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("wfh_requests")
          .select("id,created_at,status,reason")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("overtime_requests")
          .select("id,created_at,status,reason")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("flexible_attendance_requests")
          .select("id,created_at,status,reason")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("notifications")
          .select("id,title,message,type,is_read,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("articles")
          .select("id,title,category,created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("announcements")
          .select("id,title,created_at")
          .eq("tenant_id", emp.tenant_id)
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("faqs")
          .select("id,question,answer")
          .eq("is_active", true)
          .or(`tenant_id.is.null,tenant_id.eq.${emp.tenant_id}`)
          .order("sort_order", { ascending: true })
          .limit(20),
      ]);

      const failedScopes: string[] = [];
      const resolveQuery = <T,>(
        result: PromiseSettledResult<{ data: T | null; error: unknown }>,
        scope: string
      ): T | null => {
        if (result.status === "rejected") {
          failedScopes.push(scope);
          reportError(result.reason, "employee.dashboard.readonly.load_data.query_rejected", { scope });
          return null;
        }
        if (result.value.error) {
          failedScopes.push(scope);
          reportError(result.value.error, "employee.dashboard.readonly.load_data.query_error", { scope });
          return null;
        }
        return result.value.data ?? null;
      };

      const tenantData = resolveQuery<TenantProfile>(tenantRes, "tenant");
      const attendanceData = resolveQuery<AttendanceItem[]>(attendanceRes, "attendance");
      const leaveData = resolveQuery<Array<{ id: string; created_at: string; status?: string | null; reason?: string | null }>>(leaveRes, "leave_requests");
      const wfhData = resolveQuery<Array<{ id: string; created_at: string; status?: string | null; reason?: string | null }>>(wfhRes, "wfh_requests");
      const overtimeData = resolveQuery<Array<{ id: string; created_at: string; status?: string | null; reason?: string | null }>>(overtimeRes, "overtime_requests");
      const flexibleData = resolveQuery<Array<{ id: string; created_at: string; status?: string | null; reason?: string | null }>>(flexibleRes, "flexible_attendance_requests");
      const notifData = resolveQuery<NotificationItem[]>(notifRes, "notifications");
      const articleData = resolveQuery<Array<{ id: string; title: string; category?: string | null; created_at: string }>>(articleRes, "articles");
      const annData = resolveQuery<Array<{ id: string; title: string; created_at: string }>>(annRes, "announcements");
      const faqData = resolveQuery<Array<{ id: string; question: string; answer?: string | null }>>(faqRes, "faqs");

      setTenant(tenantData || null);
      setAttendanceItems(attendanceData || []);

      type RequestRow = { id: string; created_at: string; status?: string | null; reason?: string | null };
      const req: ReqItem[] = [];
      ((leaveData || []) as RequestRow[]).forEach((i) => req.push({ id: i.id, type: "Izin/Cuti", date: i.created_at, status: i.status || "pending", reason: i.reason }));
      ((wfhData || []) as RequestRow[]).forEach((i) => req.push({ id: i.id, type: "WFH", date: i.created_at, status: i.status || "pending", reason: i.reason }));
      ((overtimeData || []) as RequestRow[]).forEach((i) => req.push({ id: i.id, type: "Lembur", date: i.created_at, status: i.status || "pending", reason: i.reason }));
      ((flexibleData || []) as RequestRow[]).forEach((i) => req.push({ id: i.id, type: "Absen Fleksibel", date: i.created_at, status: i.status || "pending", reason: i.reason }));
      req.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRequestItems(req.slice(0, 25));

      setNotificationItems(notifData || []);

      const articleRows = (articleData || []) as Array<{ id: string; title: string; category?: string | null; created_at: string }>;
      const mappedArticles: HomeNews[] = articleRows.map((a) => ({
        id: a.id,
        title: a.title,
        created_at: a.created_at,
        source: (a.category || "").toLowerCase().trim() === "berita" ? "news" : "article",
      }));
      const annRows = (annData || []) as Array<{ id: string; title: string; created_at: string }>;
      const mappedAnn: HomeNews[] = annRows.map((a) => ({ id: a.id, title: `[Pengumuman] ${a.title}`, created_at: a.created_at, source: "news" }));
      setNewsItems([...mappedArticles, ...mappedAnn].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8));

      const fetchedFaqs = faqData || [];
      setFaqItems(fetchedFaqs.length > 0 ? fetchedFaqs : DEFAULT_HELP_FAQS);

      if (failedScopes.length > 0) {
        const partialRef = reportError(
          new Error("Readonly dashboard partial data load"),
          "employee.dashboard.readonly.load_data_partial",
          {
            scopes: failedScopes,
            employee_id: emp.id,
            tenant_id: emp.tenant_id,
          }
        );
        toast.error(appendErrorReference("Sebagian data dashboard gagal dimuat. Silakan muat ulang.", partialRef));
      }
    } catch (error) {
      const errorRef = reportError(error, "employee.dashboard.readonly.load_data");
      toast.error(appendErrorReference("Gagal memuat data dashboard.", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate("/auth", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [loadData, navigate]);

  const unreadCount = useMemo(() => notificationItems.filter((n) => !n.is_read).length, [notificationItems]);
  const pendingRequests = useMemo(() => requestItems.filter((r) => `${r.status}`.toLowerCase().includes("pending")).length, [requestItems]);
  const todayAttendance = attendanceItems[0] || null;

  useEffect(() => {
    if (isLoading || !employee?.id) return;

    if (unreadCount <= 0) {
      setShowNotificationOverlay(false);
      return;
    }

    const overlayKey = `dashboard-notif-overlay:${employee.id}`;
    try {
      const shown = sessionStorage.getItem(overlayKey) === "1";
      if (!shown) {
        setShowNotificationOverlay(true);
        sessionStorage.setItem(overlayKey, "1");
      }
    } catch {
      setShowNotificationOverlay(true);
    }
  }, [isLoading, unreadCount, employee?.id]);

  const [selectedYear, selectedMonth] = historyMonth.split("-");
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, idx) => String(currentYear - 5 + idx));
  }, []);
  const overtimeSettingsFallback: OvertimeSettingsRow = {
    id: "fallback",
    tenant_id: employee?.tenant_id || "",
    is_enabled: true,
    min_hours: 1,
    max_hours_per_day: 4,
    max_hours_per_month: 40,
    requires_approval: true,
    rate_multiplier: 1.5,
    weekend_rate_multiplier: 2,
    holiday_rate_multiplier: 2,
    allow_multi_date_request: true,
    max_dates_per_request: 10,
    auto_reject_after_days: 30,
    notes: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
  const wfhRequestsNormalized = useMemo(
    () =>
      wfhRequests.map((r) => ({
        id: r.id,
        request_date: r.request_date || new Date().toISOString().slice(0, 10),
        reason: r.reason || "",
        status: (r.status === "disetujui" || r.status === "ditolak" ? r.status : "menunggu") as "menunggu" | "disetujui" | "ditolak",
        rejection_reason: r.rejection_reason,
        created_at: r.created_at,
      })),
    [wfhRequests]
  );
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => tab.id !== "activation" || tenant?.billing_mode === "individual"),
    [tenant?.billing_mode]
  );

  const markNotificationRead = async (id: string) => {
    let previousItems: NotificationItem[] = [];
    setNotificationItems((prev) => {
      previousItems = prev;
      return prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    });

    try {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    } catch (error) {
      setNotificationItems(previousItems);
      const errorRef = reportError(error, "employee.dashboard.readonly.mark_notification_read", {
        notification_id: id,
      });
      toast.error(appendErrorReference("Gagal memperbarui status notifikasi.", errorRef));
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const fetchWfhRequests = useCallback(async () => {
    if (!employee?.id) return;
    setIsWfhLoading(true);
    try {
      const { data, error } = await supabase
        .from("wfh_requests")
        .select("*")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setWfhRequests(data || []);
    } catch (error) {
      const errorRef = reportError(error, "employee.dashboard.readonly.fetch_wfh_requests");
      toast.error(appendErrorReference("Gagal memuat pengajuan WFH.", errorRef));
    } finally {
      setIsWfhLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    if (!employee?.id) return;
    fetchWfhRequests();
  }, [employee?.id, fetchWfhRequests]);

  useEffect(() => {
    const fetchOvertimeSettings = async () => {
      if (!employee?.tenant_id) return;
      const { data } = await supabase
        .from("overtime_settings")
        .select("*")
        .eq("tenant_id", employee.tenant_id)
        .maybeSingle();
      setOvertimeSettings(data || null);
    };
    fetchOvertimeSettings();
  }, [employee?.tenant_id]);

  const handleSubmitWfh = async (dates: string[], reason: string): Promise<boolean> => {
    if (!employee?.id || dates.length === 0 || !reason.trim()) return false;
    try {
      const { data: existing } = await supabase
        .from("wfh_requests")
        .select("request_date")
        .eq("employee_id", employee.id)
        .in("request_date", dates);

      const existingDates = existing?.map((e) => e.request_date) || [];
      const newDates = dates.filter((d) => !existingDates.includes(d));
      if (newDates.length === 0) {
        toast.error("Semua tanggal sudah pernah diajukan");
        return false;
      }

      const insertData = newDates.map((date) => ({
        employee_id: employee.id,
        request_date: date,
        reason: reason.trim(),
        status: "menunggu",
      }));
      const { error } = await supabase.from("wfh_requests").insert(insertData);
      if (error) throw error;
      await fetchWfhRequests();
      toast.success(`${newDates.length} pengajuan WFH berhasil dikirim`);
      return true;
    } catch (error) {
      const errorRef = reportError(error, "employee.dashboard.readonly.submit_wfh_request");
      toast.error(appendErrorReference("Gagal mengirim pengajuan WFH.", errorRef));
      return false;
    }
  };

  const fetchHistoryByMonth = useCallback(async () => {
    if (!employee?.id || !historyMonth) return;
    setHistoryLoading(true);
    try {
      const [yearStr, monthStr] = historyMonth.split("-");
      const year = Number.parseInt(yearStr || "0", 10);
      const month = Number.parseInt(monthStr || "0", 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        setHistoryItems([]);
        return;
      }

      const startDate = `${historyMonth}-01`;
      const nextMonthDate = new Date(year, month, 1);
      const nextYear = nextMonthDate.getFullYear();
      const nextMonth = `${nextMonthDate.getMonth() + 1}`.padStart(2, "0");
      const endDateExclusive = `${nextYear}-${nextMonth}-01`;

      const { data, error } = await supabase
        .from("attendance_records")
        .select("id,date,check_in_time,check_out_time,status")
        .eq("employee_id", employee.id)
        .gte("date", startDate)
        .lt("date", endDateExclusive)
        .order("date", { ascending: false });

      if (error) throw error;
      setHistoryItems((data as AttendanceItem[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "employee.dashboard.readonly.fetch_history_by_month", {
        history_month: historyMonth,
      });
      toast.error(appendErrorReference("Gagal memuat riwayat kehadiran.", errorRef));
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [employee?.id, historyMonth]);

  useEffect(() => {
    if (activeTab !== "history") return;
    fetchHistoryByMonth();
  }, [activeTab, fetchHistoryByMonth]);

  const panelClass =
    "rounded-[28px] border border-slate-200/80 bg-white/92 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.52)] backdrop-blur";
  const compactStatCardClass =
    "group overflow-hidden rounded-[24px] border border-slate-200/85 bg-white/92 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-42px_rgba(15,23,42,0.58)]";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_-10%,#dbeafe_0%,transparent_34%),radial-gradient(circle_at_90%_0%,#bfdbfe_0%,transparent_28%),radial-gradient(circle_at_50%_120%,#e0f2fe_0%,transparent_34%),linear-gradient(180deg,#f8fbff_0%,#f1f5ff_48%,#eef4ff_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-120px] top-[-100px] h-[360px] w-[360px] rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-100px] h-[420px] w-[420px] rounded-full bg-blue-300/25 blur-3xl" />
      </div>
      <div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[36px] border border-slate-200/90 bg-white/90 p-5 shadow-[0_32px_90px_-44px_rgba(15,23,42,0.58)] backdrop-blur sm:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <div className="absolute inset-y-0 left-0 w-[260px] bg-gradient-to-r from-blue-100/55 to-transparent" />
            <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-300/25 blur-3xl" />
            <div className="absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-300/25 blur-3xl" />
          </div>

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-blue-200/80 shadow-sm">
                <AvatarImage src={tenant?.logo_url || undefined} alt={tenant?.name || "Org"} />
                <AvatarFallback>{(tenant?.name || "ORG").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Employee Workspace</p>
                <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-slate-900">{tenant?.name || "Dashboard Pegawai"}</h1>
                <p className="text-sm text-slate-600">{employee?.name || "Pengguna"} • {employee?.position || "Pegawai"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    Pending: {pendingRequests}
                  </Badge>
                  <Badge className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-50">
                    Notifikasi: {unreadCount}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-2xl border border-slate-200/90 bg-white/85 px-3 py-2 text-right shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Hari Ini</p>
                <p className="text-xs font-medium text-slate-700">{format(new Date(), "EEEE, dd MMM yyyy", { locale: localeId })}</p>
              </div>
              <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50 shadow-sm">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Mode Non-Absensi
              </Badge>
              <Button
                variant="outline"
                className="border-slate-300 bg-white/95 hover:border-blue-300 hover:bg-blue-50"
                onClick={logout}
              >
                <LogOut className="mr-2 h-4 w-4" /> Keluar
              </Button>
            </div>
          </div>

          <div className="relative mt-6 flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTab(tab.id)}
                  className={`inline-flex min-w-max items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition ${
                    active
                      ? "border-blue-900 bg-gradient-to-r from-blue-950 to-slate-900 text-white shadow-[0_16px_30px_-20px_rgba(15,23,42,0.9)]"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {tab.label}
                  {tab.id === "notifications" && unreadCount > 0 ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white animate-pulse">
                      {Math.min(unreadCount, 99)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 rounded-[28px] border border-slate-200/85 bg-white/88 p-3 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.36)] backdrop-blur">
              <p className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">Navigasi</p>
              <div className="space-y-1.5">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={`sidebar-${tab.id}`}
                      onClick={() => setTab(tab.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(37,99,235,0.58)]"
                          : "text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                      {tab.id === "notifications" && unreadCount > 0 ? (
                        <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white animate-pulse">
                          {Math.min(unreadCount, 99)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="space-y-4 pb-20">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className={compactStatCardClass}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : null}

          {!isLoading && activeTab === "home" && (
            <ReadonlyHomeTab
              todayAttendance={todayAttendance}
              pendingRequests={pendingRequests}
              unreadCount={unreadCount}
              newsItems={newsItems}
              panelClass={panelClass}
              compactStatCardClass={compactStatCardClass}
              onOpenRequests={() => setTab("requests")}
              onOpenNotifications={() => setTab("notifications")}
            />
          )}

          {!isLoading && activeTab === "history" && (
            <ReadonlyHistoryTab
              panelClass={panelClass}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              monthOptions={MONTH_OPTIONS}
              yearOptions={yearOptions}
              historyLoading={historyLoading}
              historyItems={historyItems}
              onChangeMonth={(month) => setHistoryMonth(`${selectedYear || new Date().getFullYear()}-${month}`)}
              onChangeYear={(year) => setHistoryMonth(`${year}-${selectedMonth || "01"}`)}
              onRefresh={fetchHistoryByMonth}
            />
          )}

          {!isLoading && activeTab === "requests" && (
            <ReadonlyRequestsTab
              panelClass={panelClass}
              activeRequestType={activeRequestType}
              onChangeRequestType={setActiveRequestType}
              createLeaveRequest={createLeaveRequest}
              leaveSubmitting={leaveSubmitting}
              leaveRequests={leaveRequests}
              leaveLoading={leaveLoading}
              cancelLeaveRequest={cancelLeaveRequest}
              handleSubmitWfh={handleSubmitWfh}
              wfhRequestsNormalized={wfhRequestsNormalized}
              isWfhLoading={isWfhLoading}
              employeeId={employee?.id}
              tenantId={employee?.tenant_id}
              overtimeSettings={overtimeSettings}
              overtimeSettingsFallback={overtimeSettingsFallback}
              refreshFlexible={refreshFlexible}
              onFlexibleSuccess={() => {
                setRefreshFlexible((prev) => prev + 1);
                refetchLeave();
              }}
            />
          )}

          {!isLoading && activeTab === "news" && <EmployeeNewsArticles onBack={() => setTab("home")} contentType="news" />}
          {!isLoading && activeTab === "articles" && <EmployeeNewsArticles onBack={() => setTab("home")} contentType="articles" />}
          {!isLoading && activeTab === "announcements" && <EmployeeAnnouncements tenantId={employee?.tenant_id || undefined} onBack={() => setTab("home")} />}

          {!isLoading && activeTab === "notifications" && (
            <ReadonlyNotificationsTab
              panelClass={panelClass}
              notificationItems={notificationItems}
              onMarkRead={markNotificationRead}
            />
          )}

          {!isLoading && activeTab === "help" && (
            <ReadonlyHelpTab
              panelClass={panelClass}
              faqItems={faqItems}
              expandedFaqId={expandedFaqId}
              onToggleFaq={(id) => setExpandedFaqId((prev) => (prev === id ? null : id))}
            />
          )}

          {!isLoading && activeTab === "profile" && (
            <ReadonlyProfileTab
              panelClass={panelClass}
              employee={employee}
              onForgotPassword={() => navigate("/auth/forgot-password")}
              onRefreshData={loadData}
            />
          )}

          {!isLoading && activeTab === "activation" && employee?.tenant_id && (
            <ReadonlyActivationTab panelClass={panelClass} tenantId={employee.tenant_id} />
          )}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/96 p-2 shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.35)] backdrop-blur md:hidden">
        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`relative flex min-w-[88px] flex-col items-center justify-center rounded-xl py-2 text-[11px] ${
                  active ? "bg-gradient-to-r from-blue-900 to-slate-900 text-white" : "text-slate-600 hover:bg-blue-50"
                }`}
              >
                {tab.id === "notifications" && unreadCount > 0 ? (
                  <span className="absolute right-1.5 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white animate-pulse">
                    {Math.min(unreadCount, 99)}
                  </span>
                ) : null}
                <Icon className="mb-1 h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {showNotificationOverlay && unreadCount > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-md border-red-200/70 bg-white shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <Bell className="h-5 w-5 animate-pulse" />
                Notifikasi Baru
              </CardTitle>
              <CardDescription>
                Anda memiliki <span className="font-semibold text-red-700">{unreadCount}</span> notifikasi belum dibaca.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {notificationItems
                .filter((item) => !item.is_read)
                .slice(0, 3)
                .map((item) => (
                  <div key={`overlay-${item.id}`} className="rounded-lg border border-red-100 bg-red-50/60 p-3">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-700">{item.message}</p>
                  </div>
                ))}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowNotificationOverlay(false)}>
                  Nanti
                </Button>
                <Button
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    setShowNotificationOverlay(false);
                    setTab("notifications");
                  }}
                >
                  Buka Notifikasi
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <EmployeeFloatingWhatsApp tenantId={employee?.tenant_id} />
    </div>
  );
}
