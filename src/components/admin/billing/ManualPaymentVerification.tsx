import { useState } from "react";
import { useInvoices, Invoice } from "@/hooks/useBilling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink,
  FileImage,
  Building2,
  Calendar,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

export function ManualPaymentVerification() {
  const [searchQuery, setSearchQuery] = useState("");
  const { invoices, isLoading, refetch } = useInvoices({ status: "AWAITING_VERIFICATION" });
  
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState("");

  // Also get pending manual invoices
  const { invoices: pendingInvoices } = useInvoices({ status: "PENDING" });
  const manualPendingInvoices = pendingInvoices.filter(inv => inv.payment_method_type === "MANUAL_TRANSFER");

  const allManualInvoices = [...invoices, ...manualPendingInvoices];
  
  const filteredInvoices = allManualInvoices.filter((inv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(query) ||
      inv.tenant?.name?.toLowerCase().includes(query) ||
      inv.tenant?.code?.toLowerCase().includes(query)
    );
  });

  const handleVerifyClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setRejectionReason("");
    setVerificationNotes("");
    setShowVerifyDialog(true);
  };

  const handleVerify = async (approved: boolean) => {
    if (!selectedInvoice) return;
    setIsProcessing(true);

    try {
      // Update invoice status
      const updates: TablesUpdate<"invoices"> = {
        status: approved ? "PAID" : "CANCELLED",
        updated_at: new Date().toISOString(),
      };

      if (approved) {
        updates.paid_at = new Date().toISOString();
        updates.notes = verificationNotes || "Pembayaran manual diverifikasi";
        
        // Get current user for verified_by
        const { data: { user } } = await supabase.auth.getUser();
        updates.verified_by = user?.id;
        updates.verified_at = new Date().toISOString();
      } else {
        updates.rejection_reason = rejectionReason;
      }

      const { error: updateError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", selectedInvoice.id);

      if (updateError) throw updateError;

      // If approved, extend subscription
      if (approved) {
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
              updated_at: new Date().toISOString(),
            })
            .eq("id", currentSub.id);
          if (subUpdateError) {
            reportError(subUpdateError, "admin.billing.manual_payment.subscription.update_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
              subscription_id: currentSub.id,
            });
            console.error("Subscription update error:", subUpdateError);
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
              updated_at: new Date().toISOString(),
            });
          if (subInsertError) {
            reportError(subInsertError, "admin.billing.manual_payment.subscription.insert_failed", {
              invoice_id: selectedInvoice.id,
              tenant_id: selectedInvoice.tenant_id,
            });
            console.error("Subscription insert error:", subInsertError);
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
          console.error("Failed to check existing financial ledger row:", existingLedgerError);
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
            console.error("Failed to insert financial ledger row:", ledgerInsertError);
          }
        }

        const { error: streakSyncError } = await supabase.rpc("mark_streak_invoiced", {
          p_tenant_id: selectedInvoice.tenant_id,
          p_invoice_id: selectedInvoice.id,
        });
        if (streakSyncError) {
          reportError(streakSyncError, "admin.billing.manual_payment.streak_sync_failed", {
            invoice_id: selectedInvoice.id,
            tenant_id: selectedInvoice.tenant_id,
          });
          console.error("Failed to sync streak invoiced state:", streakSyncError);
        }

        const [waDispatch, emailDispatch] = await Promise.all([
          supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
            "dispatch-billing-whatsapp",
            {
              body: {
                invoice_id: selectedInvoice.id,
                trigger: "ADMIN_VERIFY_MANUAL",
              },
            },
          ),
          supabase.functions.invoke<{ success?: boolean; error?: string; trace_id?: string }>(
            "dispatch-billing-email",
            {
              body: {
                invoice_id: selectedInvoice.id,
                trigger: "ADMIN_VERIFY_MANUAL",
              },
            },
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

      toast.success(approved ? "Pembayaran berhasil diverifikasi" : "Pembayaran ditolak");
      setShowVerifyDialog(false);
      setSelectedInvoice(null);
      refetch();
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
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
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
                      <Button variant="outline" size="sm" asChild>
                        <a href={invoice.payment_proof_url} target="_blank" rel="noopener noreferrer">
                          <FileImage className="mr-2 h-4 w-4" />
                          Bukti
                        </a>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verifikasi Pembayaran Manual</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedInvoice.tenant?.name}</span>
                    </div>
                    <Badge variant="outline">{selectedInvoice.tenant?.code}</Badge>
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

              {selectedInvoice.payment_proof_url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedInvoice.payment_proof_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Lihat Bukti Pembayaran
                  </a>
                </Button>
              )}

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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleVerify(false)}
              disabled={isProcessing || !rejectionReason}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Tolak
            </Button>
            <Button onClick={() => handleVerify(true)} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle className="mr-2 h-4 w-4" />
              Setujui & Aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
