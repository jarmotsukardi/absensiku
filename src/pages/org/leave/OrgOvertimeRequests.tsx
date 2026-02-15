import { useState, useEffect } from "react";
import { useOvertimeRequests, OvertimeRequest } from "@/hooks/useOvertimeRequests";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Timer,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Loader2,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
 
 const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
   pending: { label: "Menunggu", variant: "secondary" },
   approved: { label: "Disetujui", variant: "default" },
   rejected: { label: "Ditolak", variant: "destructive" },
   cancelled: { label: "Dibatalkan", variant: "outline" },
 };
 
export default function OrgOvertimeRequests() {
  const PAGE_SIZE = 20;
  const [employee, setEmployee] = useState<{ id: string } | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isTenantReady, setIsTenantReady] = useState(false);

  useEffect(() => {
    const initContext = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsTenantReady(true);
        return;
      }

      try {
        const resolvedTenantId = await resolveOrgTenantId();
        setTenantId(resolvedTenantId);
      } finally {
        setIsTenantReady(true);
      }

      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) setEmployee(data);
    };
    void initContext();
  }, []);

  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<OvertimeRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [allPage, setAllPage] = useState(1);

  useEffect(() => {
    setPendingPage(1);
    setAllPage(1);
  }, [searchQuery]);

  const {
    requests: pendingRequests,
    isLoading: loadingPending,
    totalCount: pendingTotalCount,
    approveRequest,
  } = useOvertimeRequests({
    tenantId: tenantId || undefined,
    status: "pending",
    page: pendingPage,
    pageSize: PAGE_SIZE,
    searchQuery,
  });
  const { requests: allRequests, isLoading: loadingAll, totalCount: allTotalCount } = useOvertimeRequests({
    tenantId: tenantId || undefined,
    page: allPage,
    pageSize: PAGE_SIZE,
    searchQuery,
  });

  const displayRequests = activeTab === "pending" ? pendingRequests : allRequests;
  const isLoading = !isTenantReady || (activeTab === "pending" ? loadingPending : loadingAll);
  const totalRows = activeTab === "pending" ? pendingTotalCount : allTotalCount;
  const activePage = activeTab === "pending" ? pendingPage : allPage;
  const setActivePage = activeTab === "pending" ? setPendingPage : setAllPage;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const handleApprove = async (approved: boolean) => {
    if (!selectedRequest || !employee?.id) return;

    if (!approved && !rejectionReason.trim()) {
      return;
    }

    setIsProcessing(true);
    const success = await approveRequest(
      selectedRequest.id,
      employee.id,
      approved,
      approved ? undefined : rejectionReason
    );

    if (success) {
      setSelectedRequest(null);
      setRejectionReason("");
    }
    setIsProcessing(false);
  };

  return (
    <OrganizationLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengajuan Lembur</h1>
          <p className="text-sm text-muted-foreground">Kelola pengajuan lembur pegawai</p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
             <TabsList>
               <TabsTrigger value="pending" className="relative">
                 Menunggu
                 {pendingTotalCount > 0 && (
                   <Badge className="ml-2 h-5 w-5 p-0 justify-center">
                     {pendingTotalCount}
                   </Badge>
                 )}
               </TabsTrigger>
               <TabsTrigger value="all">Semua</TabsTrigger>
             </TabsList>
 
             <div className="relative max-w-xs">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Cari pegawai atau nomor..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-10"
               />
             </div>
           </div>
           <div className="text-sm text-muted-foreground mt-2">
             Total {totalRows} pengajuan
           </div>
 
           <TabsContent value="pending" className="mt-4">
             <RequestsTable 
               requests={displayRequests}
               isLoading={isLoading}
               onSelect={setSelectedRequest}
               showActions
             />
           </TabsContent>
 
           <TabsContent value="all" className="mt-4">
             <RequestsTable 
               requests={displayRequests}
               isLoading={isLoading}
               onSelect={setSelectedRequest}
             />
           </TabsContent>
           {totalPages > 1 && (
             <div className="mt-4">
               <Pagination>
                 <PaginationContent>
                   <PaginationItem>
                     <PaginationPrevious
                       href="#"
                       onClick={(e) => {
                         e.preventDefault();
                         if (activePage > 1) setActivePage((prev) => prev - 1);
                       }}
                       className={activePage <= 1 ? "pointer-events-none opacity-50" : ""}
                     />
                   </PaginationItem>
                   {Array.from({ length: totalPages }, (_, i) => i + 1)
                     .filter((page) => page === 1 || page === totalPages || Math.abs(page - activePage) <= 1)
                     .map((page) => (
                       <PaginationItem key={page}>
                         <PaginationLink
                           href="#"
                           onClick={(e) => {
                             e.preventDefault();
                             setActivePage(page);
                           }}
                           isActive={activePage === page}
                         >
                           {page}
                         </PaginationLink>
                       </PaginationItem>
                     ))}
                   <PaginationItem>
                     <PaginationNext
                       href="#"
                       onClick={(e) => {
                         e.preventDefault();
                         if (activePage < totalPages) setActivePage((prev) => prev + 1);
                       }}
                       className={activePage >= totalPages ? "pointer-events-none opacity-50" : ""}
                     />
                   </PaginationItem>
                 </PaginationContent>
               </Pagination>
             </div>
           )}
         </Tabs>
 
         {/* Detail & Approval Dialog */}
         <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
           <DialogContent className="max-w-lg">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2">
                 <Timer className="h-5 w-5" />
                 Detail Pengajuan Lembur
               </DialogTitle>
             </DialogHeader>
 
             {selectedRequest && (
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <User className="h-4 w-4 text-muted-foreground" />
                     <span className="font-medium">{selectedRequest.employee?.name}</span>
                   </div>
                   <Badge variant={statusConfig[selectedRequest.status]?.variant}>
                     {statusConfig[selectedRequest.status]?.label}
                   </Badge>
                 </div>
 
                 <div className="grid grid-cols-2 gap-3 text-sm">
                   <div>
                     <p className="text-muted-foreground">Nomor</p>
                     <p className="font-mono">{selectedRequest.request_number}</p>
                   </div>
                   <div>
                     <p className="text-muted-foreground">NIK</p>
                     <p>{selectedRequest.employee?.nik}</p>
                   </div>
                 </div>
 
                 <div className="p-3 rounded-lg bg-muted/50">
                   <p className="text-sm font-medium mb-1">Alasan Lembur</p>
                   <p className="text-sm">{selectedRequest.reason}</p>
                 </div>
 
                 <div>
                   <p className="text-sm font-medium mb-2">Rincian Tanggal</p>
                   <div className="space-y-2 max-h-40 overflow-y-auto">
                     {selectedRequest.dates?.map((date) => (
                       <div 
                         key={date.id}
                         className="flex items-center justify-between p-2 rounded border text-sm"
                       >
                         <div className="flex items-center gap-2">
                           <Calendar className="h-3 w-3 text-muted-foreground" />
                           <span>{format(new Date(date.date), "EEE, d MMM", { locale: id })}</span>
                           {date.is_weekend && <Badge variant="secondary" className="text-xs">Weekend</Badge>}
                         </div>
                         <div className="flex items-center gap-2">
                           <Clock className="h-3 w-3 text-muted-foreground" />
                           <span>{date.start_time.slice(0,5)} - {date.end_time.slice(0,5)}</span>
                           <Badge variant="outline">{date.hours}j</Badge>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
 
                 <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                   <span className="font-medium">Total Jam Lembur</span>
                   <span className="text-xl font-bold">{selectedRequest.total_hours} jam</span>
                 </div>
 
                 {selectedRequest.status === "pending" && (
                   <>
                     <div className="space-y-2">
                       <Label>Alasan Penolakan (jika ditolak)</Label>
                       <Textarea
                         value={rejectionReason}
                         onChange={(e) => setRejectionReason(e.target.value)}
                         placeholder="Wajib diisi jika menolak..."
                         rows={2}
                       />
                     </div>
 
                     <DialogFooter className="gap-2">
                       <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                         Tutup
                       </Button>
                       <Button
                         variant="destructive"
                         onClick={() => handleApprove(false)}
                         disabled={isProcessing || !rejectionReason.trim()}
                       >
                         {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         <XCircle className="mr-2 h-4 w-4" />
                         Tolak
                       </Button>
                       <Button onClick={() => handleApprove(true)} disabled={isProcessing}>
                         {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         <CheckCircle className="mr-2 h-4 w-4" />
                         Setujui
                       </Button>
                     </DialogFooter>
                   </>
                 )}
               </div>
             )}
           </DialogContent>
         </Dialog>
      </div>
    </OrganizationLayout>
  );
}
 
 function RequestsTable({ 
   requests, 
   isLoading, 
   onSelect,
   showActions = false
 }: { 
   requests: OvertimeRequest[];
   isLoading: boolean;
   onSelect: (r: OvertimeRequest) => void;
   showActions?: boolean;
 }) {
   if (isLoading) {
     return (
       <div className="flex items-center justify-center py-8">
         <Loader2 className="h-6 w-6 animate-spin" />
       </div>
     );
   }
 
   if (requests.length === 0) {
     return (
       <Card>
         <CardContent className="py-8 text-center text-muted-foreground">
           <Timer className="mx-auto h-12 w-12 mb-3 opacity-50" />
           <p>Tidak ada pengajuan lembur</p>
         </CardContent>
       </Card>
     );
   }
 
   return (
     <Card>
       <Table>
         <TableHeader>
           <TableRow>
             <TableHead>Pegawai</TableHead>
             <TableHead>Nomor</TableHead>
             <TableHead>Total Jam</TableHead>
             <TableHead>Tanggal</TableHead>
             <TableHead>Status</TableHead>
             {showActions && <TableHead className="w-[100px]">Aksi</TableHead>}
           </TableRow>
         </TableHeader>
         <TableBody>
           {requests.map((req) => (
             <TableRow 
               key={req.id} 
               className="cursor-pointer"
               onClick={() => onSelect(req)}
             >
               <TableCell>
                 <div>
                   <p className="font-medium">{req.employee?.name}</p>
                   <p className="text-xs text-muted-foreground">{req.employee?.nik}</p>
                 </div>
               </TableCell>
               <TableCell className="font-mono text-sm">{req.request_number}</TableCell>
               <TableCell>
                 <Badge variant="outline">{req.total_hours} jam</Badge>
               </TableCell>
               <TableCell>
                 <span className="text-sm">{req.dates?.length || 0} hari</span>
               </TableCell>
               <TableCell>
                 <Badge variant={statusConfig[req.status]?.variant}>
                   {statusConfig[req.status]?.label}
                 </Badge>
               </TableCell>
               {showActions && (
                 <TableCell>
                   <Button size="sm" variant="outline">
                     Review
                   </Button>
                 </TableCell>
               )}
             </TableRow>
           ))}
         </TableBody>
       </Table>
     </Card>
   );
 }
