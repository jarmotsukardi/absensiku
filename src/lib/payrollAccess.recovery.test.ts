import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  getUserMock,
  roleEqMock,
  roleSelectMock,
  assignmentActiveEqMock,
  assignmentUserEqMock,
  assignmentTenantEqMock,
  assignmentSelectMock,
  fromMock,
  resolveOrgTenantIdMock,
  fetchTenantOrgWorkspaceModulesMock,
  fetchTenantHrPayrollAccessStateMock,
  fetchTenantPayrollAccessModeMock,
  isPayrollRoleAssignmentStorageMissingMock,
  reportErrorMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const roleEqMock = vi.fn();
  const roleSelectMock = vi.fn(() => ({ eq: roleEqMock }));
  const assignmentActiveEqMock = vi.fn();
  const assignmentUserEqMock = vi.fn(() => ({ eq: assignmentActiveEqMock }));
  const assignmentTenantEqMock = vi.fn(() => ({ eq: assignmentUserEqMock }));
  const assignmentSelectMock = vi.fn(() => ({ eq: assignmentTenantEqMock }));
  const fromMock = vi.fn((table: string) => {
    if (table === "user_roles") {
      return { select: roleSelectMock };
    }
    if (table === "payroll_role_assignments") {
      return { select: assignmentSelectMock };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    getUserMock,
    roleEqMock,
    roleSelectMock,
    assignmentActiveEqMock,
    assignmentUserEqMock,
    assignmentTenantEqMock,
    assignmentSelectMock,
    fromMock,
    resolveOrgTenantIdMock: vi.fn(),
    fetchTenantOrgWorkspaceModulesMock: vi.fn(),
    fetchTenantHrPayrollAccessStateMock: vi.fn(),
    fetchTenantPayrollAccessModeMock: vi.fn(),
    isPayrollRoleAssignmentStorageMissingMock: vi.fn(() => false),
    reportErrorMock: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}));

vi.mock("@/lib/orgTenantContext", () => ({
  resolveOrgTenantId: resolveOrgTenantIdMock,
}));

vi.mock("@/lib/orgWorkspaceModules", () => ({
  fetchTenantOrgWorkspaceModules: fetchTenantOrgWorkspaceModulesMock,
}));

vi.mock("@/lib/hrPayrollAccessPolicy", () => ({
  fetchTenantHrPayrollAccessState: fetchTenantHrPayrollAccessStateMock,
  getWorkspaceLockedReason: vi.fn(() => "HR dikunci sampai readiness absensi terpenuhi."),
}));

vi.mock("@/lib/payrollAccessMode", () => ({
  fetchTenantPayrollAccessMode: fetchTenantPayrollAccessModeMock,
}));

vi.mock("@/lib/payrollAssignmentStorage", () => ({
  isPayrollRoleAssignmentStorageMissing: isPayrollRoleAssignmentStorageMissingMock,
}));

vi.mock("@/lib/errorLogger", () => ({
  reportError: reportErrorMock,
}));

import { resolvePayrollRouteAccess } from "@/lib/payrollAccess";

describe("payrollAccess recovery gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    roleEqMock.mockResolvedValue({ data: [{ role: "admin_instansi" }], error: null });
    assignmentActiveEqMock.mockResolvedValue({ data: [], error: null });
    resolveOrgTenantIdMock.mockResolvedValue("tenant-1");
    fetchTenantOrgWorkspaceModulesMock.mockResolvedValue({ modules: { payroll: true } });
    fetchTenantHrPayrollAccessStateMock.mockRejectedValue(
      Object.assign(new Error("forced employees failure"), {
        code: "E2E_FORCED_FAILURE",
      }),
    );
    fetchTenantPayrollAccessModeMock.mockResolvedValue("strict");
    isPayrollRoleAssignmentStorageMissingMock.mockReturnValue(false);
  });

  test("tetap membuka recovery gate roles saat readiness employees gagal", async () => {
    const access = await resolvePayrollRouteAccess("payroll.roles.manage");

    expect(access.allowed).toBe(true);
    expect(access.redirectTo).toBeNull();
    expect(access.reason).toBeNull();
  });

  test("tetap membuka recovery gate integrations saat readiness employees gagal", async () => {
    const access = await resolvePayrollRouteAccess("payroll.integration.manage");

    expect(access.allowed).toBe(true);
    expect(access.redirectTo).toBeNull();
    expect(access.reason).toBeNull();
  });

  test("tidak self-redirect saat home payroll ditolak di strict mode tanpa assignment", async () => {
    fetchTenantHrPayrollAccessStateMock.mockResolvedValue({
      stage: "paid_active",
      subscriptionStatus: "active",
      accessSetting: {
        paymentCommitted: true,
        committedAt: "2026-03-26T00:00:00.000Z",
        note: null,
      },
      readiness: {
        onboardingReady: true,
        activeAdminReady: true,
        employeesReady: true,
        attendanceReady: true,
        onboardingCounts: {} as never,
        adminCount: 1,
        employeeCount: 5,
        attendanceCount: 10,
      },
      hrMode: "full",
      payrollMode: "full",
    });
    fetchTenantPayrollAccessModeMock.mockResolvedValue("strict");

    const access = await resolvePayrollRouteAccess("payroll.workspace.view");

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).toBeNull();
    expect(access.reason).toBe("Tidak punya izin payroll.workspace.view");
  });

  test("tetap redirect ke home payroll untuk route payroll lain yang ditolak", async () => {
    fetchTenantHrPayrollAccessStateMock.mockResolvedValue({
      stage: "paid_active",
      subscriptionStatus: "active",
      accessSetting: {
        paymentCommitted: true,
        committedAt: "2026-03-26T00:00:00.000Z",
        note: null,
      },
      readiness: {
        onboardingReady: true,
        activeAdminReady: true,
        employeesReady: true,
        attendanceReady: true,
        onboardingCounts: {} as never,
        adminCount: 1,
        employeeCount: 5,
        attendanceCount: 10,
      },
      hrMode: "full",
      payrollMode: "full",
    });
    fetchTenantPayrollAccessModeMock.mockResolvedValue("strict");

    const access = await resolvePayrollRouteAccess("payroll.run.manage");

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).toBe("/org/payroll");
    expect(access.reason).toBe("Tidak punya izin payroll.run.manage");
  });
});
