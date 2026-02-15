import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string | null;
}

export interface SubscriptionPackage {
  id: string;
  name: string;
  duration_months: number;
  base_price_per_month: number;
  discount_percentage: number;
  is_active: boolean;
  applies_to: string;
  description: string | null;
  features: any;
  sort_order: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  external_id: string | null;
  package_name: string | null;
  package_duration_months: number | null;
  employee_count: number;
  price_per_employee: number;
  subtotal: number;
  discount_amount: number;
  vat_percentage: number;
  vat_amount: number;
  gross_amount: number;
  xendit_fee: number;
  net_amount: number;
  status: string;
  payment_method_type: string | null;
  invoice_url: string | null;
  payment_proof_url: string | null;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  marketing_name: string | null;
  marketing_incentive_amount: number;
  notes: string | null;
  created_at: string;
  tenant?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface FinancialSummary {
  total_gross: number;
  total_xendit_fee: number;
  total_vat: number;
  total_net: number;
  transaction_count: number;
}

export function useBillingSettings() {
  const [settings, setSettings] = useState<BillingSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("billing_settings")
        .select("*")
        .order("setting_key");

      if (error) throw error;
      setSettings(data || []);
    } catch (error) {
      console.error("Error fetching billing settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = (key: string): any => {
    const setting = settings.find(s => s.setting_key === key);
    return setting?.setting_value || null;
  };

  const updateSetting = async (key: string, value: any): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("billing_settings")
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq("setting_key", key);

      if (error) throw error;
      toast.success("Pengaturan berhasil disimpan");
      await fetchSettings();
      return true;
    } catch (error: any) {
      toast.error("Gagal menyimpan: " + error.message);
      return false;
    }
  };

  return { settings, isLoading, getSetting, updateSetting, refetch: fetchSettings };
}

export function useSubscriptionPackages() {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_packages")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      setPackages(data || []);
    } catch (error) {
      console.error("Error fetching packages:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const createPackage = async (pkg: Partial<SubscriptionPackage>): Promise<boolean> => {
    try {
      const insertData = {
        name: pkg.name!,
        duration_months: pkg.duration_months!,
        base_price_per_month: pkg.base_price_per_month || 15000,
        discount_percentage: pkg.discount_percentage || 0,
        is_active: pkg.is_active !== false,
        applies_to: pkg.applies_to || "ALL",
        description: pkg.description || null,
        features: pkg.features || [],
        sort_order: pkg.sort_order || 0,
      };
      const { error } = await supabase.from("subscription_packages").insert([insertData]);
      if (error) throw error;
      toast.success("Paket berhasil ditambahkan");
      await fetchPackages();
      return true;
    } catch (error: any) {
      toast.error("Gagal menambah paket: " + error.message);
      return false;
    }
  };

  const updatePackage = async (id: string, updates: Partial<SubscriptionPackage>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("subscription_packages")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Paket berhasil diperbarui");
      await fetchPackages();
      return true;
    } catch (error: any) {
      toast.error("Gagal memperbarui paket: " + error.message);
      return false;
    }
  };

  const deletePackage = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from("subscription_packages").delete().eq("id", id);
      if (error) throw error;
      toast.success("Paket berhasil dihapus");
      await fetchPackages();
      return true;
    } catch (error: any) {
      toast.error("Gagal menghapus paket: " + error.message);
      return false;
    }
  };

  return { packages, isLoading, createPackage, updatePackage, deletePackage, refetch: fetchPackages };
}

