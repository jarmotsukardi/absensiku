 import { useState, useEffect, useCallback } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 
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
     } catch (error) {
       console.error("Error fetching overtime settings:", error);
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
     } catch (error: any) {
       toast.error("Gagal menyimpan: " + error.message);
       return false;
     }
   };
 
   return { settings, isLoading, saveSettings, refetch: fetchSettings };
 }
 
 export function useOvertimeRequests(filters?: { 
   tenantId?: string; 
   employeeId?: string; 
   status?: string;
 }) {
   const [requests, setRequests] = useState<OvertimeRequest[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   const fetchRequests = useCallback(async () => {
     try {
       let query = supabase
         .from("overtime_requests")
         .select(`
           *,
           employee:employees!overtime_requests_employee_id_fkey(id, name, nik),
           dates:overtime_request_dates(*)
         `)
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
 
       const { data, error } = await query;
       if (error) throw error;
       setRequests((data || []) as OvertimeRequest[]);
     } catch (error) {
       console.error("Error fetching overtime requests:", error);
     } finally {
       setIsLoading(false);
     }
   }, [filters?.tenantId, filters?.employeeId, filters?.status]);
 
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
       const { data: requestNumber } = await supabase.rpc(
         "generate_overtime_request_number",
         { p_tenant_id: tenantId }
       );
 
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
     } catch (error: any) {
       toast.error("Gagal mengajukan lembur: " + error.message);
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
       const updates: any = {
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
 
       toast.success(approved ? "Lembur disetujui" : "Lembur ditolak");
       await fetchRequests();
       return true;
     } catch (error: any) {
       toast.error("Gagal memproses: " + error.message);
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
     } catch (error: any) {
       toast.error("Gagal membatalkan: " + error.message);
       return false;
     }
   };
 
   return { 
     requests, 
     isLoading, 
     createRequest, 
     approveRequest, 
     cancelRequest,
     refetch: fetchRequests 
   };
 }