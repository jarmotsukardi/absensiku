import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";
 
export interface OvertimeRequest {
   id: string;
   employee_id: string;
   tenant_id: string;
   request_number: string;
   total_hours: number;
   reason: string;
   status: "pending" | "approved" | "rejected" | "cancelled";
   approved_by: string | null;
   approved_at: string | null;
   rejection_reason: string | null;
   notes: string | null;
   created_at: string;
   updated_at: string;
   employee?: {
     id: string;
     name: string;
     nik: string;
   };
   dates?: OvertimeRequestDate[];
 }
 
export interface OvertimeRequestDate {
   id: string;
   overtime_request_id: string;
   date: string;
   start_time: string;
   end_time: string;
   hours: number;
   is_weekend: boolean;
   is_holiday: boolean;
   rate_multiplier: number;
   notes: string | null;
 }
 
export interface OvertimeSettings {
   id: string;
   tenant_id: string;
   is_enabled: boolean;
   min_hours: number;
   max_hours_per_day: number;
   max_hours_per_month: number;
   requires_approval: boolean;
   rate_multiplier: number;
   weekend_rate_multiplier: number;
   holiday_rate_multiplier: number;
   allow_multi_date_request: boolean;
   max_dates_per_request: number;
   auto_reject_after_days: number;
   notes: string | null;
 }
 
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan";
};

const withContextError = (
  label: string,
  error: unknown,
  context: string,
  metadata?: Record<string, unknown>
): string => {
  const ref = reportError(error, context, metadata);
  return appendErrorReference(`${label}: ${getErrorMessage(error)}`, ref);
};
const OVERTIME_REQUESTS_QUERY_TIMEOUT_MS = 15000;
const OVERTIME_REQUESTS_QUERY_RETRY_MAX = 1;

export function useOvertimeSettings(tenantId?: string) {
   const [settings, setSettings] = useState<OvertimeSettings | null>(null);
   const [isLoading, setIsLoading] = useState(true);
 
   const fetchSettings = useCallback(async () => {
     if (!tenantId) {
       setIsLoading(false);
       return;
     }
 
     try {
       const { data, error } = await supabase
         .from("overtime_settings")
         .select("*")
         .eq("tenant_id", tenantId)
         .maybeSingle();
 
       if (error) throw error;
       setSettings(data);
     } catch (error: unknown) {
       const ref = reportError(error, "overtime_settings.fetch", { tenant_id: tenantId });
       console.error(`[OvertimeSettings ${ref}] Error fetching overtime settings:`, error);
     } finally {
       setIsLoading(false);
     }
   }, [tenantId]);
 
   useEffect(() => {
     fetchSettings();
   }, [fetchSettings]);
 
   const saveSettings = async (data: Partial<OvertimeSettings>): Promise<boolean> => {
     if (!tenantId) return false;
 
     try {
       const { error } = await supabase
         .from("overtime_settings")
         .upsert({
           tenant_id: tenantId,
           ...data,
           updated_at: new Date().toISOString(),
         }, {
           onConflict: "tenant_id",
         });
 
       if (error) throw error;
       toast.success("Pengaturan lembur berhasil disimpan");
       await fetchSettings();
       return true;
     } catch (error: unknown) {
       toast.error(
         withContextError("Gagal menyimpan", error, "overtime_settings.save", {
           tenant_id: tenantId,
         })
       );
       return false;
     }
   };
 
   return { settings, isLoading, saveSettings, refetch: fetchSettings };
 }
 
