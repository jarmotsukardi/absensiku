import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const REPORT_TABS = [
  { value: "leave", label: "Izin/Cuti", path: "/org/reports/leave" },
  { value: "overtime", label: "Lembur", path: "/org/reports/overtime" },
  { value: "flexible", label: "WFH & Absensi Khusus", path: "/org/reports/flexible" },
  { value: "mutations", label: "Riwayat Mutasi", path: "/org/reports/mutations" },
] as const;

const resolveActiveTab = (pathname: string): string => {
  if (pathname.startsWith("/org/reports/overtime")) return "overtime";
  if (pathname.startsWith("/org/reports/flexible")) return "flexible";
  if (pathname.startsWith("/org/reports/mutations")) return "mutations";
  return "leave";
};

export function RequestReportsTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveActiveTab(location.pathname);

  return (
    <Tabs value={activeTab} onValueChange={(value) => navigate(REPORT_TABS.find((tab) => tab.value === value)?.path || "/org/reports/leave")}>
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        {REPORT_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
