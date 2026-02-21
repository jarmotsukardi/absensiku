import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPLOYEE_TABS = [
  { value: "active", label: "Pegawai Aktif", path: "/org/employees/active" },
  { value: "inactive", label: "Pegawai Non-Aktif", path: "/org/employees/inactive" },
  { value: "import", label: "Import Pegawai", path: "/org/employees/import" },
] as const;

const resolveActiveTab = (pathname: string): string => {
  if (pathname.startsWith("/org/employees/inactive")) return "inactive";
  if (pathname.startsWith("/org/employees/import") || pathname.startsWith("/org/master/employee-import")) {
    return "import";
  }
  return "active";
};

export function EmployeeDataTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveActiveTab(location.pathname);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        navigate(EMPLOYEE_TABS.find((tab) => tab.value === value)?.path || "/org/employees/active")
      }
    >
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        {EMPLOYEE_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
