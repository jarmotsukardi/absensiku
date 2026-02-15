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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { 
  CreditCard, 
  Check, 
  X,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building2,
  Receipt,
} from "lucide-react";

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
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

      const { data, error } = await query;

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleVerify = async (payment: ManualPayment) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      // Update payment status
      const { error: paymentError } = await supabase
        .from("manual_payments")
        .update({
          status: "verified",
          verified_by: empData?.id || null,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (paymentError) throw paymentError;

      // Extend subscription if applicable
      if (payment.subscription_id) {
        // Add 30 days to subscription
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.subscription_id);
      }

      toast.success("Pembayaran berhasil diverifikasi");
      setIsDetailOpen(false);
      fetchPayments();
    } catch (error) {
      toast.error("Gagal memverifikasi pembayaran");
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason) {
      toast.error("Alasan penolakan harus diisi");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const { error } = await supabase
        .from("manual_payments")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason,
          verified_by: empData?.id || null,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPayment.id);

      if (error) throw error;

      toast.success("Pembayaran berhasil ditolak");
      setIsRejectOpen(false);
      setIsDetailOpen(false);
      setRejectionReason("");
      fetchPayments();
    } catch (error) {
      toast.error("Gagal menolak pembayaran");
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

  const totalPages = Math.ceil(filteredPayments.length / ITEMS_PER_PAGE);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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

        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                <TabsList>
                  <TabsTrigger value="pending">Menunggu</TabsTrigger>
                  <TabsTrigger value="verified">Terverifikasi</TabsTrigger>
                  <TabsTrigger value="rejected">Ditolak</TabsTrigger>
                  <TabsTrigger value="all">Semua</TabsTrigger>
                </TabsList>
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
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Halaman {currentPage} dari {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
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
            <DialogFooter>
              {selectedPayment?.status === "pending" && (
                <>
                  <Button 
                    variant="destructive" 
                    onClick={() => setIsRejectOpen(true)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Tolak
                  </Button>
                  <Button onClick={() => handleVerify(selectedPayment)}>
                    <Check className="h-4 w-4 mr-1" />
                    Verifikasi
                  </Button>
                </>
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Batal</Button>
              <Button variant="destructive" onClick={handleReject}>Tolak Pembayaran</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
