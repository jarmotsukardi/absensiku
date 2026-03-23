export const ORG_PAYROLL_OVERLAY_PARAM = "payroll_overlay";
export const ORG_PAYROLL_EMBED_PARAM = "payroll_embed";

export const isOrgPayrollOverlayTarget = (target: string): boolean => {
  if (!target || typeof target !== "string") return false;
  if (!target.startsWith("/org/")) return false;
  if (target.startsWith("//")) return false;
  if (/^[a-z]+:/i.test(target)) return false;
  return true;
};

export const getOrgPayrollOverlayTarget = (value: string | null): string | null => {
  if (!value) return null;
  return isOrgPayrollOverlayTarget(value) ? value : null;
};

export const buildOrgPayrollOverlayHref = (
  pathname: string,
  search: string,
  target: string,
): string => {
  if (!pathname.startsWith("/org/payroll") || !isOrgPayrollOverlayTarget(target)) {
    return target;
  }

  const [targetPathname, targetSearch = ""] = target.split("?");
  const currentSearchParams = new URLSearchParams(search);
  currentSearchParams.delete(ORG_PAYROLL_OVERLAY_PARAM);
  const currentSearch = currentSearchParams.toString();
  const normalizedCurrent = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const normalizedTarget = targetSearch ? `${targetPathname}?${targetSearch}` : targetPathname;

  if (normalizedCurrent === normalizedTarget) {
    return target;
  }

  const nextSearchParams = new URLSearchParams(search);
  nextSearchParams.set(ORG_PAYROLL_OVERLAY_PARAM, target);
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
};

export const buildOrgPayrollEmbeddedTarget = (target: string): string => {
  if (!isOrgPayrollOverlayTarget(target)) return target;

  const [rawPathname, rawSearch = ""] = target.split("?");
  const nextSearchParams = new URLSearchParams(rawSearch);
  nextSearchParams.set(ORG_PAYROLL_EMBED_PARAM, "1");
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${rawPathname}?${nextSearch}` : rawPathname;
};
