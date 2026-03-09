import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  ORG_WORKSPACE_MODULES_SETTING_KEY,
  parseOrgWorkspaceModulesSetting,
  saveTenantOrgWorkspaceModules,
  type OrgWorkspaceModules,
} from "@/lib/orgWorkspaceModules";
import {
  DEFAULT_HR_ERROR_ALERT_SETTINGS,
  HR_ERROR_ALERT_SETTINGS_KEY,
  saveTenantHrErrorAlertSettings,
  type HrErrorAlertSettings,
} from "@/lib/hrErrorAlertSettings";
import {
  DEFAULT_HR_TICKET_POLICY_SETTINGS,
  HR_TICKET_POLICY_DEFAULTS_KEY,
  HR_TICKET_POLICY_SETTING_KEY,
  normalizeHrTicketPolicySettings,
  saveTenantHrTicketPolicySettings,
  serializeHrTicketPolicySettings,
  type HrTicketPolicySettings,
  type HrTicketRole,
} from "@/lib/hrTicketPolicySettings";
import { toast } from "sonner";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  is_active: boolean | null;
};

type TenantModuleState = Record<string, OrgWorkspaceModules>;
type TenantTicketPolicyState = Record<string, HrTicketPolicySettings>;

interface HrWorkspaceDefaults {
  hr_default_enabled: boolean;
  payroll_default_enabled: boolean;
}

const DEFAULTS_KEY = "hr_workspace_defaults_v1";
const ALERT_DEFAULTS_KEY = "hr_error_alert_defaults_v1";
const DEFAULT_WORKSPACE_DEFAULTS: HrWorkspaceDefaults = {
  hr_default_enabled: false,
  payroll_default_enabled: false,
};

const parseWorkspaceDefaultToggle = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const normalizeDefaults = (value: unknown): HrWorkspaceDefaults => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_WORKSPACE_DEFAULTS;
  const raw = value as Record<string, unknown>;
  return {
    hr_default_enabled: parseWorkspaceDefaultToggle(
      raw.hr_default_enabled,
      DEFAULT_WORKSPACE_DEFAULTS.hr_default_enabled
    ),
    payroll_default_enabled: parseWorkspaceDefaultToggle(
      raw.payroll_default_enabled,
      DEFAULT_WORKSPACE_DEFAULTS.payroll_default_enabled
    ),
  };
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const normalizeAlertSettings = (value: unknown): HrErrorAlertSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_HR_ERROR_ALERT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    enableRealtimeAlerts: Boolean(raw.enable_realtime_alerts),
    webhookUrl: typeof raw.webhook_url === "string" ? raw.webhook_url.trim() : "",
    slackWebhookUrl: typeof raw.slack_webhook_url === "string" ? raw.slack_webhook_url.trim() : "",
    whatsappWebhookUrl: typeof raw.whatsapp_webhook_url === "string" ? raw.whatsapp_webhook_url.trim() : "",
    emailWebhookUrl: typeof raw.email_webhook_url === "string" ? raw.email_webhook_url.trim() : "",
  };
};

const ROLE_OPTIONS: Array<{ role: HrTicketRole; label: string }> = [
  { role: "super_admin", label: "Super Admin" },
  { role: "admin_instansi", label: "Admin Instansi" },
  { role: "atasan", label: "Atasan/Operator" },
  { role: "operator", label: "Operator Baca" },
];

const TICKET_CAPABILITIES = [
  { key: "canCreate", label: "Buat tiket" },
  { key: "canAssign", label: "Atur PIC/SLA" },
  { key: "canComment", label: "Komentar tiket" },
  { key: "canTake", label: "Ambil tiket (in_progress)" },
  { key: "canResolve", label: "Resolve tiket" },
  { key: "canReopen", label: "Reopen tiket" },
] as const;

type HrCoverageItem = {
  menu: string;
  subMenu: string;
  orgPath: string;
  adminPath: string;
  coverage: "Penuh" | "Baseline" | "Monitoring";
};

