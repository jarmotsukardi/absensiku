import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const REPORT_TABS = [
  { value: "attendance", label: "Laporan Absensi", path: "/org/reports/attendance" },
  { value: "recap", label: "Rekapitulasi", path: "/org/reports/recap" },
] as const;

const resolveActiveTab = (pathname: string): string =>
  pathname.startsWith("/org/reports/recap") ? "recap" : "attendance";

export function AttendanceRecapTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveActiveTab(location.pathname);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        navigate(REPORT_TABS.find((tab) => tab.value === value)?.path || "/org/reports/attendance")
      }
    >
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
