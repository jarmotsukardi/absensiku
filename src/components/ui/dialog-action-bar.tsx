import * as React from "react";

import { cn } from "@/lib/utils";

export const dialogActionBarClassName = "border-t border-slate-200 bg-slate-50/70 px-6 py-4";

type DialogActionHintProps = React.HTMLAttributes<HTMLDivElement>;

export function DialogActionHint({ className, ...props }: DialogActionHintProps) {
  return <div className={cn("mr-auto text-xs text-muted-foreground", className)} {...props} />;
}
