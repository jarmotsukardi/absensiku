import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface WorkHoursInfo {
  time_in: string;
  time_out: string;
  day_of_week: number;
  institution_type: string;
}

// Konversi waktu HH:mm:ss ke menit dari midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

// Get day of week dari date (0 = Sunday, 1 = Monday, dst)
const getDayOfWeek = (dateStr: string): number => {
  return new Date(dateStr).getDay();
};

export interface AttendanceKeterangan {
  status: string; // Hadir, Izin, Cuti, Sakit, Tugas Luar, Tidak Hadir
  keterangan: string; // Hadir, Telat, Pulang Cepat, Telat + Pulang Cepat, Tidak Absen Pulang
}

// Fungsi untuk menghitung keterangan berdasarkan jam kerja
export const calculateKeterangan = (
  record: {
    date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: string | null;
  },
  workHours: WorkHoursInfo | null,
  tenantTimezone: string = "Asia/Jakarta"
): AttendanceKeterangan => {
  const hasCheckIn = !!record.check_in_time;
  const hasCheckOut = !!record.check_out_time;
  const recordStatus = record.status;

  // Jika tidak ada check in → bukan hadir
  if (!hasCheckIn) {
    if (recordStatus === "izin") return { status: "Izin", keterangan: "-" };
    if (recordStatus === "cuti") return { status: "Cuti", keterangan: "-" };
    if (recordStatus === "sakit") return { status: "Sakit", keterangan: "-" };
    if (recordStatus === "tugas_luar") return { status: "Tugas Luar", keterangan: "-" };
    return { status: "Tidak Hadir", keterangan: "-" };
  }

  // Ada check in = Hadir
  const status = "Hadir";

  // Jika tidak ada jam kerja, gunakan status dari database
  if (!workHours) {
    if (hasCheckIn && !hasCheckOut) {
      if (recordStatus === "terlambat") return { status, keterangan: "Telat (Belum Pulang)" };
      return { status, keterangan: "Tidak Absen Pulang" };
    }
    
    if (recordStatus === "terlambat_pulang_cepat") return { status, keterangan: "Telat + Pulang Cepat" };
    if (recordStatus === "terlambat") return { status, keterangan: "Telat" };
    if (recordStatus === "pulang_cepat") return { status, keterangan: "Pulang Cepat" };
    return { status, keterangan: "Hadir" };
  }

  // Kalkulasi berdasarkan jam kerja
  const scheduledTimeIn = timeToMinutes(workHours.time_in);
  const scheduledTimeOut = timeToMinutes(workHours.time_out);

  // Parse waktu check in dalam timezone
  const checkInDate = new Date(record.check_in_time!);
  const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
  
  // Toleransi 15 menit untuk telat
  const isLate = checkInMinutes > scheduledTimeIn + 15;

  // Jika belum check out
  if (!hasCheckOut) {
    if (isLate) return { status, keterangan: "Telat (Belum Pulang)" };
    return { status, keterangan: "Tidak Absen Pulang" };
  }

  // Parse waktu check out
  const checkOutDate = new Date(record.check_out_time!);
  const checkOutMinutes = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
  
  // Pulang cepat jika kurang dari jadwal (toleransi 15 menit sebelum)
  const isEarlyLeave = checkOutMinutes < scheduledTimeOut - 15;

  // Kombinasi status
  if (isLate && isEarlyLeave) return { status, keterangan: "Telat + Pulang Cepat" };
  if (isLate) return { status, keterangan: "Telat" };
  if (isEarlyLeave) return { status, keterangan: "Pulang Cepat" };
  return { status, keterangan: "Hadir" };
};

// Hook untuk mengambil work hours berdasarkan tenant
export function useWorkHours(tenantId: string | undefined, institutionType: string = "pemerintahan") {
  const [workHours, setWorkHours] = useState<WorkHoursInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    const fetchWorkHours = async () => {
      try {
        const { data } = await supabase
          .from("work_hours")
          .select("time_in, time_out, day_of_week, institution_type")
          .eq("tenant_id", tenantId)
          .eq("institution_type", institutionType)
          .eq("is_active", true);

        setWorkHours(data || []);
      } catch (error) {
        console.error("Error fetching work hours:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkHours();
  }, [tenantId, institutionType]);

  // Helper untuk mendapatkan jam kerja berdasarkan hari
  const getWorkHoursForDate = (dateStr: string): WorkHoursInfo | null => {
    const dayOfWeek = getDayOfWeek(dateStr);
    return workHours.find(wh => wh.day_of_week === dayOfWeek) || null;
  };

  return { workHours, isLoading, getWorkHoursForDate };
}
