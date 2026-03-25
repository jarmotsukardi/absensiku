import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  roleEqMock,
  roleSelectMock,
  fromMock,
  resolveOrgTenantIdMock,
  fetchTenantOrgWorkspaceModulesMock,
  fetchTenantHrPayrollAccessStateMock,
  getWorkspaceLockedReasonMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const roleEqMock = vi.fn();
  const roleSelectMock = vi.fn(() => ({ eq: roleEqMock }));
  const fromMock = vi.fn((table: string) => {
    if (table === "user_roles") {
      return { select: roleSelectMock };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    getUserMock,
    roleEqMock,
    roleSelectMock,
    fromMock,
    resolveOrgTenantIdMock: vi.fn(),
    fetchTenantOrgWorkspaceModulesMock: vi.fn(),
    fetchTenantHrPayrollAccessStateMock: vi.fn(),
    getWorkspaceLockedReasonMock: vi.fn(() => "HR dikunci sampai readiness absensi terpenuhi."),
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
  getWorkspaceLockedReason: getWorkspaceLockedReasonMock,
}));

import { resolveHrPageAccess } from "@/lib/hrPageAccess";

describe("hrPageAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    roleEqMock.mockResolvedValue({ data: [{ role: "admin_instansi" }], error: null });
    resolveOrgTenantIdMock.mockResolvedValue("tenant-1");
    fetchTenantOrgWorkspaceModulesMock.mockResolvedValue({ modules: { hr: true } });
    fetchTenantHrPayrollAccessStateMock.mockResolvedValue({
      hrMode: "full",
      readiness: {},
    });
  });

  it("keeps full capability saat HR editable penuh", async () => {
    const access = await resolveHrPageAccess("/org/hr/training-data");

    expect(access.allowed).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canCreate).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canDelete).toBe(true);
    expect(access.canConfigure).toBe(true);
    expect(access.canApprove).toBe(true);
  });

  it("menurunkan capability mutasi saat tenant HR read only", async () => {
    fetchTenantHrPayrollAccessStateMock.mockResolvedValueOnce({
      hrMode: "readonly",
      readiness: {},
    });

    const access = await resolveHrPageAccess("/org/hr/training-data");

    expect(access.allowed).toBe(true);
    expect(access.canView).toBe(true);
    expect(access.canCreate).toBe(false);
    expect(access.canEdit).toBe(false);
    expect(access.canDelete).toBe(false);
    expect(access.canExport).toBe(false);
    expect(access.canConfigure).toBe(false);
    expect(access.canApprove).toBe(false);
  });

  it("menolak akses saat workspace HR terkunci", async () => {
    fetchTenantHrPayrollAccessStateMock.mockResolvedValueOnce({
      hrMode: "locked",
      readiness: { onboardingReady: false },
    });

    const access = await resolveHrPageAccess("/org/hr/settings");

    expect(access.allowed).toBe(false);
    expect(access.canView).toBe(false);
    expect(access.canConfigure).toBe(false);
    expect(access.reason).toBe("HR dikunci sampai readiness absensi terpenuhi.");
  });
});
