export type SuperAdminWorkspaceMode = "absensi" | "hr" | "payroll";

const SUPERADMIN_WORKSPACE_STORAGE_KEY = "superadmin_workspace_mode_v1";

export const getStoredSuperAdminWorkspaceMode = (): SuperAdminWorkspaceMode | null => {
  try {
    const value = sessionStorage.getItem(SUPERADMIN_WORKSPACE_STORAGE_KEY);
    if (value === "absensi" || value === "hr" || value === "payroll") {
      return value;
    }
  } catch {
    // Ignore storage failures
  }

  return null;
};

export const setStoredSuperAdminWorkspaceMode = (mode: SuperAdminWorkspaceMode) => {
  try {
    sessionStorage.setItem(SUPERADMIN_WORKSPACE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures
  }
};
