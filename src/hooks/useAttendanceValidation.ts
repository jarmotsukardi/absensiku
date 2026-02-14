import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setDynamicPeakWindowsFromWorkHours } from "@/lib/attendanceResilience";

interface WorkHour {
  day_of_week: number;
  time_in: string;
  time_out: string;
  institution_type: string;
  is_active: boolean;
}

interface SecuritySettings {
  detect_fake_gps: boolean;
  detect_mock_location: boolean;
  detect_developer_options: boolean;
  require_official_apk: boolean;
  block_desktop_browser: boolean;
  block_virtualization: boolean;
  require_realtime_location: boolean;
  block_vpn: boolean;
  enable_device_binding: boolean;
  max_device_reset_count: number;
  require_password_change_for_reset: boolean;
}

interface ValidationResult {
  canAttend: boolean;
  reason: string | null;
  isHoliday: boolean;
  holidayName: string | null;
  isWorkDay: boolean;
  workHour: WorkHour | null;
  isLate: boolean;
  lateMinutes: number;
}

interface ValidationStaticCache {
  tenantId: string;
  institutionType: string;
  date: string;
  cachedAt: string;
  expiresAt: string;
  canAttend: boolean;
  reason: string | null;
  isHoliday: boolean;
  holidayName: string | null;
  isWorkDay: boolean;
  workHour: WorkHour | null;
}

const VALIDATION_CACHE_PREFIX = "attendance_validation_today_v1";
const VALIDATION_CACHE_TTL_MS = 10 * 60 * 1000;

function getCacheKey(tenantId: string, institutionType: string, date: string) {
  return `${VALIDATION_CACHE_PREFIX}:${tenantId}:${institutionType}:${date}`;
}

