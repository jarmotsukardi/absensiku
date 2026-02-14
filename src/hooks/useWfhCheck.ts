import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface WfhCheckResult {
  isWfhAllowed: boolean;
  wfhSource: "schedule" | "request" | "setting" | null;
  wfhDescription: string | null;
}

export function useWfhCheck(
  tenantId: string | null,
  employeeId: string | null,
  opdId: string | null,
  workUnitId: string | null,
  date?: Date
) {
  const [result, setResult] = useState<WfhCheckResult>({
    isWfhAllowed: false,
    wfhSource: null,
    wfhDescription: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkWfh = useCallback(async () => {
    if (!tenantId || !employeeId) {
      setIsLoading(false);
      return;
    }

    const checkDate = date || new Date();
    const dateStr = checkDate.toISOString().split("T")[0];
    const dayOfWeek = checkDate.getDay();

    try {
      setIsLoading(true);

      // 1. Check if there's an approved WFH request for this date
      const { data: approvedRequest } = await supabase
        .from("wfh_requests")
        .select("id, reason")
        .eq("employee_id", employeeId)
        .eq("request_date", dateStr)
        .eq("status", "disetujui")
        .maybeSingle();

      if (approvedRequest) {
        setResult({
          isWfhAllowed: true,
          wfhSource: "request",
          wfhDescription: approvedRequest.reason,
        });
        setIsLoading(false);
        return;
      }

      // 2. Check WFH schedules (employee specific first)
      const { data: employeeSchedule } = await supabase
        .from("wfh_schedules")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .or(`specific_date.eq.${dateStr},and(is_recurring.eq.true,day_of_week.eq.${dayOfWeek}),and(start_date.lte.${dateStr},end_date.gte.${dateStr})`)
        .maybeSingle();

      if (employeeSchedule) {
        setResult({
          isWfhAllowed: true,
          wfhSource: "schedule",
          wfhDescription: employeeSchedule.description || "Jadwal WFH personal",
        });
        setIsLoading(false);
        return;
      }

      // 3. Check work unit WFH schedule
      if (workUnitId) {
        const { data: unitSchedule } = await supabase
          .from("wfh_schedules")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("work_unit_id", workUnitId)
          .is("employee_id", null)
          .eq("is_active", true)
          .or(`specific_date.eq.${dateStr},and(is_recurring.eq.true,day_of_week.eq.${dayOfWeek}),and(start_date.lte.${dateStr},end_date.gte.${dateStr})`)
          .maybeSingle();

        if (unitSchedule) {
          setResult({
            isWfhAllowed: true,
            wfhSource: "schedule",
            wfhDescription: unitSchedule.description || "Jadwal WFH satuan kerja",
          });
          setIsLoading(false);
          return;
        }
      }

      // 4. Check OPD WFH schedule
      if (opdId) {
        const { data: opdSchedule } = await supabase
          .from("wfh_schedules")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("opd_id", opdId)
          .is("work_unit_id", null)
          .is("employee_id", null)
          .eq("is_active", true)
          .or(`specific_date.eq.${dateStr},and(is_recurring.eq.true,day_of_week.eq.${dayOfWeek}),and(start_date.lte.${dateStr},end_date.gte.${dateStr})`)
          .maybeSingle();

        if (opdSchedule) {
          setResult({
            isWfhAllowed: true,
            wfhSource: "schedule",
            wfhDescription: opdSchedule.description || "Jadwal WFH OPD",
          });
          setIsLoading(false);
          return;
        }
      }

      // 5. Check organization-wide WFH schedule
      const { data: orgSchedule } = await supabase
        .from("wfh_schedules")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("opd_id", null)
        .is("work_unit_id", null)
        .is("employee_id", null)
        .eq("is_active", true)
        .or(`specific_date.eq.${dateStr},and(is_recurring.eq.true,day_of_week.eq.${dayOfWeek}),and(start_date.lte.${dateStr},end_date.gte.${dateStr})`)
        .maybeSingle();

      if (orgSchedule) {
        setResult({
          isWfhAllowed: true,
          wfhSource: "schedule",
          wfhDescription: orgSchedule.description || "Jadwal WFH organisasi",
        });
        setIsLoading(false);
        return;
      }

      // 6. Check organization setting (global allow WFH)
      const { data: settings } = await supabase
        .from("organization_settings")
        .select("setting_key, setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "allow_wfh")
        .maybeSingle();

      if (settings && (settings.setting_value === true || settings.setting_value === "true")) {
        setResult({
          isWfhAllowed: true,
          wfhSource: "setting",
          wfhDescription: "WFH diizinkan oleh organisasi",
        });
        setIsLoading(false);
        return;
      }

      // No WFH allowed
      setResult({
        isWfhAllowed: false,
        wfhSource: null,
        wfhDescription: null,
      });
    } catch (err) {
      console.error("Error checking WFH:", err);
      setResult({
        isWfhAllowed: false,
        wfhSource: null,
        wfhDescription: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, employeeId, opdId, workUnitId, date]);

  useEffect(() => {
    checkWfh();
  }, [checkWfh]);

  return {
    ...result,
    isLoading,
    refetch: checkWfh,
  };
}
