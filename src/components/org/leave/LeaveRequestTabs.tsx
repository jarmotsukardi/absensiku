import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LEAVE_TABS = [
  { value: "requests", label: "Permohonan Cuti", path: "/org/leave/requests" },
  { value: "overtime", label: "Pengajuan Lembur", path: "/org/leave/overtime" },
  { value: "wfh", label: "Permohonan WFH", path: "/org/leave/wfh" },
  { value: "flexible", label: "Absensi Khusus", path: "/org/leave/flexible" },
  { value: "approved", label: "Izin/Cuti Disetujui", path: "/org/leave/approved" },
  { value: "sick", label: "Sakit", path: "/org/leave/sick" },
  { value: "official", label: "Dinas/Lainnya", path: "/org/leave/official" },
  { value: "absent", label: "Tanpa Keterangan", path: "/org/leave/absent" },
  { value: "mutation", label: "Permohonan Mutasi", path: "/org/employees/mutations" },
] as const;

const resolveActiveTab = (pathname: string): string => {
  if (pathname.startsWith("/org/leave/overtime")) return "overtime";
  if (pathname.startsWith("/org/leave/wfh")) return "wfh";
  if (pathname.startsWith("/org/leave/flexible")) return "flexible";
  if (pathname.startsWith("/org/leave/approved")) return "approved";
  if (pathname.startsWith("/org/leave/sick")) return "sick";
  if (pathname.startsWith("/org/leave/official")) return "official";
  if (pathname.startsWith("/org/leave/absent")) return "absent";
  if (pathname.startsWith("/org/employees/mutations")) return "mutation";
  return "requests";
};

export function LeaveRequestTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveActiveTab(location.pathname);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        navigate(LEAVE_TABS.find((tab) => tab.value === value)?.path || "/org/leave/requests")
      }
    >
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
        {LEAVE_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
