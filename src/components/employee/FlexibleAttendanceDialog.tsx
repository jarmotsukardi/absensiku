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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, Users, Building2, Car } from "lucide-react";
import { useState } from "react";

interface FlexibleAttendanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

const FLEXIBLE_REASONS = [
  {
    value: "dinas_luar",
    label: "Dinas Luar",
    description: "Tugas resmi di luar kantor",
    icon: Car,
  },
  {
    value: "rapat_eksternal",
    label: "Rapat Eksternal",
    description: "Rapat di lokasi mitra/klien",
    icon: Users,
  },
  {
    value: "kunjungan_lapangan",
    label: "Kunjungan Lapangan",
    description: "Monitoring atau inspeksi lapangan",
    icon: MapPin,
  },
  {
    value: "tugas_pimpinan",
    label: "Tugas Pimpinan",
    description: "Penugasan langsung dari pimpinan",
    icon: Briefcase,
  },
  {
    value: "kegiatan_instansi",
    label: "Kegiatan Instansi",
    description: "Event atau kegiatan resmi instansi",
    icon: Building2,
  },
];

export function FlexibleAttendanceDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: FlexibleAttendanceDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");

  const handleConfirm = () => {
    if (!selectedReason) return;
    const reasonLabel = FLEXIBLE_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;
    onConfirm(reasonLabel);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Absensi Khusus
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Anda memiliki akses absensi khusus. Pilih alasan absensi di luar kantor:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <RadioGroup 
            value={selectedReason} 
            onValueChange={setSelectedReason}
            className="space-y-2"
          >
            {FLEXIBLE_REASONS.map((reason) => (
              <Card 
                key={reason.value}
                className={`p-3 cursor-pointer transition-all ${selectedReason === reason.value ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={reason.value} id={reason.value} className="mt-1" />
                  <Label htmlFor={reason.value} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <reason.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{reason.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reason.description}
                    </p>
                  </Label>
                </div>
              </Card>
            ))}
          </RadioGroup>

          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ Absensi ini akan dicatat sebagai "Absensi Khusus" dengan keterangan yang dipilih.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Batal</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            disabled={!selectedReason || isLoading}
          >
            {isLoading ? "Memproses..." : "Konfirmasi Absen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
