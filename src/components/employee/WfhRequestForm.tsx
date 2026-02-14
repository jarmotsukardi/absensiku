import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Home, Loader2, X, CalendarDays } from "lucide-react";
import { format, isBefore, startOfDay, addDays } from "date-fns";
import { id } from "date-fns/locale";

interface WfhRequestFormProps {
  onSubmit: (dates: string[], reason: string) => Promise<boolean>;
}

export function WfhRequestForm({ onSubmit }: WfhRequestFormProps) {
  const [open, setOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDates.length === 0 || !reason.trim()) return;

    setIsSubmitting(true);
    const dateStrings = selectedDates.map(d => format(d, "yyyy-MM-dd"));
    const success = await onSubmit(dateStrings, reason.trim());
    setIsSubmitting(false);

    if (success) {
      setOpen(false);
      setSelectedDates([]);
      setReason("");
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    const today = startOfDay(new Date());
    if (isBefore(date, today)) return;

    const dateExists = selectedDates.some(
      d => format(d, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );

    if (dateExists) {
      setSelectedDates(prev => 
        prev.filter(d => format(d, "yyyy-MM-dd") !== format(date, "yyyy-MM-dd"))
      );
    } else {
      setSelectedDates(prev => [...prev, date].sort((a, b) => a.getTime() - b.getTime()));
    }
  };

  const removeDate = (dateToRemove: Date) => {
    setSelectedDates(prev => 
      prev.filter(d => format(d, "yyyy-MM-dd") !== format(dateToRemove, "yyyy-MM-dd"))
    );
  };

  const today = startOfDay(new Date());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <Home className="w-4 h-4" />
          Ajukan WFH
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pengajuan Work From Home</DialogTitle>
          <DialogDescription>
            Pilih satu atau beberapa tanggal untuk pengajuan WFH
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Pilih Tanggal WFH (Klik untuk memilih)
            </Label>
            <div className="border rounded-lg p-3">
              <Calendar
                mode="single"
                selected={undefined}
                onSelect={handleDateSelect}
                disabled={(date) => isBefore(date, today)}
                modifiers={{
                  selected: selectedDates,
                }}
                modifiersStyles={{
                  selected: {
                    backgroundColor: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                  },
                }}
                locale={id}
                className="w-full"
              />
            </div>
            
            {selectedDates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Tanggal terpilih ({selectedDates.length}):
                </Label>
                <div className="flex flex-wrap gap-2">
                  {selectedDates.map((date) => (
                    <Badge 
                      key={format(date, "yyyy-MM-dd")} 
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {format(date, "d MMM yyyy", { locale: id })}
                      <button
                        type="button"
                        onClick={() => removeDate(date)}
                        className="ml-1 hover:bg-muted rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wfh-reason">Alasan</Label>
            <Textarea
              id="wfh-reason"
              placeholder="Jelaskan alasan pengajuan WFH..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || selectedDates.length === 0 || !reason.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Mengirim...
                </>
              ) : (
                `Kirim ${selectedDates.length} Pengajuan`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
