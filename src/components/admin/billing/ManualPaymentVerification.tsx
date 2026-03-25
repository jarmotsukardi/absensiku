import { useState } from "react";
import { useManualVerificationInvoices, Invoice } from "@/hooks/useBilling";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink,
  FileImage,
  Building2,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { logCriticalAudit } from "@/lib/auditLoggingPolicy";
import { withTimeout } from "@/lib/attendanceResilience";
import { buildAttendanceSubscriptionSnapshotFromInvoice } from "@/lib/attendanceOnboardingPromo";
import { buildSubscriptionHeadcountSnapshotFromInvoice } from "@/lib/billingHeadcountSnapshot";
import { mergeBillingSubscriptionJourneyNotes } from "@/lib/billingSubscriptionJourney";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatIdNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(value));
};

const parseIdNumberInput = (raw: string) => {
  const normalized = (raw || "").replace(/[^\d]/g, "");
  if (!normalized) return 0;
  return Number(normalized);
};

const MANUAL_PAYMENT_PENDING_STATUSES = new Set([
  "pending",
  "awaiting_verification",
  "awaiting_verification_full",
  "pending_verification_partial",
]);

const parseInvoiceBillingScope = (metadata: unknown): "individual" | "centralized" => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "centralized";
  const value = metadata as Record<string, unknown>;
  return value.billing_scope === "individual" ? "individual" : "centralized";
};

const parseInvoicePayerEmployeeId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  const manualConfirmedBy = value.manual_confirmed_by_employee_id;
  if (typeof manualConfirmedBy === "string" && manualConfirmedBy.trim().length > 0) {
    return manualConfirmedBy.trim();
  }
  const employeeId = value.employee_id;
  if (typeof employeeId === "string" && employeeId.trim().length > 0) {
    return employeeId.trim();
  }
  return null;
};

const parseInvoicePayerSnapshotFromMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  const pickString = (key: string) => {
    const raw = value[key];
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  };

  const snapshot = {
    name: pickString("manual_confirmed_by_name") || pickString("payer_name"),
    email: pickString("manual_confirmed_by_email") || pickString("payer_email"),
    whatsapp: pickString("manual_confirmed_by_whatsapp") || pickString("payer_whatsapp"),
    phone: pickString("manual_confirmed_by_phone") || pickString("payer_phone"),
  };

  if (!snapshot.name && !snapshot.email && !snapshot.whatsapp && !snapshot.phone) return null;
  return snapshot;
};

const buildSubscriptionPricingSnapshot = (
  invoice: Pick<Invoice, "employee_count" | "price_per_employee" | "metadata">,
  currentState?: TablesUpdate<"subscriptions"> | null,
): Pick<
  TablesUpdate<"subscriptions">,
  | "price_per_employee"
  | "price_per_month"
  | "intro_promo_active"
  | "intro_promo_price_per_employee"
  | "intro_promo_duration_months"
  | "intro_promo_months_consumed"
  | "intro_promo_label"
  | "intro_promo_started_at"
  | "billing_headcount_mode"
  | "contracted_employee_count"
  | "max_employees"
> =>
  ({
    ...buildAttendanceSubscriptionSnapshotFromInvoice({
      employeeCount: invoice.employee_count,
      fallbackRecurringPricePerEmployee: invoice.price_per_employee,
      metadata: invoice.metadata,
      currentState,
    }),
    ...buildSubscriptionHeadcountSnapshotFromInvoice(invoice, currentState),
  });

interface ManualPaymentVerificationProps {
  invoices?: Invoice[];
  isLoading?: boolean;
  onRefetch?: () => Promise<unknown> | void;
}

interface ManualPaymentEvidenceRow {
  id: string;
  amount: number | null;
  confirmed_amount: number | null;
  verified_amount: number | null;
  verification_method: string | null;
  status: string | null;
  reference_number: string | null;
  transfer_proof_url: string | null;
  payment_date: string | null;
  account_name: string | null;
  account_number: string | null;
  notes: string | null;
  created_at: string;
}

interface ManualPayerIdentity {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  phone: string | null;
}

const parsePayerSnapshotFromManualNote = (note: string | null | undefined) => {
  if (!note || typeof note !== "string") return null;
  const extractValue = (key: string) => {
    const match = note.match(new RegExp(`${key}=([^|]+)`));
    return match?.[1]?.trim() || null;
  };

  const snapshot = {
    name: extractValue("payer_name"),
    email: extractValue("payer_email"),
    whatsapp: extractValue("payer_wa"),
  };

  if (!snapshot.name && !snapshot.email && !snapshot.whatsapp) return null;
  return snapshot;
};

