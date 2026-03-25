export type HrWorkspaceRouteStatus = "tampil" | "redirect" | "internal" | "tunda";
export type HrWorkspaceRouteMinimumRole = "admin_instansi" | "atasan";

export type HrSidebarIconKey =
  | "layout_dashboard"
  | "building2"
  | "users"
  | "settings"
  | "file_text"
  | "calendar"
  | "map_pin"
  | "log_out"
  | "help_circle"
  | "briefcase"
  | "clock"
  | "user_check"
  | "clipboard_list"
  | "alert_triangle"
  | "file_spreadsheet"
  | "folder_tree"
  | "timer"
  | "activity"
  | "ticket"
  | "graduation_cap"
  | "award"
  | "brain_circuit"
  | "home"
  | "list_checks";

export type HrWorkspaceRouteDefinition = {
  path: string;
  label: string;
  minimumRole: HrWorkspaceRouteMinimumRole;
  status: HrWorkspaceRouteStatus;
  redirectTo: string;
};

export type HrSidebarItemDefinition = {
  path: string;
  iconKey: HrSidebarIconKey;
  title?: string;
  badgeLabel?: string;
};

export type HrSidebarGroupDefinition = {
  label: string;
  items: HrSidebarItemDefinition[];
};

export type HrSidebarSectionDefinition = {
  title: string;
  iconKey: HrSidebarIconKey;
  items: HrSidebarItemDefinition[];
};

export const HR_WORKSPACE_REDIRECT = "/org/hr";
export const HR_HELP_REDIRECT = "/org/hr/help/tickets";

