 import { useState } from "react";
 import { useOvertimeRequests, OvertimeRequest } from "@/hooks/useOvertimeRequests";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { 
   Timer, 
   Clock, 
   Calendar, 
   ChevronRight, 
   XCircle,
   Loader2 
 } from "lucide-react";
 import { format } from "date-fns";
 import { id } from "date-fns/locale";
 
 interface OvertimeRequestListProps {
   employeeId: string;
 }
 
 const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
   pending: { label: "Menunggu", variant: "secondary" },
   approved: { label: "Disetujui", variant: "default" },
   rejected: { label: "Ditolak", variant: "destructive" },
   cancelled: { label: "Dibatalkan", variant: "outline" },
 };
 
 export function OvertimeRequestList({ employeeId }: OvertimeRequestListProps) {
   const { requests, isLoading, cancelRequest } = useOvertimeRequests({ employeeId });
   const [selectedRequest, setSelectedRequest] = useState<OvertimeRequest | null>(null);
   const [isCancelling, setIsCancelling] = useState(false);
 
   const handleCancel = async (requestId: string) => {
     if (!confirm("Batalkan pengajuan lembur ini?")) return;
     setIsCancelling(true);
     await cancelRequest(requestId);
     setIsCancelling(false);
     setSelectedRequest(null);
   };
 
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
           <p>Belum ada pengajuan lembur</p>
         </CardContent>
       </Card>
     );
   }
 
   return (
     <>
       <div className="space-y-3">
         {requests.map((request) => {
           const status = statusConfig[request.status] || statusConfig.pending;
           return (
             <Card 
               key={request.id}
               className="cursor-pointer hover:shadow-md transition-shadow"
               onClick={() => setSelectedRequest(request)}
             >
               <CardContent className="p-4">
                 <div className="flex items-center justify-between">
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <span className="font-mono text-sm">{request.request_number}</span>
                       <Badge variant={status.variant}>{status.label}</Badge>
                     </div>
                     <div className="flex items-center gap-3 text-sm text-muted-foreground">
                       <span className="flex items-center gap-1">
                         <Clock className="h-3 w-3" />
                         {request.total_hours} jam
                       </span>
                       <span className="flex items-center gap-1">
                         <Calendar className="h-3 w-3" />
                         {request.dates?.length || 0} hari
                       </span>
                     </div>
                     <p className="text-xs text-muted-foreground line-clamp-1">
                       {request.reason}
                     </p>
                   </div>
                   <ChevronRight className="h-5 w-5 text-muted-foreground" />
                 </div>
               </CardContent>
             </Card>
           );
         })}
       </div>
 
       {/* Detail Dialog */}
       <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
         <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Timer className="h-5 w-5" />
               Detail Pengajuan Lembur
             </DialogTitle>
           </DialogHeader>
 
           {selectedRequest && (
             <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <span className="font-mono">{selectedRequest.request_number}</span>
                 <Badge variant={statusConfig[selectedRequest.status]?.variant}>
                   {statusConfig[selectedRequest.status]?.label}
                 </Badge>
               </div>
 
               <div className="p-3 rounded-lg bg-muted/50">
                 <p className="text-sm font-medium mb-1">Alasan</p>
                 <p className="text-sm text-muted-foreground">{selectedRequest.reason}</p>
               </div>
 
               <div>
                 <p className="text-sm font-medium mb-2">Tanggal Lembur</p>
                 <div className="space-y-2">
                   {selectedRequest.dates?.map((date) => (
                     <div 
                       key={date.id}
                       className="flex items-center justify-between p-2 rounded border text-sm"
                     >
                       <span>{format(new Date(date.date), "EEE, d MMM yyyy", { locale: id })}</span>
                       <div className="flex items-center gap-2">
                         <span className="text-muted-foreground">
                           {date.start_time.slice(0,5)} - {date.end_time.slice(0,5)}
                         </span>
                         <Badge variant="outline">{date.hours}j</Badge>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
 
               <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                 <span className="font-medium">Total</span>
                 <span className="text-lg font-bold">{selectedRequest.total_hours} jam</span>
               </div>
 
               {selectedRequest.status === "rejected" && selectedRequest.rejection_reason && (
                 <div className="p-3 rounded-lg bg-destructive/10 text-destructive">
                   <p className="text-sm font-medium">Alasan Penolakan</p>
                   <p className="text-sm">{selectedRequest.rejection_reason}</p>
                 </div>
               )}
 
               {selectedRequest.status === "pending" && (
                 <Button 
                   variant="destructive" 
                   className="w-full"
                   onClick={() => handleCancel(selectedRequest.id)}
                   disabled={isCancelling}
                 >
                   {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   <XCircle className="mr-2 h-4 w-4" />
                   Batalkan Pengajuan
                 </Button>
               )}
             </div>
           )}
         </DialogContent>
       </Dialog>
     </>
   );
 }