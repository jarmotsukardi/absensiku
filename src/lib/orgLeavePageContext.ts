export type OrgLeavePageContext = {
  badgeLabel: string | null;
  title: string;
  description: string;
  cardTitle: string;
  searchPlaceholder: string;
  hrCapabilityPath: string | null;
  hrContextLinks: Array<{
    label: string;
    path: string;
  }>;
};

const DEFAULT_CONTEXT: OrgLeavePageContext = {
  badgeLabel: null,
  title: "Permohonan Cuti",
  description: "Kelola data permohonan izin/cuti pegawai",
  cardTitle: "Daftar Permohonan Cuti",
  searchPlaceholder: "Cari permohonan...",
  hrCapabilityPath: null,
  hrContextLinks: [],
};

const HR_LEAVE_APPROVAL_CONTEXT: OrgLeavePageContext = {
  badgeLabel: "HR",
  title: "Alur Persetujuan Cuti",
  description:
    "Proses antrian persetujuan cuti/izin dari perspektif HR dan pastikan keputusan tetap sinkron dengan kuota serta hierarki tenant.",
  cardTitle: "Antrian Persetujuan Cuti",
  searchPlaceholder: "Cari antrian persetujuan...",
  hrCapabilityPath: "/org/hr/leave-approval",
  hrContextLinks: [
    { label: "Buka Kuota Cuti", path: "/org/hr/leave-quota" },
    { label: "Buka Jenis Cuti", path: "/org/hr/leave-types" },
    { label: "Buka Hierarki Persetujuan", path: "/org/hr/approval-hierarchy" },
  ],
};

const HR_ESS_LEAVE_CONTEXT: OrgLeavePageContext = {
  badgeLabel: "ESS",
  title: "Cuti & Izin ESS",
  description:
    "Pantau dan proses permohonan cuti/izin dari kanal self-service pegawai tanpa keluar dari konteks HR tenant.",
  cardTitle: "Daftar Pengajuan Cuti ESS",
  searchPlaceholder: "Cari pengajuan ESS...",
  hrCapabilityPath: "/org/hr/ess/leave-requests",
  hrContextLinks: [
    { label: "Buka Ringkasan ESS", path: "/org/hr/ess/requests" },
    { label: "Buka Kuota Cuti", path: "/org/hr/leave-quota" },
    { label: "Buka Hierarki Persetujuan", path: "/org/hr/approval-hierarchy" },
  ],
};

export function getOrgLeavePageContext(pathname: string): OrgLeavePageContext {
  if (pathname.startsWith("/org/hr/leave-approval")) {
    return HR_LEAVE_APPROVAL_CONTEXT;
  }

  if (pathname.startsWith("/org/hr/ess/leave-requests")) {
    return HR_ESS_LEAVE_CONTEXT;
  }

  return DEFAULT_CONTEXT;
}
