import { supabase } from "@/integrations/supabase/client";
import { fetchTenantHrPayrollAccessState, getWorkspaceLockedReason } from "@/lib/hrPayrollAccessPolicy";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { fetchTenantOrgWorkspaceModules } from "@/lib/orgWorkspaceModules";
import { reportError } from "@/lib/errorLogger";

export type HrPageRole = "super_admin" | "admin_instansi" | "atasan" | "pegawai" | "unknown";
export type HrPageAction = "view" | "create" | "edit" | "delete" | "export" | "configure" | "approve";

type HrPagePolicy = {
  label: string;
  capabilities: Record<HrPageAction, HrPageRole[]>;
  redirectTo: string;
};

export type HrPageAccessResolution = {
  allowed: boolean;
  role: HrPageRole;
  ref: string;
  reason: string | null;
  redirectTo: string | null;
  pagePath: string;
  label: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  canConfigure: boolean;
  canApprove: boolean;
};

const ALL_ADMIN_ROLES: HrPageRole[] = ["super_admin", "admin_instansi"];

const buildActionMap = (overrides?: Partial<Record<HrPageAction, HrPageRole[]>>): Record<HrPageAction, HrPageRole[]> => ({
  view: ALL_ADMIN_ROLES,
  create: ALL_ADMIN_ROLES,
  edit: ALL_ADMIN_ROLES,
  delete: ALL_ADMIN_ROLES,
  export: ALL_ADMIN_ROLES,
  configure: ALL_ADMIN_ROLES,
  approve: ALL_ADMIN_ROLES,
  ...overrides,
});