export function ManualPaymentVerification(props: ManualPaymentVerificationProps = {}) {
  const OP_TIMEOUT_MS = 12000;
  const [searchQuery, setSearchQuery] = useState("");
  const {
    invoices: hookManualInvoices,
    isLoading: hookIsLoading,
    refetch: hookRefetchManualVerification,
  } = useManualVerificationInvoices();
  const allManualInvoices = props.invoices ?? hookManualInvoices;
  const isLoading = props.isLoading ?? hookIsLoading;
  const refetchManualVerification = props.onRefetch ?? hookRefetchManualVerification;
  
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    invoiceNumber: string;
    tenantName: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [verifiedAmountInput, setVerifiedAmountInput] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("manual");
  const [selectedManualPayment, setSelectedManualPayment] = useState<ManualPaymentEvidenceRow | null>(null);
  const [isLoadingManualPayment, setIsLoadingManualPayment] = useState(false);
  const [selectedPayerIdentity, setSelectedPayerIdentity] = useState<ManualPayerIdentity | null>(null);
  const [isLoadingPayerIdentity, setIsLoadingPayerIdentity] = useState(false);

  const filteredInvoices = allManualInvoices.filter((inv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(query) ||
      inv.tenant?.name?.toLowerCase().includes(query) ||
      inv.tenant?.code?.toLowerCase().includes(query)
    );
  });

  const loadManualPaymentEvidence = async (invoice: Invoice) => {
    setIsLoadingManualPayment(true);
    setIsLoadingPayerIdentity(true);
    setSelectedManualPayment(null);
    setSelectedPayerIdentity(null);
    try {
      const payerEmployeeId = parseInvoicePayerEmployeeId(invoice.metadata);
      const payerSnapshotFromMetadata = parseInvoicePayerSnapshotFromMetadata(invoice.metadata);
      const [{ data, error }, { data: payerData, error: payerError }] = await withTimeout(
        Promise.all([
          supabase
            .from("manual_payments")
            .select("id, amount, confirmed_amount, verified_amount, verification_method, status, reference_number, transfer_proof_url, payment_date, account_name, account_number, notes, created_at")
            .eq("tenant_id", invoice.tenant_id)
            .eq("invoice_number", invoice.invoice_number)
            .order("created_at", { ascending: false })
            .limit(50),
          payerEmployeeId
            ? supabase
                .from("employees")
                .select("id, name, email, whatsapp, phone")
                .eq("tenant_id", invoice.tenant_id)
                .eq("id", payerEmployeeId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]),
        OP_TIMEOUT_MS,
        "Memuat detail pembayaran manual terlalu lama",
      );

      if (error) throw error;

      const rows = (data || []) as ManualPaymentEvidenceRow[];
      const pendingRow =
        rows.find((row) => MANUAL_PAYMENT_PENDING_STATUSES.has((row.status || "").toLowerCase())) || null;
      const proofRow =
        rows.find((row) => Boolean((row.transfer_proof_url || "").trim())) ||
        rows.find((row) => Boolean((row.reference_number || "").trim())) ||
        null;
      const resolvedRow = pendingRow || proofRow || rows[0] || null;
      setSelectedManualPayment(resolvedRow);
      const payerSnapshotFromManualRow = resolvedRow
        ? {
            name: resolvedRow.account_name?.trim() || null,
            email: parsePayerSnapshotFromManualNote(resolvedRow.notes)?.email || null,
            whatsapp:
              resolvedRow.account_number?.trim() ||
              parsePayerSnapshotFromManualNote(resolvedRow.notes)?.whatsapp ||
              null,
          }
        : null;

      if (pendingRow) {
        const suggestedAmount = Number(pendingRow.confirmed_amount ?? pendingRow.amount ?? 0);
        if (Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
          setVerifiedAmountInput(formatIdNumber(suggestedAmount));
        }
      }

      if (payerError) {
        reportError(payerError, "admin.billing.manual_payment.dialog.fetch_payer_failed", {
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
          invoice_number: invoice.invoice_number,
          payer_employee_id: payerEmployeeId,
        });
      } else if (payerData) {
        setSelectedPayerIdentity({
          id: payerData.id,
          name: payerData.name || "-",
          email: payerData.email || "-",
          whatsapp: payerData.whatsapp || null,
          phone: payerData.phone || null,
        });
      } else if (payerSnapshotFromMetadata) {
        setSelectedPayerIdentity({
          id: payerEmployeeId || "manual-metadata",
          name: payerSnapshotFromMetadata.name || "-",
          email: payerSnapshotFromMetadata.email || "-",
          whatsapp: payerSnapshotFromMetadata.whatsapp || null,
          phone: payerSnapshotFromMetadata.phone || null,
        });
      } else if (payerSnapshotFromManualRow) {
        setSelectedPayerIdentity({
          id: payerEmployeeId || "manual-payment-row",
          name: payerSnapshotFromManualRow.name || "-",
          email: payerSnapshotFromManualRow.email || "-",
          whatsapp: payerSnapshotFromManualRow.whatsapp || null,
          phone: null,
        });
      }
    } catch (error) {
      reportError(error, "admin.billing.manual_payment.dialog.fetch_evidence_failed", {
        invoice_id: invoice.id,
        tenant_id: invoice.tenant_id,
        invoice_number: invoice.invoice_number,
      });
    } finally {
      setIsLoadingManualPayment(false);
      setIsLoadingPayerIdentity(false);
    }
  };

  const handleVerifyClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setRejectionReason("");
    setVerificationNotes("");
    setVerifiedAmountInput(formatIdNumber(Math.max(0, Math.round(invoice.gross_amount || 0))));
    setVerificationMethod("manual");
    setSelectedManualPayment(null);
    setSelectedPayerIdentity(null);
    setShowVerifyDialog(true);
    void loadManualPaymentEvidence(invoice);
  };

  const openProofPreview = (url: string, invoiceNumber: string | null | undefined, tenantName: string | null | undefined) => {
    if (!url) return;
    setProofPreview({
      url,
      invoiceNumber: invoiceNumber || "-",
      tenantName: tenantName || "Unknown",
    });
  };

  const closeProofPreview = () => {
    setProofPreview(null);
  };

  const isPdfProofPreview = Boolean(proofPreview?.url && /\.pdf($|[?#])/i.test(proofPreview.url));

  const handleVerify = async (approved: boolean) => {
    if (!selectedInvoice) return;
    setIsProcessing(true);

    try {
      const nowIso = new Date().toISOString();
      const expectedAmount = Number(selectedInvoice.gross_amount || 0);
      const { data: manualPaymentRows, error: manualPaymentFetchError } = await withTimeout(
        supabase
          .from("manual_payments")
          .select("id, amount, confirmed_amount, verified_amount, verification_method, status, reference_number, transfer_proof_url, payment_date, account_name, account_number, notes, created_at")
          .eq("tenant_id", selectedInvoice.tenant_id)
          .eq("invoice_number", selectedInvoice.invoice_number)
          .order("created_at", { ascending: false })
          .limit(50),
        OP_TIMEOUT_MS,
        "Membaca bukti pembayaran manual terlalu lama",
      );

      if (manualPaymentFetchError) {
        const errorRef = reportError(
          manualPaymentFetchError,
          "admin.billing.manual_payment.evidence.fetch_failed",
          {
            invoice_id: selectedInvoice.id,
            tenant_id: selectedInvoice.tenant_id,
            invoice_number: selectedInvoice.invoice_number,
          },
        );
        toast.error(appendErrorReference("Gagal membaca bukti pembayaran manual.", errorRef));
        return;
      }

      const manualPayments = manualPaymentRows || [];
      const pendingManualPayment =
        manualPayments.find((row) => MANUAL_PAYMENT_PENDING_STATUSES.has((row.status || "").toLowerCase())) || null;
      const verifiedAmount = manualPayments
        .filter((row) => (row.status || "").toLowerCase() === "verified")
        .reduce((sum, row) => sum + Number(row.verified_amount ?? row.amount ?? 0), 0);

      // Update invoice status
      const updates: TablesUpdate<"invoices"> = {
        status: approved ? "PAID" : "REJECTED_NEEDS_REVISION",
        updated_at: nowIso,
      };

      if (approved) {
        if (!pendingManualPayment) {
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_PENDING_NOT_FOUND"),
            "admin.billing.manual_payment.evidence.pending_not_found",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
            },
          );
          toast.error(appendErrorReference("Belum ada konfirmasi pembayaran baru untuk diverifikasi.", errorRef));
          return;
        }

        const isIndividualBilling = parseInvoiceBillingScope(selectedInvoice.metadata) === "individual";
        const hasReferenceFallback = Boolean((pendingManualPayment.reference_number || "").trim());
        const hasTransferProof = Boolean(
          selectedInvoice.payment_proof_url || pendingManualPayment.transfer_proof_url || hasReferenceFallback,
        );
        if (!isIndividualBilling && !hasTransferProof) {
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_PROOF_MISSING"),
            "admin.billing.manual_payment.evidence.missing_proof",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
            },
          );
          toast.error(appendErrorReference("Bukti pembayaran belum tersedia. Approval diblokir.", errorRef));
          return;
        }

        const paidAmount = Number(pendingManualPayment.amount ?? 0);
        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_AMOUNT_UNAVAILABLE"),
            "admin.billing.manual_payment.evidence.missing_amount",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              manual_payment_id: pendingManualPayment.id,
            },
          );
          toast.error(appendErrorReference("Nominal pembayaran belum valid. Approval diblokir.", errorRef));
          return;
        }

        const confirmedAmount = Number(pendingManualPayment.confirmed_amount ?? pendingManualPayment.amount ?? 0);
        const verifiedInputAmount = parseIdNumberInput(verifiedAmountInput);
        if (!Number.isFinite(verifiedInputAmount) || verifiedInputAmount <= 0) {
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_VERIFIED_AMOUNT_INVALID"),
            "admin.billing.manual_payment.evidence.verified_amount_invalid",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              manual_payment_id: pendingManualPayment.id,
            },
          );
          toast.error(appendErrorReference("Nominal verifikasi admin wajib diisi.", errorRef));
          return;
        }

        const verifiedInputCents = Math.round(verifiedInputAmount * 100);
        const confirmedCents = Math.round(confirmedAmount * 100);
        if (verifiedInputCents !== confirmedCents) {
          const { error: auditError } = await withTimeout(
            supabase.rpc("log_manual_payment_verification_audit" as never, {
              p_invoice_id: selectedInvoice.id,
              p_manual_payment_id: pendingManualPayment.id,
              p_tenant_id: selectedInvoice.tenant_id,
              p_claimed_amount: Math.round(confirmedAmount),
              p_verified_amount: Math.round(verifiedInputAmount),
              p_decision: "reject",
              p_notes: verificationNotes || "Mismatch nominal klaim user vs verifikasi admin",
            } as never),
            OP_TIMEOUT_MS,
            "Mencatat audit mismatch terlalu lama",
          );
          if (auditError) {
            reportError(auditError, "admin.billing.manual_payment.audit.mismatch_log_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              manual_payment_id: pendingManualPayment.id,
            });
          }
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_CONFIRMED_VERIFIED_MISMATCH"),
            "admin.billing.manual_payment.evidence.confirmed_verified_mismatch",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              manual_payment_id: pendingManualPayment.id,
              confirmed_amount: confirmedAmount,
              verified_amount: verifiedInputAmount,
            },
          );
          toast.error(
            appendErrorReference(
              "Nominal klaim user tidak sama dengan nominal verifikasi admin. Tolak dulu sebagai wajib revisi.",
              errorRef,
            ),
          );
          return;
        }

        const amountAfterApproval = verifiedAmount + verifiedInputAmount;
        const expectedCents = Math.round(expectedAmount * 100);
        const afterApprovalCents = Math.round(amountAfterApproval * 100);
        const amountDelta = amountAfterApproval - expectedAmount;
        if (afterApprovalCents > expectedCents) {
          const mismatchReason =
            `Akumulasi pembayaran melebihi tagihan sebesar ${formatCurrency(Math.abs(amountDelta))}.`;
          const errorRef = reportError(
            new Error("MANUAL_PAYMENT_AMOUNT_OVERPAYMENT"),
            "admin.billing.manual_payment.evidence.amount_mismatch",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              manual_payment_id: pendingManualPayment.id,
              expected_amount: expectedAmount,
              paid_amount: amountAfterApproval,
              delta: amountDelta,
            },
          );
          toast.error(appendErrorReference(`${mismatchReason} Approval diblokir, cek kembali nominal konfirmasi.`, errorRef));
          return;
        }

        // Resolve verifier employee id (manual_payments.verified_by -> employees.id)
        const {
          data: { user },
          error: authError,
        } = await withTimeout(
          supabase.auth.getUser(),
          OP_TIMEOUT_MS,
          "Memvalidasi sesi verifikator terlalu lama",
        );
        if (authError) {
          const errorRef = reportError(authError, "admin.billing.manual_payment.verifier.auth_failed", {
            invoice_id: selectedInvoice.id,
            tenant_id: selectedInvoice.tenant_id,
            invoice_number: selectedInvoice.invoice_number,
            manual_payment_id: pendingManualPayment.id,
          });
          toast.error(appendErrorReference("Sesi verifikator tidak valid. Silakan login ulang.", errorRef));
          return;
        }

        let verifierEmployeeId: string | null = null;
        if (user?.id) {
          const { data: tenantScopedEmployee, error: tenantScopedEmployeeError } = await supabase
            .from("employees")
            .select("id")
            .eq("user_id", user.id)
            .eq("tenant_id", selectedInvoice.tenant_id)
            .limit(1)
            .maybeSingle();

          if (tenantScopedEmployeeError) {
            reportError(tenantScopedEmployeeError, "admin.billing.manual_payment.verifier.employee_lookup_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              user_id: user.id,
              scoped: "tenant",
            });
          } else {
            verifierEmployeeId = tenantScopedEmployee?.id ?? null;
          }

          if (!verifierEmployeeId) {
            const { data: fallbackEmployee, error: fallbackEmployeeError } = await supabase
              .from("employees")
              .select("id")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle();

            if (fallbackEmployeeError) {
              reportError(fallbackEmployeeError, "admin.billing.manual_payment.verifier.employee_lookup_failed", {
                invoice_id: selectedInvoice.id,
                tenant_id: selectedInvoice.tenant_id,
                invoice_number: selectedInvoice.invoice_number,
                user_id: user.id,
                scoped: "global_fallback",
              });
            } else {
              verifierEmployeeId = fallbackEmployee?.id ?? null;
            }
          }
        }

        const { error: manualPaymentVerifyError } = await supabase
          .from("manual_payments")
          .update({
            status: "verified",
            is_archived: true,
            verified_amount: verifiedInputAmount,
            verification_method: verificationMethod,
            verified_at: nowIso,
            verified_by: verifierEmployeeId,
            updated_at: nowIso,
          })
          .eq("id", pendingManualPayment.id);

        if (manualPaymentVerifyError) {
          const errorRef = reportError(
            manualPaymentVerifyError,
            "admin.billing.manual_payment.evidence.verify_failed",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              invoice_number: selectedInvoice.invoice_number,
              manual_payment_id: pendingManualPayment.id,
            },
          );
          toast.error(appendErrorReference("Gagal sinkron status pembayaran manual.", errorRef));
          return;
        }

        await logCriticalAudit({
          payload: {
            tenant_id: selectedInvoice.tenant_id,
            user_id: user?.id || null,
            table_name: "manual_payments",
            action: "manual_payment_verified",
            record_id: pendingManualPayment.id,
            old_values: {
              status: pendingManualPayment.status,
              amount: pendingManualPayment.amount,
              confirmed_amount: pendingManualPayment.confirmed_amount,
            },
            new_values: {
              status: "verified",
              verified_amount: verifiedInputAmount,
              verification_method: verificationMethod,
            },
          },
        });

        if (afterApprovalCents < expectedCents) {
          const remaining = expectedAmount - amountAfterApproval;
          updates.status = "PARTIALLY_PAID";
          updates.rejection_reason = null;
          updates.notes = [
            selectedInvoice.notes,
            verificationNotes || null,
            `[PARTIAL_PAYMENT] Terverifikasi ${formatCurrency(amountAfterApproval)} dari ${formatCurrency(expectedAmount)}. Sisa ${formatCurrency(remaining)}.`,
          ]
            .filter((line) => typeof line === "string" && line.trim().length > 0)
            .join("\n");
          updates.paid_at = null;
          updates.verified_by = null;
          updates.verified_at = null;
        } else {
          updates.paid_at = nowIso;
          updates.rejection_reason = null;
          updates.notes = verificationNotes || "Pembayaran manual diverifikasi";
          updates.verified_by = verifierEmployeeId;
          updates.verified_at = nowIso;
        }
      } else {
        updates.rejection_reason = rejectionReason;
        updates.notes = [selectedInvoice.notes, verificationNotes || null, `[REQUIRES_REVISION] ${rejectionReason}`]
          .filter((line) => typeof line === "string" && line.trim().length > 0)
          .join("\n");
        updates.paid_at = null;
        updates.verified_by = null;
        updates.verified_at = null;

        if (pendingManualPayment?.id) {
          const { error: manualPaymentRejectError } = await supabase
            .from("manual_payments")
            .update({
              status: "rejected",
              rejection_reason: rejectionReason,
              verification_method: verificationMethod,
              verified_amount: null,
              verified_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", pendingManualPayment.id);

          if (manualPaymentRejectError) {
            const errorRef = reportError(
              manualPaymentRejectError,
              "admin.billing.manual_payment.evidence.reject_sync_failed",
              {
                invoice_id: selectedInvoice.id,
                tenant_id: selectedInvoice.tenant_id,
                invoice_number: selectedInvoice.invoice_number,
                manual_payment_id: pendingManualPayment.id,
              },
            );
            toast.error(appendErrorReference("Gagal sinkron penolakan pembayaran manual.", errorRef));
            return;
          }

          const { data: { user: rejectUser } } = await supabase.auth.getUser();
          await logCriticalAudit({
            payload: {
              tenant_id: selectedInvoice.tenant_id,
              user_id: rejectUser?.id || null,
              table_name: "manual_payments",
              action: "manual_payment_rejected",
              record_id: pendingManualPayment.id,
              old_values: {
                status: pendingManualPayment.status,
                amount: pendingManualPayment.amount,
                confirmed_amount: pendingManualPayment.confirmed_amount,
              },
              new_values: {
                status: "rejected",
                rejection_reason: rejectionReason,
                verification_method: verificationMethod,
              },
            },
          });

          const claimedAmount = Number(pendingManualPayment.confirmed_amount ?? pendingManualPayment.amount ?? 0);
          const parsedVerifiedInput = parseIdNumberInput(verifiedAmountInput);
          const verifiedAmountForAudit = Number.isFinite(parsedVerifiedInput) ? parsedVerifiedInput : 0;
          const { error: auditError } = await withTimeout(
            supabase.rpc("log_manual_payment_verification_audit" as never, {
              p_invoice_id: selectedInvoice.id,
              p_manual_payment_id: pendingManualPayment.id,
              p_tenant_id: selectedInvoice.tenant_id,
              p_claimed_amount: Math.round(claimedAmount),
              p_verified_amount: Math.round(verifiedAmountForAudit),
              p_decision: "reject",
              p_notes: rejectionReason,
            } as never),
            OP_TIMEOUT_MS,
            "Mencatat audit penolakan terlalu lama",
          );
          if (auditError) {
            reportError(auditError, "admin.billing.manual_payment.audit.reject_log_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              manual_payment_id: pendingManualPayment.id,
            });
          }
        }
      }

      const { error: updateError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", selectedInvoice.id);

      if (updateError) throw updateError;

      // If approved & fully paid, extend subscription and run downstream workflow.
      const isFullyPaid = updates.status === "PAID";
      if (approved && isFullyPaid) {
        const isIndividualInvoice = parseInvoiceBillingScope(selectedInvoice.metadata) === "individual";
        if (!isIndividualInvoice) {
          // Get current subscription
          const { data: currentSub } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("tenant_id", selectedInvoice.tenant_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Calculate new subscription dates
          let startDate = new Date();
          if (currentSub && new Date(currentSub.end_date) > startDate) {
            startDate = new Date(currentSub.end_date);
          }

          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + (selectedInvoice.package_duration_months || 1));

          // Update latest subscription row if exists, otherwise create a new one.
          if (currentSub?.id) {
            const { error: subUpdateError } = await supabase
              .from("subscriptions")
              .update({
                status: "active",
                start_date: startDate.toISOString().split("T")[0],
                end_date: endDate.toISOString().split("T")[0],
                last_invoice_id: selectedInvoice.id,
                grace_period_end: null,
                notes: mergeBillingSubscriptionJourneyNotes(currentSub?.notes, selectedInvoice.metadata),
                ...buildSubscriptionPricingSnapshot(selectedInvoice, currentSub),
                updated_at: new Date().toISOString(),
              })
              .eq("id", currentSub.id);
            if (subUpdateError) {
              reportError(subUpdateError, "admin.billing.manual_payment.subscription.update_failed", {
                invoice_id: selectedInvoice.id,
                tenant_id: selectedInvoice.tenant_id,
                subscription_id: currentSub.id,
              });
            }
          } else {
            const { error: subInsertError } = await supabase
              .from("subscriptions")
              .insert({
                tenant_id: selectedInvoice.tenant_id,
                status: "active",
                start_date: startDate.toISOString().split("T")[0],
                end_date: endDate.toISOString().split("T")[0],
                last_invoice_id: selectedInvoice.id,
                grace_period_end: null,
                notes: mergeBillingSubscriptionJourneyNotes(null, selectedInvoice.metadata),
                ...buildSubscriptionPricingSnapshot(selectedInvoice, currentSub),
                updated_at: new Date().toISOString(),
              });
            if (subInsertError) {
              reportError(subInsertError, "admin.billing.manual_payment.subscription.insert_failed", {
                invoice_id: selectedInvoice.id,
                tenant_id: selectedInvoice.tenant_id,
              });
            }
          }
        }

        // Record in financial ledger (no Xendit fee for manual)
        const { data: existingLedger, error: existingLedgerError } = await supabase
          .from("financial_ledger")
          .select("id")
          .eq("invoice_id", selectedInvoice.id)
          .limit(1)
          .maybeSingle();
        if (existingLedgerError) {
          reportError(existingLedgerError, "admin.billing.manual_payment.ledger.check_failed", {
            invoice_id: selectedInvoice.id,
            tenant_id: selectedInvoice.tenant_id,
          });
        } else if (!existingLedger) {
          const { error: ledgerInsertError } = await supabase.from("financial_ledger").insert({
            invoice_id: selectedInvoice.id,
            tenant_id: selectedInvoice.tenant_id,
            transaction_type: "PAYMENT",
            gross_amount: selectedInvoice.gross_amount,
            xendit_fee: 0,
            vat_amount: selectedInvoice.vat_amount,
            net_amount: selectedInvoice.gross_amount - selectedInvoice.vat_amount,
            payment_source: "MANUAL",
            payment_method: selectedInvoice.payment_method_type,
            transaction_date: new Date().toISOString().split("T")[0],
            notes: `Manual payment for ${selectedInvoice.invoice_number}`,
          });
          if (ledgerInsertError) {
            reportError(ledgerInsertError, "admin.billing.manual_payment.ledger.insert_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
            });
          }
        }

        if (parseInvoiceBillingScope(selectedInvoice.metadata) !== "individual") {
          const { error: streakSyncError } = await withTimeout(
            supabase.rpc("mark_streak_invoiced", {
              p_tenant_id: selectedInvoice.tenant_id,
              p_invoice_id: selectedInvoice.id,
            }),
            OP_TIMEOUT_MS,
            "Sinkron status streak terlalu lama",
          );
          if (streakSyncError) {
            reportError(streakSyncError, "admin.billing.manual_payment.streak_sync_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
            });
          }
        }

        const [waDispatch, emailDispatch] = await Promise.all([
          withTimeout(
            supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
              "dispatch-billing-whatsapp",
              {
                body: {
                  invoice_id: selectedInvoice.id,
                  trigger: "ADMIN_VERIFY_MANUAL",
                },
              },
            ),
            OP_TIMEOUT_MS,
            "Dispatch WhatsApp billing terlalu lama",
          ),
          withTimeout(
            supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
              "dispatch-billing-email",
              {
                body: {
                  invoice_id: selectedInvoice.id,
                  trigger: "ADMIN_VERIFY_MANUAL",
                },
              },
            ),
            OP_TIMEOUT_MS,
            "Dispatch email billing terlalu lama",
          ),
        ]);

        if (waDispatch.error || waDispatch.data?.success === false) {
          const traceId = waDispatch.data?.trace_id || null;
          const errorRef = reportError(
            waDispatch.error || waDispatch.data || "WA dispatch failed",
            "admin.billing.manual_payment.whatsapp_notify_failed",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              trace_id: traceId,
            },
          );
          toast.warning(
            appendErrorReference(
              traceId
                ? `Pembayaran diverifikasi, tetapi notifikasi WhatsApp belum terkirim (Ref: ${traceId})`
                : "Pembayaran diverifikasi, tetapi notifikasi WhatsApp belum terkirim.",
              errorRef,
            ),
          );
        }

        if (emailDispatch.error || emailDispatch.data?.success === false) {
          const traceId = emailDispatch.data?.trace_id || null;
          const errorRef = reportError(
            emailDispatch.error || emailDispatch.data || "Email dispatch failed",
            "admin.billing.manual_payment.email_notify_failed",
            {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              trace_id: traceId,
            },
          );
          toast.warning(
            appendErrorReference(
              traceId
                ? `Pembayaran diverifikasi, tetapi notifikasi Email belum terkirim (Ref: ${traceId})`
                : "Pembayaran diverifikasi, tetapi notifikasi Email belum terkirim.",
              errorRef,
            ),
          );
        }
      }

      if (approved && !isFullyPaid) {
        const parsedVerifiedInput = parseIdNumberInput(verifiedAmountInput);
        const totalVerifiedAfter = verifiedAmount + (Number.isFinite(parsedVerifiedInput) ? parsedVerifiedInput : 0);
        const remaining = Math.max(0, expectedAmount - totalVerifiedAfter);
        toast.success(`Pembayaran cicilan diverifikasi. Sisa tagihan: ${formatCurrency(remaining)}.`);
      } else {
        toast.success(approved ? "Pembayaran berhasil diverifikasi" : "Konfirmasi pembayaran ditolak");
      }
      setShowVerifyDialog(false);
      setSelectedInvoice(null);
      await refetchManualVerification();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorRef = reportError(error, "admin.billing.manual_payment.verify_process", {
        invoice_id: selectedInvoice?.id || null,
      });
      toast.error(appendErrorReference("Gagal memproses: " + message, errorRef));
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
        <p className="text-base font-medium text-slate-900">Memuat verifikasi manual</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Antrean pembayaran transfer sedang disiapkan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Verifikasi Pembayaran Manual</h3>
          <p className="text-sm text-muted-foreground">
            Verifikasi pembayaran transfer bank dari instansi (B2B)
          </p>
        </div>
        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
          {filteredInvoices.length} menunggu
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari invoice atau organisasi..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Invoice Cards for Mobile / Table for Desktop */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle className="mx-auto h-12 w-12 text-green-600 mb-3" />
            <p>Tidak ada pembayaran yang menunggu verifikasi</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{invoice.tenant?.name || "Unknown"}</span>
                      <Badge variant="outline" className="text-xs">
                        {invoice.tenant?.code}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="font-mono">{invoice.invoice_number}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(invoice.issue_date), "dd MMM yyyy", { locale: id })}
                      </span>
                      <span>•</span>
                      <span>{invoice.package_name || "Custom"} ({invoice.package_duration_months} bln)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span>{invoice.employee_count} pegawai</span>
                      <span>•</span>
                      <span className="font-semibold text-lg">{formatCurrency(invoice.gross_amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {invoice.payment_proof_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openProofPreview(
                            invoice.payment_proof_url || "",
                            invoice.invoice_number,
                            invoice.tenant?.name,
                          )
                        }
                      >
                        <FileImage className="mr-2 h-4 w-4" />
                        Bukti
                      </Button>
                    )}
                    <Button size="sm" onClick={() => handleVerifyClick(invoice)}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Verifikasi
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Verification Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verifikasi Pembayaran Manual</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedInvoice.tenant?.name}</span>
                    </div>
                    <Badge variant="outline" className="max-w-full truncate">
                      {selectedInvoice.tenant?.code}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Invoice</p>
                      <p className="font-mono">{selectedInvoice.invoice_number}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Paket</p>
                      <p>{selectedInvoice.package_name || "Custom"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Durasi</p>
                      <p>{selectedInvoice.package_duration_months} Bulan</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pegawai</p>
                      <p>{selectedInvoice.employee_count}</p>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Pembayaran</span>
                      <span className="text-xl font-bold">{formatCurrency(selectedInvoice.gross_amount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Data Konfirmasi Transfer</p>
                  {selectedManualPayment?.payment_date ? (
                    <p className="text-xs text-muted-foreground">
                      Tanggal transfer:{" "}
                      {format(new Date(selectedManualPayment.payment_date), "dd MMM yyyy", { locale: id })}
                    </p>
                  ) : null}
                </div>
                {isLoadingManualPayment ? (
                  <p className="mt-2 text-xs text-muted-foreground">Memuat data konfirmasi transfer...</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">No. Ref</p>
                      <p className="text-sm font-medium">{selectedManualPayment?.reference_number?.trim() || "-"}</p>
                    </div>
                    <div className="grid gap-2 rounded-md border bg-white/70 p-2 text-xs sm:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground">Nama Pembayar</p>
                        <p className="font-medium text-foreground">
                          {isLoadingPayerIdentity ? "Memuat..." : selectedPayerIdentity?.name || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium text-foreground">
                          {isLoadingPayerIdentity ? "Memuat..." : selectedPayerIdentity?.email || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">No. WA</p>
                        <p className="font-medium text-foreground">
                          {isLoadingPayerIdentity
                            ? "Memuat..."
                            : selectedPayerIdentity?.whatsapp?.trim() ||
                              selectedPayerIdentity?.phone?.trim() ||
                              "-"}
                        </p>
                      </div>
                    </div>
                    {selectedInvoice.payment_proof_url || selectedManualPayment?.transfer_proof_url ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          openProofPreview(
                            selectedInvoice.payment_proof_url ||
                              selectedManualPayment?.transfer_proof_url ||
                              "",
                            selectedInvoice.invoice_number,
                            selectedInvoice.tenant?.name,
                          )
                        }
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Lihat Bukti Lama (Jika Ada)
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Catatan Verifikasi (opsional)</Label>
                  <Textarea
                    value={verificationNotes}
                    onChange={(e) => setVerificationNotes(e.target.value)}
                    placeholder="Catatan untuk verifikasi ini..."
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nominal Verifikasi Admin</Label>
                    <Input
                      inputMode="numeric"
                      value={verifiedAmountInput}
                      onChange={(event) =>
                        setVerifiedAmountInput(formatIdNumber(parseIdNumberInput(event.target.value)))
                      }
                      placeholder="Nominal yang benar-benar diterima"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Metode Verifikasi</Label>
                    <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih metode verifikasi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="bank_mutation">Mutasi Bank</SelectItem>
                        <SelectItem value="ocr">OCR Bukti</SelectItem>
                        <SelectItem value="other">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Alasan Penolakan (jika ditolak)</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Contoh: Bukti pembayaran tidak valid, nominal tidak sesuai, dll."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className={`${dialogActionBarClassName} flex-col gap-3 sm:flex-col sm:space-x-0`}>
            <DialogActionHint className="mr-0 w-full text-left">
              Pastikan nominal verifikasi sudah sesuai bukti transfer sebelum menyetujui pembayaran.
            </DialogActionHint>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setShowVerifyDialog(false)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => handleVerify(false)}
                disabled={isProcessing || !rejectionReason}
              >
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <XCircle className="mr-2 h-4 w-4" />
                Tolak
              </Button>
              <Button className="w-full sm:w-auto sm:min-w-[190px]" onClick={() => handleVerify(true)} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle className="mr-2 h-4 w-4" />
                Setujui Pembayaran
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(proofPreview)}
        onOpenChange={(open) => {
          if (!open) closeProofPreview();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Bukti Pembayaran • {proofPreview?.invoiceNumber || "-"}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[75vh] items-center justify-center overflow-auto bg-slate-50 p-4">
            {proofPreview ? (
              isPdfProofPreview ? (
                <iframe
                  src={proofPreview.url}
                  title={`Bukti pembayaran ${proofPreview.invoiceNumber}`}
                  className="h-[72vh] w-full rounded-md border bg-white"
                />
              ) : (
                <img
                  src={proofPreview.url}
                  alt={`Bukti pembayaran ${proofPreview.invoiceNumber}`}
                  className="max-h-[72vh] w-auto rounded-md border bg-white object-contain shadow-sm"
                />
              )
            ) : null}
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <div className="mr-auto text-xs text-muted-foreground">{proofPreview?.tenantName || "-"}</div>
            {proofPreview?.url ? (
              <Button variant="outline" asChild>
                <a href={proofPreview.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Buka Tab Baru
                </a>
              </Button>
            ) : null}
            <Button onClick={closeProofPreview}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
