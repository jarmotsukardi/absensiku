import type { RoleKey } from "./testAccounts";

const READY_ORG_ROLE_PRIORITY: Partial<Record<RoleKey, number>> = {
  org_admin_centralized: 0,
  org_admin: 1,
};

export const prioritizeReadyOrgRoles = (roles: RoleKey[]) => {
  const seen = new Set<RoleKey>();
  return [...roles]
    .filter((role) => {
      if (seen.has(role)) return false;
      seen.add(role);
      return true;
    })
    .sort((left, right) => {
      const leftPriority = READY_ORG_ROLE_PRIORITY[left] ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = READY_ORG_ROLE_PRIORITY[right] ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return roles.indexOf(left) - roles.indexOf(right);
    });
};
