import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkShift {
  id: string;
  tenant_id: string;
  work_unit_id: string | null;
  shift_name: string;
  shift_order: number;
  time_start: string;
  time_end: string;
  tolerance_minutes: number;
  is_active: boolean;
  description: string | null;
}

interface WorkUnitShiftConfig {
  enable_auto_shift: boolean;
  auto_shift_tolerance_minutes: number;
}

// Helper: Convert time string to minutes
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

// Helper: Get current time in minutes
const getCurrentTimeMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

export function useWorkShifts(tenantId: string | undefined, workUnitId: string | undefined) {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [workUnitConfig, setWorkUnitConfig] = useState<WorkUnitShiftConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      // Fetch shifts untuk satuan kerja atau general tenant
      const { data: shiftsData, error: shiftsError } = await supabase
        .from("work_shifts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .or(workUnitId ? `work_unit_id.eq.${workUnitId},work_unit_id.is.null` : "work_unit_id.is.null")
        .order("shift_order", { ascending: true });

      if (!shiftsError && shiftsData) {
        setShifts(shiftsData as WorkShift[]);
      }

      // Fetch work unit config jika ada
      if (workUnitId) {
        const { data: workUnitData, error: workUnitError } = await supabase
          .from("work_units")
          .select("enable_auto_shift, auto_shift_tolerance_minutes")
          .eq("id", workUnitId)
          .maybeSingle();

        if (!workUnitError && workUnitData) {
          setWorkUnitConfig(workUnitData as WorkUnitShiftConfig);
        }
      }
    } catch (error) {
      console.error("Error fetching work shifts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, workUnitId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cek apakah auto-shift aktif untuk satuan kerja ini
  const isAutoShiftEnabled = useMemo(() => {
    return workUnitConfig?.enable_auto_shift || false;
  }, [workUnitConfig]);

  // Tentukan shift saat ini berdasarkan waktu
  const getCurrentShift = useCallback((): WorkShift | null => {
    if (shifts.length === 0) return null;

    const currentMinutes = getCurrentTimeMinutes();
    
    // Cari shift yang sesuai dengan waktu saat ini
    for (const shift of shifts) {
      const startMinutes = timeToMinutes(shift.time_start);
      const endMinutes = timeToMinutes(shift.time_end);
      const tolerance = shift.tolerance_minutes || 0;

      // Handle overnight shifts (misal: 22:00 - 06:00)
      if (endMinutes < startMinutes) {
        // Overnight shift
        if (currentMinutes >= (startMinutes - tolerance) || currentMinutes <= endMinutes) {
          return shift;
        }
      } else {
        // Normal shift
        if (currentMinutes >= (startMinutes - tolerance) && currentMinutes <= endMinutes) {
          return shift;
        }
      }
    }

    return null;
  }, [shifts]);

  // Tentukan shift berikutnya
  const getNextShift = useCallback((currentShiftOrder: number): WorkShift | null => {
    const nextShift = shifts.find(s => s.shift_order > currentShiftOrder);
    return nextShift || null;
  }, [shifts]);

  // Cek apakah user melewati waktu shift tertentu
  const hasPassedShiftTime = useCallback((shift: WorkShift): boolean => {
    const currentMinutes = getCurrentTimeMinutes();
    const startMinutes = timeToMinutes(shift.time_start);
    const tolerance = workUnitConfig?.auto_shift_tolerance_minutes || shift.tolerance_minutes || 30;

    return currentMinutes > (startMinutes + tolerance);
  }, [workUnitConfig]);

  // Dapatkan shift yang tersedia untuk dipilih (berdasarkan waktu saat ini)
  const getAvailableShifts = useCallback((): WorkShift[] => {
    if (!isAutoShiftEnabled) return shifts;

    const currentMinutes = getCurrentTimeMinutes();
    const toleranceMinutes = workUnitConfig?.auto_shift_tolerance_minutes || 30;

    return shifts.filter(shift => {
      const startMinutes = timeToMinutes(shift.time_start);
      const endMinutes = timeToMinutes(shift.time_end);

      // Handle overnight shifts
      if (endMinutes < startMinutes) {
        return currentMinutes >= (startMinutes - toleranceMinutes) || currentMinutes <= endMinutes;
      }

      // Shift masih tersedia jika waktu sekarang belum melewati batas akhir
      return currentMinutes <= endMinutes;
    });
  }, [shifts, isAutoShiftEnabled, workUnitConfig]);

  // Tentukan apakah perlu menampilkan popup konfirmasi shift
  const needsShiftConfirmation = useCallback((): { needed: boolean; missedShift: WorkShift | null; availableShifts: WorkShift[] } => {
    if (!isAutoShiftEnabled || shifts.length <= 1) {
      return { needed: false, missedShift: null, availableShifts: [] };
    }

    const currentMinutes = getCurrentTimeMinutes();
    const toleranceMinutes = workUnitConfig?.auto_shift_tolerance_minutes || 30;

    // Cek shift pertama (shift 1)
    const firstShift = shifts.find(s => s.shift_order === 1);
    if (!firstShift) {
      return { needed: false, missedShift: null, availableShifts: [] };
    }

    const firstShiftStart = timeToMinutes(firstShift.time_start);
    const firstShiftEnd = timeToMinutes(firstShift.time_end);

    // Jika waktu sudah melewati shift 1 + toleransi
    if (currentMinutes > (firstShiftStart + toleranceMinutes) && currentMinutes > firstShiftEnd) {
      const availableShifts = getAvailableShifts();
      if (availableShifts.length > 0) {
        return { needed: true, missedShift: firstShift, availableShifts };
      }
    }

    return { needed: false, missedShift: null, availableShifts: [] };
  }, [shifts, isAutoShiftEnabled, workUnitConfig, getAvailableShifts]);

  return {
    shifts,
    isLoading,
    isAutoShiftEnabled,
    workUnitConfig,
    getCurrentShift,
    getNextShift,
    hasPassedShiftTime,
    getAvailableShifts,
    needsShiftConfirmation,
    refetch: fetchData,
  };
}
