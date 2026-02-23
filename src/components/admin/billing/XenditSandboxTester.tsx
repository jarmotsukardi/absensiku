 import { useState } from "react";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Badge } from "@/components/ui/badge";
 import { Textarea } from "@/components/ui/textarea";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { 
   TestTube2, 
   Play, 
   CheckCircle, 
   XCircle, 
   Clock,
   CreditCard,
   Smartphone,
   Building2,
   Loader2,
   RefreshCw,
   FileText
 } from "lucide-react";
 import { toast } from "sonner";
 import { format } from "date-fns";
 import { appendErrorReference, reportError } from "@/lib/errorLogger";
 import { withTimeout } from "@/lib/attendanceResilience";
 
 interface SimulatedInvoice {
   id: string;
   invoice_number: string;
   amount: number;
   status: "PENDING" | "PAID" | "EXPIRED" | "FAILED";
   payment_method: string;
   created_at: string;
   paid_at?: string;
 }
 
 export function XenditSandboxTester() {
   const [isSimulating, setIsSimulating] = useState(false);
   const [testAmount, setTestAmount] = useState(150000);
   const [paymentMethod, setPaymentMethod] = useState("VA_BCA");
   const [simulatedInvoices, setSimulatedInvoices] = useState<SimulatedInvoice[]>([]);
   const [logs, setLogs] = useState<string[]>([]);
 
   const addLog = (message: string) => {
     const timestamp = format(new Date(), "HH:mm:ss");
     setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
   };
 
  const simulateCreateInvoice = async () => {
    setIsSimulating(true);
     addLog("🚀 Memulai simulasi pembuatan invoice...");
     try {
       await withTimeout(new Promise(resolve => setTimeout(resolve, 1000)), 5000, "Simulasi pembuatan invoice timeout");

       const invoiceNumber = `SIM-${Date.now().toString().slice(-8)}`;
       const newInvoice: SimulatedInvoice = {
         id: crypto.randomUUID(),
         invoice_number: invoiceNumber,
         amount: testAmount,
         status: "PENDING",
         payment_method: paymentMethod,
         created_at: new Date().toISOString(),
       };

       setSimulatedInvoices(prev => [newInvoice, ...prev]);
       addLog(`✅ Invoice ${invoiceNumber} berhasil dibuat`);
       addLog(`💰 Amount: Rp ${testAmount.toLocaleString()}`);
       addLog(`💳 Payment Method: ${paymentMethod}`);
       addLog(`📋 Status: PENDING`);
       
       toast.success(`Invoice simulasi ${invoiceNumber} berhasil dibuat`);
     } catch (error) {
       const errorRef = reportError(error, "admin.billing.xendit_sandbox.create_invoice");
       toast.error(appendErrorReference("Gagal membuat invoice simulasi.", errorRef));
     } finally {
       setIsSimulating(false);
     }
   };
 
  const simulatePayment = async (invoiceId: string) => {
     const invoice = simulatedInvoices.find(i => i.id === invoiceId);
     if (!invoice || invoice.status !== "PENDING") return;
 
     try {
       addLog(`🔄 Memproses pembayaran ${invoice.invoice_number}...`);
       await withTimeout(new Promise(resolve => setTimeout(resolve, 1500)), 5000, "Simulasi pembayaran timeout");

       setSimulatedInvoices(prev => prev.map(i => 
         i.id === invoiceId 
           ? { ...i, status: "PAID", paid_at: new Date().toISOString() } 
           : i
       ));

       addLog(`✅ Pembayaran ${invoice.invoice_number} berhasil!`);
       addLog(`📥 Webhook callback diterima`);
       addLog(`🔐 Token validasi: OK`);
       addLog(`💾 Database updated`);
       addLog(`📧 Notifikasi dikirim`);

       toast.success(`Pembayaran ${invoice.invoice_number} berhasil disimulasikan`);
     } catch (error) {
       const errorRef = reportError(error, "admin.billing.xendit_sandbox.simulate_payment", {
         invoice_id: invoiceId,
         invoice_number: invoice.invoice_number,
       });
       toast.error(appendErrorReference(`Simulasi pembayaran ${invoice.invoice_number} gagal.`, errorRef));
     }
   };
 
  const simulateExpire = async (invoiceId: string) => {
     const invoice = simulatedInvoices.find(i => i.id === invoiceId);
     if (!invoice || invoice.status !== "PENDING") return;
 
     try {
       addLog(`⏰ Mensimulasikan expired ${invoice.invoice_number}...`);
       await withTimeout(new Promise(resolve => setTimeout(resolve, 800)), 5000, "Simulasi expiry timeout");

       setSimulatedInvoices(prev => prev.map(i => 
         i.id === invoiceId 
           ? { ...i, status: "EXPIRED" } 
           : i
       ));

       addLog(`⚠️ Invoice ${invoice.invoice_number} expired`);
       addLog(`📥 Webhook EXPIRED diterima`);
       toast.info(`Invoice ${invoice.invoice_number} expired`);
     } catch (error) {
       const errorRef = reportError(error, "admin.billing.xendit_sandbox.simulate_expire", {
         invoice_id: invoiceId,
         invoice_number: invoice.invoice_number,
       });
       toast.error(appendErrorReference(`Simulasi expiry ${invoice.invoice_number} gagal.`, errorRef));
     }
   };
 
  const simulateFail = async (invoiceId: string) => {
     const invoice = simulatedInvoices.find(i => i.id === invoiceId);
     if (!invoice || invoice.status !== "PENDING") return;
 
     try {
       addLog(`❌ Mensimulasikan gagal bayar ${invoice.invoice_number}...`);
       await withTimeout(new Promise(resolve => setTimeout(resolve, 800)), 5000, "Simulasi gagal bayar timeout");

       setSimulatedInvoices(prev => prev.map(i => 
         i.id === invoiceId 
           ? { ...i, status: "FAILED" } 
           : i
       ));

       addLog(`❌ Pembayaran ${invoice.invoice_number} gagal`);
       addLog(`📥 Webhook FAILED diterima`);
       toast.error(`Pembayaran ${invoice.invoice_number} gagal`);
     } catch (error) {
       const errorRef = reportError(error, "admin.billing.xendit_sandbox.simulate_fail", {
         invoice_id: invoiceId,
         invoice_number: invoice.invoice_number,
       });
       toast.error(appendErrorReference(`Simulasi gagal bayar ${invoice.invoice_number} gagal.`, errorRef));
     }
   };
 
   const clearLogs = () => {
     setLogs([]);
     setSimulatedInvoices([]);
     addLog("🗑️ Logs dan simulasi di-reset");
   };
 
   const statusConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
     PENDING: { icon: <Clock className="h-3 w-3" />, variant: "secondary" },
     PAID: { icon: <CheckCircle className="h-3 w-3" />, variant: "default" },
     EXPIRED: { icon: <XCircle className="h-3 w-3" />, variant: "outline" },
     FAILED: { icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
   };
 
   return (
     <div className="space-y-6">
       <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
         <CardHeader className="pb-3">
           <CardTitle className="flex items-center gap-2 text-base">
             <TestTube2 className="h-5 w-5 text-primary" />
             Xendit Sandbox Tester
           </CardTitle>
           <CardDescription>
             Uji coba payment gateway secara virtual tanpa API key production
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="grid gap-4 md:grid-cols-3">
             <div className="space-y-2">
               <Label>Nominal (Rp)</Label>
               <Input
                 type="number"
                 value={testAmount}
                 onChange={(e) => setTestAmount(Number(e.target.value))}
                 min={10000}
               />
             </div>
             <div className="space-y-2">
               <Label>Metode Pembayaran</Label>
               <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="VA_BCA">
                     <div className="flex items-center gap-2">
                       <Building2 className="h-4 w-4" />
                       VA BCA
                     </div>
                   </SelectItem>
                   <SelectItem value="VA_MANDIRI">
                     <div className="flex items-center gap-2">
                       <Building2 className="h-4 w-4" />
                       VA Mandiri
                     </div>
                   </SelectItem>
                   <SelectItem value="VA_BNI">
                     <div className="flex items-center gap-2">
                       <Building2 className="h-4 w-4" />
                       VA BNI
                     </div>
                   </SelectItem>
                   <SelectItem value="QRIS">
                     <div className="flex items-center gap-2">
                       <Smartphone className="h-4 w-4" />
                       QRIS
                     </div>
                   </SelectItem>
                   <SelectItem value="EWALLET_OVO">
                     <div className="flex items-center gap-2">
                       <Smartphone className="h-4 w-4" />
                       OVO
                     </div>
                   </SelectItem>
                   <SelectItem value="EWALLET_DANA">
                     <div className="flex items-center gap-2">
                       <Smartphone className="h-4 w-4" />
                       DANA
                     </div>
                   </SelectItem>
                   <SelectItem value="CREDIT_CARD">
                     <div className="flex items-center gap-2">
                       <CreditCard className="h-4 w-4" />
                       Kartu Kredit
                     </div>
                   </SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <div className="flex items-end">
               <Button 
                 onClick={simulateCreateInvoice} 
                 className="w-full"
                 disabled={isSimulating}
               >
                 {isSimulating ? (
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 ) : (
                   <Play className="mr-2 h-4 w-4" />
                 )}
                 Buat Invoice Simulasi
               </Button>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* Simulated Invoices */}
       {simulatedInvoices.length > 0 && (
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="text-base flex items-center justify-between">
               <span className="flex items-center gap-2">
                 <FileText className="h-4 w-4" />
                 Invoice Simulasi
               </span>
               <Button variant="ghost" size="sm" onClick={clearLogs}>
                 <RefreshCw className="h-4 w-4 mr-1" />
                 Reset
               </Button>
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-3">
               {simulatedInvoices.map((invoice) => (
                 <div 
                   key={invoice.id}
                   className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                 >
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <span className="font-mono text-sm">{invoice.invoice_number}</span>
                       <Badge variant={statusConfig[invoice.status].variant}>
                         {statusConfig[invoice.status].icon}
                         <span className="ml-1">{invoice.status}</span>
                       </Badge>
                     </div>
                     <div className="flex items-center gap-3 text-sm text-muted-foreground">
                       <span>Rp {invoice.amount.toLocaleString()}</span>
                       <span>•</span>
                       <span>{invoice.payment_method}</span>
                     </div>
                   </div>
 
                   {invoice.status === "PENDING" && (
                     <div className="flex items-center gap-2">
                       <Button 
                         size="sm" 
                         variant="default"
                         onClick={() => simulatePayment(invoice.id)}
                       >
                         <CheckCircle className="h-4 w-4 mr-1" />
                         Bayar
                       </Button>
                       <Button 
                         size="sm" 
                         variant="outline"
                         onClick={() => simulateExpire(invoice.id)}
                       >
                         <Clock className="h-4 w-4 mr-1" />
                         Expired
                       </Button>
                       <Button 
                         size="sm" 
                         variant="destructive"
                         onClick={() => simulateFail(invoice.id)}
                       >
                         <XCircle className="h-4 w-4 mr-1" />
                         Gagal
                       </Button>
                     </div>
                   )}
 
                   {invoice.status === "PAID" && invoice.paid_at && (
                     <span className="text-sm text-primary">
                       Dibayar: {format(new Date(invoice.paid_at), "HH:mm:ss")}
                     </span>
                   )}
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>
       )}
 
       {/* Logs */}
       <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-base">Log Simulasi</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="bg-muted/50 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs">
             {logs.length === 0 ? (
               <p className="text-muted-foreground">Belum ada aktivitas...</p>
             ) : (
               logs.map((log, i) => (
                 <div key={i} className="py-0.5">{log}</div>
               ))
             )}
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }
