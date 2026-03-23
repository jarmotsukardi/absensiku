import { createContext } from "react";

export interface ConfirmDialogOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export type ConfirmDialogFn = (options: ConfirmDialogOptions) => Promise<boolean>;

export const ConfirmDialogContext = createContext<ConfirmDialogFn | null>(null);
