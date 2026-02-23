import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan";
};

export interface BillingSetting {
  id: string;
  setting_key: string;
  setting_value: unknown;
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
  features: unknown;
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
  ppn_percentage?: number | null;
  pph_percentage?: number | null;
  ppn_amount?: number | null;
  pph_amount?: number | null;
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
  metadata?: Record<string, unknown> | null;
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
  total_ppn: number;
  total_pph: number;
  total_net: number;
  transaction_count: number;
}

export interface FinancialTransaction {
  id: string;
  gross_amount: number | null;
  xendit_fee: number | null;
  vat_amount: number | null;
  ppn_amount?: number | null;
  pph_amount?: number | null;
  net_amount: number | null;
  [key: string]: unknown;
}

const MANUAL_VERIFICATION_STATUSES = [
  "AWAITING_VERIFICATION",
  "AWAITING_VERIFICATION_FULL",
  "PENDING_VERIFICATION_PARTIAL",
] as const;

const parseInvoiceBillingScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const value = metadata as Record<string, unknown>;
  return value.billing_scope === "individual" ? "individual" : "centralized";
};

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
      reportError(error, "admin.billing.settings.fetch");
      console.error("Error fetching billing settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = (key: string): unknown => {
    const setting = settings.find(s => s.setting_key === key);
    return setting?.setting_value || null;
  };

  const updateSetting = async (key: string, value: unknown): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("billing_settings")
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq("setting_key", key);

      if (error) throw error;
      toast.success("Pengaturan berhasil disimpan");
      await fetchSettings();
      return true;
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.billing.settings.update", { key });
      toast.error(appendErrorReference("Gagal menyimpan: " + getErrorMessage(error), errorRef));
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
      reportError(error, "admin.billing.packages.fetch");
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
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.billing.packages.create", { package_name: pkg.name || null });
      toast.error(appendErrorReference("Gagal menambah paket: " + getErrorMessage(error), errorRef));
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
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.billing.packages.update", { package_id: id });
      toast.error(appendErrorReference("Gagal memperbarui paket: " + getErrorMessage(error), errorRef));
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
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.billing.packages.delete", { package_id: id });
      toast.error(appendErrorReference("Gagal menghapus paket: " + getErrorMessage(error), errorRef));
      return false;
    }
  };

  return { packages, isLoading, createPackage, updatePackage, deletePackage, refetch: fetchPackages };
}

