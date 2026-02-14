import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MutationRequest {
  id: string;
  tenant_id: string;
  employee_id: string;
  mutation_type: "profile_change" | "transfer";
  status: "menunggu" | "disetujui" | "ditolak";
  requested_changes: Record<string, any>;
  original_data: Record<string, any>;
  reason: string;
  attachment_url?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  employee?: {
    name: string;
    nik: string;
    nip?: string;
  };
}

interface UseMutationRequestsOptions {
  employeeId?: string;
  tenantId?: string;
  status?: string;
}

export function useMutationRequests(options: UseMutationRequestsOptions = {}) {
  const [requests, setRequests] = useState<MutationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("mutation_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (options.employeeId) {
        query = query.eq("employee_id", options.employeeId);
      }

      if (options.tenantId) {
        query = query.eq("tenant_id", options.tenantId);
      }

      if (options.status) {
        query = query.eq("status", options.status);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch employee data separately for each request
      const requestsWithEmployee = await Promise.all(
        (data || []).map(async (req) => {
          const { data: empData } = await supabase
            .from("employees")
            .select("name, nik, nip")
            .eq("id", req.employee_id)
            .single();
          
          return {
            ...req,
            employee: empData || undefined,
          } as MutationRequest;
        })
      );

      setRequests(requestsWithEmployee);
    } catch (err: any) {
      console.error("Error fetching mutation requests:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [options.employeeId, options.tenantId, options.status]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const createRequest = async (data: {
    tenant_id: string;
    employee_id: string;
    mutation_type: "profile_change" | "transfer";
    requested_changes: Record<string, any>;
    original_data: Record<string, any>;
    reason: string;
    attachment_url?: string;
  }) => {
    try {
      const { error } = await supabase
        .from("mutation_requests")
        .insert(data);

      if (error) throw error;

      toast.success("Pengajuan mutasi berhasil dikirim");
      await fetchRequests();
      return true;
    } catch (err: any) {
      console.error("Error creating mutation request:", err);
      toast.error("Gagal mengajukan mutasi", { description: err.message });
      return false;
    }
  };

  const cancelRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from("mutation_requests")
        .delete()
        .eq("id", requestId)
        .eq("status", "menunggu");

      if (error) throw error;

      toast.success("Pengajuan mutasi dibatalkan");
      await fetchRequests();
      return true;
    } catch (err: any) {
      console.error("Error canceling mutation request:", err);
      toast.error("Gagal membatalkan pengajuan", { description: err.message });
      return false;
    }
  };

  const approveRequest = async (requestId: string, employeeId: string, changes: Record<string, any>) => {
    try {
      // Update status pengajuan
      const { error: updateError } = await supabase
        .from("mutation_requests")
        .update({
          status: "disetujui",
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // Update data karyawan dengan perubahan yang disetujui
      const { error: employeeError } = await supabase
        .from("employees")
        .update(changes)
        .eq("id", employeeId);

      if (employeeError) throw employeeError;

      toast.success("Pengajuan mutasi disetujui");
      await fetchRequests();
      return true;
    } catch (err: any) {
      console.error("Error approving mutation request:", err);
      toast.error("Gagal menyetujui pengajuan", { description: err.message });
      return false;
    }
  };

  const rejectRequest = async (requestId: string, rejectionReason: string) => {
    try {
      const { error } = await supabase
        .from("mutation_requests")
        .update({
          status: "ditolak",
          rejection_reason: rejectionReason,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      toast.success("Pengajuan mutasi ditolak");
      await fetchRequests();
      return true;
    } catch (err: any) {
      console.error("Error rejecting mutation request:", err);
      toast.error("Gagal menolak pengajuan", { description: err.message });
      return false;
    }
  };

  return {
    requests,
    isLoading,
    error,
    refetch: fetchRequests,
    createRequest,
    cancelRequest,
    approveRequest,
    rejectRequest,
  };
}
