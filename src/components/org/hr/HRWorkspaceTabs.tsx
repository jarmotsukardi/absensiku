import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HR_WORKSPACE_TABS = [
  { value: "dashboard", label: "Dashboard", path: "/org/hr" },
  { value: "organization", label: "Organization", path: "/org/hr/structure" },
  { value: "employee", label: "Employee", path: "/org/hr/employees" },
  { value: "attendance", label: "Attendance", path: "/org/hr/attendance-insights" },
  { value: "leave", label: "Leave", path: "/org/hr/leave-types" },
  { value: "performance", label: "Performance", path: "/org/hr/kpi" },
  { value: "training", label: "Training", path: "/org/hr/training-data" },
  { value: "legal", label: "Legal", path: "/org/hr/document-templates" },
  { value: "access", label: "Access", path: "/org/hr/users" },
  { value: "settings", label: "Settings", path: "/org/hr/settings" },
  { value: "help", label: "Help", path: "/org/hr/help/faq" },
] as const;

const TAB_PATH_PREFIXES: Record<(typeof HR_WORKSPACE_TABS)[number]["value"], string[]> = {
  dashboard: ["/org/hr/dashboard-", "/org/hr/reports"],
  organization: [
    "/org/hr/structure",
    "/org/hr/departments",
    "/org/hr/divisions",
    "/org/hr/company",
    "/org/hr/work-locations",
    "/org/hr/work-calendar",
  ],
  employee: [
    "/org/hr/employees",
    "/org/hr/contracts",
    "/org/hr/employee-status",
    "/org/hr/job-history",
    "/org/hr/onboarding",
    "/org/hr/offboarding",
  ],
  attendance: [
    "/org/hr/attendance-insights",
    "/org/hr/work-hours",
    "/org/hr/shifts",
    "/org/hr/national-holidays",
    "/org/hr/late-settings",
    "/org/hr/attendance-integrations",
    "/org/hr/attendance-recap",
  ],
  leave: [
    "/org/hr/leave-types",
    "/org/hr/leave-quota",
    "/org/hr/leave-approval",
    "/org/hr/leave-recap",
    "/org/hr/leave-validity",
  ],
  performance: [
    "/org/hr/kpi",
    "/org/hr/performance-periods",
    "/org/hr/performance-forms",
    "/org/hr/review-360",
    "/org/hr/evaluation-results",
  ],
  training: [
    "/org/hr/training-data",
    "/org/hr/certifications",
    "/org/hr/skill-matrix",
  ],
  legal: [
    "/org/hr/documents",
    "/org/hr/document-templates",
    "/org/hr/warning-letters",
    "/org/hr/contract-templates",
    "/org/hr/digital-signature",
  ],
  access: [
    "/org/hr/users",
    "/org/hr/roles",
    "/org/hr/permissions",
    "/org/hr/approval-hierarchy",
    "/org/hr/activity-log",
  ],
  settings: [
    "/org/hr/settings",
    "/org/hr/general-settings",
    "/org/hr/branding",
    "/org/hr/notifications",
    "/org/hr/import-export",
    "/org/hr/backup",
  ],
  help: ["/org/hr/help"],
};

const resolveActiveTab = (pathname: string) => {
  if (pathname === "/org/hr" || pathname.startsWith("/org/hr/dashboard-") || pathname.startsWith("/org/hr/reports")) {
    return "dashboard";
  }
  for (const tab of HR_WORKSPACE_TABS) {
    const prefixes = TAB_PATH_PREFIXES[tab.value];
    if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix))) {
      return tab.value;
    }
  }
  return "dashboard";
};

export function HRWorkspaceTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveActiveTab(location.pathname);

  // HR navigation is centralized in sidebar to avoid duplicated menu layers.
  if (location.pathname.startsWith("/org/hr")) {
    return null;
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        navigate(HR_WORKSPACE_TABS.find((tab) => tab.value === value)?.path || "/org/hr")
      }
    >
      <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
        {HR_WORKSPACE_TABS.map((tab) => (
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
