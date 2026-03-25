import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type HrPayrollAccessStage,
  type WorkspaceAccessMode,
  type WorkspaceAccessScope,
  getAccessStageLabel,
  getWorkspaceModeLabel,
  getWorkspaceReadonlyReason,
} from "@/lib/hrPayrollAccessPolicy";

type WorkspaceAccessStatusBannerProps = {
  scope: WorkspaceAccessScope;
  stage: HrPayrollAccessStage;
  mode: WorkspaceAccessMode;
  onOpenBilling?: () => void;
};

export function WorkspaceAccessStatusBanner({
  scope,
  stage,
  mode,
  onOpenBilling,
}: WorkspaceAccessStatusBannerProps) {
  if (mode !== "readonly") return null;

  const scopeLabel = scope === "hr" ? "HR" : "Payroll";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
          {scopeLabel} {getWorkspaceModeLabel(mode)}
        </Badge>
        <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
          {getAccessStageLabel(stage)}
        </Badge>
      </div>
      <p className="mt-2 text-sm">
        {getWorkspaceReadonlyReason(scope, stage)}
      </p>
      {onOpenBilling ? (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onOpenBilling} className="border-amber-300 bg-white/70 text-amber-900 hover:bg-white">
            {scope === "hr" ? "Buka Billing" : "Buka Billing Payroll"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
