import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { DatabaseHealthMonitor } from "@/components/admin/settings/DatabaseHealthMonitor";
import { RLSPoliciesExport } from "@/components/admin/settings/RLSPoliciesExport";
import { BackupReminderCard } from "@/components/admin/settings/BackupReminderCard";
import { ConnectionTester } from "@/components/admin/settings/ConnectionTester";
import { DataImportManager } from "@/components/admin/settings/DataImportManager";
import { FullBackupManager } from "@/components/admin/settings/FullBackupManager";
import { MigrationWizard } from "@/components/admin/settings/MigrationWizard";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { debugLog } from "@/lib/debugLog";
import { withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import { 
  Database, 
  Download, 
  Upload, 
  Shield, 
  Server, 
  HardDrive,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  FileCode,
  Users,
  Building2,
  Calendar,
  Clock,
  Loader2,
  FolderOpen,
  Code,
  Key,
  Zap,
  ListChecks,
  FileWarning,
  CircleCheck,
  XCircle,
  RefreshCw,
  Activity,
  Plug
} from "lucide-react";

// Schema SQL Generator
const generateSchemaSql = () => {
  return `-- ================================================
-- ABSENSIKU DATABASE SCHEMA
-- Generated: ${new Date().toISOString()}
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- ENUM TYPES
-- ================================================
CREATE TYPE app_role AS ENUM ('super_admin', 'admin_instansi', 'atasan', 'pegawai');
CREATE TYPE organization_type AS ENUM ('perusahaan', 'pemerintah_daerah', 'pemerintah_pusat', 'pendidikan', 'kesehatan', 'lainnya');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'expired', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('hadir', 'terlambat', 'tidak_hadir', 'izin', 'sakit', 'cuti', 'dinas_luar', 'wfh');
CREATE TYPE request_status AS ENUM ('menunggu', 'disetujui', 'ditolak');
CREATE TYPE leave_type AS ENUM ('cuti_tahunan', 'cuti_sakit', 'cuti_melahirkan', 'cuti_khusus', 'izin', 'dinas_luar', 'tanpa_keterangan');

-- ================================================
-- CORE TABLES
-- ================================================

-- Tenants (Organizations)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  organization_type organization_type DEFAULT 'perusahaan',
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status subscription_status DEFAULT 'trial',
  max_offices INTEGER DEFAULT 1,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  price_per_month NUMERIC,
  price_per_employee NUMERIC,
  auto_renew BOOLEAN DEFAULT false,
  payment_type VARCHAR DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OPD (Organisasi Perangkat Daerah)
CREATE TABLE public.opd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Offices
CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  radius_meters INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Units
CREATE TABLE public.work_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  code TEXT,
  institution_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Positions
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_unit_id UUID REFERENCES work_units(id),
  name TEXT NOT NULL,
  code TEXT,
  level INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  office_id UUID REFERENCES offices(id),
  work_unit_id UUID REFERENCES work_units(id),
  position_id UUID REFERENCES positions(id),
  supervisor_id UUID REFERENCES employees(id),
  nik TEXT NOT NULL,
  nip TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  position TEXT,
  gelar_depan TEXT,
  gelar_belakang TEXT,
  address TEXT,
  gender TEXT,
  golongan TEXT,
  employee_category TEXT,
  android_id TEXT,
  last_login_device_id TEXT,
  device_id_reset_count INTEGER DEFAULT 0,
  device_id_last_reset TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  allow_flexible_attendance BOOLEAN DEFAULT false,
  flexible_attendance_limit INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Work Hours
CREATE TABLE public.work_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  time_in TIME NOT NULL,
  time_out TIME NOT NULL,
  institution_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Holidays
CREATE TABLE public.work_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  dates INTEGER[] NOT NULL,
  description TEXT,
  institution_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Absence Limits
CREATE TABLE public.absence_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warning_type TEXT NOT NULL,
  max_days INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Shifts
CREATE TABLE public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  check_in_start TIME,
  check_in_end TIME,
  check_out_start TIME,
  check_out_end TIME,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Attendance Records (Partitioned)
CREATE TABLE public.attendance_records (
  id UUID DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  office_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time TIMESTAMPTZ,
  check_in_latitude NUMERIC,
  check_in_longitude NUMERIC,
  check_in_distance_meters NUMERIC,
  check_out_time TIMESTAMPTZ,
  check_out_latitude NUMERIC,
  check_out_longitude NUMERIC,
  check_out_distance_meters NUMERIC,
  status attendance_status DEFAULT 'tidak_hadir',
  is_corrected BOOLEAN DEFAULT false,
  is_wfh BOOLEAN DEFAULT false,
  is_flexible_attendance BOOLEAN DEFAULT false,
  shift_id UUID,
  original_shift_id UUID,
  shift_changed_at TIMESTAMPTZ,
  shift_change_reason TEXT,
  flexible_attendance_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- Leave Requests
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  attachment_url TEXT,
  is_half_day BOOLEAN DEFAULT false,
  status request_status DEFAULT 'menunggu',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  employee_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- System Settings
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- FAQs
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- ENABLE RLS ON ALL TABLES
-- ================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE opd ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- ================================================
-- HELPER FUNCTIONS
-- ================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_employee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

-- ================================================
-- CATATAN:
-- 1. Jalankan SQL ini di SQL Editor proyek Supabase baru
-- 2. Setelah itu, impor data dari backup JSON
-- 3. Buat kebijakan RLS (gunakan fitur Ekspor RLS)
-- 4. Siapkan storage bucket: organization-logos, apk-files, news-images
-- 5. Deploy edge functions dari codebase
-- ================================================
`;
};

// Checklist items
const migrationChecklist = [
  {
    category: "Persiapan",
    items: [
      { id: "backup-data", label: "Backup semua data dari database sumber" },
      { id: "backup-schema", label: "Ekspor skema SQL" },
      { id: "export-rls", label: "Ekspor kebijakan RLS SQL" },
      { id: "create-project", label: "Buat proyek Supabase baru" },
      { id: "note-credentials", label: "Catat kredensial proyek baru (URL, Kunci Anon, Kunci Service)" }
    ]
  },
  {
    category: "Migrasi Skema",
    items: [
      { id: "run-schema", label: "Jalankan skema SQL di SQL Editor proyek baru" },
      { id: "run-rls", label: "Jalankan kebijakan RLS SQL" },
      { id: "verify-tables", label: "Verifikasi semua tabel berhasil dibuat" },
      { id: "create-partitions", label: "Buat partisi attendance_records untuk bulan berjalan" },
      { id: "verify-rls", label: "Verifikasi kebijakan RLS aktif" }
    ]
  },
  {
    category: "Migrasi Data",
    items: [
      { id: "import-tenants", label: "Impor data tenant" },
      { id: "import-subscriptions", label: "Impor data langganan" },
      { id: "import-opd", label: "Impor data OPD" },
      { id: "import-offices", label: "Impor data kantor" },
      { id: "import-employees", label: "Impor data pegawai" },
      { id: "import-user-roles", label: "Impor data user_roles" },
      { id: "import-attendance", label: "Impor data absensi" },
      { id: "verify-fk", label: "Verifikasi foreign key relationships" }
    ]
  },
  {
    category: "Migrasi Auth",
    items: [
      { id: "export-users", label: "Ekspor daftar pengguna dari auth.users (via Dasbor)" },
      { id: "reset-passwords", label: "Kirim email reset password ke semua user" },
      { id: "verify-roles", label: "Verifikasi user_roles terlink dengan benar" }
    ]
  },
  {
    category: "Storage & Functions",
    items: [
      { id: "create-buckets", label: "Buat storage buckets (organization-logos, apk-files, news-images)" },
      { id: "set-bucket-policies", label: "Set storage bucket policies (public read)" },
      { id: "migrate-files", label: "Upload ulang file dari storage lama" },
      { id: "deploy-functions", label: "Deploy edge functions dari codebase" },
      { id: "setup-secrets", label: "Setup secrets/environment variables di edge functions" }
    ]
  },
  {
    category: "Testing & Cutover",
    items: [
      { id: "test-connection", label: "Test koneksi ke database baru" },
      { id: "test-login", label: "Test login untuk setiap role" },
      { id: "test-attendance", label: "Test fitur absensi" },
      { id: "test-reports", label: "Test laporan dan export" },
      { id: "update-env", label: "Update environment variables di Lovable" },
      { id: "dns-cutover", label: "Cutover DNS/domain (jika ada)" },
      { id: "verify-production", label: "Verifikasi aplikasi berjalan di production" }
    ]
  }
];

export default function SupabaseSettings({ embedded = false }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState("info");
  const [isLoading, setIsLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Checklist state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  
  // Validation state
  const [validationResults, setValidationResults] = useState<{
    ran: boolean;
    issues: string[];
    passed: string[];
  }>({ ran: false, issues: [], passed: [] });
  
  // Import state
  const [importData, setImportData] = useState<Record<string, unknown[]> | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importSchema, setImportSchema] = useState<string | null>(null);
  const [importRls, setImportRls] = useState<string | null>(null);
  const [importMetadata, setImportMetadata] = useState<Record<string, unknown> | null>(null);
  
  // Stats
  const [dbStats, setDbStats] = useState<{
    tenants: number;
    employees: number;
    attendance: number;
  } | null>(null);

  const currentProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "uvzruextguakdocvhfay";
  const currentUrl = supabaseUrl;
  const currentAnonKey = supabasePublishableKey;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await withTimeout(() => navigator.clipboard.writeText(text), 5000);
      toast.success(`${label} berhasil disalin`);
    } catch (error) {
      const errorRef = reportError(error, "admin.supabase_settings.copy_clipboard", { label });
      toast.error(appendErrorReference(`Gagal menyalin ${label}`, errorRef));
    }
  };

  const fetchDatabaseStats = async () => {
    setIsLoading(true);
    try {
      const [tenantsRes, employeesRes, attendanceRes] = await withTimeout(
        () =>
          Promise.all([
            supabase.from("tenants").select("id", { count: "exact", head: true }),
            supabase.from("employees").select("id", { count: "exact", head: true }),
            supabase.from("attendance_records_partitioned").select("id", { count: "exact", head: true }),
          ]),
        15000,
      );

      if (tenantsRes.error) throw tenantsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setDbStats({
        tenants: tenantsRes.count || 0,
        employees: employeesRes.count || 0,
        attendance: attendanceRes.count || 0
      });
      
      toast.success("Statistik database berhasil dimuat");
    } catch (error) {
      const errorRef = reportError(error, "admin.supabase_settings.fetch_stats");
      toast.error(appendErrorReference("Gagal memuat statistik database", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const exportTableData = async (tableName: string) => {
    setIsLoading(true);
    try {
      type ExportableTable = "tenants" | "employees" | "offices" | "opd" | "work_hours" | "leave_requests" | "subscriptions" | "user_roles" | "work_holidays" | "absence_limits" | "positions" | "work_units" | "attendance_records_partitioned" | "work_shifts";
      
      const tableMap: Record<string, ExportableTable> = {
        tenants: "tenants",
        employees: "employees",
        offices: "offices",
        opd: "opd",
        work_hours: "work_hours",
        leave_requests: "leave_requests",
        subscriptions: "subscriptions",
        user_roles: "user_roles",
        work_holidays: "work_holidays",
        absence_limits: "absence_limits",
        positions: "positions",
        work_units: "work_units",
        work_shifts: "work_shifts",
        attendance_records: "attendance_records_partitioned"
      };
      
      const safeTableName = tableMap[tableName] || "tenants";
      
      const { data, error } = await withTimeout(
        () => supabase.from(safeTableName).select("*").limit(10000),
        20000,
      );

      if (error) throw error;

      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tableName}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Data ${tableName} berhasil diekspor`);
    } catch (error) {
      const errorRef = reportError(error, "admin.supabase_settings.export_table", {
        table_name: tableName,
      });
      toast.error(appendErrorReference(`Gagal mengekspor data ${tableName}`, errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const exportAllTables = async () => {
    setIsLoading(true);
    try {
      const [
        tenantsData,
        employeesData,
        officesData,
        opdData,
        workUnitsData,
        positionsData,
        workHoursData,
        workHolidaysData,
        absenceLimitsData,
        subscriptionsData,
        userRolesData,
        leaveRequestsData,
        workShiftsData,
      ] = await withTimeout(
        () =>
          Promise.all([
            supabase.from("tenants").select("*").limit(10000),
            supabase.from("employees").select("*").limit(10000),
            supabase.from("offices").select("*").limit(10000),
            supabase.from("opd").select("*").limit(10000),
            supabase.from("work_units").select("*").limit(10000),
            supabase.from("positions").select("*").limit(10000),
            supabase.from("work_hours").select("*").limit(10000),
            supabase.from("work_holidays").select("*").limit(10000),
            supabase.from("absence_limits").select("*").limit(10000),
            supabase.from("subscriptions").select("*").limit(10000),
            supabase.from("user_roles").select("*").limit(10000),
            supabase.from("leave_requests").select("*").limit(10000),
            supabase.from("work_shifts").select("*").limit(10000),
          ]),
        30000,
      );

      const queryError =
        tenantsData.error ||
        employeesData.error ||
        officesData.error ||
        opdData.error ||
        workUnitsData.error ||
        positionsData.error ||
        workHoursData.error ||
        workHolidaysData.error ||
        absenceLimitsData.error ||
        subscriptionsData.error ||
        userRolesData.error ||
        leaveRequestsData.error ||
        workShiftsData.error;
      if (queryError) throw queryError;

      const allData = {
        tenants: tenantsData.data || [],
        subscriptions: subscriptionsData.data || [],
        opd: opdData.data || [],
        offices: officesData.data || [],
        work_units: workUnitsData.data || [],
        positions: positionsData.data || [],
        employees: employeesData.data || [],
        user_roles: userRolesData.data || [],
        work_hours: workHoursData.data || [],
        work_holidays: workHolidaysData.data || [],
        absence_limits: absenceLimitsData.data || [],
        work_shifts: workShiftsData.data || [],
        leave_requests: leaveRequestsData.data || []
      };

      const jsonString = JSON.stringify(allData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `full_backup_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Backup lengkap berhasil dibuat");
    } catch (error) {
      const errorRef = reportError(error, "admin.supabase_settings.export_full_backup");
      toast.error(appendErrorReference("Gagal membuat backup lengkap", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const exportSchemaSql = () => {
    const sql = generateSchemaSql();
    const blob = new Blob([sql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absensiku_schema_${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Skema SQL berhasil diekspor");
  };

  const runDataValidation = async () => {
    setIsLoading(true);
    const issues: string[] = [];
    const passed: string[] = [];

    try {
      // Check employees without tenant
      const { data: orphanEmployees, error: orphanEmployeesError } = await withTimeout(
        () => supabase.from("employees").select("id, name, tenant_id").is("tenant_id", null),
        15000,
      );
      if (orphanEmployeesError) throw orphanEmployeesError;
      
      if (orphanEmployees && orphanEmployees.length > 0) {
        issues.push(`${orphanEmployees.length} pegawai tidak memiliki tenant_id`);
      } else {
        passed.push("Semua pegawai memiliki tenant_id");
      }

      // Check employees without office
      const { data: noOfficeEmployees, error: noOfficeEmployeesError } = await withTimeout(
        () =>
          supabase.from("employees").select("id, name").is("office_id", null).eq("is_active", true),
        15000,
      );
      if (noOfficeEmployeesError) throw noOfficeEmployeesError;
      
      if (noOfficeEmployees && noOfficeEmployees.length > 0) {
        issues.push(`${noOfficeEmployees.length} pegawai aktif tidak memiliki office_id`);
      } else {
        passed.push("Semua pegawai aktif memiliki office_id");
      }

      // Check tenants without subscription
      const [{ data: tenants, error: tenantsError }, { data: subscriptions, error: subscriptionsError }] =
        await withTimeout(
          () =>
            Promise.all([
              supabase.from("tenants").select("id"),
              supabase.from("subscriptions").select("tenant_id"),
            ]),
          15000,
        );
      if (tenantsError) throw tenantsError;
      if (subscriptionsError) throw subscriptionsError;
      
      const tenantsWithSub = new Set(subscriptions?.map(s => s.tenant_id) || []);
      const tenantsWithoutSub = tenants?.filter(t => !tenantsWithSub.has(t.id)) || [];
      
      if (tenantsWithoutSub.length > 0) {
        issues.push(`${tenantsWithoutSub.length} organisasi tidak memiliki subscription`);
      } else {
        passed.push("Semua organisasi memiliki subscription");
      }

      // Check user_roles without valid user
      const { data: rolesWithoutUser, error: rolesWithoutUserError } = await withTimeout(
        () => supabase.from("user_roles").select("id, user_id").is("user_id", null),
        15000,
      );
      if (rolesWithoutUserError) throw rolesWithoutUserError;
      
      if (rolesWithoutUser && rolesWithoutUser.length > 0) {
        issues.push(`${rolesWithoutUser.length} user_roles tidak memiliki user_id`);
      } else {
        passed.push("Semua user_roles memiliki user_id");
      }

      // Check duplicate NIK
      const { data: employees, error: employeesError } = await withTimeout(
        () => supabase.from("employees").select("nik, tenant_id"),
        15000,
      );
      if (employeesError) throw employeesError;
      const nikMap = new Map<string, number>();
      employees?.forEach(e => {
        const key = `${e.tenant_id}-${e.nik}`;
        nikMap.set(key, (nikMap.get(key) || 0) + 1);
      });
      const duplicateNiks = Array.from(nikMap.entries()).filter(([, count]) => count > 1);
      
      if (duplicateNiks.length > 0) {
        issues.push(`${duplicateNiks.length} NIK duplikat ditemukan dalam organisasi yang sama`);
      } else {
        passed.push("Tidak ada NIK duplikat dalam organisasi yang sama");
      }

      setValidationResults({ ran: true, issues, passed });
      
      if (issues.length === 0) {
        toast.success("Validasi selesai - Tidak ada masalah ditemukan!");
      } else {
        toast.warning(`Validasi selesai - ${issues.length} masalah ditemukan`);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.supabase_settings.run_validation");
      toast.error(appendErrorReference("Gagal menjalankan validasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const loadingToast = file.size > 1000000 ? toast.loading(`Memproses file ${file.name}...`) : null;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          toast.error("File kosong");
          if (loadingToast) toast.dismiss(loadingToast);
          return;
        }
        
        const json = JSON.parse(content);
        debugLog("Pratinjau kunci JSON:", Object.keys(json));
        
        // Check if it's a full backup format (has 'data' property with table data)
        const isFullBackup = json.data && typeof json.data === 'object' && !Array.isArray(json.data);
        
        if (isFullBackup) {
          // Full backup format
          setImportData(json.data as Record<string, unknown[]>);
          setImportSchema(typeof json.schema === 'string' ? json.schema : null);
          setImportRls(typeof json.rls === 'string' ? json.rls : null);
          setImportMetadata(json.metadata || null);
          
          const tableCount = Object.keys(json.data).length;
          const recordCount = Object.values(json.data as Record<string, unknown[]>).reduce((acc, val) => {
            return acc + (Array.isArray(val) ? val.length : 0);
          }, 0);
          
          if (loadingToast) toast.dismiss(loadingToast);
          toast.success(`Backup lengkap dimuat: ${tableCount} tabel, ${recordCount.toLocaleString()} rekaman`);
        } else {
          // Simple format (direct table data)
          setImportData(json as Record<string, unknown[]>);
          setImportSchema(null);
          setImportRls(null);
          setImportMetadata(null);
          
          if (loadingToast) toast.dismiss(loadingToast);
          toast.success(`File ${file.name} berhasil dimuat`);
        }
        
        setImportFileName(file.name);
      } catch (error) {
        const errorRef = reportError(error, "admin.supabase_settings.import_parse_json", {
          file_name: file.name,
          file_size: file.size,
        });
        if (loadingToast) toast.dismiss(loadingToast);
        toast.error(appendErrorReference("File JSON tidak valid atau rusak", errorRef));
      }
    };
    
    reader.onerror = () => {
      const errorRef = reportError(new Error("FileReader readAsText failed"), "admin.supabase_settings.import_read_file", {
        file_name: file.name,
        file_size: file.size,
      });
      if (loadingToast) toast.dismiss(loadingToast);
      toast.error(appendErrorReference("Gagal membaca file", errorRef));
    };
    
    reader.readAsText(file);
  };

  const toggleChecklistItem = (itemId: string) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const getChecklistProgress = () => {
    const totalItems = migrationChecklist.reduce((acc, cat) => acc + cat.items.length, 0);
    const checkedCount = Object.values(checkedItems).filter(Boolean).length;
    return Math.round((checkedCount / totalItems) * 100);
  };

  const content = (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="min-w-max h-auto flex-nowrap gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <TabsTrigger value="info" className="gap-2 whitespace-nowrap">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Informasi</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2 whitespace-nowrap">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Kesehatan</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2 whitespace-nowrap">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Ekspor</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2 whitespace-nowrap">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Impor</span>
          </TabsTrigger>
          <TabsTrigger value="schema" className="gap-2 whitespace-nowrap">
            <FileCode className="h-4 w-4" />
            <span className="hidden sm:inline">Skema</span>
          </TabsTrigger>
          <TabsTrigger value="rls" className="gap-2 whitespace-nowrap">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">RLS</span>
          </TabsTrigger>
          <TabsTrigger value="migrate" className="gap-2 whitespace-nowrap">
            <Plug className="h-4 w-4" />
            <span className="hidden sm:inline">Migrasi</span>
          </TabsTrigger>
          <TabsTrigger value="validate" className="gap-2 whitespace-nowrap">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Validasi</span>
          </TabsTrigger>
          <TabsTrigger value="checklist" className="gap-2 whitespace-nowrap">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">Daftar Periksa</span>
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Informasi Koneksi Database
              </CardTitle>
              <CardDescription>Rincian koneksi ke database saat ini</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Terhubung
                </Badge>
                <Badge variant="outline">Lovable Cloud</Badge>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">ID Proyek</Label>
                  <div className="flex gap-2">
                    <Input value={currentProjectId} readOnly className="font-mono text-sm bg-muted" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(currentProjectId, "ID Proyek")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Supabase URL</Label>
                  <div className="flex gap-2">
                    <Input value={currentUrl} readOnly className="font-mono text-sm bg-muted" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(currentUrl, "URL")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Kunci Anon (Publikasi)</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={showKeys ? currentAnonKey : "••••••••••••••••••••••••"} 
                      readOnly 
                      className="font-mono text-sm bg-muted"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKeys(!showKeys)}>
                      {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(currentAnonKey, "Kunci Anon")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid sm:grid-cols-3 gap-4">
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm">
                      <FolderOpen className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Storage Buckets</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">organization-logos, apk-files, news-images</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">Edge Functions</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">10+ functions deployed</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Key className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Environment</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">VITE_SUPABASE_URL, KUNCI, ID</p>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Quick Stats */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Statistik Database
                  </h4>
                  <Button variant="outline" size="sm" onClick={fetchDatabaseStats} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Muat Ulang
                  </Button>
                </div>

                {dbStats && (
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-8 w-8 text-blue-500" />
                          <div>
                            <p className="text-2xl font-bold">{dbStats.tenants.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">Organisasi</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <Users className="h-8 w-8 text-green-500" />
                          <div>
                            <p className="text-2xl font-bold">{dbStats.employees.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">Pegawai</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <Clock className="h-8 w-8 text-orange-500" />
                          <div>
                            <p className="text-2xl font-bold">{dbStats.attendance.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">Record Absensi</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Monitor Tab */}
        <TabsContent value="health" className="space-y-6">
          <DatabaseHealthMonitor />
        </TabsContent>

        {/* Tab Ekspor/Cadangan */}
        <TabsContent value="backup" className="space-y-6">
          <FullBackupManager />
        </TabsContent>

        {/* Tab Impor */}
        <TabsContent value="import" className="space-y-6">
          <DataImportManager />
        </TabsContent>

        {/* Schema Tab */}
        <TabsContent value="schema" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                Ekspor Skema SQL
              </CardTitle>
              <CardDescription>
                Ekspor struktur database dalam format SQL untuk membuat proyek baru
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button onClick={exportSchemaSql} className="gap-2" size="lg">
                <Download className="h-5 w-5" />
                Unduh Skema SQL
              </Button>

              <Separator />

              <ScrollArea className="h-[400px] w-full rounded-md border bg-muted/50">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                  {generateSchemaSql()}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RLS Policies Tab */}
        <TabsContent value="rls" className="space-y-6">
          <RLSPoliciesExport />
        </TabsContent>

        {/* Migration Tab */}
        <TabsContent value="migrate" className="space-y-6">
          {/* Migration Wizard Button */}
          <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-primary" />
                Migrasi Antar Proyek
              </CardTitle>
              <CardDescription>
                Panduan langkah demi langkah untuk memindahkan database dari satu proyek Supabase ke proyek lainnya
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <MigrationWizard />
                <div className="text-sm text-muted-foreground">
                  <p>Wizard ini akan membantu Anda:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>Test koneksi ke proyek target</li>
                    <li>Migrasi skema dan kebijakan RLS</li>
                    <li>Impor data dengan urutan yang benar</li>
                    <li>Setup storage dan edge functions</li>
                    <li>Verifikasi dan cutover</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <ConnectionTester />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Pratinjau Impor Data
              </CardTitle>
              <CardDescription>
                Upload file JSON backup untuk preview sebelum import manual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Pilih File JSON
                </Button>

                {importFileName && (
                  <p className="text-sm text-muted-foreground">
                    File: <span className="font-medium">{importFileName}</span>
                  </p>
                )}

                {(importData || importSchema || importRls || importMetadata) && (
                  <div className="space-y-4">
                    <Separator />
                    
                    {/* Summary Cards for Full Backup */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Card className="bg-muted/50">
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm">data</p>
                          <p className="text-2xl font-bold">
                            {importData ? Object.values(importData).reduce((acc, val) => acc + (Array.isArray(val) ? val.length : 0), 0).toLocaleString() : 0}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {importData ? `${Object.keys(importData).length} tabel` : 'rekaman'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className={`${importSchema ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted/50'}`}>
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm">skema</p>
                          <p className="text-2xl font-bold">{importSchema ? '✓' : '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {importSchema ? `${(importSchema.length / 1024).toFixed(1)} KB` : 'tidak ada'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className={`${importRls ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted/50'}`}>
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm">rls</p>
                          <p className="text-2xl font-bold">{importRls ? '✓' : '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {importRls ? `${(importRls.length / 1024).toFixed(1)} KB` : 'tidak ada'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className={`${importMetadata ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted/50'}`}>
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm">metadata</p>
                          <p className="text-2xl font-bold">{importMetadata ? '✓' : '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {importMetadata ? new Date(importMetadata.created_at as string).toLocaleDateString('id-ID') : 'tidak ada'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Rincian Tabel */}
                    {importData && Object.keys(importData).length > 0 && (
                      <>
                        <h4 className="font-medium">Rincian Tabel:</h4>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {Object.entries(importData).map(([table, data]) => (
                            <Card key={table} className="bg-muted/50">
                              <CardContent className="pt-4">
                                <p className="font-medium text-sm">{table}</p>
                                <p className="text-2xl font-bold">{Array.isArray(data) ? data.length.toLocaleString() : 0}</p>
                                <p className="text-xs text-muted-foreground">rekaman</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validate Tab */}
        <TabsContent value="validate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Validasi Data
              </CardTitle>
              <CardDescription>
                Cek integritas data sebelum migrasi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button onClick={runDataValidation} disabled={isLoading} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isLoading ? "Memvalidasi..." : "Jalankan Validasi"}
              </Button>

              {validationResults.ran && (
                <div className="space-y-4">
                  {validationResults.issues.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2 text-red-600">
                        <XCircle className="h-4 w-4" />
                        Masalah Ditemukan ({validationResults.issues.length})
                      </h4>
                      <ul className="space-y-1">
                        {validationResults.issues.map((issue, i) => (
                          <li key={i} className="text-sm flex items-start gap-2 text-red-600">
                            <FileWarning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResults.passed.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Validasi Berhasil ({validationResults.passed.length})
                      </h4>
                      <ul className="space-y-1">
                        {validationResults.passed.map((pass, i) => (
                          <li key={i} className="text-sm flex items-start gap-2 text-green-600">
                            <CircleCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            {pass}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!validationResults.ran && (
                <p className="text-sm text-muted-foreground">
                  Klik tombol di atas untuk menjalankan validasi data
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Checklist Tab */}
        <TabsContent value="checklist" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                Daftar Periksa Migrasi
              </CardTitle>
              <CardDescription>
                Panduan langkah demi langkah untuk migrasi database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progres: {getChecklistProgress()}%</span>
                <Badge variant={getChecklistProgress() === 100 ? "default" : "secondary"}>
                  {Object.values(checkedItems).filter(Boolean).length} / {migrationChecklist.reduce((acc, cat) => acc + cat.items.length, 0)} selesai
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all" 
                  style={{ width: `${getChecklistProgress()}%` }}
                />
              </div>

              <ScrollArea className="h-[500px] pr-4">
                <Accordion type="multiple" defaultValue={migrationChecklist.map(c => c.category)} className="space-y-2">
                  {migrationChecklist.map(category => (
                    <AccordionItem key={category.category} value={category.category} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <span className="font-medium">{category.category}</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          {category.items.map(item => (
                            <div key={item.id} className="flex items-start gap-3">
                              <Checkbox
                                id={item.id}
                                checked={checkedItems[item.id] || false}
                                onCheckedChange={() => toggleChecklistItem(item.id)}
                              />
                              <label 
                                htmlFor={item.id} 
                                className={`text-sm cursor-pointer ${checkedItems[item.id] ? 'line-through text-muted-foreground' : ''}`}
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PageGlossarySection preset="admin_supabase_settings" />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <SuperAdminLayout
      title="Pengaturan Supabase"
      subtitle="Kelola koneksi database, backup, migrasi, dan pemantauan"
    >
      {content}
    </SuperAdminLayout>
  );
}
