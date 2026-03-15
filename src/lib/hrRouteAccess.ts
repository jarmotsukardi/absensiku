import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { fetchTenantOrgWorkspaceModules } from "@/lib/orgWorkspaceModules";
import { reportError } from "@/lib/errorLogger";

export type HrRouteRole = "super_admin" | "admin_instansi" | "atasan" | "pegawai" | "unknown";
export type HrRouteStatus = "tampil" | "redirect" | "internal" | "tunda";

type HrRoutePolicy = {
  label: string;
  minimumRole: "admin_instansi" | "atasan";
  status: HrRouteStatus;
  redirectTo: string;
};

export type HrRouteAccessResolution = {
  allowed: boolean;
  reason: string | null;
  redirectTo: string | null;
  requiredRole: HrRoutePolicy["minimumRole"];
  role: HrRouteRole;
  status: HrRouteStatus;
  ref: string;
  routePath: string;
  label: string;
};

const HR_HELP_REDIRECT = "/org/hr/help/tickets";
const HR_WORKSPACE_REDIRECT = "/org/hr";

const HR_ROUTE_POLICIES: Record<string, HrRoutePolicy> = {
  "/org/hr": { label: "Ringkasan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/employees": { label: "Data Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/structure": { label: "Struktur Organisasi", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/position-grade": { label: "Jabatan dan Grade", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/contracts": { label: "Kontrak Kerja", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/documents": { label: "Dokumen HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/reports": { label: "Laporan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/settings": { label: "Pengaturan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/help/faq": { label: "FAQ HR", minimumRole: "atasan", status: "tampil", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/help/tickets": { label: "Tiket HR", minimumRole: "atasan", status: "tampil", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/help": { label: "Alias Bantuan HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/help/support": { label: "Alias Bantuan HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/faq": { label: "Alias FAQ HR", minimumRole: "atasan", status: "redirect", redirectTo: "/org/hr/help/faq" },
  "/org/hr/support": { label: "Alias Tiket HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/tickets": { label: "Alias Tiket HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  "/org/hr/help/error-logs": { label: "Log Error HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/attendance-insights": { label: "Analitik Kehadiran HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/attendance-recap": { label: "Alias Laporan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  "/org/hr/leave-recap": { label: "Alias Laporan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  "/org/hr/company": { label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  "/org/hr/departments": { label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  "/org/hr/divisions": { label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  "/org/hr/work-locations": { label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  "/org/hr/work-calendar": { label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  "/org/hr/employee-status": { label: "Status Kepegawaian", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/job-history": { label: "Riwayat Jabatan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/document-templates": { label: "Template Dokumen", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/warning-letters": { label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  "/org/hr/contract-templates": { label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  "/org/hr/digital-signature": { label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  "/org/hr/users": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/roles": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/permissions": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/approval-hierarchy": { label: "Hierarki Persetujuan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/general-settings": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/import-export": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/backup": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/notifications": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/activity-log": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/branding": { label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  "/org/hr/dashboard-notifications": { label: "Alias Ringkasan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr" },
  "/org/hr/dashboard-activity": { label: "Alias Ringkasan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr" },
  "/org/hr/onboarding": { label: "Proses Masuk Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/offboarding": { label: "Proses Keluar Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/work-hours": { label: "Jam Kerja", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/shifts": { label: "Pola Shift", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/national-holidays": { label: "Hari Libur HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  "/org/hr/late-settings": { label: "Pengaturan Keterlambatan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/attendance-integrations": { label: "Integrasi Absensi HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  "/org/hr/leave-types": { label: "Jenis Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/leave-quota": { label: "Kuota Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/leave-approval": { label: "Alur Persetujuan Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/mutation-approval": { label: "Persetujuan Mutasi", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/leave-validity": { label: "Masa Berlaku Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/kpi": { label: "KPI HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/performance-periods": { label: "Periode Penilaian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/performance-forms": { label: "Form Penilaian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/review-360": { label: "Ulasan 360 HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/evaluation-results": { label: "Hasil Evaluasi HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/training-data": { label: "Data Pelatihan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/certifications": { label: "Sertifikasi HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/skill-matrix": { label: "Matriks Keahlian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/recruitment/jobs": { label: "Lowongan ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/recruitment/candidates": { label: "Kandidat ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/recruitment/interviews": { label: "Wawancara ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/recruitment/offers": { label: "Penawaran ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/requests": { label: "ESS Pengajuan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/leave-requests": { label: "ESS Cuti dan Izin", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/wfh-requests": { label: "ESS WFH Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/flexible-attendance": { label: "ESS Absensi Khusus", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/overtime-requests": { label: "ESS Lembur Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/attendance": { label: "ESS Kehadiran", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/documents": { label: "ESS Dokumen", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  "/org/hr/ess/profile": { label: "ESS Profil", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
};

const resolveHrRole = (roles: string[]): HrRouteRole => {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin_instansi")) return "admin_instansi";
  if (roles.includes("atasan")) return "atasan";
  if (roles.includes("pegawai")) return "pegawai";
  return "unknown";
};

const buildHrRef = () => `HR-${Date.now().toString(36).toUpperCase()}`;

const getDefaultPolicy = (routePath: string): HrRoutePolicy => ({
  label: routePath,
  minimumRole: "admin_instansi",
  status: "internal",
  redirectTo: HR_WORKSPACE_REDIRECT,
});

export function getHrRoutePolicy(routePath: string): HrRoutePolicy {
  return HR_ROUTE_POLICIES[routePath] || getDefaultPolicy(routePath);
}

export async function resolveHrRouteAccess(routePath: string): Promise<HrRouteAccessResolution> {
  const ref = buildHrRef();
  const policy = getHrRoutePolicy(routePath);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        allowed: false,
        reason: "Sesi organisasi tidak ditemukan.",
        redirectTo: "/org/login",
        requiredRole: policy.minimumRole,
        role: "unknown",
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
      };
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;

    const appRoles = (roleRows || []).map((row) => row.role);
    const role = resolveHrRole(appRoles);
    if (role === "super_admin") {
      return {
        allowed: true,
        reason: null,
        redirectTo: policy.status === "tampil" ? null : policy.redirectTo,
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
      };
    }

    const tenantId = await resolveOrgTenantId();
    if (!tenantId) {
      return {
        allowed: false,
        reason: "Tenant organisasi tidak ditemukan untuk workspace HR.",
        redirectTo: role === "pegawai" ? "/employee/dashboard" : "/org",
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
      };
    }

    const workspaceModules = await fetchTenantOrgWorkspaceModules(tenantId);
    if (!workspaceModules.modules.hr) {
      return {
        allowed: false,
        reason: "Workspace HR sedang dinonaktifkan untuk organisasi ini.",
        redirectTo: "/org",
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
      };
    }

    const allowed =
      policy.minimumRole === "atasan"
        ? role === "admin_instansi" || role === "atasan"
        : role === "admin_instansi";

    if (allowed) {
      return {
        allowed: true,
        reason: null,
        redirectTo: policy.status === "tampil" ? null : policy.redirectTo,
        requiredRole: policy.minimumRole,
        role,
        status: policy.status,
        ref,
        routePath,
        label: policy.label,
      };
    }

    const reason =
      policy.minimumRole === "atasan"
        ? "Menu HR ini hanya tersedia untuk admin organisasi atau operator HR yang menangani bantuan."
        : "Menu HR ini hanya tersedia untuk admin organisasi.";

    const redirectTo =
      role === "atasan"
        ? HR_HELP_REDIRECT
        : role === "pegawai"
          ? "/employee/dashboard"
          : "/org";

    return {
      allowed: false,
      reason,
      redirectTo,
      requiredRole: policy.minimumRole,
      role,
      status: policy.status,
      ref,
      routePath,
      label: policy.label,
    };
  } catch (error) {
    reportError(error, "hr.route_access.resolve", { route_path: routePath, ref });
    return {
      allowed: false,
      reason: "Gagal memverifikasi akses HR.",
      redirectTo: "/org",
      requiredRole: policy.minimumRole,
      role: "unknown",
      status: policy.status,
      ref,
      routePath,
      label: policy.label,
    };
  }
}