export function useInvoices(filters?: { status?: string; tenantId?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    try {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          tenant:tenants(id, name, code)
        `)
        .order("created_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.tenantId) {
        query = query.eq("tenant_id", filters.tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters?.status, filters?.tenantId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const verifyPayment = async (invoiceId: string, approved: boolean, rejectionReason?: string): Promise<boolean> => {
    try {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select(`
          id,
          tenant_id,
          invoice_number,
          package_duration_months,
          gross_amount,
          vat_amount,
          net_amount,
          xendit_fee,
          payment_method_type
        `)
        .eq("id", invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      const { data: { user } } = await supabase.auth.getUser();
      
      const updates: any = {
        status: approved ? "PAID" : "CANCELLED",
        updated_at: new Date().toISOString(),
      };

      if (approved) {
        updates.paid_at = new Date().toISOString();
        updates.verified_by = user?.id;
        updates.verified_at = new Date().toISOString();
      } else {
        updates.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoiceId);

      if (error) throw error;

      if (approved) {
        const { data: currentSub, error: currentSubError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", invoice.tenant_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (currentSubError) {
          console.error("Failed to fetch current subscription:", currentSubError);
        }

        let startDate = new Date();
        if (currentSub?.end_date && new Date(currentSub.end_date) > startDate) {
          startDate = new Date(currentSub.end_date);
        }

        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + (invoice.package_duration_months || 1));

        if (currentSub?.id) {
          const { error: subError } = await supabase
            .from("subscriptions")
            .update({
              status: "active",
              start_date: startDate.toISOString().split("T")[0],
              end_date: endDate.toISOString().split("T")[0],
              last_invoice_id: invoice.id,
              grace_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", currentSub.id);
          if (subError) {
            console.error("Failed to update subscription:", subError);
          }
        } else {
          const { error: subInsertError } = await supabase
            .from("subscriptions")
            .insert({
              tenant_id: invoice.tenant_id,
              status: "active",
              start_date: startDate.toISOString().split("T")[0],
              end_date: endDate.toISOString().split("T")[0],
              last_invoice_id: invoice.id,
              grace_period_end: null,
              updated_at: new Date().toISOString(),
            });
          if (subInsertError) {
            console.error("Failed to create subscription:", subInsertError);
          }
        }

        const { data: existingLedger, error: ledgerCheckError } = await supabase
          .from("financial_ledger")
          .select("id")
          .eq("invoice_id", invoiceId)
          .limit(1)
          .maybeSingle();

        if (ledgerCheckError) {
          console.error("Failed to check financial ledger:", ledgerCheckError);
        } else if (!existingLedger) {
          const paymentSource = invoice.payment_method_type === "XENDIT" ? "XENDIT" : "MANUAL";
          const { error: ledgerError } = await supabase
            .from("financial_ledger")
            .insert({
              invoice_id: invoice.id,
              tenant_id: invoice.tenant_id,
              transaction_type: "PAYMENT",
              gross_amount: invoice.gross_amount,
              xendit_fee: invoice.xendit_fee ?? 0,
              vat_amount: invoice.vat_amount,
              net_amount: invoice.net_amount,
              payment_source: paymentSource,
              payment_method: invoice.payment_method_type,
              transaction_date: new Date().toISOString().split("T")[0],
              notes: `Payment for ${invoice.invoice_number}`,
            });
          if (ledgerError) {
            console.error("Failed to insert financial ledger:", ledgerError);
          }
        }

        const { error: streakSyncError } = await supabase.rpc("mark_streak_invoiced", {
          p_tenant_id: invoice.tenant_id,
          p_invoice_id: invoice.id,
        });
        if (streakSyncError) {
          console.error("Failed to sync streak invoiced state:", streakSyncError);
        }
      }
      
      toast.success(approved ? "Pembayaran diverifikasi" : "Pembayaran ditolak");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error("Gagal memproses: " + error.message);
      return false;
    }
  };

  return { invoices, isLoading, verifyPayment, refetch: fetchInvoices };
}

export function useFinancialLedger(dateRange?: { start: string; end: string }) {
  const [summary, setSummary] = useState<FinancialSummary>({
    total_gross: 0,
    total_xendit_fee: 0,
    total_vat: 0,
    total_net: 0,
    transaction_count: 0,
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLedger = useCallback(async () => {
    try {
      let query = supabase
        .from("financial_ledger")
        .select("*")
        .order("transaction_date", { ascending: false });

      if (dateRange?.start) {
        query = query.gte("transaction_date", dateRange.start);
      }
      if (dateRange?.end) {
        query = query.lte("transaction_date", dateRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;

      setTransactions(data || []);

      // Calculate summary
      const sum = (data || []).reduce(
        (acc, tx) => ({
          total_gross: acc.total_gross + (tx.gross_amount || 0),
          total_xendit_fee: acc.total_xendit_fee + (tx.xendit_fee || 0),
          total_vat: acc.total_vat + (tx.vat_amount || 0),
          total_net: acc.total_net + (tx.net_amount || 0),
          transaction_count: acc.transaction_count + 1,
        }),
        { total_gross: 0, total_xendit_fee: 0, total_vat: 0, total_net: 0, transaction_count: 0 }
      );
      setSummary(sum);
    } catch (error) {
      console.error("Error fetching ledger:", error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange?.start, dateRange?.end]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  return { summary, transactions, isLoading, refetch: fetchLedger };
}
