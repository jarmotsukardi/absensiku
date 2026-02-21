import { useEffect, useMemo, useState } from "react";
import { useInvoices, Invoice } from "@/hooks/useBilling";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  FileText,
  Building2,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

type InvoicesFilterMode = "all" | "invalid_number";

interface InvoicesManagerProps {
  filterMode?: InvoicesFilterMode;
  onClearFilterMode?: () => void;
}

const INVOICE_NUMBER_PATTERN = /^INV-\d{6}-\d{4,}$/;

const isInvoiceNumberValid = (invoiceNumber: string | null | undefined): boolean => {
  if (!invoiceNumber) return false;
  return INVOICE_NUMBER_PATTERN.test(invoiceNumber.trim());
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  AWAITING_VERIFICATION: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-800",
  REFUNDED: "bg-purple-100 text-purple-800",
};

const statusLabels: Record<string, string> = {
  PENDING: "Menunggu",
  AWAITING_VERIFICATION: "Verifikasi",
  PAID: "Lunas",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  REFUNDED: "Refund",
};

export function InvoicesManager({ filterMode = "all", onClearFilterMode }: InvoicesManagerProps) {
  const ITEMS_PER_PAGE = 10;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { invoices, isLoading, verifyPayment } = useInvoices(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        if (filterMode === "invalid_number" && isInvoiceNumberValid(inv.invoice_number)) {
          return false;
        }

        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          (inv.invoice_number || "").toLowerCase().includes(query) ||
          inv.tenant?.name?.toLowerCase().includes(query) ||
          inv.tenant?.code?.toLowerCase().includes(query)
        );
      }),
    [filterMode, invoices, searchQuery],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, invoices.length]);

  useEffect(() => {
    if (filterMode === "invalid_number" && statusFilter !== "all") {
      setStatusFilter("all");
    }
  }, [filterMode, statusFilter]);

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailDialog(true);
  };

  const handleVerifyClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setRejectionReason("");
    setShowVerifyDialog(true);
  };

  const handleVerify = async (approved: boolean) => {
    if (!selectedInvoice) return;
    setIsProcessing(true);
    try {
      await verifyPayment(selectedInvoice.id, approved, approved ? undefined : rejectionReason);
      setShowVerifyDialog(false);
      setSelectedInvoice(null);
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
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari invoice, nama organisasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="PENDING">Menunggu</SelectItem>
            <SelectItem value="AWAITING_VERIFICATION">Perlu Verifikasi</SelectItem>
            <SelectItem value="PAID">Lunas</SelectItem>
            <SelectItem value="EXPIRED">Kedaluwarsa</SelectItem>
            <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filterMode === "invalid_number" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          Menampilkan hanya invoice dengan format nomor faktur tidak valid.
          <Button variant="link" className="h-auto p-0 text-red-700" onClick={onClearFilterMode}>
            Tampilkan semua
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Invoice</TableHead>
              <TableHead>Organisasi</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Jatuh Tempo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {filterMode === "invalid_number"
                    ? "Tidak ada invoice dengan format nomor faktur tidak valid"
                    : "Tidak ada invoice ditemukan"}
                </TableCell>
              </TableRow>
            ) : (
              paginatedInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-sm">
                    <span className={!isInvoiceNumberValid(invoice.invoice_number) ? "text-red-700 font-semibold" : undefined}>
                      {invoice.invoice_number}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{invoice.tenant?.name || "-"}</p>
                      <p className="text-xs text-muted-foreground">{invoice.tenant?.code}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {invoice.package_name || "Custom"}
                    {invoice.package_duration_months && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({invoice.package_duration_months} bln)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(invoice.gross_amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {invoice.payment_method_type === "XENDIT" ? "Online" : 
                       invoice.payment_method_type === "MANUAL_TRANSFER" ? "Transfer" : "-"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(invoice.due_date), "dd MMM yyyy", { locale: id })}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[invoice.status]}>
                      {statusLabels[invoice.status] || invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleViewDetail(invoice)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(invoice.status === "AWAITING_VERIFICATION" || invoice.status === "PENDING") && (
                        <Button variant="ghost" size="icon" onClick={() => handleVerifyClick(invoice)}>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filteredInvoices.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {currentPage} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Berikutnya
            </Button>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detail Invoice
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-lg font-bold">{selectedInvoice.invoice_number}</p>
                  <Badge className={statusColors[selectedInvoice.status]}>
                    {statusLabels[selectedInvoice.status]}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{formatCurrency(selectedInvoice.gross_amount)}</p>
                </div>
              </div>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{selectedInvoice.tenant?.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedInvoice.tenant?.code}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Paket</p>
                      <p className="font-medium">{selectedInvoice.package_name || "Custom"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Durasi</p>
                      <p className="font-medium">{selectedInvoice.package_duration_months || 1} Bulan</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Jumlah Pegawai</p>
                      <p className="font-medium">{selectedInvoice.employee_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Harga/Pegawai</p>
                      <p className="font-medium">{formatCurrency(selectedInvoice.price_per_employee)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.discount_amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Diskon</span>
                      <span>-{formatCurrency(selectedInvoice.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PPN ({selectedInvoice.vat_percentage}%)</span>
                    <span>{formatCurrency(selectedInvoice.vat_amount)}</span>
                  </div>
                  {selectedInvoice.xendit_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Biaya Layanan</span>
                      <span>{formatCurrency(selectedInvoice.xendit_fee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total</span>
                    <span>{formatCurrency(selectedInvoice.gross_amount)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Net Revenue</span>
                    <span>{formatCurrency(selectedInvoice.net_amount)}</span>
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifikasi Pembayaran</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <p>
                Verifikasi pembayaran untuk invoice <strong>{selectedInvoice.invoice_number}</strong>?
              </p>
              <p className="text-lg font-bold">{formatCurrency(selectedInvoice.gross_amount)}</p>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Alasan penolakan (jika ditolak):</p>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Contoh: Bukti pembayaran tidak valid"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleVerify(false)}
              disabled={isProcessing}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Tolak
            </Button>
            <Button onClick={() => handleVerify(true)} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle className="mr-2 h-4 w-4" />
              Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
