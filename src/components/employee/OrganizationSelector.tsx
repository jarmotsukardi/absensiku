import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Check } from "lucide-react";

interface OrganizationOption {
  employee_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_logo?: string | null;
  opd_name?: string | null;
  office_name?: string | null;
}

interface OrganizationSelectorProps {
  userId: string;
  onSelect: (employeeId: string, tenantId: string) => void;
  selectedEmployeeId?: string | null;
}

export function OrganizationSelector({ userId, onSelect, selectedEmployeeId }: OrganizationSelectorProps) {
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string>(selectedEmployeeId || "");

  useEffect(() => {
    fetchOrganizations();
  }, [userId]);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          tenant_id,
          tenants:tenant_id(name, logo_url),
          opd:opd_id(name),
          offices:office_id(name)
        `)
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) throw error;

      const orgs: OrganizationOption[] = (data || []).map((emp: any) => ({
        employee_id: emp.id,
        tenant_id: emp.tenant_id,
        tenant_name: emp.tenants?.name || "Organisasi",
        tenant_logo: emp.tenants?.logo_url,
        opd_name: emp.opd?.name,
        office_name: emp.offices?.name,
      }));

      setOrganizations(orgs);

      // Auto-select jika hanya 1 organisasi
      if (orgs.length === 1 && !selectedEmployeeId) {
        setSelected(orgs[0].employee_id);
        onSelect(orgs[0].employee_id, orgs[0].tenant_id);
      } else if (selectedEmployeeId) {
        setSelected(selectedEmployeeId);
      }
    } catch (error) {
      console.error("Error fetching organizations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (employeeId: string) => {
    setSelected(employeeId);
    const org = organizations.find(o => o.employee_id === employeeId);
    if (org) {
      onSelect(org.employee_id, org.tenant_id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (organizations.length === 0) {
    return null;
  }

  if (organizations.length === 1) {
    return null; // Tidak perlu selector jika hanya 1 organisasi
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Pilih Organisasi
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selected} onValueChange={handleSelect}>
          <div className="space-y-3">
            {organizations.map((org) => (
              <div
                key={org.employee_id}
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected === org.employee_id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
                onClick={() => handleSelect(org.employee_id)}
              >
                <RadioGroupItem value={org.employee_id} id={org.employee_id} />
                <div className="flex-1 min-w-0">
                  <Label htmlFor={org.employee_id} className="font-medium cursor-pointer">
                    {org.tenant_name}
                  </Label>
                  {(org.opd_name || org.office_name) && (
                    <p className="text-sm text-muted-foreground truncate">
                      {[org.opd_name, org.office_name].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
                {selected === org.employee_id && (
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
