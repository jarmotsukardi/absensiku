import { useContext } from "react";
import { ConfirmDialogContext } from "@/lib/confirmDialogContext";

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }
  return context;
}
