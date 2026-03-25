const getWindowOrigin = (): string => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

export const EMPLOYEE_LOGIN_PATH = "/employee/login";
export const EMPLOYEE_DASHBOARD_PATH = "/employee/dashboard";
export const ORG_LOGIN_PATH = "/org/login";
export const WEB_AUTH_LOGIN_PATH = "/auth";
export const PENDING_INVITATION_CODE_STORAGE_KEY = "absensiku_pending_invitation_code";

export const buildEmployeeLoginPath = (inviteCode?: string | null): string => {
  const trimmedInviteCode = inviteCode?.trim();
  if (!trimmedInviteCode) {
    return EMPLOYEE_LOGIN_PATH;
  }

  const params = new URLSearchParams({ invite: trimmedInviteCode });
  return `${EMPLOYEE_LOGIN_PATH}?${params.toString()}`;
};

export const buildEmployeeLoginUrl = (inviteCode?: string | null): string => {
  const origin = getWindowOrigin();
  const path = buildEmployeeLoginPath(inviteCode);
  return origin ? `${origin}${path}` : path;
};

export const buildEmployeeDashboardUrl = (): string => {
  const origin = getWindowOrigin();
  return origin ? `${origin}${EMPLOYEE_DASHBOARD_PATH}` : EMPLOYEE_DASHBOARD_PATH;
};

export const buildOrgRegisterPath = (): string => {
  const params = new URLSearchParams({ mode: "register" });
  return `${ORG_LOGIN_PATH}?${params.toString()}`;
};
