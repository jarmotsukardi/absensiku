export type FaqAudience = "public" | "employee" | "org_admin" | "super_admin";

export const FAQ_AUDIENCE_LABEL: Record<FaqAudience, string> = {
  public: "Untuk Umum (Calon Pelanggan)",
  employee: "Untuk Employee",
  org_admin: "Untuk Admin Organisasi",
  super_admin: "Untuk Superadmin",
};

export const FAQ_AUDIENCE_BADGE_CLASSNAME: Record<FaqAudience, string> = {
  public: "border-blue-200 bg-blue-50 text-blue-700",
  employee: "border-violet-200 bg-violet-50 text-violet-700",
  org_admin: "border-emerald-200 bg-emerald-50 text-emerald-700",
  super_admin: "border-amber-200 bg-amber-50 text-amber-700",
};

const normalizeText = (value?: string | null) => (value || "").trim().toLowerCase();

const containsAny = (source: string, keywords: readonly string[]) =>
  keywords.some((keyword) => source.includes(keyword));

const PUBLIC_CATEGORY_KEYWORDS = [
  "umum",
  "landing",
  "publik",
  "calon pelanggan",
  "chat agent",
  "website",
] as const;

const EMPLOYEE_CATEGORY_KEYWORDS = [
  "employee",
  "pegawai",
  "keamanan pegawai",
  "aplikasi mobile",
  "perangkat",
] as const;

const ORG_ADMIN_CATEGORY_KEYWORDS = [
  "admin organisasi",
  "onboarding org",
  "master data",
  "laporan",
  "notifikasi",
  "jadwal",
  "izin",
  "cuti",
] as const;

const SUPER_ADMIN_CATEGORY_KEYWORDS = [
  "admin super",
  "super admin",
  "devops",
  "operasional",
  "lifecycle tenant",
  "streak",
  "troubleshooting",
  "template tenant",
  "pengaturan sistem",
  "billing & payment",
] as const;

const PUBLIC_CONTENT_KEYWORDS = [
  "calon pelanggan",
  "publik",
  "landing",
  "halaman utama",
  "home area pelanggan",
] as const;

const EMPLOYEE_CONTENT_KEYWORDS = [
  "pegawai",
  "employee",
  "karyawan",
  "absensi",
  "gps",
  "shift",
  "android",
  "dashboard pegawai",
  "/employee/",
] as const;

const ORG_ADMIN_CONTENT_KEYWORDS = [
  "admin organisasi",
  "operator",
  "/org/",
  "setup awal",
  "master data",
  "permohonan",
  "undangan pegawai",
  "org/billing",
] as const;

const SUPER_ADMIN_CONTENT_KEYWORDS = [
  "super admin",
  "superadmin",
  "/admin/",
  "panel admin",
  "manajemen faq",
  "xendit",
  "cron",
  "partisi",
  "tenant",
  "streak",
  "log error",
] as const;

export const isFaqAudience = (value: unknown): value is FaqAudience =>
  value === "public" ||
  value === "employee" ||
  value === "org_admin" ||
  value === "super_admin";

export const inferFaqAudienceFromCategory = (category?: string | null): FaqAudience | null => {
  const normalized = normalizeText(category);
  if (!normalized) return null;

  if (containsAny(normalized, SUPER_ADMIN_CATEGORY_KEYWORDS)) return "super_admin";
  if (containsAny(normalized, EMPLOYEE_CATEGORY_KEYWORDS)) return "employee";
  if (containsAny(normalized, PUBLIC_CATEGORY_KEYWORDS)) return "public";
  if (containsAny(normalized, ORG_ADMIN_CATEGORY_KEYWORDS)) return "org_admin";

  return null;
};

export const inferFaqAudience = (input: {
  category?: string | null;
  question?: string | null;
  answer?: string | null;
}): FaqAudience => {
  const byCategory = inferFaqAudienceFromCategory(input.category);
  if (byCategory) return byCategory;

  const normalizedCombined = normalizeText(
    `${input.category || ""} ${input.question || ""} ${input.answer || ""}`,
  );

  const scores: Record<FaqAudience, number> = {
    public: 0,
    employee: 0,
    org_admin: 0,
    super_admin: 0,
  };

  for (const keyword of PUBLIC_CONTENT_KEYWORDS) {
    if (normalizedCombined.includes(keyword)) scores.public += 1;
  }
  for (const keyword of EMPLOYEE_CONTENT_KEYWORDS) {
    if (normalizedCombined.includes(keyword)) scores.employee += 1;
  }
  for (const keyword of ORG_ADMIN_CONTENT_KEYWORDS) {
    if (normalizedCombined.includes(keyword)) scores.org_admin += 1;
  }
  for (const keyword of SUPER_ADMIN_CONTENT_KEYWORDS) {
    if (normalizedCombined.includes(keyword)) scores.super_admin += 1;
  }

  const sorted = (Object.entries(scores) as Array<[FaqAudience, number]>).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0) return sorted[0][0];

  return "org_admin";
};

export const resolveFaqAudience = (input: {
  audience?: unknown;
  category?: string | null;
  question?: string | null;
  answer?: string | null;
}): FaqAudience => {
  if (isFaqAudience(input.audience)) return input.audience;
  return inferFaqAudience({
    category: input.category,
    question: input.question,
    answer: input.answer,
  });
};

const PUBLIC_VISIBLE_AUDIENCES: ReadonlySet<FaqAudience> = new Set(["public", "employee"]);

export const isFaqVisibleToPublic = (input: {
  audience?: unknown;
  category?: string | null;
  question?: string | null;
  answer?: string | null;
}): boolean => {
  return PUBLIC_VISIBLE_AUDIENCES.has(resolveFaqAudience(input));
};

export const shouldAutoCorrectLegacyAudience = (input: {
  currentAudience?: unknown;
  category?: string | null;
  question?: string | null;
  answer?: string | null;
}): boolean => {
  if (input.currentAudience !== "org_admin") return false;

  const inferredByCategory = inferFaqAudienceFromCategory(input.category);
  if (!inferredByCategory) return false;

  return inferredByCategory !== "org_admin";
};
