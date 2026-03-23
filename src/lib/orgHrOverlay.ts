export const ORG_HR_OVERLAY_PARAM = "hr_overlay";
export const ORG_HR_EMBED_PARAM = "hr_embed";

export const isOrgHrOverlayTarget = (target: string): boolean => {
  if (!target || typeof target !== "string") return false;
  if (!target.startsWith("/org/")) return false;
  if (target.startsWith("//")) return false;
  if (/^[a-z]+:/i.test(target)) return false;
  return true;
};

export const getOrgHrOverlayTarget = (value: string | null): string | null => {
  if (!value) return null;
  return isOrgHrOverlayTarget(value) ? value : null;
};

export const buildOrgHrOverlayHref = (
  pathname: string,
  search: string,
  target: string,
): string => {
  if (!pathname.startsWith("/org/hr") || !isOrgHrOverlayTarget(target)) {
    return target;
  }

  const [targetPathname, targetSearch = ""] = target.split("?");
  const currentSearchParams = new URLSearchParams(search);
  currentSearchParams.delete(ORG_HR_OVERLAY_PARAM);
  const currentSearch = currentSearchParams.toString();
  const normalizedCurrent = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const normalizedTarget = targetSearch ? `${targetPathname}?${targetSearch}` : targetPathname;

  if (normalizedCurrent === normalizedTarget) {
    return target;
  }

  const nextSearchParams = new URLSearchParams(search);
  nextSearchParams.set(ORG_HR_OVERLAY_PARAM, target);
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
};

export const buildOrgHrEmbeddedTarget = (target: string): string => {
  if (!isOrgHrOverlayTarget(target)) return target;

  const [rawPathname, rawSearch = ""] = target.split("?");
  const nextSearchParams = new URLSearchParams(rawSearch);
  nextSearchParams.set(ORG_HR_EMBED_PARAM, "1");
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${rawPathname}?${nextSearch}` : rawPathname;
};
