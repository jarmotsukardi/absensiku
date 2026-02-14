import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface WorkShift {
  id: string;
  shift_name: string;
  shift_order: number;
  time_start: string;
  time_end: string;
  description: string | null;
}

interface ShiftSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectShift: (shiftId: string, isMissedShift: boolean) => void;
  missedShift: WorkShift | null;
  availableShifts: WorkShift[];
  isLoading?: boolean;
}

export function ShiftSelectionDialog({
  isOpen,
  onClose,
  onSelectShift,
  missedShift,
  availableShifts,
  isLoading = false,
}: ShiftSelectionDialogProps) {
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");

  const handleConfirm = () => {
    if (!selectedShiftId) return;
    const isMissedShift = missedShift?.id === selectedShiftId;
    onSelectShift(selectedShiftId, isMissedShift);
  };

  const formatTime = (time: string) => {
    return time.substring(0, 5); // Format HH:mm
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Konfirmasi Shift Absensi
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Anda melewati waktu {missedShift?.shift_name || "Shift 1"}. 
            Pilih shift untuk absensi hari ini:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <RadioGroup 
            value={selectedShiftId} 
            onValueChange={setSelectedShiftId}
            className="space-y-3"
          >
            {/* Opsi: Tetap absen di shift yang terlewat */}
            {missedShift && (
              <Card className={`p-3 cursor-pointer transition-all ${selectedShiftId === missedShift.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={missedShift.id} id={missedShift.id} className="mt-1" />
                  <Label htmlFor={missedShift.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{missedShift.shift_name}</span>
                      <Badge variant="secondary" className="text-xs">
                        Terlewat
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(missedShift.time_start)} - {formatTime(missedShift.time_end)}
                    </div>
                    <p className="text-xs text-warning mt-1">
                      ⚠️ Akan dicatat sebagai terlambat
                    </p>
                  </Label>
                </div>
              </Card>
            )}

            {/* Opsi: Shift yang masih tersedia */}
            {availableShifts
              .filter(s => s.id !== missedShift?.id)
              .map((shift) => (
                <Card 
                  key={shift.id}
                  className={`p-3 cursor-pointer transition-all ${selectedShiftId === shift.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={shift.id} id={shift.id} className="mt-1" />
                    <Label htmlFor={shift.id} className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{shift.shift_name}</span>
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Tersedia
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(shift.time_start)} - {formatTime(shift.time_end)}
                      </div>
                      {shift.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {shift.description}
                        </p>
                      )}
                    </Label>
                  </div>
                </Card>
              ))}
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Batal</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            disabled={!selectedShiftId || isLoading}
          >
            {isLoading ? "Memproses..." : "Konfirmasi Absen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
