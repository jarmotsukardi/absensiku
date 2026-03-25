import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ArchivedManualPayment {
  id: string;
  tenant_id: string;
  invoice_number: string | null;
  amount: number;
  confirmed_amount: number | null;
  verified_amount: number | null;
  payment_date: string | null;
  reference_number: string | null;
  transfer_proof_path: string | null;
  transfer_proof_url: string | null;
  archived_at: string | null;
  archive_expires_at: string | null;
  status: string | null;
  verification_method: string | null;
}

interface TenantLite {
  id: string;
  name: string | null;
  code: string | null;
}

const PAGE_SIZE = 10;
const PAYMENT_PROOF_BUCKET = "payment-proofs";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const formatDateTimeId = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd MMM yyyy HH:mm", { locale: id });
};

const getDaysRemaining = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;
  const diff = expiry - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};

export function ManualPaymentArchive() {
  const ARCHIVE_TIMEOUT_MS = 12000;
  const ARCHIVE_RETRIES = 2;
  const [rows, setRows] = useState<ArchivedManualPayment[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Map<string, TenantLite>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [selectedArchive, setSelectedArchive] = useState<ArchivedManualPayment | null>(null);
  const [selectedArchiveProofUrl, setSelectedArchiveProofUrl] = useState("");
  const [isLoadingSelectedProof, setIsLoadingSelectedProof] = useState(false);

  const fetchArchiveRows = useCallback(async () => {
    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    try {
      const [archiveRes, retentionRes] = await withExponentialBackoff(
        async () =>
          withTimeout(
            Promise.all([
              supabase
                .from("manual_payments")
                .select(
                  "id, tenant_id, invoice_number, amount, confirmed_amount, verified_amount, payment_date, reference_number, transfer_proof_url, transfer_proof_path, archived_at, archive_expires_at, status, verification_method",
                )
                .eq("is_archived", true)
                .order("archived_at", { ascending: false })
                .limit(500),
              supabase
                .from("system_settings")
                .select("value")
                .eq("key", "payment_archive_retention_days")
                .maybeSingle(),
            ]),
            ARCHIVE_TIMEOUT_MS,
            "Memuat arsip pembayaran terlalu lama",
          ),
        {
          maxRetries: ARCHIVE_RETRIES,
          baseDelay: 500,
          shouldRetry: (err) => isRetryableError(err),
          onRetry: () => setIsRetrying(true),
        },
      );
      if (archiveRes.error) throw archiveRes.error;

      const retentionRaw = (retentionRes.data?.value as { value?: unknown } | number | string | null) ?? 7;
      const retentionValue =
        typeof retentionRaw === "number"
          ? retentionRaw
          : typeof retentionRaw === "string"
            ? Number(retentionRaw)
            : Number(retentionRaw?.value ?? 7);
      setRetentionDays(Math.min(365, Math.max(1, Number.isFinite(retentionValue) ? Math.floor(retentionValue) : 7)));

      const archivedRows = (archiveRes.data || []) as ArchivedManualPayment[];
      setRows(archivedRows);

      const tenantIds = Array.from(new Set(archivedRows.map((row) => row.tenant_id).filter(Boolean)));
      if (tenantIds.length === 0) {
        setTenantsMap(new Map());
        return;
      }

      const { data: tenantRows, error: tenantError } = await withTimeout(
        supabase
          .from("tenants")
          .select("id, name, code")
          .in("id", tenantIds),
        ARCHIVE_TIMEOUT_MS,
        "Memuat data tenant arsip terlalu lama",
      );
      if (tenantError) throw tenantError;

      const nextMap = new Map<string, TenantLite>();
      for (const tenant of (tenantRows || []) as TenantLite[]) {
        nextMap.set(tenant.id, tenant);
      }
      setTenantsMap(nextMap);
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.manual_payment_archive.fetch");
      toast.error(appendErrorReference("Gagal memuat arsip validasi pembayaran", errorRef));
      setLoadError(appendErrorReference("Gagal memuat arsip validasi pembayaran.", errorRef));
      setRows([]);
      setTenantsMap(new Map());
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArchiveRows();
  }, [fetchArchiveRows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const tenant = tenantsMap.get(row.tenant_id);
      const tenantName = (tenant?.name || "").toLowerCase();
      const tenantCode = (tenant?.code || "").toLowerCase();
      return (
        (row.invoice_number || "").toLowerCase().includes(needle) ||
        tenantName.includes(needle) ||
        tenantCode.includes(needle) ||
        (row.reference_number || "").toLowerCase().includes(needle)
      );
    });
  }, [query, rows, tenantsMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filteredRows.length]);

  const openArchiveDetail = useCallback((row: ArchivedManualPayment) => {
    setSelectedArchive(row);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const toPublicUrlFromPath = (path: string | null): string => {
      const normalized = (path || "").trim();
      if (!normalized) return "";
      return supabase.storage.from(PAYMENT_PROOF_BUCKET).getPublicUrl(normalized).data.publicUrl || "";
    };

    const resolveSelectedProofUrl = async () => {
      if (!selectedArchive) {
        setSelectedArchiveProofUrl("");
        setIsLoadingSelectedProof(false);
        return;
      }

      const directProofUrl = (selectedArchive.transfer_proof_url || "").trim();
      if (directProofUrl) {
        setSelectedArchiveProofUrl(directProofUrl);
        setIsLoadingSelectedProof(false);
        return;
      }

      const directProofUrlFromPath = toPublicUrlFromPath(selectedArchive.transfer_proof_path);
      if (directProofUrlFromPath) {
        setSelectedArchiveProofUrl(directProofUrlFromPath);
        setIsLoadingSelectedProof(false);
        return;
      }

      const invoiceNumber = (selectedArchive.invoice_number || "").trim();
      if (!invoiceNumber) {
        setSelectedArchiveProofUrl("");
        setIsLoadingSelectedProof(false);
        return;
      }

      setSelectedArchiveProofUrl("");
      setIsLoadingSelectedProof(true);
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("invoices")
            .select("payment_proof_url")
            .eq("tenant_id", selectedArchive.tenant_id)
            .eq("invoice_number", invoiceNumber)
            .maybeSingle(),
          ARCHIVE_TIMEOUT_MS,
          "Memuat bukti transfer arsip terlalu lama",
        );
        if (error) throw error;
        if (isCancelled) return;
        const invoiceProofUrl = (data?.payment_proof_url || "").trim();
        if (invoiceProofUrl) {
          setSelectedArchiveProofUrl(invoiceProofUrl);
          return;
        }

        const { data: fallbackManualRows, error: fallbackManualRowsError } = await withTimeout(
          supabase
            .from("manual_payments")
            .select("transfer_proof_url, transfer_proof_path")
            .eq("tenant_id", selectedArchive.tenant_id)
            .eq("invoice_number", invoiceNumber)
            .or("transfer_proof_url.not.is.null,transfer_proof_path.not.is.null")
            .order("created_at", { ascending: false })
            .limit(1),
          ARCHIVE_TIMEOUT_MS,
          "Memuat fallback bukti transfer arsip terlalu lama",
        );
        if (fallbackManualRowsError) throw fallbackManualRowsError;
        if (isCancelled) return;

        const fallbackManualRow = fallbackManualRows?.[0];
        const fallbackManualUrl = (fallbackManualRow?.transfer_proof_url || "").trim();
        if (fallbackManualUrl) {
          setSelectedArchiveProofUrl(fallbackManualUrl);
          return;
        }

        const fallbackManualUrlFromPath = toPublicUrlFromPath(fallbackManualRow?.transfer_proof_path || null);
        setSelectedArchiveProofUrl(fallbackManualUrlFromPath);
      } catch (error) {
        if (isCancelled) return;
        const errorRef = reportError(error, "admin.billing.manual_payment_archive.fetch_invoice_proof_failed", {
          tenant_id: selectedArchive.tenant_id,
          invoice_number: selectedArchive.invoice_number,
        });
        toast.error(appendErrorReference("Gagal memuat bukti transfer arsip", errorRef));
        setSelectedArchiveProofUrl("");
      } finally {
        if (!isCancelled) {
          setIsLoadingSelectedProof(false);
        }
      }
    };

    void resolveSelectedProofUrl();
    return () => {
      isCancelled = true;
    };
  }, [ARCHIVE_TIMEOUT_MS, selectedArchive]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedTenant = selectedArchive ? tenantsMap.get(selectedArchive.tenant_id) : null;
  const selectedProofUrl = selectedArchiveProofUrl.trim();
  const hasSelectedProof = Boolean(selectedProofUrl);
  const selectedProofIsPdf = hasSelectedProof && /\.pdf($|[?#])/i.test(selectedProofUrl);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Arsip Validasi Pembayaran</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Menampilkan arsip pembayaran manual yang sudah diverifikasi. Retensi aktif: <strong>{retentionDays} hari</strong>.
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchArchiveRows()} disabled={isLoading || isRetrying}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Muat Ulang"}
          </Button>
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
              <Button variant="outline" size="sm" onClick={() => void fetchArchiveRows()} disabled={isLoading || isRetrying}>
                Coba Lagi
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari invoice / tenant / referensi..."
            className="pl-9"
          />
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Terverifikasi</TableHead>
                <TableHead>Kedaluwarsa Arsip</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bukti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                      </div>
                      <p className="text-base font-medium text-slate-800">Memuat arsip pembayaran</p>
                      <p className="text-sm text-muted-foreground">
                        Riwayat validasi arsip sedang disiapkan. Mohon tunggu sebentar.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Search className="h-5 w-5 text-slate-500" />
                      </div>
                      <p className="text-base font-medium text-slate-800">Tidak ada data arsip</p>
                      <p className="text-sm text-muted-foreground">
                        Coba ubah kata kunci pencarian atau refresh untuk memuat data terbaru.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const tenant = tenantsMap.get(row.tenant_id);
                  const remainingDays = getDaysRemaining(row.archive_expires_at);
                  const amount = Number(row.verified_amount ?? row.confirmed_amount ?? row.amount ?? 0);
                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openArchiveDetail(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openArchiveDetail(row);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <TableCell className="font-mono text-xs">{row.invoice_number || "-"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{tenant?.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{tenant?.code || row.tenant_id}</div>
                      </TableCell>
                      <TableCell>{formatCurrency(amount)}</TableCell>
                      <TableCell>
                        <div>{formatDateTimeId(row.archived_at)}</div>
                        <div className="text-xs text-muted-foreground">{row.verification_method || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{formatDateTimeId(row.archive_expires_at)}</div>
                        <div className="text-xs">
                          {remainingDays === null ? (
                            <span className="text-muted-foreground">-</span>
                          ) : remainingDays >= 0 ? (
                            <span className="text-amber-700">Sisa {remainingDays} hari</span>
                          ) : (
                            <span className="text-red-700">Lewat {Math.abs(remainingDays)} hari</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status || "verified"}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.transfer_proof_url || row.transfer_proof_path ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              openArchiveDetail(row);
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Lihat
                          </button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Total {filteredRows.length} arsip • Halaman {safePage} dari {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>

        <Dialog open={Boolean(selectedArchive)} onOpenChange={(open) => (!open ? setSelectedArchive(null) : undefined)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Rincian Arsip Pembayaran</DialogTitle>
              <DialogDescription>
                Rincian arsip manual untuk invoice <strong>{selectedArchive?.invoice_number || "-"}</strong>.
              </DialogDescription>
            </DialogHeader>

            {selectedArchive ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice</p>
                    <p className="font-medium font-mono">{selectedArchive.invoice_number || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline">{selectedArchive.status || "verified"}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="font-medium">{selectedTenant?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground">{selectedTenant?.code || selectedArchive.tenant_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nominal Terverifikasi</p>
                    <p className="font-semibold">
                      {formatCurrency(Number(selectedArchive.verified_amount ?? selectedArchive.confirmed_amount ?? selectedArchive.amount ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tanggal Transfer</p>
                    <p className="font-medium">{formatDateTimeId(selectedArchive.payment_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Terverifikasi</p>
                    <p className="font-medium">{formatDateTimeId(selectedArchive.archived_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kedaluwarsa Arsip</p>
                    <p className="font-medium">{formatDateTimeId(selectedArchive.archive_expires_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Metode Verifikasi</p>
                    <p className="font-medium">{selectedArchive.verification_method || "-"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Nomor Referensi</p>
                    <p className="font-medium">{selectedArchive.reference_number || "-"}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Bukti Transfer</p>
                  {isLoadingSelectedProof ? (
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memuat bukti transfer...
                    </div>
                  ) : hasSelectedProof ? (
                    <div className="space-y-2">
                      {selectedProofIsPdf ? (
                        <iframe
                          src={selectedProofUrl}
                          title={`Bukti transfer ${selectedArchive.invoice_number || "-"}`}
                          className="h-[52vh] w-full rounded-md border bg-white"
                        />
                      ) : (
                        <img
                          src={selectedProofUrl}
                          alt={`Bukti transfer ${selectedArchive.invoice_number || "-"}`}
                          className="max-h-[52vh] w-full rounded-md border object-contain"
                        />
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedProofUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Buka bukti di tab baru
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Tidak ada file bukti transfer pada arsip ini.</p>
                  )}
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedArchive(null)}>
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
