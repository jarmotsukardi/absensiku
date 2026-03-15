import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";
import { fetchTenantApprovalWorkflow, getRequiredApprovalLevels } from "@/lib/hrApprovalWorkflow";
import { fetchTenantHrLeaveTypes } from "@/lib/hrLeaveTypes";

type LeaveRequest = Tables<"leave_requests">;

interface LeaveRequestStats {
  pending: number;
  approved: number;
  rejected: number;
}

export function useLeaveRequests(employeeId: string | null, tenantId?: string | null) {
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
    leave_type_id?: string;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
    document_reference_number?: string;
    document_reference_date?: string;
    document_reference_issuer?: string;
    document_reference_notes?: string;
  }): Promise<{ success: boolean; message: string }> => {
    if (!employeeId) {
      return { success: false, message: "Data pegawai tidak ditemukan" };
    }

    try {
      setIsSubmitting(true);
      let selectedLeaveApprovalTypeCode = "LEAVE";

      if (tenantId && data.leave_type_id) {
        const leaveTypes = await fetchTenantHrLeaveTypes(tenantId, false);
        const selectedLeaveType = leaveTypes.find((item) => item.id === data.leave_type_id && item.is_active);
        if (!selectedLeaveType) {
          return { success: false, message: "Jenis cuti HR untuk tenant aktif tidak ditemukan atau tidak aktif" };
        }

        if (selectedLeaveType.request_type !== data.leave_type) {
          return { success: false, message: "Jenis cuti HR tidak sinkron dengan kategori absensi" };
        }

        if (selectedLeaveType.requires_document && !data.document_reference_number?.trim()) {
          return { success: false, message: "Nomor dokumen rujukan wajib diisi untuk jenis pengajuan ini" };
        }

        const startDate = new Date(data.start_date);
        const endDate = new Date(data.end_date);
        const milliseconds = endDate.getTime() - startDate.getTime();
        const requestedDays = Math.max(0.5, milliseconds / (1000 * 60 * 60 * 24) + 1);
        const normalizedRequestedDays = data.is_half_day ? 0.5 : Math.max(1, requestedDays);

        const { data: quotaRow, error: quotaError } = await supabase
          .from("leave_quotas")
          .select("remaining_days")
          .eq("employee_id", employeeId)
          .eq("leave_type_id", data.leave_type_id)
          .eq("quota_year", startDate.getFullYear())
          .maybeSingle();

        if (quotaError) throw quotaError;
        if (quotaRow && Number(quotaRow.remaining_days || 0) < normalizedRequestedDays) {
          return { success: false, message: "Sisa kuota cuti tidak mencukupi untuk pengajuan ini" };
        }

        selectedLeaveApprovalTypeCode = selectedLeaveType.approval_type_code || "LEAVE";
      }

      const approvalTypeCode = selectedLeaveApprovalTypeCode;
      const approvalWorkflow =
        tenantId && approvalTypeCode ? await fetchTenantApprovalWorkflow(tenantId, approvalTypeCode) : null;
      const requiredApprovalLevels = getRequiredApprovalLevels(approvalWorkflow);
      const submittedAt = new Date().toISOString();

      const requestData: TablesInsert<"leave_requests"> & {
        leave_type_id?: string;
        approval_type_code?: string;
        current_approval_level?: number;
        required_approval_levels?: number;
        approval_history?: Array<Record<string, unknown>>;
        document_reference_number?: string | null;
        document_reference_date?: string | null;
        document_reference_issuer?: string | null;
        document_reference_notes?: string | null;
      } = {
        employee_id: employeeId,
        leave_type: data.leave_type,
        start_date: data.start_date,
        end_date: data.end_date,
        reason: data.reason,
        is_half_day: data.is_half_day || false,
        status: "menunggu",
        leave_type_id: data.leave_type_id,
        approval_type_code: approvalTypeCode,
        current_approval_level: 1,
        required_approval_levels: requiredApprovalLevels,
        document_reference_number: data.document_reference_number?.trim() || null,
        document_reference_date: data.document_reference_date || null,
        document_reference_issuer: data.document_reference_issuer?.trim() || null,
        document_reference_notes: data.document_reference_notes?.trim() || null,
        approval_history: [
          {
            action: "submitted",
            at: submittedAt,
            approval_type_code: approvalTypeCode,
            level_order: 1,
            status_after: "menunggu",
          },
        ],
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
