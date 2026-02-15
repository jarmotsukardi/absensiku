import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { LeaveRequestForm } from "@/components/employee/LeaveRequestForm";
import { useLeaveRequests } from "@/hooks/useLeaveRequests";
import { useSessionManagement } from "@/hooks/useSessionManagement";
import { SessionLoadingScreen } from "@/components/employee/SessionLoadingScreen";
import { toast } from "sonner";
import { formatToTimezone, formatTimeToTimezone, getCurrentTimeInTimezone } from "@/lib/timezone";
import { format, isBefore, startOfDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useDeviceBinding } from "@/hooks/useDeviceBinding";
import { useAttendance } from "@/hooks/useAttendance";
import { useAttendanceValidation } from "@/hooks/useAttendanceValidation";
import { useSecurityCheck } from "@/hooks/useSecurityCheck";
import { useWorkShifts } from "@/hooks/useWorkShifts";
import { saveScalabilityConfig, type ScalabilityTier } from "@/lib/scalabilityConfig";
import { CheckoutConfirmDialog } from "@/components/employee/CheckoutConfirmDialog";
import { DesktopBlockedMessage } from "@/components/employee/DesktopBlockedMessage";
import { DeviceRegistrationDialog } from "@/components/employee/DeviceRegistrationDialog";
import { ShiftSelectionDialog } from "@/components/employee/ShiftSelectionDialog";
import { FlexibleAttendanceDialog } from "@/components/employee/FlexibleAttendanceDialog";
import { FlexibleAttendanceRequestForm } from "@/components/employee/FlexibleAttendanceRequestForm";
import { FlexibleAttendanceRequestList } from "@/components/employee/FlexibleAttendanceRequestList";
import { OvertimeRequestForm } from "@/components/employee/OvertimeRequestForm";
import { OvertimeRequestList } from "@/components/employee/OvertimeRequestList";
import { HolidayCalendarDialog } from "@/components/employee/HolidayCalendarDialog";
import { MutationSection } from "@/components/employee/MutationSection";
import { EmployeeNotifications } from "@/pages/employee/EmployeeNotifications";
import { JoinOrganizationCard } from "@/components/employee/JoinOrganizationCard";
import { OrganizationSelector } from "@/components/employee/OrganizationSelector";
import { EmployeeSidebar } from "@/components/employee/EmployeeSidebar";
import { SmartAppBanner } from "@/components/common/SmartAppBanner";
import { EmployeeFloatingWhatsApp } from "@/components/employee/EmployeeFloatingWhatsApp";
import EmployeeNewsArticles from "@/pages/employee/EmployeeNewsArticles";
import EmployeeAnnouncements from "@/pages/employee/EmployeeAnnouncements";
import DOMPurify from "dompurify";

// Lazy load DeviceResetDialog di level modul untuk mencegah flicker
const LazyDeviceResetDialog = React.lazy(() => 
  import("@/components/employee/DeviceResetDialog").then(m => ({ default: m.DeviceResetDialog }))
);
const EmployeeActivationPageLazy = React.lazy(() => import("@/components/employee/EmployeeActivationPage").then(m => ({ default: m.EmployeeActivationPage })));
import { BillingActivationOverlay } from "@/components/employee/BillingActivationOverlay";
import {
  MapPin,
  LogIn,
  LogOut,
  Clock,
  Calendar,
  Bell,
  Home,
  History,
  FileText,
  HelpCircle,
  User as UserIcon,
  ChevronRight,
  Navigation,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Timer,
  CalendarDays,
  X,
  Smartphone,
  AlertTriangle,
  AlertCircle,
  MapPinOff,
  Menu,
} from "lucide-react";

interface EmployeeData {
  id: string;
  name: string;
  email: string;
  position?: string;
  nik: string;
  nip?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  gender?: string;
  golongan?: string;
  employee_category?: string;
  tenant_id?: string;
  office_id?: string;
  user_id?: string;
  android_id?: string;
  last_login_device_id?: string | null;
  last_login_at?: string | null;
  work_unit_id?: string;
  allow_flexible_attendance?: boolean;
  flexible_attendance_limit?: number | null;
  opd?: { name: string; code: string };
  work_unit?: { name: string; id: string; enable_auto_shift?: boolean };
  offices?: { id: string; name: string; latitude?: number; longitude?: number; radius_meters?: number };
}

interface TenantInfo {
  name: string;
  logo_url?: string;
  organization_type?: string;
  timezone: string;
  billing_mode?: string | null;
  whatsapp?: string | null;
  pic_whatsapp?: string | null;
  pic_name?: string | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  status: string;
  notes?: string | null;
  is_wfh?: boolean | null;
  is_flexible_attendance?: boolean | null;
  flexible_attendance_reason?: string | null;
}

interface NewsItem {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

type LeaveRequestRow = Tables<"leave_requests">;
type WfhRequestRow = Tables<"wfh_requests">;
type OvertimeSettingsRow = Tables<"overtime_settings">;
type FaqRow = Tables<"faqs">;

interface WorkHourRow {
  day_of_week: number;
  time_in: string;
  time_out: string;
}

type EmployeeTab = "home" | "history" | "requests" | "help" | "profile" | "news" | "articles" | "announcements" | "notifications" | "activation";

// Pending state type untuk optimistic UI
type PendingStatus = 'idle' | 'pending' | 'buffered' | 'jitter' | 'processing' | 'success' | 'error' | 'circuit_open';
interface PendingState {
  status: PendingStatus;
  type: 'check_in' | 'check_out' | null;
  message: string;
}

// Helper: Calculate distance between two coordinates
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper: Ambil tanggal hari ini berdasarkan timezone tenant (YYYY-MM-DD)
// Catatan: date kolom di DB dipakai sebagai "tanggal lokal" (bukan UTC), sehingga wajib konsisten.
const getTodayDateString = (timezone: string): string => {
  try {
    return format(getCurrentTimeInTimezone(timezone || "Asia/Jakarta"), "yyyy-MM-dd");
  } catch {
    return format(getCurrentTimeInTimezone("Asia/Jakarta"), "yyyy-MM-dd");
  }
};

interface EmployeeDashboardNewProps {
  readOnlyMode?: boolean;
}

export default function EmployeeDashboardNew({ readOnlyMode = false }: EmployeeDashboardNewProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Session management dengan sliding expiration 7 hari
  const sessionManagement = useSessionManagement();
  
  // State untuk loading screen transisi pada dashboard
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  // Gunakan useRef untuk todayAttendance agar tidak menyebabkan flicker
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const todayAttendanceRef = React.useRef<AttendanceRecord | null>(null);
  const hasFetchedRef = React.useRef(false); // Mencegah double fetch
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; timestamp: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true); // State loading terpisah untuk news
  const newsRef = React.useRef<NewsItem[]>([]); // Ref untuk mencegah flicker saat data sama
  const [activeTab, setActiveTab] = useState<EmployeeTab>("home");
  const [billingMode, setBillingMode] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [workDayError, setWorkDayError] = useState<string | null>(null);
  const [todayWorkSchedule, setTodayWorkSchedule] = useState<{ time_in: string; time_out: string } | null>(null);
  
