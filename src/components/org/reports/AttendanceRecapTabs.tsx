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
      <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
        {REPORT_TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="whitespace-nowrap rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:-translate-y-px hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900 data-[state=active]:border-slate-800/70 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-[0_8px_18px_rgba(15,23,42,0.22)]"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
