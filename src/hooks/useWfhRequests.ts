import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WfhRequest {
  id: string;
  employee_id: string;
  request_date: string;
  reason: string;
  status: "menunggu" | "disetujui" | "ditolak";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  employees?: {
    name: string;
    nip: string | null;
    opd?: {
      name: string;
      code: string;
    } | null;
  };
}

interface WfhStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  thisMonth: number;
}

export function useWfhRequests(employeeId: string | null, isAdmin: boolean = false, tenantId?: string | null) {
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [stats, setStats] = useState<WfhStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    thisMonth: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!employeeId && !isAdmin) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      let query = supabase
        .from("wfh_requests")
        .select("*, employees!wfh_requests_employee_id_fkey(name, nip, opd(name, code))")
        .order("created_at", { ascending: false });

      if (!isAdmin && employeeId) {
        query = query.eq("employee_id", employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRequests((data as WfhRequest[]) || []);

      // Calculate stats
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const filteredData = data || [];
      setStats({
        total: filteredData.length,
        pending: filteredData.filter((r) => r.status === "menunggu").length,
        approved: filteredData.filter((r) => r.status === "disetujui").length,
        rejected: filteredData.filter((r) => r.status === "ditolak").length,
        thisMonth: filteredData.filter((r) => {
          const requestDate = new Date(r.request_date);
          return requestDate.getMonth() === currentMonth && requestDate.getFullYear() === currentYear && r.status === "disetujui";
        }).length,
      });
    } catch (err) {
      console.error("Error fetching WFH requests:", err);
      toast.error("Gagal memuat pengajuan WFH");
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, isAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const createRequest = async (requestDates: string[], reason: string) => {
    if (!employeeId) return false;

    try {
      // Check for existing requests
      const { data: existing } = await supabase
        .from("wfh_requests")
        .select("request_date")
        .eq("employee_id", employeeId)
        .in("request_date", requestDates);

      const existingDates = existing?.map(e => e.request_date) || [];
      const newDates = requestDates.filter(d => !existingDates.includes(d));

      if (newDates.length === 0) {
        toast.error("Semua tanggal sudah pernah diajukan");
        return false;
      }

      if (existingDates.length > 0) {
        toast.warning(`${existingDates.length} tanggal sudah ada, mengajukan ${newDates.length} tanggal baru`);
      }

      const insertData = newDates.map(date => ({
        employee_id: employeeId,
        request_date: date,
        reason,
      }));

      const { error } = await supabase
        .from("wfh_requests")
        .insert(insertData);

      if (error) throw error;

      toast.success(`${newDates.length} pengajuan WFH berhasil dikirim`);
      fetchRequests();
      return true;
    } catch (err) {
      console.error("Error creating WFH request:", err);
      toast.error("Gagal mengirim pengajuan WFH");
      return false;
    }
  };

  const approveRequest = async (requestId: string, approverId: string) => {
    try {
      const { error } = await supabase
        .from("wfh_requests")
        .update({
          status: "disetujui",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      toast.success("Pengajuan WFH disetujui");
      fetchRequests();
      return true;
    } catch (err) {
      console.error("Error approving WFH request:", err);
      toast.error("Gagal menyetujui pengajuan");
      return false;
    }
  };

  const rejectRequest = async (requestId: string, approverId: string, rejectionReason: string) => {
    try {
      const { error } = await supabase
        .from("wfh_requests")
        .update({
          status: "ditolak",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", requestId);

      if (error) throw error;

      toast.success("Pengajuan WFH ditolak");
      fetchRequests();
      return true;
    } catch (err) {
      console.error("Error rejecting WFH request:", err);
      toast.error("Gagal menolak pengajuan");
      return false;
    }
  };

  return {
    requests,
    stats,
    isLoading,
    refetch: fetchRequests,
    createRequest,
    approveRequest,
    rejectRequest,
  };
}
