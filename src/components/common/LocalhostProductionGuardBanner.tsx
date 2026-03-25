import { AlertTriangle } from "lucide-react";
import {
  buildLocalProductionWriteBlockMessage,
  shouldBlockLocalProductionWrites,
} from "@/lib/runtimeEnvironment";

export const LocalhostProductionGuardBanner = () => {
  if (!shouldBlockLocalProductionWrites()) return null;

  return (
    <div className="sticky top-0 z-[120] border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Localhost sedang mode read-only terhadap production</p>
          <p>{buildLocalProductionWriteBlockMessage("Penulisan data dari browser lokal")}</p>
        </div>
      </div>
    </div>
  );
};
