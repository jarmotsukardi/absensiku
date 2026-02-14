import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ApprovedFlexibleRequest {
  id: string;
  request_date: string;
  reason_type: string;
  reason: string;
}

export function useFlexibleAttendanceApproval(employeeId: string | null) {
  const [approvedRequest, setApprovedRequest] = useState<ApprovedFlexibleRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkApprovalForToday = useCallback(async () => {
    if (!employeeId) return null;

    setIsLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      
      const { data, error } = await supabase
        .from("flexible_attendance_requests")
        .select("id, request_date, reason_type, reason")
        .eq("employee_id", employeeId)
        .eq("request_date", today)
        .eq("status", "disetujui")
        .maybeSingle();

      if (error) throw error;
      
      setApprovedRequest(data);
      return data;
    } catch (error) {
      console.error("Error checking flexible attendance approval:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    checkApprovalForToday();
  }, [checkApprovalForToday]);

  return {
    approvedRequest,
    isLoading,
    checkApprovalForToday,
    hasApprovalForToday: !!approvedRequest,
  };
}
