import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MutationRequestForm } from "./MutationRequestForm";
import { MutationRequestList } from "./MutationRequestList";
import { UserCog, FileText, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EmployeeData {
  id: string;
  tenant_id?: string;
  name: string;
  nip?: string;
  nik: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  gender?: string;
  golongan?: string;
  position?: string;
  employee_category?: string;
  opd_id?: string;
  work_unit_id?: string;
  office_id?: string;
  opd?: { id?: string; name: string; code?: string } | null;
  work_unit?: { id?: string; name: string } | null;
  offices?: { id?: string; name: string } | null;
}

interface MutationSectionProps {
  employee: EmployeeData | null;
  onRefresh?: () => void;
}

export function MutationSection({ employee, onRefresh }: MutationSectionProps) {
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRequestSubmit = () => {
    setActiveTab("history");
    setRefreshKey((k) => k + 1);
    onRefresh?.();
  };

  if (!employee) {
    return (
      <Card className="shadow-large">
        <CardContent className="p-4">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-large">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCog className="h-5 w-5" />
          Pengajuan Mutasi
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "form" | "history")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="form" className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Ajukan
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Riwayat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="mt-0">
            <MutationRequestForm
              employee={{
                ...employee,
                opd: employee.opd ? { 
                  id: employee.opd.id || "", 
                  name: employee.opd.name, 
                  code: employee.opd.code || "" 
                } : undefined,
              }}
              onSuccess={handleRequestSubmit}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <MutationRequestList key={refreshKey} employeeId={employee.id} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}