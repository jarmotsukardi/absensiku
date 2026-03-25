import type { ReactNode, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

type WorkspaceReadonlyShieldProps = {
  active: boolean;
  children: ReactNode;
  className?: string;
};

const INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='switch']",
  "[role='tab']",
  "[contenteditable='true']",
].join(", ");

export function WorkspaceReadonlyShield({
  active,
  children,
  className,
}: WorkspaceReadonlyShieldProps) {
  const blockIfInteractive = active
    ? (event: SyntheticEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest(INTERACTIVE_SELECTOR)) return;
        if (target.closest(".workspace-readonly-allow")) return;
        event.preventDefault();
        event.stopPropagation();
      }
    : undefined;

  return (
    <div
      className={cn(
        active &&
          "[&_button]:opacity-60 [&_input]:opacity-60 [&_textarea]:opacity-60 [&_select]:opacity-60 [&_[role='button']]:opacity-60 [&_[role='switch']]:opacity-60 [&_[role='tab']]:opacity-60 [&_.workspace-readonly-allow]:opacity-100",
        className,
      )}
      onClickCapture={blockIfInteractive}
      onPointerDownCapture={blockIfInteractive}
      onSubmitCapture={active ? (event) => event.preventDefault() : undefined}
      onKeyDownCapture={
        active
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                const target = event.target as HTMLElement | null;
                if (target?.closest(INTERACTIVE_SELECTOR)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
