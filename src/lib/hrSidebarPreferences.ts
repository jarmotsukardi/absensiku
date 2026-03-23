const HR_SIDEBAR_GROUPS_STORAGE_KEY_PREFIX = "absensiku:org_hr_sidebar_groups_v1";

export const buildHrSidebarGroupsStorageKey = ({
  tenantId,
  userId,
  accessLevel,
}: {
  tenantId?: string | null;
  userId?: string | null;
  accessLevel: string;
}) =>
  [
    HR_SIDEBAR_GROUPS_STORAGE_KEY_PREFIX,
    tenantId || "tenant-default",
    userId || "user-default",
    accessLevel,
  ].join(":");

export const readHrSidebarGroupsState = (storageKey: string): Record<string, boolean> => {
  if (typeof window === "undefined" || !storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
};

export const writeHrSidebarGroupsState = (storageKey: string, nextState: Record<string, boolean>) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
  } catch {
    // Ignore storage failures.
  }
};

export const clearHrSidebarGroupsState = (storageKey: string) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
};