const HR_SETTINGS_COVERAGE: Array<{ domain: string; items: HrCoverageItem[] }> = [
  {
    domain: "1. Ringkasan Platform",
    items: [
      { menu: "Dashboard", subMenu: "Ringkasan Karyawan", orgPath: "/org/hr", adminPath: "/admin/hr", coverage: "Monitoring" },
      { menu: "Dashboard", subMenu: "Statistik Kehadiran", orgPath: "/org/hr/attendance-insights", adminPath: "/admin/hr", coverage: "Monitoring" },
      { menu: "Dashboard", subMenu: "Status Cuti", orgPath: "/org/hr/reports", adminPath: "/admin/hr", coverage: "Monitoring" },
      { menu: "Dashboard", subMenu: "Notifikasi", orgPath: "/org/hr/dashboard-notifications", adminPath: "/admin/hr/settings#alert-defaults", coverage: "Baseline" },
      { menu: "Dashboard", subMenu: "Aktivitas Terbaru", orgPath: "/org/hr/dashboard-activity", adminPath: "/admin/hr/audit", coverage: "Monitoring" },
    ],
  },
  {
    domain: "2. Tata Kelola Tenant",
    items: [
      { menu: "Tata Kelola Tenant", subMenu: "Data Perusahaan", orgPath: "/org/hr/company", adminPath: "/admin/hr/tenants", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Struktur & Unit Organisasi", orgPath: "/org/hr/structure", adminPath: "/admin/hr/sections/struktur-unit-organisasi", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Departemen", orgPath: "/org/hr/departments", adminPath: "/admin/hr/sections/struktur-unit-organisasi", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Divisi", orgPath: "/org/hr/divisions", adminPath: "/admin/hr/sections/struktur-unit-organisasi", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Jabatan & Grade", orgPath: "/org/hr/position-grade", adminPath: "/admin/hr/sections/jabatan-grade", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Lokasi & Kalender Kerja", orgPath: "/org/hr/work-locations", adminPath: "/admin/hr/sections/lokasi-kalender-kerja", coverage: "Penuh" },
      { menu: "Tata Kelola Tenant", subMenu: "Kalender Kerja", orgPath: "/org/hr/work-calendar", adminPath: "/admin/hr/sections/lokasi-kalender-kerja", coverage: "Penuh" },
    ],
  },
  {
    domain: "3. Manajemen Karyawan",
    items: [
      { menu: "Manajemen Karyawan", subMenu: "Data Karyawan", orgPath: "/org/hr/employees", adminPath: "/admin/hr/tenants", coverage: "Monitoring" },
      { menu: "Manajemen Karyawan", subMenu: "Kontrak Kerja", orgPath: "/org/hr/contracts", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Manajemen Karyawan", subMenu: "Status Kepegawaian", orgPath: "/org/hr/employee-status", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Manajemen Karyawan", subMenu: "Riwayat Jabatan", orgPath: "/org/hr/job-history", adminPath: "/admin/hr/audit", coverage: "Monitoring" },
      { menu: "Manajemen Karyawan", subMenu: "Dokumen Karyawan", orgPath: "/org/hr/documents", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Manajemen Karyawan", subMenu: "Onboarding", orgPath: "/org/hr/onboarding", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Manajemen Karyawan", subMenu: "Offboarding", orgPath: "/org/hr/offboarding", adminPath: "/admin/hr/policies", coverage: "Baseline" },
    ],
  },
  {
    domain: "4. Manajemen Kehadiran",
    items: [
      { menu: "Attendance", subMenu: "Jam Kerja", orgPath: "/org/hr/work-hours", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Attendance", subMenu: "Shift", orgPath: "/org/hr/shifts", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Attendance", subMenu: "Hari Libur Nasional", orgPath: "/org/hr/national-holidays", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Attendance", subMenu: "Pengaturan Keterlambatan", orgPath: "/org/hr/late-settings", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Attendance", subMenu: "Integrasi Absensi", orgPath: "/org/hr/attendance-integrations", adminPath: "/admin/hr/settings#workspace-tenant", coverage: "Penuh" },
      { menu: "Attendance", subMenu: "Rekap Absensi", orgPath: "/org/hr/attendance-recap", adminPath: "/admin/hr", coverage: "Monitoring" },
    ],
  },
  {
    domain: "5. Cuti & Izin",
    items: [
      { menu: "Leave", subMenu: "Jenis Cuti", orgPath: "/org/hr/leave-types", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Leave", subMenu: "Kuota Cuti", orgPath: "/org/hr/leave-quota", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Leave", subMenu: "Approval Flow", orgPath: "/org/hr/leave-approval", adminPath: "/admin/hr/settings#ticket-defaults", coverage: "Penuh" },
      { menu: "Leave", subMenu: "Rekap Cuti", orgPath: "/org/hr/leave-recap", adminPath: "/admin/hr/audit", coverage: "Monitoring" },
      { menu: "Leave", subMenu: "Pengaturan Masa Berlaku", orgPath: "/org/hr/leave-validity", adminPath: "/admin/hr/policies", coverage: "Baseline" },
    ],
  },
  {
    domain: "6. Manajemen Kinerja",
    items: [
      { menu: "Performance", subMenu: "KPI", orgPath: "/org/hr/kpi", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Performance", subMenu: "Periode Penilaian", orgPath: "/org/hr/performance-periods", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Performance", subMenu: "Form Penilaian", orgPath: "/org/hr/performance-forms", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Performance", subMenu: "360 Review", orgPath: "/org/hr/review-360", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Performance", subMenu: "Hasil Evaluasi", orgPath: "/org/hr/evaluation-results", adminPath: "/admin/hr/audit", coverage: "Monitoring" },
    ],
  },
  {
    domain: "7. Pelatihan & Pengembangan",
    items: [
      { menu: "Training", subMenu: "Data Training", orgPath: "/org/hr/training-data", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Training", subMenu: "Sertifikasi", orgPath: "/org/hr/certifications", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Training", subMenu: "Skill Matrix", orgPath: "/org/hr/skill-matrix", adminPath: "/admin/hr/policies", coverage: "Baseline" },
    ],
  },
  {
    domain: "8. Dokumen & Legal",
    items: [
      { menu: "Dokumen", subMenu: "Template Dokumen", orgPath: "/org/hr/document-templates", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Dokumen", subMenu: "Surat Peringatan", orgPath: "/org/hr/warning-letters", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Dokumen", subMenu: "Kontrak Template", orgPath: "/org/hr/contract-templates", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Dokumen", subMenu: "Digital Signature", orgPath: "/org/hr/digital-signature", adminPath: "/admin/hr/policies", coverage: "Baseline" },
    ],
  },
  {
    domain: "9. Manajemen Pengguna & Akses",
    items: [
      { menu: "Pengguna & Akses", subMenu: "Manajemen Pengguna", orgPath: "/org/hr/users", adminPath: "/admin/hr/tenants", coverage: "Monitoring" },
      { menu: "Pengguna & Akses", subMenu: "Manajemen Peran", orgPath: "/org/hr/roles", adminPath: "/admin/hr/settings#ticket-defaults", coverage: "Penuh" },
      { menu: "Pengguna & Akses", subMenu: "Pengaturan Izin", orgPath: "/org/hr/permissions", adminPath: "/admin/hr/settings#ticket-defaults", coverage: "Penuh" },
      { menu: "Pengguna & Akses", subMenu: "Hierarki Persetujuan", orgPath: "/org/hr/approval-hierarchy", adminPath: "/admin/hr/settings#ticket-defaults", coverage: "Penuh" },
      { menu: "Pengguna & Akses", subMenu: "Log Audit", orgPath: "/org/hr/activity-log", adminPath: "/admin/hr/audit", coverage: "Monitoring" },
    ],
  },
  {
    domain: "10. Pengaturan Sistem",
    items: [
      { menu: "Pengaturan Sistem", subMenu: "Pengaturan Workspace HR", orgPath: "/org/hr/settings", adminPath: "/admin/hr/settings#workspace-tenant", coverage: "Penuh" },
      { menu: "Pengaturan Sistem", subMenu: "Pengaturan Umum", orgPath: "/org/hr/general-settings", adminPath: "/admin/hr/settings#workspace-default", coverage: "Penuh" },
      { menu: "Pengaturan Sistem", subMenu: "Branding", orgPath: "/org/hr/branding", adminPath: "/admin/hr/profile", coverage: "Baseline" },
      { menu: "Pengaturan Sistem", subMenu: "Email & Notifikasi", orgPath: "/org/hr/notifications", adminPath: "/admin/hr/settings#alert-defaults", coverage: "Penuh" },
      { menu: "Pengaturan Sistem", subMenu: "Import / Export Data", orgPath: "/org/hr/import-export", adminPath: "/admin/hr/policies", coverage: "Baseline" },
      { menu: "Pengaturan Sistem", subMenu: "Backup", orgPath: "/org/hr/backup", adminPath: "/admin/hr/policies", coverage: "Baseline" },
    ],
  },
  {
    domain: "11. Helpdesk HR",
    items: [
      { menu: "Helpdesk", subMenu: "Ringkasan Bantuan", orgPath: "/org/hr/help", adminPath: "/admin/hr/help/support", coverage: "Monitoring" },
      { menu: "Helpdesk", subMenu: "FAQ HR", orgPath: "/org/hr/help/faq", adminPath: "/admin/hr/help/faq", coverage: "Penuh" },
      { menu: "Helpdesk", subMenu: "Bantuan HR", orgPath: "/org/hr/help/support", adminPath: "/admin/hr/help/support", coverage: "Penuh" },
      { menu: "Helpdesk", subMenu: "Tiket HR", orgPath: "/org/hr/help/tickets", adminPath: "/admin/hr/help/tickets", coverage: "Penuh" },
      { menu: "Helpdesk", subMenu: "Log Error HR", orgPath: "/org/hr/help/error-logs", adminPath: "/admin/hr/error-logs", coverage: "Monitoring" },
    ],
  },
  {
    domain: "12. Rekrutmen (ATS)",
    items: [
      { menu: "Rekrutmen", subMenu: "Lowongan Kerja", orgPath: "/org/hr/recruitment/jobs", adminPath: "/admin/hr/sections/rekrutmen-ats", coverage: "Baseline" },
      { menu: "Rekrutmen", subMenu: "Kandidat", orgPath: "/org/hr/recruitment/candidates", adminPath: "/admin/hr/sections/rekrutmen-ats", coverage: "Baseline" },
      { menu: "Rekrutmen", subMenu: "Tahap Interview", orgPath: "/org/hr/recruitment/interviews", adminPath: "/admin/hr/sections/rekrutmen-ats", coverage: "Baseline" },
      { menu: "Rekrutmen", subMenu: "Penawaran Kerja", orgPath: "/org/hr/recruitment/offers", adminPath: "/admin/hr/sections/rekrutmen-ats", coverage: "Baseline" },
    ],
  },
  {
    domain: "13. Layanan Mandiri Karyawan (ESS)",
    items: [
      { menu: "ESS", subMenu: "Pengajuan Saya", orgPath: "/org/hr/ess/requests", adminPath: "/admin/hr/sections/layanan-mandiri-karyawan", coverage: "Monitoring" },
      { menu: "ESS", subMenu: "Cuti dan Izin Saya", orgPath: "/org/hr/ess/leave-requests", adminPath: "/admin/hr/sections/layanan-mandiri-karyawan", coverage: "Monitoring" },
      { menu: "ESS", subMenu: "Kehadiran Saya", orgPath: "/org/hr/ess/attendance", adminPath: "/admin/hr/sections/layanan-mandiri-karyawan", coverage: "Monitoring" },
      { menu: "ESS", subMenu: "Dokumen Saya", orgPath: "/org/hr/ess/documents", adminPath: "/admin/hr/sections/layanan-mandiri-karyawan", coverage: "Monitoring" },
      { menu: "ESS", subMenu: "Profil Saya", orgPath: "/org/hr/ess/profile", adminPath: "/admin/hr/sections/layanan-mandiri-karyawan", coverage: "Monitoring" },
    ],
  },
];

export default function AdminHRSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isSavingAlertDefaults, setIsSavingAlertDefaults] = useState(false);
  const [isSavingTicketDefaults, setIsSavingTicketDefaults] = useState(false);
  const [isSavingTenantId, setIsSavingTenantId] = useState<string | null>(null);
  const [isSavingAlertTenantId, setIsSavingAlertTenantId] = useState<string | null>(null);
  const [isSavingPolicyTenantId, setIsSavingPolicyTenantId] = useState<string | null>(null);
  const [defaultsUpdatedAt, setDefaultsUpdatedAt] = useState<string | null>(null);
  const [alertDefaultsUpdatedAt, setAlertDefaultsUpdatedAt] = useState<string | null>(null);
  const [ticketDefaultsUpdatedAt, setTicketDefaultsUpdatedAt] = useState<string | null>(null);
  const [tenantRows, setTenantRows] = useState<TenantRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [defaultSettings, setDefaultSettings] = useState<HrWorkspaceDefaults>(DEFAULT_WORKSPACE_DEFAULTS);
  const [alertDefaults, setAlertDefaults] = useState<HrErrorAlertSettings>(DEFAULT_HR_ERROR_ALERT_SETTINGS);
  const [ticketDefaults, setTicketDefaults] = useState<HrTicketPolicySettings>(DEFAULT_HR_TICKET_POLICY_SETTINGS);
  const [tenantModules, setTenantModules] = useState<TenantModuleState>({});
  const [savedTenantModules, setSavedTenantModules] = useState<TenantModuleState>({});
  const [tenantAlertSettings, setTenantAlertSettings] = useState<Record<string, HrErrorAlertSettings>>({});
  const [savedTenantAlertSettings, setSavedTenantAlertSettings] = useState<Record<string, HrErrorAlertSettings>>({});
  const [tenantTicketPolicies, setTenantTicketPolicies] = useState<TenantTicketPolicyState>({});
  const [savedTenantTicketPolicies, setSavedTenantTicketPolicies] = useState<TenantTicketPolicyState>({});
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const [
          { data: tenants, error: tenantsError },
          { data: defaults, error: defaultsError },
          { data: alertDefaultsRow, error: alertDefaultsError },
          { data: ticketDefaultsRow, error: ticketDefaultsError },
        ] = await Promise.all([
          supabase.from("tenants").select("id, name, code, is_active").order("name", { ascending: true }).limit(500),
          supabase.from("system_settings").select("value, updated_at").eq("key", DEFAULTS_KEY).maybeSingle(),
          supabase.from("system_settings").select("value, updated_at").eq("key", ALERT_DEFAULTS_KEY).maybeSingle(),
          supabase.from("system_settings").select("value, updated_at").eq("key", HR_TICKET_POLICY_DEFAULTS_KEY).maybeSingle(),
        ]);
        if (tenantsError) throw tenantsError;
        if (defaultsError) throw defaultsError;
        if (alertDefaultsError) throw alertDefaultsError;
        if (ticketDefaultsError) throw ticketDefaultsError;

        const list = (tenants || []) as TenantRow[];
        const tenantIds = list.map((row) => row.id);

        let map: TenantModuleState = {};
        let alertMap: Record<string, HrErrorAlertSettings> = {};
        let policyMap: TenantTicketPolicyState = {};
        if (tenantIds.length > 0) {
          const [
            { data: moduleRows, error: moduleError },
            { data: alertRows, error: alertRowsError },
            { data: policyRows, error: policyRowsError },
          ] = await Promise.all([
            supabase
              .from("organization_settings")
              .select("tenant_id, setting_value")
              .eq("setting_key", ORG_WORKSPACE_MODULES_SETTING_KEY)
              .in("tenant_id", tenantIds),
            supabase
              .from("organization_settings")
              .select("tenant_id, setting_value")
              .eq("setting_key", HR_ERROR_ALERT_SETTINGS_KEY)
              .in("tenant_id", tenantIds),
            supabase
              .from("organization_settings")
              .select("tenant_id, setting_value")
              .eq("setting_key", HR_TICKET_POLICY_SETTING_KEY)
              .in("tenant_id", tenantIds),
          ]);
          if (moduleError) throw moduleError;
          if (alertRowsError) throw alertRowsError;
          if (policyRowsError) throw policyRowsError;

          map = tenantIds.reduce<TenantModuleState>((acc, id) => {
            acc[id] = DEFAULT_ORG_WORKSPACE_MODULES;
            return acc;
          }, {});
          alertMap = tenantIds.reduce<Record<string, HrErrorAlertSettings>>((acc, id) => {
            acc[id] = DEFAULT_HR_ERROR_ALERT_SETTINGS;
            return acc;
          }, {});
          policyMap = tenantIds.reduce<TenantTicketPolicyState>((acc, id) => {
            acc[id] = DEFAULT_HR_TICKET_POLICY_SETTINGS;
            return acc;
          }, {});

          for (const row of moduleRows || []) {
            const tenantId = row.tenant_id;
            map[tenantId] = parseOrgWorkspaceModulesSetting(row.setting_value);
          }
          for (const row of alertRows || []) {
            const tenantId = row.tenant_id;
            alertMap[tenantId] = normalizeAlertSettings(row.setting_value);
          }
          for (const row of policyRows || []) {
            const tenantId = row.tenant_id;
            policyMap[tenantId] = normalizeHrTicketPolicySettings(row.setting_value);
          }
        }

        setTenantRows(list);
        setTenantModules(map);
        setSavedTenantModules(map);
        setTenantAlertSettings(alertMap);
        setSavedTenantAlertSettings(alertMap);
        setTenantTicketPolicies(policyMap);
        setSavedTenantTicketPolicies(policyMap);
        setDefaultSettings(normalizeDefaults(defaults?.value));
        setDefaultsUpdatedAt(defaults?.updated_at ?? null);
        setAlertDefaults(normalizeAlertSettings(alertDefaultsRow?.value));
        setAlertDefaultsUpdatedAt(alertDefaultsRow?.updated_at ?? null);
        setTicketDefaults(normalizeHrTicketPolicySettings(ticketDefaultsRow?.value));
        setTicketDefaultsUpdatedAt(ticketDefaultsRow?.updated_at ?? null);
      } catch (error) {
        const ref = reportError(error, "admin.hr.settings.load");
        toast.error(appendErrorReference("Gagal memuat pengaturan workspace HR lintas tenant", ref));
      } finally {
        setIsLoading(false);
      }
    };

    void loadSettings();
  }, []);

  const filteredTenants = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return tenantRows.filter((tenant) => {
      if (statusFilter === "active" && !tenant.is_active) return false;
      if (statusFilter === "inactive" && tenant.is_active) return false;
      if (!keyword) return true;
      return `${tenant.name} ${tenant.code} ${tenant.id}`.toLowerCase().includes(keyword);
    });
  }, [searchTerm, statusFilter, tenantRows]);

  const handleTenantToggle = (tenantId: string, key: keyof OrgWorkspaceModules, value: boolean) => {
    setTenantModules((prev) => ({
      ...prev,
      [tenantId]: {
        ...(prev[tenantId] || DEFAULT_ORG_WORKSPACE_MODULES),
        [key]: value,
      },
    }));
  };

  const handleTenantAlertChange = (tenantId: string, key: keyof HrErrorAlertSettings, value: string | boolean) => {
    setTenantAlertSettings((prev) => ({
      ...prev,
      [tenantId]: {
        ...(prev[tenantId] || DEFAULT_HR_ERROR_ALERT_SETTINGS),
        [key]: value,
      },
    }));
  };

  const handleTenantPolicyRoleToggle = (
    tenantId: string,
    capability: keyof Pick<
      HrTicketPolicySettings,
      "canCreate" | "canAssign" | "canComment" | "canTake" | "canResolve" | "canReopen"
    >,
    role: HrTicketRole,
    checked: boolean,
  ) => {
    setTenantTicketPolicies((prev) => {
      const current = prev[tenantId] || DEFAULT_HR_TICKET_POLICY_SETTINGS;
      const currentRoles = current[capability];
      const nextRoles = checked
        ? Array.from(new Set([...currentRoles, role]))
        : currentRoles.filter((value) => value !== role);
      return {
        ...prev,
        [tenantId]: {
          ...current,
          [capability]: nextRoles,
        },
      };
    });
  };

  const handleGlobalPolicyRoleToggle = (
    capability: keyof Pick<
      HrTicketPolicySettings,
      "canCreate" | "canAssign" | "canComment" | "canTake" | "canResolve" | "canReopen"
    >,
    role: HrTicketRole,
    checked: boolean,
  ) => {
    setTicketDefaults((prev) => {
      const currentRoles = prev[capability];
      const nextRoles = checked
        ? Array.from(new Set([...currentRoles, role]))
        : currentRoles.filter((value) => value !== role);
      return {
        ...prev,
        [capability]: nextRoles,
      };
    });
  };

  const isTenantDirty = (tenantId: string) => {
    const current = tenantModules[tenantId] || DEFAULT_ORG_WORKSPACE_MODULES;
    const saved = savedTenantModules[tenantId] || DEFAULT_ORG_WORKSPACE_MODULES;
    return current.hr !== saved.hr || current.payroll !== saved.payroll;
  };

  const isTenantAlertDirty = (tenantId: string) => {
    const current = tenantAlertSettings[tenantId] || DEFAULT_HR_ERROR_ALERT_SETTINGS;
    const saved = savedTenantAlertSettings[tenantId] || DEFAULT_HR_ERROR_ALERT_SETTINGS;
    return (
      current.enableRealtimeAlerts !== saved.enableRealtimeAlerts ||
      current.webhookUrl !== saved.webhookUrl ||
      current.slackWebhookUrl !== saved.slackWebhookUrl ||
      current.whatsappWebhookUrl !== saved.whatsappWebhookUrl ||
      current.emailWebhookUrl !== saved.emailWebhookUrl
    );
  };

  const isTenantPolicyDirty = (tenantId: string) => {
    const current = tenantTicketPolicies[tenantId] || DEFAULT_HR_TICKET_POLICY_SETTINGS;
    const saved = savedTenantTicketPolicies[tenantId] || DEFAULT_HR_TICKET_POLICY_SETTINGS;
    return JSON.stringify(serializeHrTicketPolicySettings(current)) !== JSON.stringify(serializeHrTicketPolicySettings(saved));
  };

  const saveTenantModules = async (tenantId: string) => {
    const payload = tenantModules[tenantId] || DEFAULT_ORG_WORKSPACE_MODULES;
    setIsSavingTenantId(tenantId);
    try {
      const saved = await saveTenantOrgWorkspaceModules(tenantId, payload);
      setTenantModules((prev) => ({ ...prev, [tenantId]: saved }));
      setSavedTenantModules((prev) => ({ ...prev, [tenantId]: saved }));
      toast.success("Pengaturan tenant berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_tenant_modules", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan tenant", ref));
    } finally {
      setIsSavingTenantId(null);
    }
  };

  const saveTenantAlertSettings = async (tenantId: string) => {
    const payload = tenantAlertSettings[tenantId] || DEFAULT_HR_ERROR_ALERT_SETTINGS;
    setIsSavingAlertTenantId(tenantId);
    try {
      await saveTenantHrErrorAlertSettings(tenantId, payload);
      setSavedTenantAlertSettings((prev) => ({ ...prev, [tenantId]: payload }));
      toast.success("Alert tenant berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_tenant_alert", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyimpan alert tenant", ref));
    } finally {
      setIsSavingAlertTenantId(null);
    }
  };

  const saveTenantTicketPolicy = async (tenantId: string) => {
    const payload = tenantTicketPolicies[tenantId] || DEFAULT_HR_TICKET_POLICY_SETTINGS;
    setIsSavingPolicyTenantId(tenantId);
    try {
      await saveTenantHrTicketPolicySettings(tenantId, payload);
      setSavedTenantTicketPolicies((prev) => ({ ...prev, [tenantId]: payload }));
      toast.success("Policy tiket tenant berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_tenant_ticket_policy", { tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menyimpan policy tiket tenant", ref));
    } finally {
      setIsSavingPolicyTenantId(null);
    }
  };

  const saveDefaults = async () => {
    setIsSavingDefaults(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("system_settings").upsert(
        {
          key: DEFAULTS_KEY,
          value: defaultSettings,
          description: "Default aktivasi workspace HR/Payroll untuk tenant baru.",
          updated_by: user?.id ?? null,
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      setDefaultsUpdatedAt(new Date().toISOString());
      toast.success("Default global workspace berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_defaults");
      toast.error(appendErrorReference("Gagal menyimpan default global workspace", ref));
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const saveAlertDefaults = async () => {
    setIsSavingAlertDefaults(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const value = {
        enable_realtime_alerts: alertDefaults.enableRealtimeAlerts,
        webhook_url: alertDefaults.webhookUrl.trim(),
        slack_webhook_url: alertDefaults.slackWebhookUrl.trim(),
        whatsapp_webhook_url: alertDefaults.whatsappWebhookUrl.trim(),
        email_webhook_url: alertDefaults.emailWebhookUrl.trim(),
      };

      const { error } = await supabase.from("system_settings").upsert(
        {
          key: ALERT_DEFAULTS_KEY,
          value,
          description: "Baseline alert realtime error kritis HR lintas tenant.",
          updated_by: user?.id ?? null,
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      setAlertDefaultsUpdatedAt(new Date().toISOString());
      toast.success("Default alert HR berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_alert_defaults");
      toast.error(appendErrorReference("Gagal menyimpan default alert HR", ref));
    } finally {
      setIsSavingAlertDefaults(false);
    }
  };

  const saveTicketDefaults = async () => {
    setIsSavingTicketDefaults(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const value = serializeHrTicketPolicySettings(ticketDefaults);
      const { error } = await supabase.from("system_settings").upsert(
        {
          key: HR_TICKET_POLICY_DEFAULTS_KEY,
          value,
          description: "Baseline SLA dan role matrix untuk tiket HR lintas tenant.",
          updated_by: user?.id ?? null,
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      setTicketDefaultsUpdatedAt(new Date().toISOString());
      toast.success("Baseline policy tiket HR berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.save_ticket_defaults");
      toast.error(appendErrorReference("Gagal menyimpan baseline policy tiket HR", ref));
    } finally {
      setIsSavingTicketDefaults(false);
    }
  };

  const toggleTenantSelected = (tenantId: string, checked: boolean) => {
    setSelectedTenantIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tenantId);
      else next.delete(tenantId);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedTenantIds((prev) => {
      const next = new Set(prev);
      for (const tenant of filteredTenants) {
        if (checked) next.add(tenant.id);
        else next.delete(tenant.id);
      }
      return next;
    });
  };

  const applyAlertBaselineToSelected = async () => {
    const selected = filteredTenants
      .map((tenant) => tenant.id)
      .filter((tenantId) => selectedTenantIds.has(tenantId));
    if (selected.length === 0) {
      toast.info("Pilih minimal satu tenant untuk apply baseline alert.");
      return;
    }

    try {
      await Promise.all(selected.map((tenantId) => saveTenantHrErrorAlertSettings(tenantId, alertDefaults)));
      setTenantAlertSettings((prev) => {
        const next = { ...prev };
        for (const tenantId of selected) next[tenantId] = alertDefaults;
        return next;
      });
      setSavedTenantAlertSettings((prev) => {
        const next = { ...prev };
        for (const tenantId of selected) next[tenantId] = alertDefaults;
        return next;
      });
      toast.success(`Baseline alert diterapkan ke ${selected.length} tenant.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.apply_alert_baseline_bulk", {
        tenant_count: selected.length,
      });
      toast.error(appendErrorReference("Gagal menerapkan baseline alert ke tenant terpilih", ref));
    }
  };

  const applyTicketPolicyBaselineToSelected = async () => {
    const selected = filteredTenants
      .map((tenant) => tenant.id)
      .filter((tenantId) => selectedTenantIds.has(tenantId));
    if (selected.length === 0) {
      toast.info("Pilih minimal satu tenant untuk apply baseline policy tiket.");
      return;
    }
    try {
      await Promise.all(selected.map((tenantId) => saveTenantHrTicketPolicySettings(tenantId, ticketDefaults)));
      setTenantTicketPolicies((prev) => {
        const next = { ...prev };
        for (const tenantId of selected) next[tenantId] = ticketDefaults;
        return next;
      });
      setSavedTenantTicketPolicies((prev) => {
        const next = { ...prev };
        for (const tenantId of selected) next[tenantId] = ticketDefaults;
        return next;
      });
      toast.success(`Baseline policy tiket diterapkan ke ${selected.length} tenant.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.settings.apply_ticket_policy_baseline_bulk", {
        tenant_count: selected.length,
      });
      toast.error(appendErrorReference("Gagal menerapkan baseline policy tiket ke tenant terpilih", ref));
    }
  };

  const allFilteredSelected =
    filteredTenants.length > 0 && filteredTenants.every((tenant) => selectedTenantIds.has(tenant.id));

  return (
    <AdminHRPageShell
      title="Pengaturan HR"
      subtitle="Konfigurasi modul HR global"
      description="Control tower superadmin untuk mengatur aktivasi workspace HR/Payroll lintas tenant."
    >
      <div className="space-y-6">
        <Card id="coverage-map">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Cakupan /org/hr</Badge>
            </div>
            <CardTitle>Matriks Pengaturan HR Org ke Admin</CardTitle>
            <CardDescription>
              Pemetaan menu dan sub menu `/org/hr` ke titik kontrol superadmin `/admin/hr`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {HR_SETTINGS_COVERAGE.map((domain) => (
              <div key={domain.domain} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-semibold">{domain.domain}</p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sub Menu /org/hr</TableHead>
                        <TableHead>Route Org</TableHead>
                        <TableHead>Kontrol Admin</TableHead>
                        <TableHead>Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domain.items.map((item) => (
                        <TableRow key={`${domain.domain}-${item.orgPath}-${item.subMenu}`}>
                          <TableCell className="font-medium">{item.subMenu}</TableCell>
                          <TableCell className="font-mono text-xs">{item.orgPath}</TableCell>
                          <TableCell>
                            <Button asChild variant="outline" size="sm">
                              <Link to={item.adminPath}>{item.adminPath}</Link>
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.coverage === "Penuh" ? "secondary" : "outline"}>
                              {item.coverage}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="workspace-default">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Default Global</Badge>
              {defaultsUpdatedAt ? (
                <Badge variant="secondary">Update terakhir {formatDateTime(defaultsUpdatedAt)}</Badge>
              ) : null}
            </div>
            <CardTitle>Default Workspace Tenant Baru</CardTitle>
            <CardDescription>
              Nilai ini menjadi baseline ketika tenant belum memiliki pengaturan `org_workspace_modules_v1`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">HR default aktif</p>
                  <p className="text-xs text-muted-foreground">Mengaktifkan menu `/org/hr` secara default.</p>
                </div>
                <Switch
                  checked={defaultSettings.hr_default_enabled}
                  onCheckedChange={(checked) =>
                    setDefaultSettings((prev) => ({ ...prev, hr_default_enabled: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Payroll default aktif</p>
                  <p className="text-xs text-muted-foreground">Mengaktifkan menu `/org/payroll` secara default.</p>
                </div>
                <Switch
                  checked={defaultSettings.payroll_default_enabled}
                  onCheckedChange={(checked) =>
                    setDefaultSettings((prev) => ({ ...prev, payroll_default_enabled: checked }))
                  }
                />
              </div>
            </div>
            <Button onClick={saveDefaults} disabled={isSavingDefaults || isLoading}>
              <Save className="mr-2 h-4 w-4" />
              Simpan Default Global
            </Button>
          </CardContent>
        </Card>

        <Card id="workspace-tenant">
          <CardHeader>
            <CardTitle>Workspace per Tenant</CardTitle>
            <CardDescription>Aktif/nonaktifkan workspace HR dan Payroll per tenant organisasi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="search-tenant">Cari tenant</Label>
                <Input
                  id="search-tenant"
                  placeholder="Cari nama/kode/ID tenant..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status tenant</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Workspace HR</TableHead>
                    <TableHead>Workspace Payroll</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat daftar tenant...
                      </TableCell>
                    </TableRow>
                  ) : filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Tidak ada tenant untuk filter saat ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => {
                      const modules = tenantModules[tenant.id] || DEFAULT_ORG_WORKSPACE_MODULES;
                      const isDirty = isTenantDirty(tenant.id);
                      return (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {tenant.code} · {tenant.id}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={tenant.is_active ? "secondary" : "outline"}>
                              {tenant.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={modules.hr}
                              onCheckedChange={(checked) => handleTenantToggle(tenant.id, "hr", checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={modules.payroll}
                              onCheckedChange={(checked) => handleTenantToggle(tenant.id, "payroll", checked)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => void saveTenantModules(tenant.id)}
                              disabled={!isDirty || isSavingTenantId === tenant.id}
                            >
                              Simpan
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card id="alert-defaults">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">HR Alert Settings</Badge>
              {alertDefaultsUpdatedAt ? (
                <Badge variant="secondary">Update terakhir {formatDateTime(alertDefaultsUpdatedAt)}</Badge>
              ) : null}
            </div>
            <CardTitle>Baseline Alert Realtime HR</CardTitle>
            <CardDescription>
              Atur baseline alert HR, lalu apply ke tenant terpilih. Tidak ada auto-refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Aktifkan alert realtime kritis</p>
                  <p className="text-xs text-muted-foreground">Tenant akan kirim notifikasi saat error HR kritis.</p>
                </div>
                <Switch
                  checked={alertDefaults.enableRealtimeAlerts}
                  onCheckedChange={(checked) =>
                    setAlertDefaults((prev) => ({ ...prev, enableRealtimeAlerts: checked }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-webhook-hr">Webhook Umum</Label>
                <Input
                  id="default-webhook-hr"
                  placeholder="https://..."
                  value={alertDefaults.webhookUrl}
                  onChange={(event) =>
                    setAlertDefaults((prev) => ({ ...prev, webhookUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-slack-hr">Slack Webhook</Label>
                <Input
                  id="default-slack-hr"
                  placeholder="https://hooks.slack.com/..."
                  value={alertDefaults.slackWebhookUrl}
                  onChange={(event) =>
                    setAlertDefaults((prev) => ({ ...prev, slackWebhookUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-wa-hr">WhatsApp Webhook</Label>
                <Input
                  id="default-wa-hr"
                  placeholder="https://..."
                  value={alertDefaults.whatsappWebhookUrl}
                  onChange={(event) =>
                    setAlertDefaults((prev) => ({ ...prev, whatsappWebhookUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-email-hr">Email Webhook</Label>
                <Input
                  id="default-email-hr"
                  placeholder="https://..."
                  value={alertDefaults.emailWebhookUrl}
                  onChange={(event) =>
                    setAlertDefaults((prev) => ({ ...prev, emailWebhookUrl: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveAlertDefaults} disabled={isSavingAlertDefaults || isLoading}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Baseline Alert
              </Button>
              <Button variant="outline" onClick={() => void applyAlertBaselineToSelected()} disabled={isLoading}>
                Apply Baseline ke Tenant Terpilih
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card id="ticket-defaults">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Ticket SLA & Role Matrix</Badge>
              {ticketDefaultsUpdatedAt ? (
                <Badge variant="secondary">Update terakhir {formatDateTime(ticketDefaultsUpdatedAt)}</Badge>
              ) : null}
            </div>
            <CardTitle>Baseline Policy Tiket HR</CardTitle>
            <CardDescription>
              Atur SLA default dan role matrix tiket HR untuk fallback ketika tenant belum punya override.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ticket-default-sla-hours">Default SLA (jam)</Label>
                <Input
                  id="ticket-default-sla-hours"
                  type="number"
                  min={1}
                  max={720}
                  value={ticketDefaults.defaultSlaHours}
                  onChange={(event) =>
                    setTicketDefaults((prev) => ({
                      ...prev,
                      defaultSlaHours: Math.max(1, Math.min(720, Number(event.target.value) || 1)),
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              {TICKET_CAPABILITIES.map((capability) => (
                <div key={capability.key} className="space-y-2">
                  <p className="text-sm font-medium">{capability.label}</p>
                  <div className="flex flex-wrap gap-3">
                    {ROLE_OPTIONS.map((roleOption) => (
                      <label key={`${capability.key}-${roleOption.role}`} className="inline-flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={ticketDefaults[capability.key].includes(roleOption.role)}
                          onCheckedChange={(checked) =>
                            handleGlobalPolicyRoleToggle(capability.key, roleOption.role, Boolean(checked))
                          }
                        />
                        <span>{roleOption.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveTicketDefaults} disabled={isSavingTicketDefaults || isLoading}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Baseline Policy Tiket
              </Button>
              <Button variant="outline" onClick={() => void applyTicketPolicyBaselineToSelected()} disabled={isLoading}>
                Apply Policy ke Tenant Terpilih
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card id="alert-override">
          <CardHeader>
            <CardTitle>Override Alert per Tenant</CardTitle>
            <CardDescription>Kelola pengaturan alert realtime HR pada tenant tertentu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
                        aria-label="Pilih semua tenant terfilter"
                      />
                    </TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Alert Aktif</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Slack</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat pengaturan alert tenant...
                      </TableCell>
                    </TableRow>
                  ) : filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Tidak ada tenant untuk filter saat ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => {
                      const settings = tenantAlertSettings[tenant.id] || DEFAULT_HR_ERROR_ALERT_SETTINGS;
                      const dirty = isTenantAlertDirty(tenant.id);
                      return (
                        <TableRow key={`alert-${tenant.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTenantIds.has(tenant.id)}
                              onCheckedChange={(checked) => toggleTenantSelected(tenant.id, Boolean(checked))}
                              aria-label={`Pilih tenant ${tenant.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={settings.enableRealtimeAlerts}
                              onCheckedChange={(checked) =>
                                handleTenantAlertChange(tenant.id, "enableRealtimeAlerts", checked)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="https://..."
                              value={settings.webhookUrl}
                              onChange={(event) =>
                                handleTenantAlertChange(tenant.id, "webhookUrl", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="https://hooks.slack.com/..."
                              value={settings.slackWebhookUrl}
                              onChange={(event) =>
                                handleTenantAlertChange(tenant.id, "slackWebhookUrl", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="https://..."
                              value={settings.whatsappWebhookUrl}
                              onChange={(event) =>
                                handleTenantAlertChange(tenant.id, "whatsappWebhookUrl", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="https://..."
                              value={settings.emailWebhookUrl}
                              onChange={(event) =>
                                handleTenantAlertChange(tenant.id, "emailWebhookUrl", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => void saveTenantAlertSettings(tenant.id)}
                              disabled={!dirty || isSavingAlertTenantId === tenant.id}
                            >
                              Simpan
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card id="ticket-override">
          <CardHeader>
            <CardTitle>Override Policy Tiket per Tenant</CardTitle>
            <CardDescription>Atur SLA default dan role matrix tiket HR untuk tenant tertentu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Default SLA (jam)</TableHead>
                    <TableHead>Role Matrix</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        Memuat policy tiket tenant...
                      </TableCell>
                    </TableRow>
                  ) : filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        Tidak ada tenant untuk filter saat ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => {
                      const policy = tenantTicketPolicies[tenant.id] || DEFAULT_HR_TICKET_POLICY_SETTINGS;
                      const dirty = isTenantPolicyDirty(tenant.id);
                      return (
                        <TableRow key={`policy-${tenant.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              max={720}
                              value={policy.defaultSlaHours}
                              onChange={(event) =>
                                setTenantTicketPolicies((prev) => ({
                                  ...prev,
                                  [tenant.id]: {
                                    ...policy,
                                    defaultSlaHours: Math.max(1, Math.min(720, Number(event.target.value) || 1)),
                                  },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-3">
                              {TICKET_CAPABILITIES.map((capability) => (
                                <div key={`${tenant.id}-${capability.key}`} className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground">{capability.label}</p>
                                  <div className="flex flex-wrap gap-3">
                                    {ROLE_OPTIONS.map((roleOption) => (
                                      <label
                                        key={`${tenant.id}-${capability.key}-${roleOption.role}`}
                                        className="inline-flex items-center gap-2 text-xs"
                                      >
                                        <Checkbox
                                          checked={policy[capability.key].includes(roleOption.role)}
                                          onCheckedChange={(checked) =>
                                            handleTenantPolicyRoleToggle(
                                              tenant.id,
                                              capability.key,
                                              roleOption.role,
                                              Boolean(checked),
                                            )
                                          }
                                        />
                                        <span>{roleOption.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => void saveTenantTicketPolicy(tenant.id)}
                              disabled={!dirty || isSavingPolicyTenantId === tenant.id}
                            >
                              Simpan
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}
