import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";

type LeaveRequest = Tables<"leave_requests">;

interface LeaveRequestStats {
  pending: number;
  approved: number;
  rejected: number;
}

export function useLeaveRequests(employeeId: string | null) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<LeaveRequestStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLeaveRequests = useCallback(async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setLeaveRequests(data || []);

      // Calculate stats
      const newStats = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      data?.forEach((request) => {
        if (request.status === "menunggu") newStats.pending++;
        else if (request.status === "disetujui") newStats.approved++;
        else if (request.status === "ditolak") newStats.rejected++;
      });

      setStats(newStats);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchLeaveRequests();
  }, [fetchLeaveRequests]);

  const createLeaveRequest = async (data: {
    leave_type: Enums<"leave_type">;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
    attachment_url?: string;
  }): Promise<{ success: boolean; message: string }> => {
    if (!employeeId) {
      return { success: false, message: "Data pegawai tidak ditemukan" };
    }

    try {
      setIsSubmitting(true);

      const requestData: TablesInsert<"leave_requests"> = {
        employee_id: employeeId,
        leave_type: data.leave_type,
        start_date: data.start_date,
        end_date: data.end_date,
        reason: data.reason,
        is_half_day: data.is_half_day || false,
        attachment_url: data.attachment_url,
        status: "menunggu",
      };

      const { error } = await supabase
        .from("leave_requests")
        .insert(requestData);

      if (error) throw error;

      await fetchLeaveRequests();

      return { success: true, message: "Pengajuan berhasil dikirim" };
    } catch (error) {
      console.error("Error creating leave request:", error);
      return { success: false, message: "Gagal mengirim pengajuan" };
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelLeaveRequest = async (
    requestId: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      setIsSubmitting(true);

      // Can only cancel pending requests
      const request = leaveRequests.find((r) => r.id === requestId);
      if (!request) {
        return { success: false, message: "Pengajuan tidak ditemukan" };
      }

      if (request.status !== "menunggu") {
        return { success: false, message: "Hanya dapat membatalkan pengajuan yang masih menunggu" };
      }

      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "ditolak" as Enums<"request_status"> })
        .eq("id", requestId);

      if (error) throw error;

      await fetchLeaveRequests();

      return { success: true, message: "Pengajuan dibatalkan" };
    } catch (error) {
      console.error("Error canceling leave request:", error);
      return { success: false, message: "Gagal membatalkan pengajuan" };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    leaveRequests,
    stats,
    isLoading,
    isSubmitting,
    createLeaveRequest,
    cancelLeaveRequest,
    refetch: fetchLeaveRequests,
  };
}