export function useOvertimeRequests(filters?: { 
   tenantId?: string; 
   employeeId?: string; 
   status?: string;
   page?: number;
   pageSize?: number;
   searchQuery?: string;
 }) {
   const [requests, setRequests] = useState<OvertimeRequest[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [totalCount, setTotalCount] = useState(0);
   const [isRetrying, setIsRetrying] = useState(false);
   const [loadError, setLoadError] = useState<string | null>(null);
 
   const fetchRequests = useCallback(async () => {
     try {
       setLoadError(null);
       setIsRetrying(false);
       let query = supabase
         .from("overtime_requests")
         .select(`
           *,
           employee:employees!overtime_requests_employee_id_fkey(id, name, nik),
           dates:overtime_request_dates(*)
         `, { count: "exact" })
         .order("created_at", { ascending: false });
 
       if (filters?.tenantId) {
         query = query.eq("tenant_id", filters.tenantId);
       }
       if (filters?.employeeId) {
         query = query.eq("employee_id", filters.employeeId);
       }
       if (filters?.status) {
         query = query.eq("status", filters.status);
       }
       if (filters?.searchQuery?.trim()) {
         const escaped = filters.searchQuery.trim().replace(/[%_]/g, "\\$&");
         const employeeQuery = supabase
           .from("employees")
           .select("id")
           .or(`name.ilike.%${escaped}%,nik.ilike.%${escaped}%`);

         if (filters?.tenantId) {
           employeeQuery.eq("tenant_id", filters.tenantId);
         }

         const { data: employeeMatches, error: employeeError } = await withExponentialBackoff(
           () =>
             withTimeout(
               employeeQuery,
               OVERTIME_REQUESTS_QUERY_TIMEOUT_MS,
               "overtime_requests.fetch.employee_lookup timeout",
             ),
           {
             maxRetries: OVERTIME_REQUESTS_QUERY_RETRY_MAX,
             shouldRetry: isRetryableError,
             onRetry: () => setIsRetrying(true),
           },
         );
         if (employeeError) throw employeeError;

         const employeeIds = (employeeMatches || []).map((employee) => employee.id);
         if (employeeIds.length > 0) {
           query = query.or(`request_number.ilike.%${escaped}%,employee_id.in.(${employeeIds.join(",")})`);
         } else {
           query = query.ilike("request_number", `%${escaped}%`);
         }
       }
       if (filters?.page && filters?.pageSize) {
         const from = (filters.page - 1) * filters.pageSize;
         const to = from + filters.pageSize - 1;
         query = query.range(from, to);
       }

       const { data, error, count } = await withExponentialBackoff(
         () =>
           withTimeout(
             query,
             OVERTIME_REQUESTS_QUERY_TIMEOUT_MS,
             "overtime_requests.fetch.query timeout",
           ),
         {
           maxRetries: OVERTIME_REQUESTS_QUERY_RETRY_MAX,
           shouldRetry: isRetryableError,
           onRetry: () => setIsRetrying(true),
         },
       );
       if (error) throw error;
       setRequests((data || []) as OvertimeRequest[]);
       setTotalCount(count || 0);
     } catch (error: unknown) {
       const errorRef = reportError(error, "overtime_requests.fetch", {
         tenant_id: filters?.tenantId,
         employee_id: filters?.employeeId,
         status: filters?.status,
         page: filters?.page,
       });
       const message = appendErrorReference("Gagal memuat data pengajuan lembur", errorRef);
       setLoadError(message);
       setRequests([]);
       setTotalCount(0);
     } finally {
       setIsLoading(false);
       setIsRetrying(false);
     }
   }, [filters?.employeeId, filters?.page, filters?.pageSize, filters?.searchQuery, filters?.status, filters?.tenantId]);
 
   useEffect(() => {
     fetchRequests();
   }, [fetchRequests]);
 
   const createRequest = async (
     employeeId: string,
     tenantId: string,
     reason: string,
     dates: Omit<OvertimeRequestDate, "id" | "overtime_request_id" | "created_at">[]
     ): Promise<boolean> => {
       try {
         // Generate request number
       const { data: requestNumber, error: requestNumberError } = await supabase.rpc(
          "generate_overtime_request_number",
          { p_tenant_id: tenantId }
        );
       if (requestNumberError) throw requestNumberError;
       if (!requestNumber) throw new Error("Nomor pengajuan lembur tidak tersedia");
 
         const totalHours = dates.reduce((sum, d) => sum + d.hours, 0);
 
       // Create the request
       const { data: request, error: requestError } = await supabase
         .from("overtime_requests")
         .insert({
           employee_id: employeeId,
           tenant_id: tenantId,
           request_number: requestNumber,
           total_hours: totalHours,
           reason,
           status: "pending",
         })
         .select()
         .single();
 
       if (requestError) throw requestError;
 
       // Create the dates
       const dateInserts = dates.map((d) => ({
         overtime_request_id: request.id,
         date: d.date,
         start_time: d.start_time,
         end_time: d.end_time,
         hours: d.hours,
         is_weekend: d.is_weekend,
         is_holiday: d.is_holiday,
         rate_multiplier: d.rate_multiplier,
         notes: d.notes,
       }));
 
       const { error: datesError } = await supabase
         .from("overtime_request_dates")
         .insert(dateInserts);
 
       if (datesError) throw datesError;
 
       toast.success("Pengajuan lembur berhasil dibuat");
       await fetchRequests();
       return true;
     } catch (error: unknown) {
       toast.error(
         withContextError("Gagal mengajukan lembur", error, "overtime_requests.create", {
           employee_id: employeeId,
           tenant_id: tenantId,
           date_count: dates.length,
         })
       );
       return false;
     }
   };
 
   const approveRequest = async (
     requestId: string,
     approverId: string,
     approved: boolean,
     rejectionReason?: string
   ): Promise<boolean> => {
     try {
       const targetRequest = requests.find((item) => item.id === requestId) || null;
       const updates: TablesUpdate<"overtime_requests"> = {
         status: approved ? "approved" : "rejected",
         approved_by: approverId,
         approved_at: new Date().toISOString(),
         updated_at: new Date().toISOString(),
       };
 
       if (!approved && rejectionReason) {
         updates.rejection_reason = rejectionReason;
       }
 
       const { error } = await supabase
         .from("overtime_requests")
         .update(updates)
         .eq("id", requestId);
 
       if (error) throw error;

       if (targetRequest) {
         const {
           data: { user },
         } = await supabase.auth.getUser();
        await logAuditIfEnabled({
          tenantId: targetRequest.tenant_id,
          payload: {
            tenant_id: targetRequest.tenant_id,
            employee_id: targetRequest.employee_id,
            user_id: user?.id || null,
            table_name: "overtime_requests",
            action: approved ? "overtime_request_approved" : "overtime_request_rejected",
            record_id: targetRequest.id,
            old_values: {
              status: targetRequest.status,
              total_hours: targetRequest.total_hours,
              request_number: targetRequest.request_number,
            },
            new_values: {
              status: approved ? "approved" : "rejected",
              total_hours: targetRequest.total_hours,
              request_number: targetRequest.request_number,
              approved_by: approverId,
              rejection_reason: approved ? null : rejectionReason || null,
            },
          },
        });
      }
 
       toast.success(approved ? "Lembur disetujui" : "Lembur ditolak");
       await fetchRequests();
       return true;
     } catch (error: unknown) {
       toast.error(
         withContextError("Gagal memproses", error, "overtime_requests.approve", {
           request_id: requestId,
           approver_id: approverId,
           approved,
         })
       );
       return false;
     }
   };
 
   const cancelRequest = async (requestId: string): Promise<boolean> => {
     try {
       const { error } = await supabase
         .from("overtime_requests")
         .update({ 
           status: "cancelled",
           updated_at: new Date().toISOString(),
         })
         .eq("id", requestId);
 
       if (error) throw error;
 
       toast.success("Pengajuan lembur dibatalkan");
       await fetchRequests();
       return true;
     } catch (error: unknown) {
       toast.error(
         withContextError("Gagal membatalkan", error, "overtime_requests.cancel", {
           request_id: requestId,
         })
       );
       return false;
     }
   };
 
   return { 
     requests, 
     isLoading, 
     isRetrying,
     loadError,
     totalCount,
     createRequest, 
     approveRequest, 
     cancelRequest,
     refetch: fetchRequests 
   };
 }