  // Dialog states
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [showDeviceRegistration, setShowDeviceRegistration] = useState(false);
  const [showShiftSelection, setShowShiftSelection] = useState(false);
  const [showFlexibleAttendance, setShowFlexibleAttendance] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  // Map overlay state
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  const [mapOverlayCoords, setMapOverlayCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Selected shift untuk auto-shift
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [pendingFlexibleReason, setPendingFlexibleReason] = useState<string | null>(null);
  const [pendingAttendanceMeta, setPendingAttendanceMeta] = useState<{
    shiftId: string | null;
    flexibleReason: string | null;
  } | null>(null);
  
  // State untuk optimistic UI
  const [pendingState, setPendingState] = useState<PendingState>({
    status: 'idle',
    type: null,
    message: ''
  });

  // State untuk user tanpa employee record (registrasi mandiri) dan multi-organisasi
  const [hasNoEmployee, setHasNoEmployee] = useState(false);
  const [multipleEmployees, setMultipleEmployees] = useState<EmployeeData[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const dashboardBasePath = readOnlyMode ? "/dashboard" : "/employee/dashboard";

  const navigateToTab = useCallback((tab: EmployeeTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    if (tab === "home") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const nextSearch = params.toString();
    navigate(
      {
        pathname: dashboardBasePath,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true }
    );
  }, [dashboardBasePath, location.search, navigate]);

  // Leave request hook
  const { createLeaveRequest, isSubmitting: isSubmittingLeave } = useLeaveRequests(employee?.id || null);

  // Handler for leave request from form
  const handleLeaveRequest = async (data: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
  }) => {
    return await createLeaveRequest(data);
  };

  // Security check hook
  const securityCheck = useSecurityCheck(employee?.tenant_id);

  // Device binding hook
  const deviceBinding = useDeviceBinding(employee?.id || null);
  
  // Work shifts hook untuk auto-shift
  const workShifts = useWorkShifts(employee?.tenant_id, employee?.work_unit_id);
  
  // Attendance validation hook
  const attendanceValidation = useAttendanceValidation(
    employee?.tenant_id || null,
    employee?.id || null,
    tenantInfo?.organization_type === "pemerintah_daerah" || tenantInfo?.organization_type === "instansi_pemerintah" 
      ? "pemerintahan" 
      : tenantInfo?.organization_type || "pemerintahan"
  );

  const {
    todayAttendance: offlineTodayAttendance,
    isSubmitting: offlineSubmitting,
    pendingState: offlinePendingState,
    checkIn: saveCheckInOffline,
    checkOut: saveCheckOutOffline,
    syncStats: offlineSyncStats,
  } = useAttendance(employee?.id || null, employee?.office_id || null);

  // Handler ketika loading screen selesai
  const handleLoadingComplete = useCallback(() => {
    setSessionCheckComplete(true);
  }, []);

  // Effect untuk cek sesi dan redirect jika tidak valid
  useEffect(() => {
    // Tunggu sampai loading screen selesai DAN session check selesai
    if (sessionCheckComplete && !sessionManagement.isChecking) {
      if (sessionManagement.isValid && sessionManagement.session) {
        // Sesi valid, set user dan session lalu tampilkan dashboard
        setUser(sessionManagement.user);
        setSession(sessionManagement.session);
        setShowLoadingScreen(false);
      } else {
        // Sesi tidak valid, redirect ke login
        navigate("/employee/login", { replace: true });
      }
    }
  }, [sessionCheckComplete, sessionManagement.isChecking, sessionManagement.isValid, sessionManagement.session, sessionManagement.user, navigate]);

  // Listen untuk auth state changes - HANYA untuk SIGNED_OUT
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/employee/login", { replace: true });
      }
      // TIDAK update user/session di sini untuk mencegah flicker
      // User sudah diset dari sessionManagement
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch data - HANYA sekali saat user tersedia
  useEffect(() => {
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
      fetchUnreadNotificationCount();
    }
    // fetchData intentionally not in deps to keep one-time initial fetch behavior tied to user readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch unread notification count
  const fetchUnreadNotificationCount = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", currentUser.id)
        .eq("is_read", false);
      
      setUnreadNotificationCount(count || 0);
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
    }
  };

  // Subscribe to realtime notification changes
  useEffect(() => {
    if (!user) return;
    
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchUnreadNotificationCount();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // UX: saat pindah tab (Beranda/Riwayat/Pengajuan/Bantuan/Profil), reset scroll ke atas
  // Ini mencegah kesan "tab kosong" ketika user sebelumnya scroll jauh ke bawah.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  // Sinkronkan tab dari query param, contoh: /employee/dashboard?tab=activation
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    const allowedTabs = new Set<EmployeeTab>([
      "home",
      "history",
      "requests",
      "help",
      "profile",
      "news",
      "articles",
      "announcements",
      "notifications",
      "activation",
    ]);

    if (tab && allowedTabs.has(tab as EmployeeTab)) {
      setActiveTab(tab as EmployeeTab);
      return;
    }
    setActiveTab("home");
  }, [location.search]);

  // Sinkronisasi state absensi dari offline-first hook ke UI dashboard ini
  useEffect(() => {
    if (!offlineTodayAttendance) return;

    const mappedRecord: AttendanceRecord = {
      id: String(offlineTodayAttendance.id),
      date: offlineTodayAttendance.date,
      check_in_time: offlineTodayAttendance.check_in_time,
      check_out_time: offlineTodayAttendance.check_out_time,
      check_in_latitude: offlineTodayAttendance.check_in_latitude,
      check_in_longitude: offlineTodayAttendance.check_in_longitude,
      status: offlineTodayAttendance.status || "hadir",
      notes: offlineTodayAttendance.notes,
      is_wfh: offlineTodayAttendance.is_wfh,
      is_flexible_attendance: offlineTodayAttendance.is_flexible_attendance,
      flexible_attendance_reason: offlineTodayAttendance.flexible_attendance_reason,
    };

    const currentAtt = todayAttendanceRef.current;
    const isChanged =
      !currentAtt ||
      currentAtt.id !== mappedRecord.id ||
      currentAtt.check_in_time !== mappedRecord.check_in_time ||
      currentAtt.check_out_time !== mappedRecord.check_out_time ||
      currentAtt.status !== mappedRecord.status;

    if (isChanged) {
      todayAttendanceRef.current = mappedRecord;
      setTodayAttendance(mappedRecord);
    }
  }, [offlineTodayAttendance]);

  useEffect(() => {
    setIsSubmitting(offlineSubmitting);
  }, [offlineSubmitting]);

  useEffect(() => {
    setPendingState((prev) => {
      const next: PendingState = {
        status: offlinePendingState.status as PendingStatus,
        type: offlinePendingState.type,
        message: offlinePendingState.message,
      };
      if (
        prev.status === next.status &&
        prev.type === next.type &&
        prev.message === next.message
      ) {
        return prev;
      }
      return next;
    });
  }, [offlinePendingState.status, offlinePendingState.type, offlinePendingState.message]);

  // Setelah background sync selesai, refresh data server agar UI konsisten.
  useEffect(() => {
    if (!offlineSyncStats.lastSyncAt || offlineSyncStats.syncedCount <= 0) return;
    fetchData();
    // fetchData intentionally omitted to avoid cascade refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineSyncStats.lastSyncAt, offlineSyncStats.syncedCount]);

  // Terapkan metadata absensi (shift/flexible) setelah record berhasil sinkron ke server.
  useEffect(() => {
    if (!pendingAttendanceMeta) return;
    if (!todayAttendance?.id || !todayAttendance?.date) return;
    if (
      todayAttendance.id.startsWith("pending-") ||
      todayAttendance.id.startsWith("idb-") ||
      todayAttendance.id.startsWith("buffer-")
    ) {
      return;
    }

    const applyMetadata = async () => {
      const updates: Record<string, unknown> = {};
      if (pendingAttendanceMeta.shiftId) {
        updates.shift_id = pendingAttendanceMeta.shiftId;
      }
      if (pendingAttendanceMeta.flexibleReason) {
        updates.is_flexible_attendance = true;
        updates.flexible_attendance_reason = pendingAttendanceMeta.flexibleReason;
      }

      if (Object.keys(updates).length === 0) {
        setPendingAttendanceMeta(null);
        return;
      }

      const { error } = await supabase
        .from("attendance_records_partitioned")
        .update(updates)
        .eq("id", todayAttendance.id)
        .eq("date", todayAttendance.date);

      if (error) {
        console.error("Error applying attendance metadata:", error);
        return;
      }

      setPendingAttendanceMeta(null);
      fetchData();
    };

    applyMetadata();
    // fetchData intentionally omitted to avoid recursive refresh while metadata pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAttendanceMeta, todayAttendance?.id, todayAttendance?.date]);

  // Get current device ID menggunakan utility tunggal
  const getCurrentDeviceId = (): string => {
    const storedId = localStorage.getItem("web_device_id");
    if (storedId) return storedId;
    
    // Generate ID stabil (tanpa canvas)
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const deviceId = `WEB-${Math.abs(hash).toString(16).toUpperCase().padStart(16, "0")}`;
    localStorage.setItem("web_device_id", deviceId);
    
    return deviceId;
  };

  // Fungsi untuk cek apakah hari ini libur
  const checkTodayHoliday = async (tenantId: string, organizationType?: string | null) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const day = today.getDate().toString().padStart(2, "0");
      const dateStr = today.toISOString().split("T")[0];

      // Cek libur nasional
      const { data: nationalHoliday } = await supabase
        .from("national_holidays")
        .select("name")
        .eq("date", dateStr)
        .eq("is_active", true)
        .maybeSingle();

      if (nationalHoliday) {
        setWorkDayError(`Hari ini adalah libur nasional: ${nationalHoliday.name}`);
        return;
      }

      // Cek work_holidays untuk tenant ini
      const institutionType = organizationType === "pemerintah_daerah" || organizationType === "instansi_pemerintah" 
        ? "pemerintahan" 
        : organizationType || null;

      let workHolidayQuery = supabase
        .from("work_holidays")
        .select("dates, description")
        .eq("tenant_id", tenantId)
        .eq("year", year)
        .eq("month", month);

      if (institutionType) {
        workHolidayQuery = workHolidayQuery.or(`institution_type.eq.${institutionType},institution_type.is.null`);
      }

      const { data: workHolidays } = await workHolidayQuery;

      if (workHolidays && workHolidays.length > 0) {
        for (const holiday of workHolidays) {
          // Parse dates - bisa berupa JSON array atau comma-separated
          let dates: string[] = [];
          try {
            const parsed = JSON.parse(holiday.dates);
            dates = Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            dates = holiday.dates.split(",").map((d: string) => d.trim());
          }
          
          const paddedDates = dates.map((d: string) => d.padStart(2, "0"));
          if (paddedDates.includes(day)) {
            setWorkDayError(`Hari ini adalah hari libur: ${holiday.description || "Hari Libur Kerja"}`);
            return;
          }
        }
      }

      // Cek holidays table (legacy)
      const { data: legacyHoliday } = await supabase
        .from("holidays")
        .select("name")
        .eq("date", dateStr)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .maybeSingle();

      if (legacyHoliday) {
        setWorkDayError(`Hari ini adalah hari libur: ${legacyHoliday.name}`);
        return;
      }

      // Bukan hari libur
      setWorkDayError(null);
    } catch (error) {
      console.error("Error checking holiday:", error);
      setWorkDayError(null);
    }
  };

  const fetchData = async () => {
    try {
      // Fetch ALL employee records for this user (multi-organisasi support)
      const { data: allEmpData, error: empError } = await supabase
        .from("employees")
        .select("*, opd(*), work_unit:work_unit_id(*), offices:office_id(*), tenants:tenant_id(name, logo_url)")
        .eq("user_id", user?.id)
        .eq("is_active", true);

      if (empError) throw empError;

      // Jika tidak ada employee record sama sekali
      if (!allEmpData || allEmpData.length === 0) {
        setHasNoEmployee(true);
        setIsLoading(false);
        return;
      }

      setHasNoEmployee(false);
      setMultipleEmployees(allEmpData);

      // Pilih employee berdasarkan selectedEmployeeId atau default ke yang pertama
      let empData = allEmpData[0];
      if (selectedEmployeeId) {
        const found = allEmpData.find((e: EmployeeData) => e.id === selectedEmployeeId);
        if (found) empData = found;
      }
      
      if (!selectedEmployeeId && empData) {
        setSelectedEmployeeId(empData.id);
      }

      setEmployee(empData as EmployeeData);

      // Check attendance eligibility (no DB call needed)
      if (!empData.user_id) {
        setAttendanceError("Akun Anda belum teraktivasi. Hubungi admin untuk aktivasi akun.");
      } else if (!empData.office_id) {
        setAttendanceError("Lokasi kerja belum ditetapkan. Hubungi admin untuk pengaturan lokasi.");
      } else {
        setAttendanceError(null);
      }

      // ============================================================
      // OPTIMISASI: Jalankan semua query independen secara PARALEL
      // Sebelumnya sequential (6 query berurutan), sekarang paralel.
      // Mengurangi waktu loading dari ~6x latency menjadi ~1x latency.
      // ============================================================
      const tenantId = empData.tenant_id;
      const todayDayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay();

      // Semua promise independen dijalankan bersamaan
      const [tenantResult, deviceUpdateResult, scalabilityResult] = await Promise.all([
        // 1. Fetch tenant info
        supabase
          .from("tenants")
          .select("name, logo_url, organization_type, timezone, billing_mode, whatsapp, pic_whatsapp, pic_name")
          .eq("id", tenantId)
          .maybeSingle(),

        // 2. Update device ID (fire-and-forget style, tapi masih await untuk error handling)
        (() => {
          const currentDeviceId = getCurrentDeviceId();
            if (empData.last_login_device_id && 
                empData.last_login_device_id !== currentDeviceId) {
            return supabase
              .from("employees")
              .update({
                last_login_device_id: currentDeviceId,
                last_login_at: new Date().toISOString(),
              })
              .eq("id", empData.id);
          }
          return Promise.resolve(null);
        })(),

        // 3. Fetch profil skalabilitas global (dari admin settings)
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "attendance_scalability")
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              console.warn("[Scalability] Global profile unavailable, fallback to local:", error.message);
              return { data: null };
            }
            return { data };
          })
          .catch(() => ({ data: null })),
      ]);

      const tenantData = tenantResult.data;
      if (tenantData) {
        setTenantInfo(tenantData);
        setTimezone(tenantData.timezone || "Asia/Jakarta");
        setBillingMode(tenantData.billing_mode || "centralized");
      }

      const scalabilityValue = scalabilityResult?.data?.value as { tier?: string } | null;
      const tier = scalabilityValue?.tier;
      if (tier && ["small", "medium", "large", "enterprise"].includes(tier)) {
        saveScalabilityConfig(tier as ScalabilityTier);
      }

      // Sekarang kita punya timezone & organization_type, jalankan batch kedua secara paralel
      const tz = tenantData?.timezone || timezone || "Asia/Jakarta";
      const today = getTodayDateString(tz);
      const institutionType = tenantData?.organization_type === "pemerintah_daerah" || tenantData?.organization_type === "instansi_pemerintah" 
        ? "pemerintahan" : tenantData?.organization_type || null;

      const [attResult, workHourResult] = await Promise.all([
        // 3. Fetch absensi hari ini
        supabase
          .from("attendance_records_partitioned")
          .select("*")
          .eq("employee_id", empData.id)
          .eq("date", today)
          .maybeSingle(),

        // 4. Fetch jadwal kerja hari ini
        supabase
          .from("work_hours")
          .select("time_in, time_out")
          .eq("tenant_id", tenantId)
          .eq("day_of_week", todayDayOfWeek)
          .eq("is_active", true)
          .or(institutionType ? `institution_type.eq.${institutionType},institution_type.is.null` : "institution_type.is.null")
          .order("institution_type", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Process attendance result (anti-flicker)
      const attData = attResult.data;
      const currentAtt = todayAttendanceRef.current;
      const isDataDifferent = 
        (!currentAtt && attData) ||
        (currentAtt && !attData) ||
        (currentAtt?.check_in_time !== attData?.check_in_time) ||
        (currentAtt?.check_out_time !== attData?.check_out_time);
      
      if (isDataDifferent) {
        todayAttendanceRef.current = attData;
        setTodayAttendance(attData);
      }

      // Process work hours
      if (workHourResult.data) {
        setTodayWorkSchedule({ time_in: workHourResult.data.time_in, time_out: workHourResult.data.time_out });
      }

      // 5. Cek hari libur (berisi beberapa sub-query, tapi non-blocking untuk UI)
      checkTodayHoliday(tenantId, tenantData?.organization_type);

      // 6. Fetch news secara non-blocking (tidak menghalangi loading utama)
      (async () => {
        try {
          let newsData: NewsItem[] = [];
          
          if (tenantId) {
            const { data, error } = await supabase
              .from("news")
              .select("id, title, content, image_url, created_at")
              .or(`tenant_id.eq.${tenantId},is_global.eq.true`)
              .eq("is_published", true)
              .order("created_at", { ascending: false })
              .limit(5);

            if (!error) newsData = data || [];
          } else {
            const { data } = await supabase
              .from("news")
              .select("id, title, content, image_url, created_at")
              .eq("is_global", true)
              .eq("is_published", true)
              .order("created_at", { ascending: false })
              .limit(5);
            
            newsData = data || [];
          }
          
          const currentIds = newsRef.current.map(n => n.id).join(',');
          const newIds = newsData.map(n => n.id).join(',');
          
          if (currentIds !== newIds || newsRef.current.length === 0) {
            newsRef.current = newsData;
            setNews(newsData);
          }
        } finally {
          setNewsLoading(false);
        }
      })();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation tidak didukung"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
  };

  const validateLocationSecurityOrNotify = useCallback((position: GeolocationPosition): boolean => {
    const validation = securityCheck.validateLocationSecurity(position);
    if (validation.allowed) return true;

    setAttendanceError(validation.reason || "Pemeriksaan keamanan lokasi gagal.");
    toast.error("Tidak Bisa Absen", {
      description: validation.reason || "Perangkat/lokasi tidak memenuhi kebijakan keamanan.",
    });
    return false;
  }, [securityCheck]);

  const handleCheckIn = async () => {
    if (!employee) return;
    
    // 1. Validasi hari kerja dan libur
    const validation = await attendanceValidation.validateToday();
    if (!validation.canAttend) {
      toast.error("Tidak Dapat Absen", {
        description: validation.reason || "Hari ini bukan hari kerja",
      });
      setWorkDayError(validation.reason);
      return;
    }

    // 2. Validasi device binding - cek apakah device tidak valid (bukan first time)
    if (deviceBinding.isEnabled && !deviceBinding.isDeviceValid && !deviceBinding.isFirstTime) {
      toast.error("Tidak Bisa Absen", {
        description: `ID Perangkat anda yang terdaftar terdeteksi berbeda dengan ID perangkat yang sekarang. 
                      \nTerdaftar: ${deviceBinding.employeeAndroidId?.substring(0, 16) || '-'}...
                      \nSekarang: ${deviceBinding.currentAndroidId?.substring(0, 16) || '-'}...`,
      });
      return;
    }

    // 3. Jika pertama kali, tampilkan dialog konfirmasi registrasi perangkat
    if (deviceBinding.isEnabled && deviceBinding.isFirstTime) {
      setShowDeviceRegistration(true);
      return;
    }

    // 4. Cek apakah pegawai memiliki flexible attendance dan di luar radius
    if (employee.allow_flexible_attendance) {
      // Dapatkan lokasi terlebih dahulu untuk validasi radius
      try {
        const position = await getCurrentPosition();
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const office = employee.offices;
        
        if (office?.latitude && office?.longitude) {
          const distance = calculateDistance(lat, lng, office.latitude, office.longitude);
          const radiusLimit = office.radius_meters || 100;
          
          // Jika di luar radius, tampilkan dialog flexible attendance
          if (distance > radiusLimit) {
            if (!validateLocationSecurityOrNotify(position)) return;
            setCurrentLocation({ lat, lng, timestamp: position.timestamp });
            setShowFlexibleAttendance(true);
            return;
          }
        }
        
        if (!validateLocationSecurityOrNotify(position)) return;
        setCurrentLocation({ lat, lng, timestamp: position.timestamp });
      } catch (error: unknown) {
        toast.error("Gagal Mendapatkan Lokasi", {
          description: error instanceof Error ? error.message : "Aktifkan GPS dan coba lagi",
        });
        return;
      }
    }
    
    // 5. Cek auto-shift jika diaktifkan untuk satuan kerja
    if (workShifts.isAutoShiftEnabled && !selectedShiftId) {
      const shiftCheck = workShifts.needsShiftConfirmation();
      if (shiftCheck.needed && shiftCheck.availableShifts.length > 0) {
        setShowShiftSelection(true);
        return;
      }
    }
    
    // Lanjutkan proses check-in normal
    await proceedWithCheckInNormal(selectedShiftId, pendingFlexibleReason);
  };

  // Handler untuk konfirmasi shift selection
  const handleShiftSelection = (shiftId: string, _isMissedShift: boolean) => {
    setSelectedShiftId(shiftId);
    setShowShiftSelection(false);
    
    // Lanjutkan check-in dengan shift yang dipilih
    proceedWithCheckInNormal(shiftId, pendingFlexibleReason);
  };

  // Handler untuk konfirmasi flexible attendance
  const handleFlexibleAttendanceConfirm = async (reason: string) => {
    setPendingFlexibleReason(reason);
    setShowFlexibleAttendance(false);
    
    // Lanjutkan check-in dengan flexible attendance
    await proceedWithFlexibleCheckIn(reason);
  };

  // Proses check-in normal (dalam radius kantor)
  const proceedWithCheckInNormal = async (_shiftId: string | null, flexibleReason: string | null) => {
    if (!employee) return;

    try {
      let lat: number, lng: number;
      
      if (currentLocation && !securityCheck.settings?.require_realtime_location) {
        lat = currentLocation.lat;
        lng = currentLocation.lng;
      } else {
        const position = await getCurrentPosition();
        if (!validateLocationSecurityOrNotify(position)) return;
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        setCurrentLocation({ lat, lng, timestamp: position.timestamp });
      }

      const office = employee.offices;
      if (!office) {
        toast.error("Gagal Absen Masuk", {
          description: "Lokasi kantor belum tersedia untuk akun ini.",
        });
        return;
      }

      // Flexible attendance tetap diizinkan dengan bypass radius lokal.
      const officeForCheckIn = flexibleReason
        ? { ...office, radius_meters: Math.max(office.radius_meters || 100, 9999999) }
        : office;

      const result = await saveCheckInOffline(lat, lng, officeForCheckIn);
      if (!result.success) {
        toast.error("Gagal Absen Masuk", {
          description: result.message || "Terjadi kesalahan",
        });
        return;
      }

      setWorkDayError(null);
      setSelectedShiftId(null);
      setPendingFlexibleReason(null);
      if (_shiftId || flexibleReason) {
        setPendingAttendanceMeta({
          shiftId: _shiftId,
          flexibleReason,
        });
      } else {
        setPendingAttendanceMeta(null);
      }

      let statusText = "";
      if (flexibleReason) {
        statusText = ` (${flexibleReason})`;
      }

      toast.success(`Absen Masuk Tersimpan${statusText}`, {
        description: result.message || `Lokasi: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    } catch (error: unknown) {
      console.error("Check-in error:", error);
      toast.error("Gagal Absen Masuk", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    }
  };

  // Proses check-in dengan flexible attendance (di luar radius kantor)
  const proceedWithFlexibleCheckIn = async (reason: string) => {
    await proceedWithCheckInNormal(selectedShiftId, reason);
  };

  const handleCheckOut = async () => {
    if (!employee || !todayAttendance) return;
    
    // Skip jika id masih pending
    if (todayAttendance.id.startsWith('pending-')) {
      toast.error("Tunggu sebentar", {
        description: "Absen masuk masih diproses",
      });
      return;
    }

    const office = employee.offices;

    try {
      if (!office) {
        toast.error("Gagal Absen Pulang", {
          description: "Lokasi kantor belum tersedia untuk akun ini.",
        });
        return;
      }

      const position = await getCurrentPosition();
      if (!validateLocationSecurityOrNotify(position)) return;
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCurrentLocation({ lat, lng, timestamp: position.timestamp });

      const result = await saveCheckOutOffline(lat, lng, office);
      if (!result.success) {
        toast.error("Gagal Absen Pulang", {
          description: result.message || "Terjadi kesalahan",
        });
        return;
      }

      toast.success("Absen Pulang Tersimpan", {
        description: result.message || `Lokasi: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    } catch (error: unknown) {
      console.error("Check-out error:", error);

      toast.error("Gagal Absen Pulang", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    }
  };

  const openInMaps = () => {
    let lat: number | undefined;
    let lng: number | undefined;

    if (todayAttendance?.check_in_latitude && todayAttendance?.check_in_longitude) {
      lat = todayAttendance.check_in_latitude;
      lng = todayAttendance.check_in_longitude;
    } else if (currentLocation) {
      lat = currentLocation.lat;
      lng = currentLocation.lng;
    }

    if (lat && lng) {
      // Buat overlay modal dengan iframe Google Maps daripada link intent
      setMapOverlayCoords({ lat, lng });
      setShowMapOverlay(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/employee/login");
  };

  const currentTime = getCurrentTimeInTimezone(timezone);
  const formattedDate = formatToTimezone(new Date(), timezone, "EEEE, dd MMMM yyyy");
  const formattedTime = formatTimeToTimezone(new Date(), timezone);

  // Tampilkan loading screen selama verifikasi sesi (3 detik)
  if (showLoadingScreen) {
    return (
      <SessionLoadingScreen 
        onComplete={handleLoadingComplete} 
        duration={3000}
        message="Memverifikasi sesi..."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <MapPin className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  // User terdaftar mandiri tapi belum bergabung ke organisasi
  if (hasNoEmployee) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto pt-8 space-y-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Selamat Datang!</h1>
            <p className="text-muted-foreground mt-2">Akun Anda berhasil dibuat</p>
          </div>
          
          <JoinOrganizationCard onSuccess={() => {
            hasFetchedRef.current = false;
            fetchData();
          }} />
          
          <div className="text-center">
            <Button variant="ghost" onClick={async () => {
              await supabase.auth.signOut();
              navigate("/employee/login");
            }}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Ikuti pengaturan keamanan dari /admin/attendance-security.
  // readOnlyMode (/dashboard) tetap tidak memblokir akses.
  const isSecurityBlocked = !readOnlyMode && securityCheck.securityResult.isBlocked;

  if (isSecurityBlocked) {
    return (
      <DesktopBlockedMessage 
        organizationName={tenantInfo?.name}
        apkUrl={null}
      />
    );
  }

  // Handler untuk ganti organisasi (multi-organisasi)
  const handleOrganizationSelect = (employeeId: string, tenantId: string) => {
    setSelectedEmployeeId(employeeId);
    hasFetchedRef.current = false;
    fetchData();
  };

  // Handler untuk open checkout dialog
  const openCheckoutConfirm = () => {
    setShowCheckoutConfirm(true);
  };

  // Handler untuk confirm checkout
  const confirmCheckout = async () => {
    setShowCheckoutConfirm(false);
    await handleCheckOut();
  };

  // Handler untuk registrasi device lalu lanjut check-in
  const handleDeviceRegistration = async (): Promise<boolean> => {
    const success = await deviceBinding.registerDevice();
    if (success) {
      setShowDeviceRegistration(false);
      toast.success("Perangkat berhasil didaftarkan!");
      // Lanjutkan proses check-in
      await proceedWithCheckIn();
    }
    return success;
  };

  // Fungsi internal untuk melanjutkan check-in setelah device terdaftar
  const proceedWithCheckIn = async () => {
    await proceedWithCheckInNormal(selectedShiftId, pendingFlexibleReason);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Employee Sidebar */}
      <EmployeeSidebar
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        activeTab={activeTab}
        unreadNotificationCount={unreadNotificationCount}
        onNavigateTab={(tab) => {
          navigateToTab(tab as EmployeeTab);
        }}
        tenantLogoUrl={tenantInfo?.logo_url || null}
        tenantId={employee?.tenant_id || null}
        tenantWhatsapp={tenantInfo?.whatsapp || null}
        tenantName={tenantInfo?.name}
        billingMode={billingMode}
        picWhatsapp={tenantInfo?.pic_whatsapp || null}
        picName={tenantInfo?.pic_name || null}
      />

      {/* Billing Activation Overlay - blocks access if individual billing and unpaid */}
      {employee?.tenant_id && billingMode === "individual" && (
        <BillingActivationOverlay
          tenantId={employee.tenant_id}
          employeeId={employee.id}
          billingMode={billingMode}
        />
      )}

      {/* Smart App Banner */}
      <SmartAppBanner appName={tenantInfo?.name || "AbsensiKu"} />
      <EmployeeFloatingWhatsApp tenantId={employee?.tenant_id} />
      {!readOnlyMode && (
        <>
          {/* Checkout Confirm Dialog */}
          <CheckoutConfirmDialog
            isOpen={showCheckoutConfirm}
            onClose={() => setShowCheckoutConfirm(false)}
            onConfirm={confirmCheckout}
            isLoading={isSubmitting && pendingState.type === 'check_out'}
          />

          {/* Device Registration Dialog */}
          <DeviceRegistrationDialog
            isOpen={showDeviceRegistration}
            onClose={() => setShowDeviceRegistration(false)}
            onConfirm={handleDeviceRegistration}
            currentDeviceId={deviceBinding.currentAndroidId || ""}
          />

          {/* Shift Selection Dialog */}
          <ShiftSelectionDialog
            isOpen={showShiftSelection}
            onClose={() => setShowShiftSelection(false)}
            onSelectShift={handleShiftSelection}
            missedShift={workShifts.needsShiftConfirmation().missedShift}
            availableShifts={workShifts.needsShiftConfirmation().availableShifts}
            isLoading={isSubmitting}
          />

          {/* Flexible Attendance Dialog */}
          <FlexibleAttendanceDialog
            isOpen={showFlexibleAttendance}
            onClose={() => setShowFlexibleAttendance(false)}
            onConfirm={handleFlexibleAttendanceConfirm}
            isLoading={isSubmitting}
          />
        </>
      )}

      {/* Google Maps Overlay */}
      {showMapOverlay && mapOverlayCoords && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold">Lokasi Absensi</h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {mapOverlayCoords.lat.toFixed(6)}, {mapOverlayCoords.lng.toFixed(6)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMapOverlay(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="aspect-video bg-muted">
              <iframe
                title="Google Maps"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.google.com/maps?q=${mapOverlayCoords.lat},${mapOverlayCoords.lng}&z=17&output=embed`}
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="hero-gradient text-primary-foreground p-4 pt-8 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        </div>
        
        <div className="relative z-10">
          {/* Organization Logo & Name */}
          {tenantInfo && (
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-primary-foreground/20">
              {tenantInfo.logo_url ? (
                <img 
                  src={tenantInfo.logo_url} 
                  alt={tenantInfo.name} 
                  className="w-10 h-10 rounded-lg object-contain bg-white/90 p-1"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{tenantInfo.name}</p>
                <p className="text-xs text-primary-foreground/70">
                  {tenantInfo.organization_type === "pemerintah_daerah" && "Pemerintah Daerah"}
                  {tenantInfo.organization_type === "instansi_pemerintah" && "Instansi Pemerintah"}
                  {tenantInfo.organization_type === "perusahaan" && "Perusahaan"}
                  {tenantInfo.organization_type === "sekolah" && "Sekolah"}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground -ml-2"
                onClick={() => setShowSidebar(true)}
              >
                <Menu className="w-6 h-6" />
              </Button>
              <div>
                <p className="text-sm text-primary-foreground/70">Selamat Datang,</p>
                <h1 className="text-xl font-bold">{employee?.name || "Pegawai"}</h1>
                <p className="text-sm text-primary-foreground/70">{employee?.position || employee?.opd?.name}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={`text-primary-foreground relative ${unreadNotificationCount > 0 ? 'animate-pulse' : ''}`}
              onClick={() => navigateToTab("notifications")}
            >
              <Bell className={`w-5 h-5 ${unreadNotificationCount > 0 ? 'animate-[wiggle_1s_ease-in-out_infinite]' : ''}`} />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold animate-bounce">
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
              <Calendar className="w-4 h-4" />
              <span>{formattedDate}</span>
            </div>
            <HolidayCalendarDialog 
              tenantId={employee?.tenant_id} 
              institutionType={
                tenantInfo?.organization_type === "pemerintah_daerah" || tenantInfo?.organization_type === "instansi_pemerintah" 
                  ? "pemerintahan" 
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 -mt-16 relative z-20">
        {activeTab === "home" && (
          <div className="space-y-4">
            {/* Attendance Card */}
            <Card className="shadow-large">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status Hari Ini</p>
                    {todayAttendance ? (
                      <Badge className="mt-1 status-hadir">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Sudah Absen
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="mt-1">
                        Belum Absen
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">{formattedTime}</p>
                    <p className="text-xs text-muted-foreground">Waktu Server</p>
                  </div>
                </div>

                {/* GPS Location */}
                {(todayAttendance?.check_in_latitude || currentLocation) && (
                  <button
                    onClick={openInMaps}
                    className="w-full p-3 bg-muted/50 rounded-lg mb-4 flex items-center justify-between hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-primary" />
                      <span className="text-sm font-mono">
                        {todayAttendance?.check_in_latitude?.toFixed(4) || currentLocation?.lat.toFixed(4)},
                        {todayAttendance?.check_in_longitude?.toFixed(4) || currentLocation?.lng.toFixed(4)}
                      </span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}

                {/* Check-in/out times */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-success/10 rounded-lg text-center">
                    <LogIn className="w-5 h-5 text-success mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Masuk</p>
                    <p className="font-semibold text-success">
                      {todayAttendance?.check_in_time
                        ? formatTimeToTimezone(todayAttendance.check_in_time, timezone)
                        : "--:--"}
                    </p>
                  </div>
                  <div className="p-3 bg-warning/10 rounded-lg text-center">
                    <LogOut className="w-5 h-5 text-warning mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Pulang</p>
                    <p className="font-semibold text-warning">
                      {todayAttendance?.check_out_time
                        ? formatTimeToTimezone(todayAttendance.check_out_time, timezone)
                        : "--:--"}
                    </p>
                  </div>
                </div>

                {/* Holiday/Non-Workday Notice */}
                {workDayError && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                        <CalendarDays className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-amber-700 dark:text-amber-400">Hari Libur</p>
                        <p className="text-sm text-amber-600/80 dark:text-amber-300/80 mt-0.5">{workDayError}</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-600/60 dark:text-amber-400/60 mt-3 text-center">
                      Tombol absensi tidak tersedia pada hari libur
                    </p>
                  </div>
                )}

                {/* Device Binding Warning */}
                {deviceBinding.isEnabled && !deviceBinding.isDeviceValid && !deviceBinding.isFirstTime && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
                    <div className="flex items-start gap-2">
                      <Smartphone className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Perangkat Tidak Dikenali</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Android ID Anda tidak sesuai. Silakan reset device di menu Profil.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attendance Error Notice */}
                {attendanceError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Tidak Dapat Absen</p>
                        <p className="text-xs text-muted-foreground mt-1">{attendanceError}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!readOnlyMode && (() => {
                  // Hitung kondisi disable di luar JSX untuk clarity
                  const hasCheckedIn = !!(todayAttendance?.check_in_time);
                  const hasCheckedOut = !!(todayAttendance?.check_out_time);
                  const isPending = pendingState.status !== 'idle';
                  const isOptimisticPending =
                    todayAttendance?.id?.startsWith('pending-') ||
                    todayAttendance?.id?.startsWith('idb-') ||
                    todayAttendance?.id?.startsWith('buffer-');
                  const deviceInvalid = deviceBinding.isEnabled && !deviceBinding.isDeviceValid && !deviceBinding.isFirstTime;
                  
                  const disableCheckIn = isSubmitting || hasCheckedIn || !!attendanceError || !!workDayError || deviceInvalid || isPending || isOptimisticPending;
                  const disableCheckOut = isSubmitting || !hasCheckedIn || hasCheckedOut || !!attendanceError || isPending || isOptimisticPending;
                  
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        size="lg"
                        className="h-14 text-lg"
                        disabled={disableCheckIn}
                        onClick={handleCheckIn}
                      >
                        {(isSubmitting && pendingState.type === 'check_in') || (pendingState.status === 'processing' && pendingState.type === 'check_in') ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : hasCheckedIn ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 mr-2 text-green-400" />
                            Sudah Absen
                          </>
                        ) : (
                          <>
                            <LogIn className="w-5 h-5 mr-2" />
                            Absen Masuk
                          </>
                        )}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 text-lg"
                        disabled={disableCheckOut}
                        onClick={openCheckoutConfirm}
                      >
                        {(isSubmitting && pendingState.type === 'check_out') || (pendingState.status === 'processing' && pendingState.type === 'check_out') ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : hasCheckedOut ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 mr-2 text-green-400" />
                            Sudah Pulang
                          </>
                        ) : (
                          <>
                            <LogOut className="w-5 h-5 mr-2" />
                            Absen Pulang
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })()}

                {readOnlyMode && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground text-center">
                    Mode tampilan: aktivitas absensi dinonaktifkan di halaman ini.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Today's Attendance Notes Section */}
            <TodayAttendanceNotes attendance={todayAttendance} timezone={timezone} workSchedule={todayWorkSchedule} />
          </div>
        )}

        {activeTab === "history" && (
          <HistoryTab employeeId={employee?.id} timezone={timezone} />
        )}

        {activeTab === "requests" && (
          <RequestsTab employeeId={employee?.id} tenantId={employee?.tenant_id} />
        )}

        {activeTab === "help" && (
          <HelpTab tenantId={employee?.tenant_id} />
        )}

        {activeTab === "news" && (
          <EmployeeNewsArticles onBack={() => navigateToTab("home")} contentType="news" />
        )}

        {activeTab === "articles" && (
          <EmployeeNewsArticles onBack={() => navigateToTab("home")} contentType="articles" />
        )}

        {activeTab === "announcements" && (
          <EmployeeAnnouncements tenantId={employee?.tenant_id} onBack={() => navigateToTab("home")} />
        )}

        {activeTab === "notifications" && (
          <EmployeeNotifications
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                fetchUnreadNotificationCount();
                navigateToTab("home");
              }
            }}
          />
        )}

        {activeTab === "activation" && employee?.tenant_id && (
          <React.Suspense fallback={<div className="p-4"><Skeleton className="h-40 w-full" /></div>}>
            <EmployeeActivationPageLazy
              tenantId={employee.tenant_id}
              employeeId={employee.id}
              onBack={() => navigateToTab("home")}
            />
          </React.Suspense>
        )}

        {activeTab === "profile" && (
          <React.Suspense fallback={
            <div className="space-y-4">
              <Card className="shadow-large">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 mb-6">
                    <Skeleton className="w-16 h-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          }>
            <ProfileTab 
              employee={employee} 
              onLogout={handleLogout} 
              deviceBinding={deviceBinding}
            />
          </React.Suspense>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="grid grid-cols-5 h-16">
          {[
            { id: "home", icon: Home, label: "Beranda" },
            { id: "history", icon: History, label: "Riwayat" },
            { id: "requests", icon: FileText, label: "Pengajuan" },
            { id: "help", icon: HelpCircle, label: "Bantuan" },
            { id: "profile", icon: UserIcon, label: "Profil" },
          ].map((item) => (
            <button
              key={item.id}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === item.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => navigateToTab(item.id as EmployeeTab)}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Helper function untuk menentukan status kehadiran (kategori utama)
const getStatus = (record: Pick<AttendanceRecord, "status" | "check_in_time">): string => {
  const status = record.status;
  const hasCheckIn = !!record.check_in_time;

  if (!hasCheckIn) {
    if (status === "izin") return "Izin";
    if (status === "cuti") return "Cuti";
    if (status === "sakit") return "Sakit";
    if (status === "tugas_luar") return "Tugas Luar";
    return "Tidak Hadir";
  }

  return "Hadir";
};

// Helper function untuk menentukan keterangan kehadiran (detail) dengan jam kerja
const getKeterangan = (
  record: Pick<AttendanceRecord, "status" | "check_in_time" | "check_out_time" | "date">,
  workHoursData?: WorkHourRow[]
): string => {
  const status = record.status;
  const hasCheckIn = !!record.check_in_time;
  const hasCheckOut = !!record.check_out_time;

  if (!hasCheckIn) return "-";

  // Cari jam kerja untuk hari ini
  const recordDate = new Date(record.date);
  const dayOfWeek = recordDate.getDay() === 0 ? 7 : recordDate.getDay();
  const workHour = workHoursData?.find(wh => wh.day_of_week === dayOfWeek);

  if (workHour && hasCheckIn) {
    const checkInDate = new Date(record.check_in_time);
    const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    const [inH, inM] = workHour.time_in.split(":").map(Number);
    const scheduledIn = inH * 60 + inM;
    const isLate = checkInMinutes > scheduledIn + 15;

    if (!hasCheckOut) {
      return isLate ? "Telat (Belum Pulang)" : "Tidak Absen Pulang";
    }

    const checkOutDate = new Date(record.check_out_time);
    const checkOutMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
    const [outH, outM] = workHour.time_out.split(":").map(Number);
    const scheduledOut = outH * 60 + outM;
    const isEarly = checkOutMinutes < scheduledOut - 15;

    if (isLate && isEarly) return "Telat + Pulang Cepat";
    if (isLate) return "Telat";
    if (isEarly) return "Pulang Cepat";
    return "Hadir";
  }

  // Fallback ke status database
  if (hasCheckIn && !hasCheckOut) {
    if (status === "terlambat") return "Telat (Belum Pulang)";
    return "Tidak Absen Pulang";
  }

  if (status === "terlambat_pulang_cepat") return "Telat + Pulang Cepat";
  if (status === "terlambat") return "Telat";
  if (status === "pulang_cepat") return "Pulang Cepat";
  if (status === "hadir") return "Hadir";

  return status || "-";
};

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Hadir": { variant: "default", className: "bg-green-500 hover:bg-green-600" },
    "Izin": { variant: "outline", className: "border-blue-500 text-blue-600" },
    "Cuti": { variant: "outline", className: "border-purple-500 text-purple-600" },
    "Sakit": { variant: "outline", className: "border-pink-500 text-pink-600" },
    "Tugas Luar": { variant: "outline", className: "border-cyan-500 text-cyan-600" },
    "Tidak Hadir": { variant: "destructive", className: "" },
  };

  const style = variants[status] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{status}</Badge>;
};

const getKeteranganBadge = (keterangan: string) => {
  if (keterangan === "-") return <span className="text-muted-foreground">-</span>;
  
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    "Hadir": { variant: "default", className: "bg-green-500 hover:bg-green-600 text-white" },
    "Telat": { variant: "secondary", className: "bg-yellow-500 text-black hover:bg-yellow-600" },
    "Pulang Cepat": { variant: "secondary", className: "bg-orange-500 hover:bg-orange-600 text-white" },
    "Telat + Pulang Cepat": { variant: "destructive", className: "bg-red-500 hover:bg-red-600" },
    "Tidak Absen Pulang": { variant: "outline", className: "border-orange-500 text-orange-600" },
    "Telat (Belum Pulang)": { variant: "outline", className: "border-yellow-500 text-yellow-600" },
    "Izin": { variant: "outline", className: "border-blue-500 text-blue-600" },
    "Cuti": { variant: "outline", className: "border-purple-500 text-purple-600" },
    "Sakit": { variant: "outline", className: "border-pink-500 text-pink-600" },
    "Tugas Luar": { variant: "outline", className: "border-cyan-500 text-cyan-600" },
    "Tidak Hadir": { variant: "destructive", className: "" },
  };

  const style = variants[keterangan] || { variant: "outline" as const, className: "" };
  return <Badge variant={style.variant} className={style.className}>{keterangan}</Badge>;
};

// History Tab Component - Now using weekly pagination
function HistoryTab({ employeeId, timezone, tenantId }: { employeeId?: string; timezone: string; tenantId?: string }) {
  // Menggunakan komponen weekly pagination
  return (
    <div className="space-y-4">
      <Card className="shadow-large">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <History className="w-4 h-4" />
            Riwayat Absensi Mingguan
          </h2>
          
          {/* Weekly Pagination Component - inline implementation */}
          <WeeklyAttendanceView employeeId={employeeId || null} />
        </CardContent>
      </Card>
    </div>
  );
}

// Inline Weekly Attendance View
function WeeklyAttendanceView({ employeeId }: { employeeId: string | null }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  
  const getWeekRange = (offset: number) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (offset * 7)); // Monday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
    return { start: startOfWeek, end: endOfWeek };
  };
  
  const { start, end } = getWeekRange(weekOffset);
  const weekLabel = `${format(start, "d MMM", { locale: idLocale })} - ${format(end, "d MMM yyyy", { locale: idLocale })}`;
  
  useEffect(() => {
    if (!employeeId) return;
    
    const fetchWeekData = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("attendance_records_partitioned")
        .select("id, date, check_in_time, check_out_time, status, notes, is_wfh")
        .eq("employee_id", employeeId)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      
      setRecords(data || []);
      setIsLoading(false);
    };
    
    fetchWeekData();
    // start/end derived from weekOffset; dependency on weekOffset is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, weekOffset]);
  
  const stats = {
    hadir: records.filter(r => r.status === "hadir").length,
    terlambat: records.filter(r => r.status?.includes("terlambat")).length,
    absen: records.filter(r => r.status === "tidak_hadir" || !r.check_in_time).length,
  };
  
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    return day;
  });

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronRight className="w-4 h-4 rotate-180" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm">{weekLabel}</p>
          {weekOffset !== 0 && (
            <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => setWeekOffset(0)}>
              Minggu ini
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset >= 0}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 text-center bg-green-50 dark:bg-green-950/30 rounded-lg">
          <div className="text-lg font-bold text-green-600">{stats.hadir}</div>
          <div className="text-[10px] text-muted-foreground">Hadir</div>
        </div>
        <div className="p-2 text-center bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
          <div className="text-lg font-bold text-yellow-600">{stats.terlambat}</div>
          <div className="text-[10px] text-muted-foreground">Terlambat</div>
        </div>
        <div className="p-2 text-center bg-red-50 dark:bg-red-950/30 rounded-lg">
          <div className="text-lg font-bold text-red-600">{stats.absen}</div>
          <div className="text-[10px] text-muted-foreground">Absen</div>
        </div>
      </div>
      
      {/* Daily list */}
      <div className="space-y-2 max-h-[280px] overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : (
          weekDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const record = records.find(r => r.date === dateStr);
            const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            const isFuture = day > new Date();
            
            return (
              <div key={dateStr} className={`p-3 rounded-lg border ${isToday ? 'ring-2 ring-primary/50 bg-primary/5' : 'bg-muted/30'} ${isFuture ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <span className="text-sm font-bold">{format(day, "dd")}</span>
                      <span className="text-[9px] uppercase">{format(day, "EEE", { locale: idLocale })}</span>
                    </div>
                    {record ? (
                      <div className="text-xs">
                        <span className="text-green-600">{record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
                        <span className="mx-1 text-muted-foreground">-</span>
                        <span className="text-red-600">{record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{isFuture ? "-" : "Tidak ada data"}</span>
                    )}
                  </div>
                  {record?.status && !isFuture && (
                    <Badge variant={record.status === "hadir" ? "default" : record.status === "tidak_hadir" ? "destructive" : "secondary"} className="text-[10px]">
                      {record.status === "hadir" ? "Hadir" : record.status === "terlambat" ? "Telat" : record.status === "tidak_hadir" ? "Absen" : record.status}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Legacy filter code removed - now using weekly pagination
const LegacyHistoryTab = ({ employeeId, timezone, tenantId }: { employeeId?: string; timezone: string; tenantId?: string }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [workHoursData, setWorkHoursData] = useState<WorkHourRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  useEffect(() => {
    if (employeeId) fetchHistory();
    if (tenantId) fetchWorkHours();
    // fetchHistory/fetchWorkHours intentionally omitted; they depend on local filters that already drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, tenantId, filter]);

  const fetchHistory = async () => {
    try {
      const startDate = new Date(filter.year, filter.month - 1, 1);
      const endDate = new Date(filter.year, filter.month, 0);

      const { data } = await supabase
        .from("attendance_records_partitioned")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0])
        .order("date", { ascending: false });

      setRecords(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkHours = async () => {
    try {
      const { data } = await supabase
        .from("work_hours")
        .select("day_of_week, time_in, time_out, institution_type")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      
      setWorkHoursData(data || []);
    } catch (error) {
      console.error("Error fetching work hours:", error);
    }
  };

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-large">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Riwayat Absensi (Legacy)</h2>
          
          {/* Filter */}
          <div className="flex gap-2 mb-4">
            <select
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm"
              value={filter.month}
              onChange={(e) => setFilter({ ...filter, month: parseInt(e.target.value) })}
            >
              {months.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="w-24 px-3 py-2 rounded-lg border border-input bg-background text-sm"
              value={filter.year}
              onChange={(e) => setFilter({ ...filter, year: parseInt(e.target.value) })}
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Records */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Tidak ada data</p>
          ) : (
            <div className="space-y-2">
              {records.map((record) => {
                const status = getStatus(record);
                const keterangan = getKeterangan(record);
                return (
                  <div
                    key={record.id}
                    className="p-3 border border-border rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">
                        {formatToTimezone(record.date, timezone, "EEEE, dd MMM")}
                      </p>
                      {getStatusBadge(status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Masuk: {record.check_in_time ? formatTimeToTimezone(record.check_in_time, timezone) : "-"}</span>
                        <span>Pulang: {record.check_out_time ? formatTimeToTimezone(record.check_out_time, timezone) : "-"}</span>
                      </div>
                      {status === "Hadir" && getKeteranganBadge(keterangan)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Requests Tab Component
function RequestsTab({ employeeId, tenantId }: { employeeId?: string; tenantId?: string }) {
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [wfhRequests, setWfhRequests] = useState<WfhRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRequestType, setActiveRequestType] = useState<"leave" | "wfh" | "flexible" | "overtime">("leave");
  const [wfhDialogOpen, setWfhDialogOpen] = useState(false);
  const [selectedWfhDates, setSelectedWfhDates] = useState<Date[]>([]);
  const [wfhReason, setWfhReason] = useState("");
  const [isSubmittingWfh, setIsSubmittingWfh] = useState(false);
  const [refreshFlexible, setRefreshFlexible] = useState(0);
  const [overtimeSettings, setOvertimeSettings] = useState<OvertimeSettingsRow | null>(null);

  // Fetch overtime settings
  useEffect(() => {
    if (!tenantId) return;
    const fetchOvertimeSettings = async () => {
      const { data } = await supabase
        .from("overtime_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      setOvertimeSettings(data);
    };
    fetchOvertimeSettings();
  }, [tenantId]);
  
  // Leave request hook
  const { createLeaveRequest, isSubmitting: isSubmittingLeave } = useLeaveRequests(employeeId || null);

  // Handler for leave request from form
  const handleLeaveRequest = async (data: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
  }) => {
    const result = await createLeaveRequest(data);
    if (result.success) {
      fetchRequests(); // Refresh the list after successful submission
    }
    return result;
  };

  useEffect(() => {
    if (employeeId) {
      fetchRequests();
      fetchWfhRequests();
    }
    // fetchRequests/fetchWfhRequests intentionally omitted to avoid unnecessary recreation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const fetchRequests = async () => {
    try {
      const { data } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(20);

      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWfhRequests = async () => {
    try {
      const { data } = await supabase
        .from("wfh_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(20);

      setWfhRequests(data || []);
    } catch (error) {
      console.error("Error fetching WFH requests:", error);
    }
  };

  const handleSubmitWfh = async () => {
    if (!employeeId || selectedWfhDates.length === 0 || !wfhReason.trim()) return;
    
    setIsSubmittingWfh(true);
    try {
      const dateStrings = selectedWfhDates.map(d => format(d, "yyyy-MM-dd"));
      
      // Check for existing requests
      const { data: existing } = await supabase
        .from("wfh_requests")
        .select("request_date")
        .eq("employee_id", employeeId)
        .in("request_date", dateStrings);
      
      const existingDates = existing?.map(e => e.request_date) || [];
      const newDates = dateStrings.filter(d => !existingDates.includes(d));

      if (newDates.length === 0) {
        toast.error("Semua tanggal sudah pernah diajukan");
        return;
      }

      if (existingDates.length > 0) {
        toast.warning(`${existingDates.length} tanggal sudah ada, mengajukan ${newDates.length} tanggal baru`);
      }

      const insertData = newDates.map(date => ({
        employee_id: employeeId,
        request_date: date,
        reason: wfhReason.trim(),
        status: "menunggu"
      }));

      const { error } = await supabase
        .from("wfh_requests")
        .insert(insertData);

      if (error) throw error;
      
      toast.success(`${newDates.length} pengajuan WFH berhasil dikirim`);
      setWfhDialogOpen(false);
      setSelectedWfhDates([]);
      setWfhReason("");
      fetchWfhRequests();
    } catch (error: unknown) {
      toast.error("Gagal mengirim pengajuan WFH", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    } finally {
      setIsSubmittingWfh(false);
    }
  };

  const handleWfhDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const today = startOfDay(new Date());
    if (isBefore(date, today)) return;

    const dateExists = selectedWfhDates.some(
      d => format(d, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );

    if (dateExists) {
      setSelectedWfhDates(prev => 
        prev.filter(d => format(d, "yyyy-MM-dd") !== format(date, "yyyy-MM-dd"))
      );
    } else {
      setSelectedWfhDates(prev => [...prev, date].sort((a, b) => a.getTime() - b.getTime()));
    }
  };

  const removeWfhDate = (dateToRemove: Date) => {
    setSelectedWfhDates(prev => 
      prev.filter(d => format(d, "yyyy-MM-dd") !== format(dateToRemove, "yyyy-MM-dd"))
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "disetujui":
        return <Badge className="status-hadir">Disetujui</Badge>;
      case "ditolak":
        return <Badge className="status-tidak-hadir">Ditolak</Badge>;
      default:
        return <Badge variant="secondary">Menunggu</Badge>;
    }
  };

  const getLeaveTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      cuti_tahunan: "Cuti Tahunan",
      cuti_penting: "Cuti Penting",
      cuti_lainnya: "Cuti Lainnya",
      sakit: "Sakit",
      izin: "Izin",
      tugas_luar: "Tugas Luar",
    };
    return types[type] || type;
  };

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button 
          size="sm" 
          variant={activeRequestType === "leave" ? "default" : "outline"}
          onClick={() => setActiveRequestType("leave")}
        >
          <FileText className="w-4 h-4 mr-1" />
          Cuti/Izin
        </Button>
        <Button 
          size="sm" 
          variant={activeRequestType === "overtime" ? "default" : "outline"}
          onClick={() => setActiveRequestType("overtime")}
        >
          <Timer className="w-4 h-4 mr-1" />
          Lembur
        </Button>
        <Button 
          size="sm" 
          variant={activeRequestType === "wfh" ? "default" : "outline"}
          onClick={() => setActiveRequestType("wfh")}
        >
          <Home className="w-4 h-4 mr-1" />
          WFH
        </Button>
        <Button 
          size="sm" 
          variant={activeRequestType === "flexible" ? "default" : "outline"}
          onClick={() => setActiveRequestType("flexible")}
        >
          <MapPinOff className="w-4 h-4 mr-1" />
          Absensi Khusus
        </Button>
      </div>

      {activeRequestType === "leave" ? (
        <Card className="shadow-large">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Riwayat Cuti/Izin</h2>
              <LeaveRequestForm 
                onSubmit={handleLeaveRequest}
                isSubmitting={isSubmittingLeave}
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Belum ada pengajuan</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div key={req.id} className="p-3 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{getLeaveTypeLabel(req.leave_type)}</span>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {req.start_date} - {req.end_date}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {req.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : activeRequestType === "overtime" ? (
        <div className="space-y-4">
          <Card className="shadow-large">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold flex items-center gap-2">
                    <Timer className="w-4 h-4 text-primary" />
                    Pengajuan Lembur
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajukan permohonan lembur untuk tanggal tertentu
                  </p>
                </div>
                {employeeId && tenantId && (
                  <OvertimeRequestForm 
                    employeeId={employeeId} 
                    tenantId={tenantId} 
                    settings={overtimeSettings || { is_enabled: true, min_hours: 1, max_hours_per_day: 4, max_dates_per_request: 10, rate_multiplier: 1.5, weekend_rate_multiplier: 2.0 }}
                  />
                )}
              </div>
            </CardContent>
          </Card>
          {employeeId && (
            <OvertimeRequestList employeeId={employeeId} />
          )}
        </div>
      ) : activeRequestType === "wfh" ? (
        <Card className="shadow-large">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Riwayat WFH</h2>
              <Button size="sm" onClick={() => setWfhDialogOpen(true)}>
                <Home className="w-4 h-4 mr-1" />
                Ajukan WFH
              </Button>
            </div>

            {wfhRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Belum ada pengajuan WFH</p>
            ) : (
              <div className="space-y-3">
                {wfhRequests.map((req) => (
                  <div key={req.id} className="p-3 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">Work From Home</span>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tanggal: {req.request_date}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {req.reason}
                    </p>
                    {req.rejection_reason && (
                      <p className="text-xs text-destructive mt-1">
                        Alasan ditolak: {req.rejection_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : activeRequestType === "flexible" ? (
        <div className="space-y-4">
          <Card className="shadow-large">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold flex items-center gap-2">
                    <MapPinOff className="w-4 h-4 text-primary" />
                    Absensi Khusus
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajukan permohonan absensi dari lokasi manapun
                  </p>
                </div>
                {employeeId && tenantId && (
                  <FlexibleAttendanceRequestForm 
                    employeeId={employeeId} 
                    tenantId={tenantId}
                    onSuccess={() => setRefreshFlexible(prev => prev + 1)}
                  />
                )}
              </div>
            </CardContent>
          </Card>
          {employeeId && (
            <FlexibleAttendanceRequestList 
              employeeId={employeeId}
              refreshTrigger={refreshFlexible}
            />
          )}
        </div>
      ) : null}

      {/* WFH Request Dialog - Multi Date */}
      {wfhDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-auto">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Ajukan Work From Home</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    Pilih Tanggal WFH (Klik untuk memilih)
                  </label>
                  <div className="border rounded-lg p-2">
                    <CalendarComponent
                      mode="single"
                      selected={undefined}
                      onSelect={(date) => handleWfhDateSelect(date as Date)}
                      disabled={(date) => isBefore(date, startOfDay(new Date()))}
                      modifiers={{
                        selected: selectedWfhDates,
                      }}
                      modifiersStyles={{
                        selected: {
                          backgroundColor: "hsl(var(--primary))",
                          color: "hsl(var(--primary-foreground))",
                        },
                      }}
                      locale={idLocale}
                      className="w-full"
                    />
                  </div>

                  {selectedWfhDates.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Tanggal terpilih ({selectedWfhDates.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedWfhDates.map((date) => (
                          <Badge 
                            key={format(date, "yyyy-MM-dd")} 
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                          >
                            {format(date, "d MMM", { locale: idLocale })}
                            <button
                              type="button"
                              onClick={() => removeWfhDate(date)}
                              className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Alasan</label>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm min-h-[80px]"
                    placeholder="Jelaskan alasan pengajuan WFH..."
                    value={wfhReason}
                    onChange={(e) => setWfhReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setWfhDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button 
                    onClick={handleSubmitWfh} 
                    disabled={isSubmittingWfh || selectedWfhDates.length === 0 || !wfhReason.trim()}
                  >
                    {isSubmittingWfh ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Mengirim...
                      </>
                    ) : (
                      `Kirim ${selectedWfhDates.length} Pengajuan`
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Help Tab Component  
function HelpTab({ tenantId }: { tenantId?: string }) {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFAQs();
    // fetchFAQs intentionally omitted; only tenant change should trigger reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const fetchFAQs = async () => {
    try {
      setIsLoading(true);
      // Query FAQs - global (tenant_id is null) atau milik tenant ini
      let query = supabase
        .from("faqs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      
      // Filter berdasarkan tenant_id
      if (tenantId) {
        query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching FAQs:", error);
        // Set default FAQs jika error
        setFaqs(getDefaultFAQs());
      } else {
        setFaqs(data && data.length > 0 ? data : getDefaultFAQs());
      }
    } catch (error) {
      console.error("Error fetching FAQs:", error);
      setFaqs(getDefaultFAQs());
    } finally {
      setIsLoading(false);
    }
  };
  
  // Default FAQs jika tidak ada data dari database
  const getDefaultFAQs = () => [
    { 
      id: "default-1", 
      question: "Bagaimana cara melakukan absensi?", 
      answer: "Klik tombol 'Absen Masuk' pada halaman beranda untuk check-in dan 'Absen Pulang' untuk check-out. Pastikan GPS aktif dan Anda berada di lokasi kantor." 
    },
    { 
      id: "default-2", 
      question: "Apa yang harus dilakukan jika lokasi GPS tidak akurat?", 
      answer: "Pastikan GPS aktif dan izin lokasi diberikan. Coba refresh halaman atau tunggu beberapa saat hingga GPS mendapat sinyal yang lebih baik." 
    },
    { 
      id: "default-3", 
      question: "Bagaimana cara mengajukan cuti atau izin?", 
      answer: "Buka tab 'Pengajuan' lalu pilih 'Cuti/Izin'. Isi formulir dengan lengkap termasuk jenis cuti, tanggal, dan alasan." 
    },
    { 
      id: "default-4", 
      question: "Apa yang dimaksud dengan Absensi Khusus?", 
      answer: "Absensi Khusus memungkinkan Anda melakukan absensi dari lokasi di luar kantor dengan persetujuan. Fitur ini harus diaktifkan oleh admin." 
    },
    { 
      id: "default-5", 
      question: "Bagaimana jika saya lupa absen pulang?", 
      answer: "Hubungi admin atau atasan Anda untuk melakukan koreksi absensi. Catatan: absensi yang tidak lengkap dapat mempengaruhi perhitungan kehadiran." 
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-large">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-4">Pertanyaan yang Sering Ditanyakan</h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Belum ada FAQ</p>
          ) : (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div key={faq.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    className="w-full p-3 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                  >
                    <span className="font-medium text-sm">{faq.question}</span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        expandedId === faq.id ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                  {expandedId === faq.id && (
                    <div className="p-3 pt-0 text-sm text-muted-foreground border-t border-border bg-muted/30">
                      {faq.answer || "Jawaban belum tersedia."}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Profile Tab Component
interface ProfileTabProps {
  employee?: EmployeeData | null;
  onLogout: () => void;
  deviceBinding: {
    isEnabled: boolean;
    settings: {
      enable_device_binding: boolean;
      max_device_reset_count: number;
      require_password_change_for_reset: boolean;
    };
    employeeAndroidId: string | null;
    currentAndroidId: string | null;
    resetCount: number;
    isDeviceValid: boolean;
    isFirstTime: boolean;
    isLoading: boolean;
    refetch: () => void;
  };
}

const ProfileTab = React.memo(function ProfileTab({ employee, onLogout, deviceBinding }: ProfileTabProps) {
  const [showDeviceReset, setShowDeviceReset] = useState(false);
  const [isLoadingDeviceInfo, setIsLoadingDeviceInfo] = useState(false);
  
  // Gunakan data dari deviceBinding, tidak perlu fetch sendiri
  const deviceInfo = {
    android_id: deviceBinding.employeeAndroidId,
    device_id_reset_count: deviceBinding.resetCount,
  };
  
  const settings = deviceBinding.settings;
  const currentDeviceId = deviceBinding.currentAndroidId || "";
  const isLoadingSettings = deviceBinding.isLoading;

  if (!employee) {
    return (
      <div className="space-y-4">
        <Card className="shadow-large">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-6">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-border last:border-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryIdentityField = employee.nip
    ? { label: "NIP", value: employee.nip }
    : { label: "NIK", value: employee.nik || "-" };

  const profileFields = [
    { label: "Nama Lengkap", value: employee.name },
    primaryIdentityField,
    { label: "Email", value: employee.email },
    { label: "No. Telepon / WhatsApp", value: employee.phone || employee.whatsapp || "-" },
    { label: "Jenis Kelamin", value: employee.gender === "laki-laki" ? "Laki-laki" : employee.gender === "perempuan" ? "Perempuan" : (employee.gender || "-") },
    { label: "Alamat", value: employee.address || "-" },
    { label: "Jabatan", value: employee.position || "-" },
    { label: "OPD", value: employee.opd?.name || "-" },
    { label: "Satuan Kerja", value: employee.work_unit?.name || "-" },
    { label: "Lokasi Kerja", value: employee.offices?.name || "-" },
    { label: "Golongan", value: employee.golongan || "-" },
    { label: "Kategori", value: employee.employee_category || "-" },
  ];

  // DeviceResetDialog dilazy-load di level modul (LazyDeviceResetDialog) untuk mencegah flicker saat re-render

  return (
    <div className="space-y-4">
      <Card className="shadow-large">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">
                {employee.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-lg">{employee.name}</h2>
              <p className="text-sm text-muted-foreground">{employee.position || employee.opd?.name}</p>
            </div>
          </div>

          <div className="space-y-3">
            {profileFields.map((field, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{field.label}</span>
                <span className="text-sm font-medium text-right max-w-[60%]">{field.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device Binding Section - Selalu tampilkan dengan loading state */}
      <Card className="shadow-large">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Perangkat Terdaftar
          </h3>
          
          {isLoadingSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !settings?.enable_device_binding ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Device binding tidak diaktifkan</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Device Terdaftar</span>
                  <span className="font-mono text-xs">
                    {deviceInfo?.android_id ? `${deviceInfo.android_id.substring(0, 20)}...` : "Belum terdaftar"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Device Sekarang</span>
                  <span className="font-mono text-xs">
                    {currentDeviceId ? `${currentDeviceId.substring(0, 20)}...` : "-"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Status</span>
                  {!deviceInfo?.android_id ? (
                    <Badge variant="secondary">Belum Terdaftar</Badge>
                  ) : deviceInfo.android_id === currentDeviceId ? (
                    <Badge className="bg-green-500 hover:bg-green-600">Cocok</Badge>
                  ) : (
                    <Badge variant="destructive">Tidak Cocok</Badge>
                  )}
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Reset Tersisa</span>
                  <span className="font-medium">
                    {(settings?.max_device_reset_count || 3) - (deviceInfo?.device_id_reset_count || 0)} / {settings?.max_device_reset_count || 3}
                  </span>
                </div>
              </div>
              {deviceInfo?.android_id && deviceInfo.android_id !== currentDeviceId && (
                <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm">
                  <p className="text-warning font-medium">Perangkat berbeda terdeteksi</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anda tidak dapat absen dari perangkat ini. Reset device jika Anda mengganti HP.
                  </p>
                </div>
              )}
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => setShowDeviceReset(true)}
                disabled={(settings?.max_device_reset_count || 3) - (deviceInfo?.device_id_reset_count || 0) <= 0}
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Reset Perangkat
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mutation Request Section */}
      <MutationSection 
        employee={employee ? {
          id: employee.id,
          tenant_id: employee.tenant_id,
          name: employee.name,
          nip: employee.nip,
          nik: employee.nik,
          email: employee.email,
          phone: employee.phone,
          whatsapp: employee.whatsapp,
          address: employee.address,
          gender: employee.gender,
          golongan: employee.golongan,
          position: employee.position,
          employee_category: employee.employee_category,
          opd_id: undefined,
          work_unit_id: employee.work_unit_id,
          office_id: employee.office_id,
          opd: employee.opd ? { name: employee.opd.name, code: employee.opd.code } : null,
          work_unit: employee.work_unit ? { id: employee.work_unit.id, name: employee.work_unit.name } : null,
          offices: employee.offices ? { id: employee.offices.id, name: employee.offices.name } : null,
        } : null}
      />

      <Button variant="destructive" className="w-full" onClick={onLogout}>
        <LogOut className="w-4 h-4 mr-2" />
        Keluar
      </Button>

      {/* Device Reset Dialog */}
      <React.Suspense fallback={null}>
        <LazyDeviceResetDialog
          open={showDeviceReset}
          onOpenChange={setShowDeviceReset}
          employeeId={employee.id}
          employeeEmail={employee.email}
          currentResetCount={deviceInfo?.device_id_reset_count || 0}
          maxResetCount={settings?.max_device_reset_count || 3}
          requirePasswordChange={settings?.require_password_change_for_reset ?? true}
          onSuccess={() => deviceBinding.refetch()}
        />
      </React.Suspense>
    </div>
  );
});

// Today's Attendance Notes Component - Catatan Absen Hari Ini with Schedule Info
function TodayAttendanceNotes({ attendance, timezone, workSchedule }: { 
  attendance: AttendanceRecord | null; 
  timezone: string;
  workSchedule?: { time_in: string; time_out: string } | null;
}) {
  // Calculate lateness or early leave
  const getLatenessInfo = () => {
    if (!attendance?.check_in_time || !workSchedule) return null;
    
    const checkInDate = new Date(attendance.check_in_time);
    const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    const [inH, inM] = workSchedule.time_in.split(":").map(Number);
    const scheduledInMinutes = inH * 60 + inM;
    
    let latenessMinutes = 0;
    let isLate = false;
    if (checkInMinutes > scheduledInMinutes) {
      latenessMinutes = checkInMinutes - scheduledInMinutes;
      isLate = latenessMinutes > 0;
    }
    
    let earlyLeaveMinutes = 0;
    let isEarlyLeave = false;
    if (attendance.check_out_time && workSchedule.time_out) {
      const checkOutDate = new Date(attendance.check_out_time);
      const checkOutMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
      const [outH, outM] = workSchedule.time_out.split(":").map(Number);
      const scheduledOutMinutes = outH * 60 + outM;
      
      if (checkOutMinutes < scheduledOutMinutes) {
        earlyLeaveMinutes = scheduledOutMinutes - checkOutMinutes;
        isEarlyLeave = earlyLeaveMinutes > 0;
      }
    }
    
    const formatDuration = (minutes: number) => {
      if (minutes < 60) return `${minutes} menit`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours} jam ${mins} menit` : `${hours} jam`;
    };
    
    return { isLate, latenessMinutes, isEarlyLeave, earlyLeaveMinutes, formatDuration };
  };
  
  const latenessInfo = getLatenessInfo();
  // Tentukan status dan keterangan
  const getAttendanceInfo = () => {
    if (!attendance) {
      return {
        status: "Belum Absen",
        statusClass: "bg-muted text-muted-foreground",
        keterangan: "Anda belum melakukan absensi hari ini",
        icon: Clock,
        iconClass: "text-muted-foreground"
      };
    }

    const hasCheckIn = !!attendance.check_in_time;
    const hasCheckOut = !!attendance.check_out_time;
    const status = attendance.status;

    // Jika tidak ada check in sama sekali
    if (!hasCheckIn) {
      if (status === "izin") return {
        status: "Izin",
        statusClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        keterangan: attendance.notes || "Izin hari ini",
        icon: FileText,
        iconClass: "text-blue-500"
      };
      if (status === "cuti") return {
        status: "Cuti",
        statusClass: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
        keterangan: attendance.notes || "Sedang cuti",
        icon: CalendarDays,
        iconClass: "text-purple-500"
      };
      if (status === "sakit") return {
        status: "Sakit",
        statusClass: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
        keterangan: attendance.notes || "Izin sakit",
        icon: AlertCircle,
        iconClass: "text-pink-500"
      };
      if (status === "tugas_luar") return {
        status: "Tugas Luar",
        statusClass: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
        keterangan: attendance.notes || "Sedang tugas luar",
        icon: MapPin,
        iconClass: "text-cyan-500"
      };
      return {
        status: "Tidak Hadir",
        statusClass: "bg-red-500/10 text-red-700 dark:text-red-400",
        keterangan: "Tidak ada catatan kehadiran",
        icon: XCircle,
        iconClass: "text-red-500"
      };
    }

    // Jika sudah check in
    const checkInTime = formatTimeToTimezone(attendance.check_in_time!, timezone);
    const checkOutTime = hasCheckOut ? formatTimeToTimezone(attendance.check_out_time!, timezone) : null;

    // Jika WFH
    if (attendance.is_wfh) {
      return {
        status: "Work From Home",
        statusClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
        keterangan: `Absen WFH pukul ${checkInTime}${checkOutTime ? ` - ${checkOutTime}` : ' (belum pulang)'}`,
        icon: Home,
        iconClass: "text-indigo-500"
      };
    }

    // Jika Flexible Attendance
    if (attendance.is_flexible_attendance) {
      return {
        status: "Absensi Khusus",
        statusClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        keterangan: attendance.flexible_attendance_reason || `Absen khusus pukul ${checkInTime}${checkOutTime ? ` - ${checkOutTime}` : ' (belum pulang)'}`,
        icon: MapPinOff,
        iconClass: "text-amber-500"
      };
    }

    // Jika ada check in tapi tidak ada check out
    if (hasCheckIn && !hasCheckOut) {
      if (status === "terlambat") return {
        status: "Terlambat",
        statusClass: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
        keterangan: `Masuk terlambat pukul ${checkInTime} - Belum absen pulang`,
        icon: Timer,
        iconClass: "text-yellow-500"
      };
      return {
        status: "Hadir",
        statusClass: "bg-green-500/10 text-green-700 dark:text-green-400",
        keterangan: `Masuk pukul ${checkInTime} - Belum absen pulang`,
        icon: CheckCircle2,
        iconClass: "text-green-500"
      };
    }

    // Jika sudah check in dan check out
    if (status === "terlambat_pulang_cepat") return {
      status: "Terlambat + Pulang Cepat",
      statusClass: "bg-red-500/10 text-red-700 dark:text-red-400",
      keterangan: `Masuk ${checkInTime} - Pulang ${checkOutTime}`,
      icon: AlertCircle,
      iconClass: "text-red-500"
    };
    if (status === "terlambat") return {
      status: "Terlambat",
      statusClass: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      keterangan: `Masuk terlambat ${checkInTime} - Pulang ${checkOutTime}`,
      icon: Timer,
      iconClass: "text-yellow-500"
    };
    if (status === "pulang_cepat") return {
      status: "Pulang Cepat",
      statusClass: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      keterangan: `Masuk ${checkInTime} - Pulang cepat ${checkOutTime}`,
      icon: LogOut,
      iconClass: "text-orange-500"
    };

    return {
      status: "Hadir",
      statusClass: "bg-green-500/10 text-green-700 dark:text-green-400",
      keterangan: `Absensi lengkap: ${checkInTime} - ${checkOutTime}`,
      icon: CheckCircle2,
      iconClass: "text-green-500"
    };
  };

  const info = getAttendanceInfo();
  const IconComponent = info.icon;

  return (
    <Card className="shadow-large overflow-hidden">
      <div className={`h-1 w-full ${attendance?.check_in_time ? 'bg-gradient-to-r from-primary to-primary/60' : 'bg-muted'}`} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Catatan Absen Hari Ini
          </h3>
          <span className="text-xs text-muted-foreground">
            {formatToTimezone(new Date().toISOString(), timezone, "EEEE, dd MMM")}
          </span>
        </div>
        
        <div className={`p-4 rounded-xl ${info.statusClass} transition-all`}>
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-background/50 flex items-center justify-center`}>
              <IconComponent className={`w-5 h-5 ${info.iconClass}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{info.status}</span>
              </div>
              <p className="text-sm opacity-90">{info.keterangan}</p>
              {attendance?.notes && attendance.notes !== info.keterangan && (
                <p className="text-xs opacity-70 mt-1 italic">"{attendance.notes}"</p>
              )}
            </div>
          </div>
        </div>

        {/* Schedule Info */}
        {workSchedule && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg mt-3 border border-blue-100 dark:border-blue-900">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Jadwal Hari Ini</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Jam Masuk</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">{workSchedule.time_in}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jam Pulang</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">{workSchedule.time_out}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats jika sudah absen */}
        {attendance?.check_in_time && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Absen Masuk</p>
              <p className="font-semibold text-primary">
                {formatTimeToTimezone(attendance.check_in_time, timezone)}
              </p>
              {latenessInfo?.isLate && latenessInfo.latenessMinutes > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Terlambat {latenessInfo.formatDuration(latenessInfo.latenessMinutes)}
                </p>
              )}
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Absen Pulang</p>
              <p className="font-semibold text-primary">
                {attendance.check_out_time 
                  ? formatTimeToTimezone(attendance.check_out_time, timezone)
                  : "--:--"}
              </p>
              {latenessInfo?.isEarlyLeave && latenessInfo.earlyLeaveMinutes > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Pulang cepat {latenessInfo.formatDuration(latenessInfo.earlyLeaveMinutes)}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// News Section Component with Detail Modal - Fixed flickering  
// Menggunakan useRef untuk mencegah re-render loop pada image states
function NewsSection({ news, timezone, isLoading = false }: { news: NewsItem[]; timezone: string; isLoading?: boolean }) {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  
  // Gunakan useRef untuk image states agar tidak menyebabkan re-render
  const imageStatesRef = React.useRef<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  
  // Simpan news di ref untuk mencegah flicker saat parent re-render
  const newsDataRef = React.useRef<NewsItem[]>(news);
  
  // Update ref hanya jika news benar-benar berubah (berdasarkan ID)
  React.useEffect(() => {
    const currentIds = newsDataRef.current.map(n => n.id).join(',');
    const newIds = news.map(n => n.id).join(',');
    if (currentIds !== newIds) {
      newsDataRef.current = news;
    }
  }, [news]);
  
  // Gunakan data dari ref untuk render stabil
  const stableNews = newsDataRef.current.length > 0 ? newsDataRef.current : news;

  // Memoize displayed news untuk mencegah re-compute
  const displayedNews = React.useMemo(() => 
    showAll ? stableNews : stableNews.slice(0, 3), 
    [showAll, stableNews]
  );

  // Memoize stripHtml function
  const stripHtml = React.useCallback((html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }, []);

  // Handler image load - update ref dan force re-render
  const handleImageLoad = React.useCallback((id: string) => {
    if (imageStatesRef.current[id] !== 'loaded') {
      imageStatesRef.current[id] = 'loaded';
      forceUpdate();
    }
  }, []);

  const handleImageError = React.useCallback((id: string) => {
    if (imageStatesRef.current[id] !== 'error') {
      imageStatesRef.current[id] = 'error';
      forceUpdate();
    }
  }, []);
  
  // Helper untuk mendapatkan image state
  const getImageState = React.useCallback((id: string) => {
    return imageStatesRef.current[id] || 'loading';
  }, []);

  // Jika masih loading dan belum ada data sebelumnya, tampilkan skeleton
  if (isLoading && stableNews.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="font-semibold">Berita Terbaru</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Berita Terbaru</h2>
          {stableNews.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Tampilkan Sedikit" : "Lihat Semua"}
              <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${showAll ? "rotate-90" : ""}`} />
            </Button>
          )}
        </div>

        {stableNews.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <p>Belum ada berita terbaru</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayedNews.map((item) => {
              const imageState = getImageState(item.id);
              const hasImage = item.image_url && imageState !== 'error';
              
              return (
                <Card 
                  key={item.id} 
                  className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedNews(item)}
                >
                  {hasImage && (
                    <div className="aspect-video w-full overflow-hidden bg-muted relative">
                      {/* Skeleton placeholder - always visible until loaded */}
                      <div 
                        className={`absolute inset-0 bg-gradient-to-br from-muted to-muted/70 transition-opacity duration-500 ${
                          imageState === 'loaded' ? 'opacity-0' : 'opacity-100'
                        }`}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-muted-foreground/10 animate-pulse" />
                        </div>
                      </div>
                      {/* Actual image */}
                      <img 
                        src={item.image_url!} 
                        alt={item.title}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                          imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
                        }`}
                        onLoad={() => handleImageLoad(item.id)}
                        onError={() => handleImageError(item.id)}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-medium text-sm line-clamp-2">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {stripHtml(item.content).substring(0, 150)}...
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatToTimezone(item.created_at, timezone, "dd MMM yyyy")}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* News Detail Modal */}
      {selectedNews && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedNews(null)}
        >
          <div 
            className="bg-card w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <div className="sticky top-0 bg-card z-10 p-4 border-b border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {formatToTimezone(selectedNews.created_at, timezone, "dd MMMM yyyy")}
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open(`/news/${selectedNews.id}`, "_blank")}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Buka
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedNews(null)}>
                  Tutup
                </Button>
              </div>
            </div>

            {/* Cover Image */}
            {selectedNews.image_url && (
              <div className="aspect-video w-full overflow-hidden">
                <img 
                  src={selectedNews.image_url} 
                  alt={selectedNews.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-4 sm:p-6">
              <h2 className="text-xl font-bold mb-4">{selectedNews.title}</h2>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(selectedNews.content, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
                    ALLOW_DATA_ATTR: false
                  })
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
