import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/errorLogger";
import { toWorkDayOfWeek } from "@/lib/workday";

interface HolidayInfo {
  isHoliday: boolean;
  holidayName: string | null;
  holidaySource: "work_holiday" | "national_holiday" | null;
}

export function useHolidayCheck(tenantId: string | null, date?: Date) {
  const [holidayInfo, setHolidayInfo] = useState<HolidayInfo>({
    isHoliday: false,
    holidayName: null,
    holidaySource: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkHoliday = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    const checkDate = date || new Date();
    const year = checkDate.getFullYear();
    const month = checkDate.getMonth() + 1;
    const day = checkDate.getDate().toString().padStart(2, "0");
    const dateStr = checkDate.toISOString().split("T")[0];
    const dayOfWeek = toWorkDayOfWeek(checkDate); // 1 = Monday, 7 = Sunday

    try {
      setIsLoading(true);

      // Check apakah hari ini termasuk hari kerja tenant
      const { data: workHourToday } = await supabase
        .from("work_hours")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!workHourToday) {
        setHolidayInfo({
          isHoliday: true,
          holidayName: "Bukan hari kerja",
          holidaySource: null,
        });
        setIsLoading(false);
        return;
      }

      // Check work_holidays for this tenant
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
            setHolidayInfo({
              isHoliday: true,
              holidayName: holiday.description || "Hari Libur Kerja",
              holidaySource: "work_holiday",
            });
            setIsLoading(false);
            return;
          }
        }
      }

      // Check national_holidays
      const { data: nationalHolidays } = await supabase
        .from("national_holidays")
        .select("name")
        .eq("date", dateStr)
        .eq("is_active", true)
        .maybeSingle();

      if (nationalHolidays) {
        setHolidayInfo({
          isHoliday: true,
          holidayName: nationalHolidays.name,
          holidaySource: "national_holiday",
        });
        setIsLoading(false);
        return;
      }

      // Check holidays table (legacy)
      const { data: legacyHoliday } = await supabase
        .from("holidays")
        .select("name")
        .eq("date", dateStr)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .maybeSingle();

      if (legacyHoliday) {
        setHolidayInfo({
          isHoliday: true,
          holidayName: legacyHoliday.name,
          holidaySource: "national_holiday",
        });
        setIsLoading(false);
        return;
      }

      // Not a holiday
      setHolidayInfo({
        isHoliday: false,
        holidayName: null,
        holidaySource: null,
      });
    } catch (err) {
      const errorRef = reportError(err, "holiday.check", {
        tenant_id: tenantId,
        date: dateStr,
      });
      console.error(`[HolidayCheck ${errorRef}] Error checking holiday:`, err);
      setHolidayInfo({
        isHoliday: false,
        holidayName: null,
        holidaySource: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, date]);

  useEffect(() => {
    checkHoliday();
  }, [checkHoliday]);

  return {
    ...holidayInfo,
    isLoading,
    refetch: checkHoliday,
  };
}
