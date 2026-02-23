import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface WalletTopupAdminRow {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_code: string | null;
  requested_amount: number;
  approved_amount: number | null;
  status: string;
  reference_number: string | null;
  notes: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd MMM yyyy HH:mm", { locale: id });
};

const getStatusMeta = (status: string | null | undefined) => {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return { label: "Disetujui", className: "border-green-300 bg-green-50 text-green-700" };
    case "REJECTED":
      return { label: "Ditolak", className: "border-red-300 bg-red-50 text-red-700" };
    case "CANCELLED":
      return { label: "Dibatalkan", className: "border-zinc-300 bg-zinc-100 text-zinc-700" };
    default:
      return { label: "Menunggu", className: "border-amber-300 bg-amber-50 text-amber-700" };
  }
};

interface WalletTopupVerificationProps {
  focusRequestId?: string | null;
  sourceErrorRef?: string | null;
}

export function WalletTopupVerification({
  focusRequestId = null,
  sourceErrorRef = null,
}: WalletTopupVerificationProps) {
  const FETCH_TIMEOUT_MS = 12000;
  const FETCH_RETRY_MAX = 2;
  const REVIEW_TIMEOUT_MS = 12000;
  const REVIEW_RETRY_MAX = 1;
  const navigate = useNavigate();
  const [rows, setRows] = useState<WalletTopupAdminRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [query, setQuery] = useState("");

  const [selectedRow, setSelectedRow] = useState<WalletTopupAdminRow | null>(null);
  const [reviewAction, setReviewAction] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [approvedAmountInput, setApprovedAmountInput] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingSourceError, setIsResolvingSourceError] = useState(false);
  const [isResolveConfirmOpen, setIsResolveConfirmOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    try {
      const { data, error } = await withExponentialBackoff(
        async () =>
          withTimeout(
            supabase.rpc("get_wallet_topup_requests_admin" as never, {
              p_status: statusFilter === "ALL" ? null : statusFilter,
              p_limit: 200,
              p_offset: 0,
            } as never),
            FETCH_TIMEOUT_MS,
            "Memuat data topup saldo terlalu lama",
          ),
        {
          maxRetries: FETCH_RETRY_MAX,
          baseDelay: 450,
          shouldRetry: (err) => isRetryableError(err),
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;

      const payload = data as { rows?: WalletTopupAdminRow[] } | null;
      const nextRows = (payload?.rows || []).map((row) => ({
        ...row,
        requested_amount: Number(row.requested_amount || 0),
        approved_amount: row.approved_amount === null ? null : Number(row.approved_amount || 0),
      }));
      setRows(nextRows);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.wallet_topup.fetch");
      toast.error(appendErrorReference("Gagal memuat data topup saldo.", errorRef));
      setLoadError(appendErrorReference("Gagal memuat data topup saldo.", errorRef));
      setRows([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!focusRequestId) return;
    setStatusFilter("ALL");
  }, [focusRequestId]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      return (
        (row.tenant_name || "").toLowerCase().includes(needle) ||
        (row.tenant_code || "").toLowerCase().includes(needle) ||
        (row.reference_number || "").toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle)
      );
    });
  }, [query, rows]);

  const openReviewDialog = (row: WalletTopupAdminRow) => {
    setSelectedRow(row);
    setReviewAction("APPROVE");
    setApprovedAmountInput(String(Math.max(0, Math.round(row.requested_amount || 0))));
    setReviewNotes("");
    setRejectionReason("");
    setIsDialogOpen(true);
  };

  const submitReview = async () => {
    if (!selectedRow) return;
    setIsSubmitting(true);
    try {
      const approvedAmount = Number(approvedAmountInput.replace(/[^\d]/g, ""));
      if (reviewAction === "APPROVE" && (!Number.isFinite(approvedAmount) || approvedAmount <= 0)) {
        toast.error("Nominal persetujuan harus valid.");
        return;
      }
      if (reviewAction === "REJECT" && rejectionReason.trim().length < 3) {
        toast.error("Alasan penolakan minimal 3 karakter.");
        return;
      }

      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("review_wallet_topup_request" as never, {
              p_request_id: selectedRow.id,
              p_action: reviewAction,
              p_approved_amount: reviewAction === "APPROVE" ? approvedAmount : null,
              p_rejection_reason: reviewAction === "REJECT" ? rejectionReason.trim() : null,
              p_notes: reviewNotes.trim() || null,
            } as never),
            REVIEW_TIMEOUT_MS,
            "Memproses review topup terlalu lama",
          ),
        {
          maxRetries: REVIEW_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;

      const dispatchRes = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.functions.invoke<{
              success?: boolean;
              trace_id?: string;
              channels?: {
                whatsapp?: { ok?: boolean; skipped?: boolean; reason?: string; error?: string };
                email?: { ok?: boolean; skipped?: boolean; reason?: string; error?: string };
              };
              error?: string;
            }>("dispatch-wallet-topup-notification", {
              body: {
                topup_request_id: selectedRow.id,
                trigger: "ADMIN_REVIEW_TOPUP",
              },
            }),
            REVIEW_TIMEOUT_MS,
            "Mengirim notifikasi topup terlalu lama",
          ),
        {
          maxRetries: REVIEW_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (dispatchRes.error || dispatchRes.data?.success === false) {
        const errorRef = reportError(dispatchRes.error || dispatchRes.data || "topup notification dispatch failed", "admin.billing.wallet_topup.dispatch_failed", {
          request_id: selectedRow.id,
          action: reviewAction,
          trace_id: dispatchRes.data?.trace_id || null,
        });
        toast.warning(
          appendErrorReference(
            dispatchRes.data?.trace_id
              ? `Review berhasil, tetapi dispatch notifikasi WA/Email gagal (Ref: ${dispatchRes.data.trace_id})`
              : "Review berhasil, tetapi dispatch notifikasi WA/Email gagal.",
            errorRef,
          ),
        );
      } else {
        const waState = dispatchRes.data?.channels?.whatsapp;
        const emailState = dispatchRes.data?.channels?.email;
        const hasChannelFailure =
          (waState && waState.ok === false && waState.skipped !== true) ||
          (emailState && emailState.ok === false && emailState.skipped !== true);
        if (hasChannelFailure) {
          const partialRef = reportError(
            {
              whatsapp: waState,
              email: emailState,
              trace_id: dispatchRes.data?.trace_id || null,
            },
            "admin.billing.wallet_topup.dispatch_partial_failed",
            {
              request_id: selectedRow.id,
              action: reviewAction,
              trace_id: dispatchRes.data?.trace_id || null,
            },
          );
          toast.warning(
            appendErrorReference("Review berhasil, tetapi ada channel notifikasi yang gagal terkirim.", partialRef),
          );
        }
      }

      toast.success(reviewAction === "APPROVE" ? "Topup disetujui dan saldo dikreditkan." : "Request topup ditolak.");
      setIsDialogOpen(false);
      setSelectedRow(null);
      await fetchRows();
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.wallet_topup.review", {
        request_id: selectedRow.id,
        action: reviewAction,
      });
      toast.error(appendErrorReference("Gagal memproses review topup.", errorRef));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveSourceErrorAndBack = async () => {
    if (!sourceErrorRef) {
      navigate("/admin/log-errors");
      return;
    }

    setIsResolvingSourceError(true);
    try {
      const nowIso = new Date().toISOString();
      const { data: resolvedRows, error: resolveError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("client_error_logs")
              .update({
                is_resolved: true,
                resolved_at: nowIso,
                resolution_note: "Diselesaikan dari review topup saldo",
              } as never)
              .eq("error_ref", sourceErrorRef)
              .eq("is_resolved", false)
              .select("id, tenant_id"),
            REVIEW_TIMEOUT_MS,
            "Menandai log selesai terlalu lama",
          ),
        {
          maxRetries: REVIEW_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (resolveError) throw resolveError;

      const resolvedCount = Array.isArray(resolvedRows) ? resolvedRows.length : 0;

      const { data: archivedRows, error: archiveError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("client_error_logs")
              .update({
                is_archived: true,
                archived_at: nowIso,
                archive_note: "Auto-arsip dari review topup saldo",
              } as never)
              .eq("error_ref", sourceErrorRef)
              .eq("is_non_critical", false)
              .eq("is_resolved", true)
              .eq("is_archived", false)
              .select("id, tenant_id"),
            REVIEW_TIMEOUT_MS,
            "Mengarsipkan log kritis terlalu lama",
          ),
        {
          maxRetries: REVIEW_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (archiveError) throw archiveError;

      const archivedCount = Array.isArray(archivedRows) ? archivedRows.length : 0;
      const tenantIdFromRows =
        (Array.isArray(resolvedRows) && resolvedRows.find((row) => row.tenant_id)?.tenant_id) ||
        (Array.isArray(archivedRows) && archivedRows.find((row) => row.tenant_id)?.tenant_id) ||
        null;

      const { error: auditError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("log_wallet_topup_error_resolution_audit" as never, {
              p_error_ref: sourceErrorRef,
              p_topup_request_id: focusRequestId || null,
              p_tenant_id: tenantIdFromRows,
              p_resolved_count: resolvedCount,
              p_archived_count: archivedCount,
            } as never),
            REVIEW_TIMEOUT_MS,
            "Mencatat audit penyelesaian log terlalu lama",
          ),
        {
          maxRetries: REVIEW_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (auditError) {
        reportError(auditError, "admin.billing.wallet_topup.audit_log_failed", {
          source_error_ref: sourceErrorRef,
          topup_request_id: focusRequestId || null,
          resolved_count: resolvedCount,
          archived_count: archivedCount,
        });
      }

      if (resolvedCount > 0 || archivedCount > 0) {
        toast.success(`Log diproses: selesai ${resolvedCount}, arsip kritis ${archivedCount}.`);
      } else {
        toast.info("Tidak ada log aktif yang perlu ditandai selesai.");
      }

      navigate(`/admin/log-errors?errorRef=${encodeURIComponent(sourceErrorRef)}`);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.wallet_topup.resolve_source_error", {
        source_error_ref: sourceErrorRef,
      });
      toast.error(appendErrorReference("Gagal menandai log error sebagai selesai.", errorRef));
    } finally {
      setIsResolvingSourceError(false);
      setIsRetrying(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Topup Saldo Wallet</CardTitle>
          {sourceErrorRef ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/log-errors?errorRef=${encodeURIComponent(sourceErrorRef)}`)}
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Kembali ke Log Error
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsResolveConfirmOpen(true)}
                disabled={isResolvingSourceError}
              >
                {isResolvingSourceError ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Kembali & Tandai Selesai
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Menunggu</SelectItem>
                <SelectItem value="APPROVED">Disetujui</SelectItem>
                <SelectItem value="REJECTED">Ditolak</SelectItem>
                <SelectItem value="ALL">Semua</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void fetchRows()} disabled={isLoading || isRetrying}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari tenant / referensi..."
              className="pl-9"
            />
          </div>
        </div>
        {isRetrying ? (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Mencoba memuat ulang otomatis...
          </div>
        ) : null}
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={isLoading || isRetrying}>
                Coba Lagi
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                      </div>
                      <p className="text-base font-medium text-slate-800">Memuat request topup</p>
                      <p className="text-sm text-muted-foreground">
                        Data pengajuan topup sedang disiapkan. Mohon tunggu sebentar.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Search className="h-5 w-5 text-slate-500" />
                      </div>
                      <p className="text-base font-medium text-slate-800">Tidak ada request topup</p>
                      <p className="text-sm text-muted-foreground">
                        Ubah filter status atau kata kunci jika Anda mencari pengajuan tertentu.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const statusMeta = getStatusMeta(row.status);
                  const isFocused = Boolean(focusRequestId) && row.id === focusRequestId;
                  return (
                    <TableRow key={row.id} className={isFocused ? "bg-amber-50/70" : undefined}>
                      <TableCell>
                        <div className="font-medium">{row.tenant_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.tenant_code || row.tenant_id}</div>
                        {isFocused ? <div className="text-xs font-medium text-amber-700">Target dari Log Error</div> : null}
                      </TableCell>
                      <TableCell>{formatDate(row.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{formatCurrency(row.requested_amount)}</div>
                        {row.approved_amount !== null ? (
                          <div className="text-xs text-muted-foreground">Disetujui: {formatCurrency(row.approved_amount)}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">{row.reference_number || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusMeta.className}>
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "PENDING" ? (
                          <Button size="sm" onClick={() => openReviewDialog(row)}>
                            Review
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{formatDate(row.reviewed_at)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Request Topup</DialogTitle>
          </DialogHeader>

          {selectedRow ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="font-medium">{selectedRow.tenant_name || "-"}</div>
                <div className="text-xs text-muted-foreground">{selectedRow.tenant_code || selectedRow.tenant_id}</div>
                <div className="mt-2 text-sm">Nominal request: <strong>{formatCurrency(selectedRow.requested_amount)}</strong></div>
                <div className="text-xs text-muted-foreground">Ref: {selectedRow.reference_number || "-"}</div>
              </div>

              <div className="space-y-2">
                <Label>Aksi</Label>
                <Select value={reviewAction} onValueChange={(value) => setReviewAction(value as "APPROVE" | "REJECT") }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVE">Setujui</SelectItem>
                    <SelectItem value="REJECT">Tolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reviewAction === "APPROVE" ? (
                <div className="space-y-2">
                  <Label>Nominal Disetujui</Label>
                  <Input
                    inputMode="numeric"
                    value={approvedAmountInput}
                    onChange={(event) => setApprovedAmountInput(event.target.value)}
                    placeholder="Nominal yang dikreditkan"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Alasan Penolakan</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Alasan penolakan"
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Catatan Admin (opsional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Catatan internal"
                  rows={2}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitReview()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isResolveConfirmOpen} onOpenChange={setIsResolveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tandai Log Selesai & Arsipkan?</AlertDialogTitle>
            <AlertDialogDescription>
              Aksi ini akan menandai log sumber sebagai selesai, mengarsipkan log kritis terkait, lalu kembali ke
              halaman Log Error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResolvingSourceError}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void resolveSourceErrorAndBack();
                setIsResolveConfirmOpen(false);
              }}
              disabled={isResolvingSourceError}
            >
              {isResolvingSourceError ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ya, Proses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
