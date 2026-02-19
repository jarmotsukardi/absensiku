import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPinOff, CalendarIcon, Car, Users, MapPin, Briefcase, Building2, Loader2, Send, X } from "lucide-react";
import { format, addDays, isBefore, startOfToday } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Jenis alasan yang tersedia
const REASON_TYPES = [
  { value: "dinas_luar", label: "Dinas Luar", description: "Tugas resmi di luar kantor", icon: Car },
  { value: "rapat_eksternal", label: "Rapat Eksternal", description: "Rapat di lokasi mitra/klien", icon: Users },
  { value: "kunjungan_lapangan", label: "Kunjungan Lapangan", description: "Monitoring atau inspeksi lapangan", icon: MapPin },
  { value: "tugas_pimpinan", label: "Tugas Pimpinan", description: "Penugasan langsung dari pimpinan", icon: Briefcase },
  { value: "kegiatan_instansi", label: "Kegiatan Instansi", description: "Event atau kegiatan resmi instansi", icon: Building2 },
];

interface FlexibleAttendanceRequestFormProps {
  employeeId: string;
  tenantId: string;
  onSuccess?: () => void;
}

export function FlexibleAttendanceRequestForm({ employeeId, tenantId, onSuccess }: FlexibleAttendanceRequestFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [reasonType, setReasonType] = useState("");
  const [reason, setReason] = useState("");

  const resetForm = () => {
    setSelectedDates([]);
    setReasonType("");
    setReason("");
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    const dateStr = format(date, "yyyy-MM-dd");
    const existingIndex = selectedDates.findIndex(d => format(d, "yyyy-MM-dd") === dateStr);
    
    if (existingIndex >= 0) {
      // Hapus tanggal jika sudah dipilih
      setSelectedDates(prev => prev.filter((_, i) => i !== existingIndex));
    } else {
      // Tambah tanggal jika belum dipilih (max 10 tanggal)
      if (selectedDates.length >= 10) {
        toast.error("Maksimal 10 tanggal per permohonan");
        return;
      }
      setSelectedDates(prev => [...prev, date].sort((a, b) => a.getTime() - b.getTime()));
    }
  };

  const removeDate = (index: number) => {
    setSelectedDates(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (selectedDates.length === 0 || !reasonType || !reason.trim()) {
      toast.error("Lengkapi semua field yang diperlukan");
      return;
    }

    if (reason.trim().length < 10) {
      toast.error("Alasan minimal 10 karakter");
      return;
    }

    setIsSubmitting(true);

    try {
      // Cek apakah sudah ada permohonan untuk tanggal yang sama
      const dateStrings = selectedDates.map(d => format(d, "yyyy-MM-dd"));
      
      const { data: existing, error: checkError } = await supabase
        .from("flexible_attendance_requests")
        .select("request_date")
        .eq("employee_id", employeeId)
        .in("request_date", dateStrings)
        .neq("status", "ditolak");

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        const conflictDates = existing.map(e => format(new Date(e.request_date), "dd MMM yyyy", { locale: localeId }));
        toast.error(`Sudah ada permohonan untuk tanggal: ${conflictDates.join(", ")}`);
        setIsSubmitting(false);
        return;
      }

      // Insert semua tanggal sekaligus
      const insertData = selectedDates.map(date => ({
        employee_id: employeeId,
        tenant_id: tenantId,
        request_date: format(date, "yyyy-MM-dd"),
        reason_type: reasonType,
        reason: reason.trim(),
        status: "menunggu",
      }));

      const { error } = await supabase.from("flexible_attendance_requests").insert(insertData);

      if (error) throw error;

      toast.success(`${selectedDates.length} permohonan absensi khusus berhasil diajukan`);
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error submitting request:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || "Gagal mengajukan permohonan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedReasonType = REASON_TYPES.find(r => r.value === reasonType);

  // Fungsi untuk menentukan apakah tanggal sudah dipilih
  const isDateSelected = (date: Date) => {
    return selectedDates.some(d => format(d, "yyyy-MM-dd") === format(date, "yyyy-MM-dd"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MapPinOff className="h-4 w-4" />
          Ajukan Absensi Khusus
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinOff className="h-5 w-5 text-primary" />
            Ajukan Absensi Khusus
          </DialogTitle>
          <DialogDescription>
            Ajukan permohonan untuk melakukan absensi dari lokasi manapun tanpa pembatasan geofence.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Tanggal Multi-Select */}
            <div className="space-y-2">
              <Label>Tanggal Absensi Khusus * (Pilih satu atau lebih)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      selectedDates.length === 0 && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDates.length === 0 
                      ? "Pilih tanggal" 
                      : `${selectedDates.length} tanggal dipilih`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={undefined}
                    onSelect={handleDateSelect}
                    disabled={(date) => isBefore(date, startOfToday()) || isBefore(addDays(new Date(), 30), date)}
                    modifiers={{
                      selected: selectedDates,
                    }}
                    modifiersStyles={{
                      selected: {
                        backgroundColor: "hsl(var(--primary))",
                        color: "hsl(var(--primary-foreground))",
                        fontWeight: "bold",
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Klik tanggal untuk memilih/membatalkan (maks 10 tanggal, 30 hari ke depan)
              </p>
              
              {/* Daftar tanggal terpilih */}
              {selectedDates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedDates.map((date, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {format(date, "dd MMM yyyy", { locale: localeId })}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 hover:bg-destructive/20"
                        onClick={() => removeDate(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Jenis Alasan */}
            <div className="space-y-2">
              <Label>Jenis Kegiatan *</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis kegiatan" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedReasonType && (
                <p className="text-xs text-muted-foreground">{selectedReasonType.description}</p>
              )}
            </div>

            {/* Alasan Detail */}
            <div className="space-y-2">
              <Label>Alasan/Keterangan Detail *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Jelaskan secara detail alasan permohonan absensi khusus ini..."
                rows={4}
                maxLength={500}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Minimal 10 karakter</span>
                <span>{reason.length}/500</span>
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">Informasi:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Permohonan akan diproses oleh Admin</li>
                <li>Jika disetujui, Anda dapat absensi dari lokasi manapun pada tanggal tersebut</li>
                <li>Satu jenis kegiatan untuk semua tanggal yang dipilih</li>
                <li>Status permohonan dapat dilihat di menu Permohonan</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || selectedDates.length === 0 || !reasonType || !reason.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Ajukan {selectedDates.length > 0 ? `(${selectedDates.length} tanggal)` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