export function useInvoices(filters?: { status?: string; tenantId?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
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
      reportError(error, "admin.billing.invoices.fetch", {
        status: filters?.status || null,
        tenant_id: filters?.tenantId || null,
      });
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
          ppn_amount,
          pph_amount,
          net_amount,
          xendit_fee,
          payment_method_type,
          metadata
        `)
        .eq("id", invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      const { data: { user } } = await supabase.auth.getUser();
      
      const updates: TablesUpdate<"invoices"> = {
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
        const isIndividualInvoice = parseInvoiceBillingScope(invoice.metadata) === "individual";
        const { data: currentSub, error: currentSubError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", invoice.tenant_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!isIndividualInvoice) {
          if (currentSubError) {
            reportError(currentSubError, "admin.billing.verify_payment.subscription.fetch_failed", {
              invoice_id: invoice.id,
              tenant_id: invoice.tenant_id,
            });
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
              reportError(subError, "admin.billing.verify_payment.subscription.update_failed", {
                invoice_id: invoice.id,
                tenant_id: invoice.tenant_id,
                subscription_id: currentSub.id,
              });
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
              reportError(subInsertError, "admin.billing.verify_payment.subscription.insert_failed", {
                invoice_id: invoice.id,
                tenant_id: invoice.tenant_id,
              });
              console.error("Failed to create subscription:", subInsertError);
            }
          }
        }

        const { data: existingLedger, error: ledgerCheckError } = await supabase
          .from("financial_ledger")
          .select("id")
          .eq("invoice_id", invoiceId)
          .limit(1)
          .maybeSingle();

        if (ledgerCheckError) {
          reportError(ledgerCheckError, "admin.billing.verify_payment.ledger.check_failed", {
            invoice_id: invoice.id,
            tenant_id: invoice.tenant_id,
          });
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
            reportError(ledgerError, "admin.billing.verify_payment.ledger.insert_failed", {
              invoice_id: invoice.id,
              tenant_id: invoice.tenant_id,
            });
            console.error("Failed to insert financial ledger:", ledgerError);
          }
        }

        if (!isIndividualInvoice) {
          const { error: streakSyncError } = await supabase.rpc("mark_streak_invoiced", {
            p_tenant_id: invoice.tenant_id,
            p_invoice_id: invoice.id,
          });
          if (streakSyncError) {
            reportError(streakSyncError, "admin.billing.verify_payment.streak_sync_failed", {
              invoice_id: invoice.id,
              tenant_id: invoice.tenant_id,
            });
            console.error("Failed to sync streak invoiced state:", streakSyncError);
          }
        }

        const [waDispatch, emailDispatch] = await Promise.all([
          supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
            "dispatch-billing-whatsapp",
            {
              body: {
                invoice_id: invoice.id,
                trigger: "ADMIN_VERIFY",
              },
            },
          ),
          supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
            "dispatch-billing-email",
            {
              body: {
                invoice_id: invoice.id,
                trigger: "ADMIN_VERIFY",
              },
            },
          ),
        ]);

        if (waDispatch.error || waDispatch.data?.success === false) {
          const traceId = waDispatch.data?.trace_id || null;
          reportError(waDispatch.error || waDispatch.data || "WA dispatch failed", "admin.billing.verify_payment.whatsapp_notify_failed", {
            invoice_id: invoice.id,
            tenant_id: invoice.tenant_id,
            trace_id: traceId,
          });
          toast.warning(
            traceId
              ? `Pembayaran berhasil diverifikasi, tetapi notifikasi WhatsApp belum terkirim (Ref: ${traceId})`
              : "Pembayaran berhasil diverifikasi, tetapi notifikasi WhatsApp belum terkirim.",
          );
        }

        if (emailDispatch.error || emailDispatch.data?.success === false) {
          const traceId = emailDispatch.data?.trace_id || null;
          reportError(emailDispatch.error || emailDispatch.data || "Email dispatch failed", "admin.billing.verify_payment.email_notify_failed", {
            invoice_id: invoice.id,
            tenant_id: invoice.tenant_id,
            trace_id: traceId,
          });
          toast.warning(
            traceId
              ? `Pembayaran berhasil diverifikasi, tetapi notifikasi Email belum terkirim (Ref: ${traceId})`
              : "Pembayaran berhasil diverifikasi, tetapi notifikasi Email belum terkirim.",
          );
        }
      }
      
      toast.success(approved ? "Pembayaran diverifikasi" : "Pembayaran ditolak");
      await fetchInvoices();
      return true;
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.billing.verify_payment.process", { invoice_id: invoiceId, approved });
      toast.error(appendErrorReference("Gagal memproses: " + getErrorMessage(error), errorRef));
      return false;
    }
  };

  return { invoices, isLoading, verifyPayment, refetch: fetchInvoices };
}

export function useManualVerificationInvoices(filters?: { tenantId?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          tenant:tenants(id, name, code)
        `)
        .in("status", [...MANUAL_VERIFICATION_STATUSES])
        .order("created_at", { ascending: false });

      if (filters?.tenantId) {
        query = query.eq("tenant_id", filters.tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      reportError(error, "admin.billing.invoices.manual_verification.fetch", {
        tenant_id: filters?.tenantId || null,
      });
      console.error("Error fetching manual verification invoices:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters?.tenantId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return { invoices, isLoading, refetch: fetchInvoices };
}

export function useFinancialLedger(dateRange?: { start: string; end: string }) {
  const [summary, setSummary] = useState<FinancialSummary>({
    total_gross: 0,
    total_xendit_fee: 0,
    total_vat: 0,
    total_ppn: 0,
    total_pph: 0,
    total_net: 0,
    transaction_count: 0,
  });
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
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

      setTransactions((data || []) as FinancialTransaction[]);

      // Calculate summary
      const sum = (data || []).reduce(
        (acc, tx) => {
          const vatAmount = tx.vat_amount || 0;
          const ppnAmount = tx.ppn_amount ?? vatAmount;
          const pphAmount = tx.pph_amount || 0;
          return {
            total_gross: acc.total_gross + (tx.gross_amount || 0),
            total_xendit_fee: acc.total_xendit_fee + (tx.xendit_fee || 0),
            total_vat: acc.total_vat + vatAmount,
            total_ppn: acc.total_ppn + ppnAmount,
            total_pph: acc.total_pph + pphAmount,
            total_net: acc.total_net + (tx.net_amount || 0),
            transaction_count: acc.transaction_count + 1,
          };
        },
        { total_gross: 0, total_xendit_fee: 0, total_vat: 0, total_ppn: 0, total_pph: 0, total_net: 0, transaction_count: 0 }
      );
      setSummary(sum);
    } catch (error) {
      reportError(error, "admin.billing.ledger.fetch", {
        start: dateRange?.start || null,
        end: dateRange?.end || null,
      });
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
