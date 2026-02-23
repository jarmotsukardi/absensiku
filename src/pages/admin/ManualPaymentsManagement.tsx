import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { 
  CreditCard, 
  Check, 
  X,
  Loader2,
  Search,
  Eye,
  Building2,
  Receipt,
} from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface ManualPayment {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  amount: number;
  payment_method: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  transfer_proof_url: string | null;
  reference_number: string | null;
  payment_date: string | null;
  status: string;
  rejection_reason: string | null;
  notes: string | null;
  invoice_number: string | null;
  created_at: string;
  tenant?: {
    name: string;
    code: string;
    organization_type: string;
  };
}

const ITEMS_PER_PAGE = 15;

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Menunggu Verifikasi", variant: "secondary" },
  verified: { label: "Terverifikasi", variant: "default" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

export default function ManualPaymentsManagement() {
  const ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX = 1;
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      setIsRetrying(false);
      setLoadError(null);
      let query = supabase
        .from("manual_payments")
        .select(`
          *,
          tenant:tenant_id(name, code, organization_type)
        `)
        .order("created_at", { ascending: false });

      if (activeTab !== "all") {
        query = query.eq("status", activeTab);
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.fetch timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setPayments(data || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.manual_payments.fetch", { tab: activeTab });
      const message = appendErrorReference("Gagal memuat data pembayaran manual", errorRef);
      setLoadError(message);
      setPayments([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleVerify = async (payment: ManualPayment) => {
    try {
      setIsRetrying(false);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.verify.get_user timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      const { data: empData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("id")
              .eq("user_id", user?.id)
              .maybeSingle(),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.verify.employee timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      // Update payment status
      const { error: paymentError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("manual_payments")
              .update({
                status: "verified",
                verified_by: empData?.id || null,
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", payment.id),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.verify.update_payment timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (paymentError) throw paymentError;

      // Extend subscription if applicable
      if (payment.subscription_id) {
        // Add 30 days to subscription
        const { error: subscriptionError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("subscriptions")
                .update({
                  status: "active",
                  end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  updated_at: new Date().toISOString(),
                })
                .eq("id", payment.subscription_id),
              ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
              "admin.manual_payments.verify.update_subscription timeout",
            ),
          {
            maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (subscriptionError) throw subscriptionError;
      }

      toast.success("Pembayaran berhasil diverifikasi");
      setIsDetailOpen(false);
      fetchPayments();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.manual_payments.verify", { payment_id: payment.id });
      toast.error(appendErrorReference("Gagal memverifikasi pembayaran", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason) {
      toast.error("Alasan penolakan harus diisi");
      return;
    }

    try {
      setIsRetrying(false);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.reject.get_user timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      const { data: empData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("id")
              .eq("user_id", user?.id)
              .maybeSingle(),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.reject.employee timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("manual_payments")
              .update({
                status: "rejected",
                rejection_reason: rejectionReason,
                verified_by: empData?.id || null,
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", selectedPayment.id),
            ADMIN_MANUAL_PAYMENTS_QUERY_TIMEOUT_MS,
            "admin.manual_payments.reject.update timeout",
          ),
        {
          maxRetries: ADMIN_MANUAL_PAYMENTS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      toast.success("Pembayaran berhasil ditolak");
      setIsRejectOpen(false);
      setIsDetailOpen(false);
      setRejectionReason("");
      fetchPayments();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.manual_payments.reject", { payment_id: selectedPayment.id });
      toast.error(appendErrorReference("Gagal menolak pembayaran", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const openDetail = (payment: ManualPayment) => {
    setSelectedPayment(payment);
    setIsDetailOpen(true);
  };

  const filteredPayments = payments.filter(p =>
    p.tenant?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / ITEMS_PER_PAGE));
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, payments.length]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Konfirmasi Pembayaran Manual
          </h1>
          <p className="text-muted-foreground">Verifikasi pembayaran transfer dari organisasi</p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchPayments()}>
                Coba Lagi
              </Button>
            </div>
          </div>
        )}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang koneksi data pembayaran manual...
          </div>
        )}

        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="overflow-x-auto pb-1">
                  <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                    <TabsTrigger value="pending" className="whitespace-nowrap">Menunggu</TabsTrigger>
                    <TabsTrigger value="verified" className="whitespace-nowrap">Terverifikasi</TabsTrigger>
                    <TabsTrigger value="rejected" className="whitespace-nowrap">Ditolak</TabsTrigger>
                    <TabsTrigger value="all" className="whitespace-nowrap">Semua</TabsTrigger>
                  </TabsList>
                </div>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari organisasi / no. referensi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisasi</TableHead>
                      <TableHead>Nominal</TableHead>
                      <TableHead>Metode</TableHead>
                      <TableHead>No. Referensi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Tidak ada data pembayaran
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{payment.tenant?.name}</p>
                                <p className="text-xs text-muted-foreground">{payment.tenant?.code}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{payment.bank_name || payment.payment_method}</TableCell>
                          <TableCell>{payment.reference_number || "-"}</TableCell>
                          <TableCell>
                            {payment.payment_date 
                              ? format(parseISO(payment.payment_date), "dd MMM yyyy", { locale: idLocale })
                              : format(parseISO(payment.created_at), "dd MMM yyyy", { locale: idLocale })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadge[payment.status]?.variant || "secondary"}>
                              {statusBadge[payment.status]?.label || payment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openDetail(payment)}>
                              <Eye className="h-4 w-4 mr-1" />
                              Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-muted-foreground">
                      Halaman {currentPage} dari {totalPages}
                    </span>
                    <Pagination className="mx-0 w-auto justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              if (currentPage > 1) {
                                setCurrentPage((page) => page - 1);
                              }
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {pageNumbers.map((page) => (
                          <PaginationItem key={`manual-payment-page-${page}`}>
                            <PaginationLink
                              href="#"
                              isActive={page === currentPage}
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              if (currentPage < totalPages) {
                                setCurrentPage((page) => page + 1);
                              }
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Pembayaran</DialogTitle>
              <DialogDescription>Informasi lengkap pembayaran</DialogDescription>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Organisasi</Label>
                    <p className="font-medium">{selectedPayment.tenant?.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Nominal</Label>
                    <p className="font-medium text-lg">{formatCurrency(selectedPayment.amount)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Bank</Label>
                    <p className="font-medium">{selectedPayment.bank_name || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">No. Rekening</Label>
                    <p className="font-medium">{selectedPayment.account_number || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Atas Nama</Label>
                    <p className="font-medium">{selectedPayment.account_name || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">No. Referensi</Label>
                    <p className="font-medium">{selectedPayment.reference_number || "-"}</p>
                  </div>
                </div>

                {selectedPayment.transfer_proof_url && (
                  <div>
                    <Label className="text-muted-foreground">Bukti Transfer</Label>
                    <a 
                      href={selectedPayment.transfer_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Lihat Bukti Transfer
                    </a>
                  </div>
                )}

                {selectedPayment.notes && (
                  <div>
                    <Label className="text-muted-foreground">Catatan</Label>
                    <p>{selectedPayment.notes}</p>
                  </div>
                )}

                {selectedPayment.status === "rejected" && selectedPayment.rejection_reason && (
                  <div className="p-3 bg-destructive/10 rounded-lg">
                    <Label className="text-destructive">Alasan Penolakan</Label>
                    <p className="text-destructive">{selectedPayment.rejection_reason}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Verifikasi akan mengubah status pembayaran manual secara permanen.</DialogActionHint>
              {selectedPayment?.status === "pending" && (
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="destructive"
                    onClick={() => setIsRejectOpen(true)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Tolak
                  </Button>
                  <Button className="w-full sm:w-auto" onClick={() => handleVerify(selectedPayment)}>
                    <Check className="h-4 w-4 mr-1" />
                    Verifikasi
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tolak Pembayaran</DialogTitle>
              <DialogDescription>Berikan alasan penolakan pembayaran</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Alasan Penolakan *</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Jelaskan alasan penolakan..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Alasan penolakan akan dikirim sebagai catatan review pembayaran.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setIsRejectOpen(false)}>Batal</Button>
                <Button className="w-full sm:w-auto" variant="destructive" onClick={handleReject}>Tolak Pembayaran</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
