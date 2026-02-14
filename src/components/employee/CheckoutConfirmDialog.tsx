import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogOut, X } from "lucide-react";

interface CheckoutConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function CheckoutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: CheckoutConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-destructive" />
            Konfirmasi Absen Pulang
          </DialogTitle>
          <DialogDescription>
            Silakan klik tombol Absen Pulang untuk mencatat waktu kepulangan Anda.
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            <X className="h-4 w-4 mr-2" />
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {isLoading ? "Memproses..." : "Absen Pulang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
