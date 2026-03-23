type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const normalizeErrorText = (value: string | null | undefined) => (value || "").toLowerCase();

export const isPayrollRoleAssignmentStorageMissing = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;

  const candidate = error as PostgrestLikeError;
  const code = normalizeErrorText(candidate.code);
  const combinedText = [
    normalizeErrorText(candidate.message),
    normalizeErrorText(candidate.details),
    normalizeErrorText(candidate.hint),
  ].join(" ");

  if (code === "42p01") return true;
  if (code === "pgrst205" && combinedText.includes("payroll_role_assignments")) return true;
  return false;
};
