import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface DeviceRegistrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  currentDeviceId: string;
}

export function DeviceRegistrationDialog({
  isOpen,
  onClose,
  onConfirm,
  currentDeviceId,
}: DeviceRegistrationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onConfirm();
      if (success) {
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Pendaftaran Perangkat
          </DialogTitle>
          <DialogDescription>
            Perangkat ini belum terdaftar di akun Anda. Daftarkan perangkat ini untuk melakukan absensi.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">ID Perangkat Anda:</span>
            </div>
            <code className="text-xs bg-background px-2 py-1 rounded block break-all">
              {currentDeviceId || "Tidak dapat dideteksi"}
            </code>
          </div>

          <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <h4 className="font-medium text-warning">Perhatian</h4>
                <p className="text-muted-foreground mt-1">
                  Setelah perangkat terdaftar, Anda hanya dapat melakukan absensi dari perangkat ini. 
                  Jika ingin mengganti perangkat, Anda perlu melakukan reset device ID.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Batal
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mendaftarkan...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Daftarkan Perangkat
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
