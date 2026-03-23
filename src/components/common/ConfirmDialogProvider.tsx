import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { ConfirmDialogContext, type ConfirmDialogFn, type ConfirmDialogOptions } from "@/lib/confirmDialogContext";

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolveDialog = useCallback((value: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setIsOpen(false);
    setOptions(null);
    if (resolver) resolver(value);
  }, []);

  const confirm = useCallback<ConfirmDialogFn>((nextOptions) => {
    return new Promise<boolean>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setOptions(nextOptions);
      setIsOpen(true);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isOpen) {
        resolveDialog(false);
        return;
      }
      setIsOpen(open);
    },
    [isOpen, resolveDialog],
  );

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title || "Konfirmasi"}</AlertDialogTitle>
            <AlertDialogDescription>{options?.description || ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveDialog(false)}>
              {options?.cancelText || "Batal"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                resolveDialog(true);
              }}
              className={
                options?.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {options?.confirmText || "Lanjutkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}