function loadValidationCache(key: string): ValidationStaticCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ValidationStaticCache;
    if (!parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveValidationCache(key: string, payload: Omit<ValidationStaticCache, "cachedAt" | "expiresAt">) {
  try {
    const data: ValidationStaticCache = {
      ...payload,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + VALIDATION_CACHE_TTL_MS).toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    return;
  }
}

export function useAttendanceValidation(
  tenantId: string | null,
  employeeId: string | null,
  institutionType: string = "pemerintahan"
) {
  const [isLoading, setIsLoading] = useState(true);
  const [workHours, setWorkHours] = useState<WorkHour[]>([]);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [validation, setValidation] = useState<ValidationResult>({
    canAttend: false,
    reason: null,
    isHoliday: false,
    holidayName: null,
    isWorkDay: false,
    workHour: null,
    isLate: false,
    lateMinutes: 0,
  });

  const resolveWorkHourToday = useCallback((dayOfWeek: number): WorkHour | null => {
    return (
      workHours.find(
        wh => wh.day_of_week === dayOfWeek &&
        (wh.institution_type === institutionType || wh.institution_type === "all")
      ) || null
    );
  }, [workHours, institutionType]);

  const buildRuntimeResult = useCallback((
    base: Omit<ValidationResult, "isLate" | "lateMinutes">,
    now: Date,
  ): ValidationResult => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const result: ValidationResult = {
      ...base,
      isLate: false,
      lateMinutes: 0,
    };

    if (!base.canAttend || !base.workHour) return result;

    const [inHours, inMinutes] = base.workHour.time_in.split(":").map(Number);
    const scheduledIn = inHours * 60 + inMinutes;
    const tolerance = (base.workHour as any).late_tolerance_minutes ?? 0;

    if (currentMinutes > scheduledIn + tolerance) {
      result.isLate = true;
      result.lateMinutes = currentMinutes - scheduledIn;
    }

    return result;
  }, []);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch work hours dan security settings secara paralel
      const [workHoursRes, securityRes] = await Promise.all([
        supabase
          .from("work_hours")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("is_active", true),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "attendance_security")
          .maybeSingle(),
      ]);

      if (workHoursRes.data) {
        setWorkHours(workHoursRes.data);
        setDynamicPeakWindowsFromWorkHours(workHoursRes.data);
      }

      if (securityRes.data?.value && typeof securityRes.data.value === 'object') {
        setSecuritySettings(securityRes.data.value as unknown as SecuritySettings);
      }
    } catch (error) {
      console.error("Error fetching attendance validation data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Validasi hari ini
  const validateToday = useCallback(async (): Promise<ValidationResult> => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const today = now.toISOString().split("T")[0];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate().toString().padStart(2, "0");

    // Default result
    const result: ValidationResult = {
      canAttend: false,
      reason: null,
      isHoliday: false,
      holidayName: null,
      isWorkDay: false,
      workHour: null,
      isLate: false,
      lateMinutes: 0,
    };

    if (!tenantId) {
      return {
        ...result,
        canAttend: false,
        reason: "Tenant tidak ditemukan",
      };
    }

    const cacheKey = getCacheKey(tenantId, institutionType, today);
    const cached = loadValidationCache(cacheKey);
    if (cached) {
      return buildRuntimeResult({
        canAttend: cached.canAttend,
        reason: cached.reason,
        isHoliday: cached.isHoliday,
        holidayName: cached.holidayName,
        isWorkDay: cached.isWorkDay,
        workHour: cached.workHour,
      }, now);
    }

    // 1. Cek hari Sabtu/Minggu (weekend default libur)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const weekendName = dayOfWeek === 0 ? "Hari Minggu" : "Hari Sabtu";
      
      // Cek apakah ada jam kerja untuk hari ini (beberapa instansi mungkin bekerja Sabtu)
      const workHourToday = resolveWorkHourToday(dayOfWeek);
      
      if (!workHourToday) {
        const staticResult = {
          ...result,
          canAttend: false,
          reason: `Tidak dapat absen pada ${weekendName}. Bukan hari kerja.`,
          isHoliday: true,
          holidayName: weekendName,
          isWorkDay: false,
        };
        saveValidationCache(cacheKey, {
          tenantId,
          institutionType,
          date: today,
          canAttend: staticResult.canAttend,
          reason: staticResult.reason,
          isHoliday: staticResult.isHoliday,
          holidayName: staticResult.holidayName,
          isWorkDay: staticResult.isWorkDay,
          workHour: staticResult.workHour,
        });
        return staticResult;
      }
    }

    // 2. Cek jam kerja untuk hari ini
    const workHourToday = resolveWorkHourToday(dayOfWeek);

    if (!workHourToday) {
      const staticResult = {
        ...result,
        canAttend: false,
        reason: "Tidak ada jadwal kerja untuk hari ini.",
        isWorkDay: false,
      };
      saveValidationCache(cacheKey, {
        tenantId,
        institutionType,
        date: today,
        canAttend: staticResult.canAttend,
        reason: staticResult.reason,
        isHoliday: staticResult.isHoliday,
        holidayName: staticResult.holidayName,
        isWorkDay: staticResult.isWorkDay,
        workHour: staticResult.workHour,
      });
      return staticResult;
    }

    result.workHour = workHourToday;
    result.isWorkDay = true;

    // 3. Cek libur nasional
    try {
      const { data: nationalHoliday } = await supabase
        .from("national_holidays")
        .select("name")
        .eq("date", today)
        .eq("is_active", true)
        .maybeSingle();

      if (nationalHoliday) {
        const staticResult = {
          ...result,
          canAttend: false,
          reason: `Hari ini libur nasional: ${nationalHoliday.name}`,
          isHoliday: true,
          holidayName: nationalHoliday.name,
        };
        saveValidationCache(cacheKey, {
          tenantId,
          institutionType,
          date: today,
          canAttend: staticResult.canAttend,
          reason: staticResult.reason,
          isHoliday: staticResult.isHoliday,
          holidayName: staticResult.holidayName,
          isWorkDay: staticResult.isWorkDay,
          workHour: staticResult.workHour,
        });
        return staticResult;
      }

      // 4. Cek work_holidays (libur tenant)
      const { data: workHolidays } = await supabase
        .from("work_holidays")
        .select("dates, description")
        .eq("tenant_id", tenantId)
        .eq("year", year)
        .eq("month", month);

      if (workHolidays && workHolidays.length > 0) {
        for (const holiday of workHolidays) {
          const dates = holiday.dates.split(",").map((d: string) => d.trim().padStart(2, "0"));
          if (dates.includes(day)) {
            const staticResult = {
              ...result,
              canAttend: false,
              reason: `Hari ini libur: ${holiday.description || "Hari Libur Kerja"}`,
              isHoliday: true,
              holidayName: holiday.description || "Hari Libur Kerja",
            };
            saveValidationCache(cacheKey, {
              tenantId,
              institutionType,
              date: today,
              canAttend: staticResult.canAttend,
              reason: staticResult.reason,
              isHoliday: staticResult.isHoliday,
              holidayName: staticResult.holidayName,
              isWorkDay: staticResult.isWorkDay,
              workHour: staticResult.workHour,
            });
            return staticResult;
          }
        }
      }
    } catch (error) {
      console.error("Error checking holidays:", error);
    }

    // Boleh absen
    result.canAttend = true;
    saveValidationCache(cacheKey, {
      tenantId,
      institutionType,
      date: today,
      canAttend: result.canAttend,
      reason: result.reason,
      isHoliday: result.isHoliday,
      holidayName: result.holidayName,
      isWorkDay: result.isWorkDay,
      workHour: result.workHour,
    });

    return buildRuntimeResult({
      canAttend: result.canAttend,
      reason: result.reason,
      isHoliday: result.isHoliday,
      holidayName: result.holidayName,
      isWorkDay: result.isWorkDay,
      workHour: result.workHour,
    }, now);
  }, [tenantId, institutionType, resolveWorkHourToday, buildRuntimeResult]);

  // Calculate attendance status - FIXED: toleransi dari database, default 0
  const calculateStatus = useCallback((checkInTime: Date, workHour: WorkHour | null): "hadir" | "terlambat" => {
    if (!workHour) return "hadir";

    const [inHours, inMinutes] = workHour.time_in.split(":").map(Number);
    const scheduledIn = inHours * 60 + inMinutes;
    const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    // Toleransi dari database, default 0 menit (strict)
    const tolerance = (workHour as any).late_tolerance_minutes ?? 0;

    return checkInMinutes > scheduledIn + tolerance ? "terlambat" : "hadir";
  }, []);

  const calculateCheckoutStatus = useCallback((
    checkOutTime: Date, 
    currentStatus: string, 
    workHour: WorkHour | null
  ): string => {
    if (!workHour) return currentStatus;

    const [outHours, outMinutes] = workHour.time_out.split(":").map(Number);
    const scheduledOut = outHours * 60 + outMinutes;
    const checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();

    const isEarlyLeave = checkOutMinutes < scheduledOut - 15;

    if (isEarlyLeave) {
      if (currentStatus === "terlambat") {
        return "terlambat_pulang_cepat";
      }
      return "pulang_cepat";
    }

    return currentStatus;
  }, []);

  return {
    isLoading,
    workHours,
    securitySettings,
    validation,
    validateToday,
    calculateStatus,
    calculateCheckoutStatus,
    refetch: fetchData,
  };
}