const PAGE_POLICIES: Record<string, HrPagePolicy> = {
  "/org/hr/employees": {
    label: "Data Pegawai",
    capabilities: buildActionMap({
      create: ["super_admin", "admin_instansi"],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/employee-status": {
    label: "Status Kepegawaian",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/structure": {
    label: "Struktur Organisasi",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: [],
      configure: ["super_admin", "admin_instansi"],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/position-grade": {
    label: "Jabatan dan Grade",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: [],
      configure: ["super_admin", "admin_instansi"],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/reports": {
    label: "Laporan HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/contracts": {
    label: "Kontrak Kerja",
    capabilities: buildActionMap({ configure: [] }),
    redirectTo: "/org/hr",
  },
  "/org/hr/documents": {
    label: "Dokumen HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      configure: ["super_admin", "admin_instansi"],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/settings": {
    label: "Pengaturan HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/priority": {
    label: "Workspace Prioritas HR",
    capabilities: buildActionMap({
      create: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/document-templates": {
    label: "Template Dokumen HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/help/tickets": {
    label: "Tiket HR",
    capabilities: buildActionMap({
      view: ["super_admin", "admin_instansi", "atasan"],
      create: ["super_admin", "admin_instansi"],
      edit: ["super_admin", "admin_instansi", "atasan"],
      delete: [],
      export: [],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr/help/tickets",
  },
  "/org/hr/attendance-insights": {
    label: "Analitik Kehadiran HR",
    capabilities: buildActionMap({
      create: [],
      delete: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/help/error-logs": {
    label: "Log Error HR",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/onboarding": {
    label: "Proses Masuk Pegawai HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/offboarding": {
    label: "Proses Keluar Pegawai HR",
    capabilities: buildActionMap({
      create: ["super_admin", "admin_instansi"],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/work-hours": {
    label: "Jam Kerja HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/shifts": {
    label: "Pola Shift HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/late-settings": {
    label: "Pengaturan Keterlambatan HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/leave-types": {
    label: "Jenis Cuti HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/leave-quota": {
    label: "Kuota Cuti HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/leave-approval": {
    label: "Approval Cuti HR",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/mutation-approval": {
    label: "Persetujuan Mutasi HR",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/leave-validity": {
    label: "Masa Berlaku Cuti HR",
    capabilities: buildActionMap({
      create: [],
      delete: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/kpi": {
    label: "KPI HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/performance-periods": {
    label: "Periode Penilaian HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/performance-forms": {
    label: "Form Penilaian HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/review-360": {
    label: "Ulasan 360 HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/evaluation-results": {
    label: "Hasil Evaluasi HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/training-data": {
    label: "Data Pelatihan HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/certifications": {
    label: "Sertifikasi HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/skill-matrix": {
    label: "Matriks Keahlian HR",
    capabilities: buildActionMap(),
    redirectTo: "/org/hr",
  },
  "/org/hr/recruitment/jobs": {
    label: "Lowongan ATS HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/recruitment/candidates": {
    label: "ATS Kandidat HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/recruitment/interviews": {
    label: "ATS Interview HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/recruitment/offers": {
    label: "ATS Offer HR",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/requests": {
    label: "Pengajuan ESS",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/leave-requests": {
    label: "Cuti & Izin ESS",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/wfh-requests": {
    label: "Pengajuan WFH",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/flexible-attendance": {
    label: "Absensi Khusus",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/overtime-requests": {
    label: "Pengajuan Lembur",
    capabilities: buildActionMap({
      create: [],
      edit: ["super_admin", "admin_instansi"],
      delete: [],
      export: ["super_admin", "admin_instansi"],
      configure: ["super_admin", "admin_instansi"],
      approve: ["super_admin", "admin_instansi"],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/attendance": {
    label: "Kehadiran ESS",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/documents": {
    label: "Dokumen ESS",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
  "/org/hr/ess/profile": {
    label: "Profil ESS",
    capabilities: buildActionMap({
      create: [],
      edit: [],
      delete: [],
      export: [],
      configure: [],
      approve: [],
    }),
    redirectTo: "/org/hr",
  },
};

const DEFAULT_POLICY: HrPagePolicy = {
  label: "Halaman HR",
  capabilities: buildActionMap({
    create: [],
    edit: [],
    delete: [],
    configure: [],
    approve: [],
  }),
  redirectTo: "/org/hr",
};

const buildRef = () => `HR-ACT-${Date.now().toString(36).toUpperCase()}`;

const resolveRole = (roles: string[]): HrPageRole => {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin_instansi")) return "admin_instansi";
  if (roles.includes("atasan")) return "atasan";
  if (roles.includes("pegawai")) return "pegawai";
  return "unknown";
};

const isRoleAllowed = (allowedRoles: HrPageRole[], role: HrPageRole) => allowedRoles.includes(role);

const buildReadonlyResolution = ({
  canView,
  role,
  ref,
  pagePath,
  label,
}: {
  canView: boolean;
  role: HrPageRole;
  ref: string;
  pagePath: string;
  label: string;
}): HrPageAccessResolution => ({
  allowed: canView,
  role,
  ref,
  reason: canView ? null : "HR pada organisasi ini masih dalam mode lihat saja.",
  redirectTo: canView ? null : "/org/hr",
  pagePath,
  label,
  canView,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canExport: false,
  canConfigure: false,
  canApprove: false,
});

export function getHrPagePolicy(pagePath: string): HrPagePolicy {
  return PAGE_POLICIES[pagePath] || DEFAULT_POLICY;
}

export async function resolveHrPageAccess(pagePath: string): Promise<HrPageAccessResolution> {
  const ref = buildRef();
  const policy = getHrPagePolicy(pagePath);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        allowed: false,
        role: "unknown",
        ref,
        reason: "Sesi organisasi tidak ditemukan.",
        redirectTo: "/org/login",
        pagePath,
        label: policy.label,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canExport: false,
        canConfigure: false,
        canApprove: false,
      };
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;

    const appRoles = (roleRows || []).map((row) => row.role);
    const role = resolveRole(appRoles);
    const tenantId = await resolveOrgTenantId();
    if (!tenantId && role !== "super_admin") {
      return {
        allowed: false,
        role,
        ref,
        reason: "Tenant organisasi tidak ditemukan untuk halaman HR.",
        redirectTo: role === "pegawai" ? "/employee/dashboard" : "/org",
        pagePath,
        label: policy.label,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canExport: false,
        canConfigure: false,
        canApprove: false,
      };
    }

    if (tenantId) {
      const workspaceModules = await fetchTenantOrgWorkspaceModules(tenantId);
      if (!workspaceModules.modules.hr) {
        return {
          allowed: false,
          role,
          ref,
          reason: "Workspace HR sedang dinonaktifkan untuk organisasi ini.",
          redirectTo: "/org",
          pagePath,
          label: policy.label,
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canExport: false,
          canConfigure: false,
          canApprove: false,
        };
      }

      const accessState = await fetchTenantHrPayrollAccessState(tenantId);
      const canViewReadonly = isRoleAllowed(policy.capabilities.view, role);
      if (accessState.hrMode === "locked") {
        return {
          allowed: false,
          role,
          ref,
          reason: getWorkspaceLockedReason("hr", accessState.readiness),
          redirectTo: "/org/hr",
          pagePath,
          label: policy.label,
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canExport: false,
          canConfigure: false,
          canApprove: false,
        };
      }

      if (accessState.hrMode === "readonly") {
        return buildReadonlyResolution({
          canView: canViewReadonly,
          role,
          ref,
          pagePath,
          label: policy.label,
        });
      }
    }

    const canView = isRoleAllowed(policy.capabilities.view, role);
    return {
      allowed: canView,
      role,
      ref,
      reason: canView ? null : "Akses aksi halaman HR tidak memenuhi syarat.",
      redirectTo: canView ? null : policy.redirectTo,
      pagePath,
      label: policy.label,
      canView,
      canCreate: isRoleAllowed(policy.capabilities.create, role),
      canEdit: isRoleAllowed(policy.capabilities.edit, role),
      canDelete: isRoleAllowed(policy.capabilities.delete, role),
      canExport: isRoleAllowed(policy.capabilities.export, role),
      canConfigure: isRoleAllowed(policy.capabilities.configure, role),
      canApprove: isRoleAllowed(policy.capabilities.approve, role),
    };
  } catch (error) {
    reportError(error, "hr.page_access.resolve", { page_path: pagePath, ref });
    return {
      allowed: false,
      role: "unknown",
      ref,
      reason: "Gagal memverifikasi capability halaman HR.",
      redirectTo: "/org",
      pagePath,
      label: policy.label,
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canExport: false,
      canConfigure: false,
      canApprove: false,
    };
  }
}
