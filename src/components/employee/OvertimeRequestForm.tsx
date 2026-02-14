 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Calendar } from "@/components/ui/calendar";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
 import { CalendarIcon, Plus, Trash2, Clock, Loader2, Timer } from "lucide-react";
 import { format, isWeekend, differenceInHours, parse } from "date-fns";
 import { id } from "date-fns/locale";
 import { cn } from "@/lib/utils";
 import { useOvertimeRequests, OvertimeSettings } from "@/hooks/useOvertimeRequests";
 import { toast } from "sonner";
 
 interface OvertimeDateEntry {
   date: Date;
   startTime: string;
   endTime: string;
   hours: number;
   notes: string;
 }
 
 interface OvertimeRequestFormProps {
   employeeId: string;
   tenantId: string;
   settings?: OvertimeSettings | null;
   onSuccess?: () => void;
 }
 
 export function OvertimeRequestForm({ 
   employeeId, 
   tenantId, 
   settings,
   onSuccess 
 }: OvertimeRequestFormProps) {
   const { createRequest } = useOvertimeRequests();
   const [isOpen, setIsOpen] = useState(false);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [reason, setReason] = useState("");
   const [dates, setDates] = useState<OvertimeDateEntry[]>([]);
   const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
   const [newEntry, setNewEntry] = useState({
     startTime: "17:00",
     endTime: "20:00",
     notes: "",
   });
 
   const maxDates = settings?.max_dates_per_request || 10;
   const maxHoursPerDay = settings?.max_hours_per_day || 4;
 
   const calculateHours = (start: string, end: string): number => {
     const startDate = parse(start, "HH:mm", new Date());
     const endDate = parse(end, "HH:mm", new Date());
     let hours = differenceInHours(endDate, startDate);
     if (hours < 0) hours += 24; // Handle overnight
     return Math.min(hours, maxHoursPerDay);
   };
 
   const addDate = () => {
     if (!selectedDate) {
       toast.error("Pilih tanggal terlebih dahulu");
       return;
     }
 
     if (dates.length >= maxDates) {
       toast.error(`Maksimal ${maxDates} tanggal per pengajuan`);
       return;
     }
 
     const exists = dates.some(d => 
       format(d.date, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd")
     );
 
     if (exists) {
       toast.error("Tanggal sudah ditambahkan");
       return;
     }
 
     const hours = calculateHours(newEntry.startTime, newEntry.endTime);
     if (hours < (settings?.min_hours || 1)) {
       toast.error(`Minimal ${settings?.min_hours || 1} jam lembur`);
       return;
     }
 
     setDates([
       ...dates,
       {
         date: selectedDate,
         startTime: newEntry.startTime,
         endTime: newEntry.endTime,
         hours,
         notes: newEntry.notes,
       },
     ]);
     setSelectedDate(undefined);
     setNewEntry({ startTime: "17:00", endTime: "20:00", notes: "" });
   };
 
   const removeDate = (index: number) => {
     setDates(dates.filter((_, i) => i !== index));
   };
 
   const totalHours = dates.reduce((sum, d) => sum + d.hours, 0);
 
   const handleSubmit = async () => {
     if (!reason.trim()) {
       toast.error("Alasan lembur wajib diisi");
       return;
     }
 
     if (dates.length === 0) {
       toast.error("Tambahkan minimal 1 tanggal lembur");
       return;
     }
 
     setIsSubmitting(true);
     try {
       const dateEntries = dates.map(d => ({
         date: format(d.date, "yyyy-MM-dd"),
         start_time: d.startTime + ":00",
         end_time: d.endTime + ":00",
         hours: d.hours,
         is_weekend: isWeekend(d.date),
         is_holiday: false, // TODO: Check against holidays
         rate_multiplier: isWeekend(d.date) 
           ? (settings?.weekend_rate_multiplier || 2.0) 
           : (settings?.rate_multiplier || 1.5),
         notes: d.notes || null,
       }));
 
       const success = await createRequest(employeeId, tenantId, reason, dateEntries);
       if (success) {
         setIsOpen(false);
         setReason("");
         setDates([]);
         onSuccess?.();
       }
     } finally {
       setIsSubmitting(false);
     }
   };
 
   if (!settings?.is_enabled) {
     return null;
   }
 
   return (
     <>
       <Button onClick={() => setIsOpen(true)} variant="outline">
         <Timer className="mr-2 h-4 w-4" />
         Ajukan Lembur
       </Button>
 
       <Dialog open={isOpen} onOpenChange={setIsOpen}>
         <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Timer className="h-5 w-5" />
               Pengajuan Lembur
             </DialogTitle>
           </DialogHeader>
 
           <div className="space-y-4">
             {/* Reason */}
             <div className="space-y-2">
               <Label>Alasan Lembur</Label>
               <Textarea
                 value={reason}
                 onChange={(e) => setReason(e.target.value)}
                 placeholder="Jelaskan alasan dan pekerjaan yang akan dilakukan..."
                 rows={3}
               />
             </div>
 
             {/* Add Date */}
             <Card>
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm flex items-center justify-between">
                   <span>Tambah Tanggal Lembur</span>
                   <Badge variant="outline">{dates.length}/{maxDates}</Badge>
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                 <Popover>
                   <PopoverTrigger asChild>
                     <Button
                       variant="outline"
                       className={cn(
                         "w-full justify-start text-left font-normal",
                         !selectedDate && "text-muted-foreground"
                       )}
                     >
                       <CalendarIcon className="mr-2 h-4 w-4" />
                       {selectedDate ? format(selectedDate, "PPP", { locale: id }) : "Pilih tanggal"}
                     </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-0">
                     <Calendar
                       mode="single"
                       selected={selectedDate}
                       onSelect={setSelectedDate}
                       disabled={(date) => date < new Date()}
                       initialFocus
                     />
                   </PopoverContent>
                 </Popover>
 
                 <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                     <Label className="text-xs">Jam Mulai</Label>
                     <Input
                       type="time"
                       value={newEntry.startTime}
                       onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })}
                     />
                   </div>
                   <div className="space-y-1">
                     <Label className="text-xs">Jam Selesai</Label>
                     <Input
                       type="time"
                       value={newEntry.endTime}
                       onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })}
                     />
                   </div>
                 </div>
 
                 <Input
                   placeholder="Catatan (opsional)"
                   value={newEntry.notes}
                   onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                 />
 
                 <Button 
                   onClick={addDate} 
                   className="w-full"
                   disabled={!selectedDate || dates.length >= maxDates}
                 >
                   <Plus className="mr-2 h-4 w-4" />
                   Tambah ({calculateHours(newEntry.startTime, newEntry.endTime)} jam)
                 </Button>
               </CardContent>
             </Card>
 
             {/* Date List */}
             {dates.length > 0 && (
               <div className="space-y-2">
                 <Label>Daftar Tanggal Lembur</Label>
                 {dates.map((entry, index) => (
                   <div 
                     key={index}
                     className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                   >
                     <div className="space-y-1">
                       <div className="flex items-center gap-2">
                         <span className="font-medium">
                           {format(entry.date, "EEEE, d MMMM yyyy", { locale: id })}
                         </span>
                         {isWeekend(entry.date) && (
                           <Badge variant="secondary" className="text-xs">Weekend</Badge>
                         )}
                       </div>
                       <div className="flex items-center gap-2 text-sm text-muted-foreground">
                         <Clock className="h-3 w-3" />
                         <span>{entry.startTime} - {entry.endTime}</span>
                         <Badge variant="outline">{entry.hours} jam</Badge>
                       </div>
                       {entry.notes && (
                         <p className="text-xs text-muted-foreground">{entry.notes}</p>
                       )}
                     </div>
                     <Button 
                       variant="ghost" 
                       size="icon"
                       onClick={() => removeDate(index)}
                     >
                       <Trash2 className="h-4 w-4 text-destructive" />
                     </Button>
                   </div>
                 ))}
 
                 <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                   <span className="font-medium">Total Jam Lembur</span>
                   <Badge className="text-lg">{totalHours} jam</Badge>
                 </div>
               </div>
             )}
           </div>
 
           <DialogFooter>
             <Button variant="outline" onClick={() => setIsOpen(false)}>
               Batal
             </Button>
             <Button 
               onClick={handleSubmit} 
               disabled={isSubmitting || dates.length === 0 || !reason.trim()}
             >
               {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Ajukan Lembur
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </>
   );
 }