import type { OrgOnboardingCounts } from "@/lib/orgOnboardingTemplates";

export interface OrgProfileSnapshot {
  pic_name?: string | null;
  pic_whatsapp?: string | null;
  address?: string | null;
}

export const ORG_ONBOARDING_REQUIRED_STEPS: Array<{
  key: keyof OrgOnboardingCounts;
  label: string;
  path: string;
  description: string;
}> = [
  {
    key: "opd",
    label: "Data OPD",
    path: "/org/master/opd",
    description: "Tetapkan struktur induk organisasi agar unit kerja lain punya acuan.",
  },
  {
    key: "work_units",
    label: "Satuan Kerja",
    path: "/org/master/work-units",
    description: "Susun unit kerja yang benar-benar dipakai operasional harian.",
  },
  {
    key: "offices",
    label: "Lokasi Kerja",
    path: "/org/master/work-locations",
    description: "Pastikan titik kantor utama atau area absensi sudah sesuai.",
  },
  {
    key: "work_hours",
    label: "Jam Kerja",
    path: "/org/schedule/work-hours",
    description: "Buat minimal satu pola jam kerja untuk dipakai pegawai.",
  },
  {
    key: "absence_limits",
    label: "Batas Absen",
    path: "/org/schedule/absence-limits",
    description: "Tetapkan toleransi dan aturan dasar agar absensi bisa jalan konsisten.",
  },
];

export const getOrgOnboardingModuleTotal = () => ORG_ONBOARDING_REQUIRED_STEPS.length;

export const getOrgOnboardingReadyModules = (counts: OrgOnboardingCounts) =>
  ORG_ONBOARDING_REQUIRED_STEPS.filter((step) => counts[step.key] > 0).length;

export const isOrgOnboardingComplete = (counts: OrgOnboardingCounts) =>
  getOrgOnboardingReadyModules(counts) === getOrgOnboardingModuleTotal();

export const isOrgProfileComplete = (profile: OrgProfileSnapshot | null | undefined) =>
  Boolean(
    profile?.pic_name?.trim() &&
      profile?.pic_whatsapp?.trim() &&
      profile?.address?.trim(),
  );

export const isOrgOnboardingAllowedPathDuringFirstRun = (pathname: string) => {
  if (pathname === "/org/onboarding") return true;
  return ORG_ONBOARDING_REQUIRED_STEPS.some((step) => pathname === step.path);
};

export const resolveOrgFirstRunRedirect = (args: {
  pathname: string;
  accessLevel: "admin" | "operator";
  profileComplete: boolean;
  onboardingComplete: boolean | null;
}) => {
  if (args.accessLevel !== "admin") return null;

  if (!args.profileComplete) {
    return args.pathname === "/org/profile/setup" ? null : "/org/profile/setup";
  }

  if (args.onboardingComplete === false && !isOrgOnboardingAllowedPathDuringFirstRun(args.pathname)) {
    return "/org/onboarding";
  }

  return null;
};
