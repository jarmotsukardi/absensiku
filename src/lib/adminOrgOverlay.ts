export const ADMIN_ORG_OVERLAY_PARAM = "admin_org_overlay";
export const ADMIN_ORG_EMBED_PARAM = "admin_org_embed";

export const isAdminOrgOverlayTarget = (target: string): boolean => {
  if (!target || typeof target !== "string") return false;
  if (!target.startsWith("/admin/organizations")) return false;
  if (target.startsWith("//")) return false;
  if (/^[a-z]+:/i.test(target)) return false;
  return true;
};

export const getAdminOrgOverlayTarget = (value: string | null): string | null => {
  if (!value) return null;
  return isAdminOrgOverlayTarget(value) ? value : null;
};

export const buildAdminOrgOverlayHref = (
  pathname: string,
  search: string,
  target: string,
): string => {
  if (!pathname.startsWith("/admin") || !isAdminOrgOverlayTarget(target)) {
    return target;
  }

  const [targetPathname, targetSearch = ""] = target.split("?");
  const currentSearchParams = new URLSearchParams(search);
  currentSearchParams.delete(ADMIN_ORG_OVERLAY_PARAM);
  const currentSearch = currentSearchParams.toString();
  const normalizedCurrent = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const normalizedTarget = targetSearch ? `${targetPathname}?${targetSearch}` : targetPathname;

  if (normalizedCurrent === normalizedTarget) {
    return target;
  }

  const nextSearchParams = new URLSearchParams(search);
  nextSearchParams.set(ADMIN_ORG_OVERLAY_PARAM, target);
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
};

export const buildAdminOrgEmbeddedTarget = (target: string): string => {
  if (!isAdminOrgOverlayTarget(target)) return target;

  const [rawPathname, rawSearch = ""] = target.split("?");
  const nextSearchParams = new URLSearchParams(rawSearch);
  nextSearchParams.set(ADMIN_ORG_EMBED_PARAM, "1");
  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${rawPathname}?${nextSearch}` : rawPathname;
};