export const HR_WORKSPACE_ROUTE_DEFINITIONS: HrWorkspaceRouteDefinition[] = [
  { path: "/org/hr", label: "Ringkasan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/employees", label: "Data Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/structure", label: "Struktur Organisasi", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/position-grade", label: "Jabatan dan Grade", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/contracts", label: "Kontrak Kerja", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/documents", label: "Dokumen HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/reports", label: "Laporan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/settings", label: "Pengaturan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/priority", label: "Workspace Prioritas HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/priority-workspace", label: "Alias Workspace Prioritas HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/priority" },
  { path: "/org/hr/help/faq", label: "FAQ HR", minimumRole: "atasan", status: "tampil", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/help/tickets", label: "Tiket HR", minimumRole: "atasan", status: "tampil", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/help", label: "Alias Bantuan HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/help/support", label: "Alias Bantuan HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/faq", label: "Alias FAQ HR", minimumRole: "atasan", status: "redirect", redirectTo: "/org/hr/help/faq" },
  { path: "/org/hr/support", label: "Alias Tiket HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/tickets", label: "Alias Tiket HR", minimumRole: "atasan", status: "redirect", redirectTo: HR_HELP_REDIRECT },
  { path: "/org/hr/help/error-logs", label: "Log Error HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/attendance-insights", label: "Analitik Kehadiran HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/attendance-recap", label: "Alias Laporan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  { path: "/org/hr/leave-recap", label: "Alias Laporan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  { path: "/org/hr/company", label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  { path: "/org/hr/departments", label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  { path: "/org/hr/divisions", label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  { path: "/org/hr/work-locations", label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  { path: "/org/hr/work-calendar", label: "Alias Struktur Organisasi", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/structure" },
  { path: "/org/hr/employee-status", label: "Status Kepegawaian", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/job-history", label: "Riwayat Jabatan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/document-templates", label: "Templat Dokumen", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/warning-letters", label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  { path: "/org/hr/contract-templates", label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  { path: "/org/hr/digital-signature", label: "Alias Dokumen HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/documents" },
  { path: "/org/hr/users", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/roles", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/permissions", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/approval-hierarchy", label: "Hierarki Persetujuan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/general-settings", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/import-export", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/backup", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/notifications", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/activity-log", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/branding", label: "Alias Pengaturan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/settings" },
  { path: "/org/hr/dashboard-notifications", label: "Alias Ringkasan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr" },
  { path: "/org/hr/dashboard-activity", label: "Alias Ringkasan HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr" },
  { path: "/org/hr/onboarding", label: "Proses Masuk Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/offboarding", label: "Proses Keluar Pegawai", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/work-hours", label: "Jam Kerja", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/shifts", label: "Pola Shift", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/national-holidays", label: "Hari Libur HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  { path: "/org/hr/late-settings", label: "Pengaturan Keterlambatan", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/attendance-integrations", label: "Integrasi Absensi HR", minimumRole: "admin_instansi", status: "redirect", redirectTo: "/org/hr/reports" },
  { path: "/org/hr/leave-types", label: "Jenis Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/leave-quota", label: "Kuota Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/leave-approval", label: "Alur Persetujuan Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/mutation-approval", label: "Persetujuan Mutasi", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/leave-validity", label: "Masa Berlaku Cuti", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/kpi", label: "KPI HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/performance-periods", label: "Periode Penilaian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/performance-forms", label: "Form Penilaian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/review-360", label: "Ulasan 360 HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/evaluation-results", label: "Hasil Evaluasi HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/training-data", label: "Data Pelatihan HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/certifications", label: "Sertifikasi HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/skill-matrix", label: "Matriks Keahlian HR", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/recruitment/jobs", label: "Lowongan ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/recruitment/candidates", label: "Kandidat ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/recruitment/interviews", label: "Wawancara ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/recruitment/offers", label: "Penawaran ATS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/requests", label: "Pengajuan ESS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/leave-requests", label: "Cuti & Izin ESS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/wfh-requests", label: "Pengajuan WFH", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/flexible-attendance", label: "Absensi Khusus", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/overtime-requests", label: "Pengajuan Lembur", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/attendance", label: "Kehadiran ESS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/documents", label: "Dokumen ESS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
  { path: "/org/hr/ess/profile", label: "Profil ESS", minimumRole: "admin_instansi", status: "tampil", redirectTo: HR_WORKSPACE_REDIRECT },
];

const HR_WORKSPACE_ROUTE_DEFINITION_MAP = new Map(
  HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => [route.path, route]),
);

export const HR_OVERVIEW_SIDEBAR_SECTIONS: HrSidebarSectionDefinition[] = [
  {
    title: "Masuk Area Kerja HR",
    iconKey: "layout_dashboard",
    items: [{ path: "/org/hr", title: "Buka Area Kerja HR", iconKey: "layout_dashboard" }],
  },
  {
    title: "Fondasi HR",
    iconKey: "building2",
    items: [
      { path: "/org/hr/employees", iconKey: "users" },
      { path: "/org/hr/employee-status", iconKey: "user_check" },
      { path: "/org/hr/job-history", iconKey: "briefcase" },
      { path: "/org/hr/structure", iconKey: "building2" },
      { path: "/org/hr/position-grade", iconKey: "briefcase" },
      { path: "/org/hr/contracts", iconKey: "file_text" },
      { path: "/org/hr/documents", iconKey: "file_text" },
      { path: "/org/hr/document-templates", title: "Templat Dokumen", iconKey: "file_text" },
    ],
  },
  {
    title: "Layanan dan Pemantauan HR",
    iconKey: "activity",
    items: [
      { path: "/org/hr/onboarding", iconKey: "user_check" },
      { path: "/org/hr/offboarding", iconKey: "log_out" },
      { path: "/org/hr/late-settings", iconKey: "alert_triangle" },
      { path: "/org/hr/leave-types", iconKey: "clipboard_list" },
      { path: "/org/hr/leave-quota", iconKey: "list_checks" },
      { path: "/org/hr/reports", iconKey: "file_spreadsheet" },
      { path: "/org/hr/attendance-insights", iconKey: "activity" },
      { path: "/org/hr/help/error-logs", iconKey: "clipboard_list" },
    ],
  },
  {
    title: "Dukungan HR",
    iconKey: "help_circle",
    items: [
      { path: "/org/hr/help/faq", iconKey: "help_circle" },
      { path: "/org/hr/help/tickets", iconKey: "ticket" },
    ],
  },
  {
    title: "Konfigurasi HR",
    iconKey: "settings",
    items: [
      { path: "/org/hr/settings", iconKey: "settings" },
      { path: "/org/hr/approval-hierarchy", iconKey: "user_check" },
    ],
  },
];

export const HR_FOCUSED_SIDEBAR_GROUPS: HrSidebarGroupDefinition[] = [
  {
    label: "Beranda",
    items: [{ path: "/org/hr", iconKey: "layout_dashboard" }],
  },
  {
    label: "Organisasi",
    items: [
      { path: "/org/hr/structure", iconKey: "building2" },
      { path: "/org/hr/position-grade", iconKey: "briefcase" },
    ],
  },
  {
    label: "Pegawai",
    items: [
      { path: "/org/hr/employees", iconKey: "users" },
      { path: "/org/hr/employee-status", iconKey: "user_check" },
      { path: "/org/hr/job-history", iconKey: "briefcase" },
      { path: "/org/hr/mutation-approval", iconKey: "folder_tree" },
      { path: "/org/hr/contracts", iconKey: "file_text" },
    ],
  },
  {
    label: "Administrasi HR",
    items: [
      { path: "/org/hr/documents", iconKey: "file_text" },
      { path: "/org/hr/document-templates", title: "Templat Dokumen", iconKey: "file_text" },
      { path: "/org/hr/leave-types", iconKey: "clipboard_list" },
      { path: "/org/hr/leave-quota", iconKey: "list_checks" },
      { path: "/org/hr/settings", iconKey: "settings" },
      { path: "/org/hr/approval-hierarchy", iconKey: "user_check" },
    ],
  },
  {
    label: "Operasional",
    items: [
      { path: "/org/hr/onboarding", iconKey: "user_check" },
      { path: "/org/hr/offboarding", iconKey: "log_out" },
      { path: "/org/hr/late-settings", iconKey: "alert_triangle" },
      { path: "/org/hr/reports", iconKey: "file_spreadsheet" },
      { path: "/org/hr/attendance-insights", iconKey: "activity" },
    ],
  },
  {
    label: "Kinerja",
    items: [
      { path: "/org/hr/kpi", title: "KPI", iconKey: "activity" },
      { path: "/org/hr/performance-periods", title: "Periode Penilaian", iconKey: "calendar" },
      { path: "/org/hr/performance-forms", title: "Form Penilaian", iconKey: "clipboard_list" },
      { path: "/org/hr/review-360", title: "Ulasan 360", iconKey: "users" },
      { path: "/org/hr/evaluation-results", title: "Hasil Evaluasi", iconKey: "file_spreadsheet" },
    ],
  },
  {
    label: "Pengembangan",
    items: [
      { path: "/org/hr/training-data", iconKey: "graduation_cap" },
      { path: "/org/hr/certifications", iconKey: "award" },
      { path: "/org/hr/skill-matrix", title: "Matriks Kompetensi", iconKey: "brain_circuit" },
    ],
  },
  {
    label: "Rekrutmen",
    items: [
      { path: "/org/hr/recruitment/jobs", title: "Lowongan Kerja", iconKey: "briefcase" },
      { path: "/org/hr/recruitment/candidates", title: "Kandidat", iconKey: "users" },
      { path: "/org/hr/recruitment/interviews", title: "Tahap Interview", iconKey: "clipboard_list" },
      { path: "/org/hr/recruitment/offers", title: "Penawaran Kerja", iconKey: "file_text" },
    ],
  },
  {
    label: "ESS",
    items: [
      { path: "/org/hr/ess/requests", title: "Pengajuan ESS", iconKey: "clipboard_list" },
      { path: "/org/hr/ess/leave-requests", title: "Cuti & Izin ESS", iconKey: "file_text" },
      { path: "/org/hr/ess/wfh-requests", title: "Pengajuan WFH", iconKey: "home" },
      { path: "/org/hr/ess/flexible-attendance", title: "Absensi Khusus", iconKey: "map_pin" },
      { path: "/org/hr/ess/overtime-requests", title: "Pengajuan Lembur", iconKey: "timer" },
      { path: "/org/hr/ess/attendance", title: "Kehadiran ESS", iconKey: "activity" },
      { path: "/org/hr/ess/documents", title: "Dokumen ESS", iconKey: "file_text" },
      { path: "/org/hr/ess/profile", title: "Profil ESS", iconKey: "user_check" },
    ],
  },
  {
    label: "Bantuan",
    items: [
      { path: "/org/hr/help/faq", iconKey: "help_circle" },
      { path: "/org/hr/help/tickets", iconKey: "ticket" },
      { path: "/org/hr/help/error-logs", iconKey: "clipboard_list" },
    ],
  },
];

export function getHrWorkspaceRouteDefinition(routePath: string): HrWorkspaceRouteDefinition | undefined {
  return HR_WORKSPACE_ROUTE_DEFINITION_MAP.get(routePath);
}
