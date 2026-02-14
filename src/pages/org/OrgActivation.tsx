import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { OrgActivationTab } from "@/components/org/OrgActivationTab";
import { GlossaryPanel } from "@/components/common/GlossaryPanel";
import { Loader2, Zap } from "lucide-react";

export default function OrgActivation() {
  const { organization, isLoading } = useOrganizationSettings();

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6" />
              Aktivasi & Langganan
            </h1>
            <p className="text-muted-foreground">Kelola paket langganan dan pembayaran organisasi</p>
          </div>
          <GlossaryPanel defaultCategory="billing" />
        </div>

        {organization?.id && (
          <OrgActivationTab tenantId={organization.id} tenantName={organization.name} />
        )}
      </div>
    </OrganizationLayout>
  );
}
