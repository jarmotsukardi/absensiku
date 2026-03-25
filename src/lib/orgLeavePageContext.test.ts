import { describe, expect, it } from "vitest";

import { getOrgLeavePageContext } from "@/lib/orgLeavePageContext";

describe("orgLeavePageContext", () => {
  it("mempertahankan konteks absensi untuk route permohonan organisasi", () => {
    expect(getOrgLeavePageContext("/org/leave/requests")).toEqual({
      badgeLabel: null,
      title: "Permohonan Cuti",
      description: "Kelola data permohonan izin/cuti pegawai",
      cardTitle: "Daftar Permohonan Cuti",
      searchPlaceholder: "Cari permohonan...",
      hrCapabilityPath: null,
      hrContextLinks: [],
    });
  });

  it("mengembalikan konteks HR untuk approval cuti", () => {
    const context = getOrgLeavePageContext("/org/hr/leave-approval");

    expect(context.badgeLabel).toBe("HR");
    expect(context.title).toBe("Alur Persetujuan Cuti");
    expect(context.hrCapabilityPath).toBe("/org/hr/leave-approval");
    expect(context.hrContextLinks.map((item) => item.path)).toEqual([
      "/org/hr/leave-quota",
      "/org/hr/leave-types",
      "/org/hr/approval-hierarchy",
    ]);
  });

  it("mengembalikan konteks ESS untuk leave request HR", () => {
    const context = getOrgLeavePageContext("/org/hr/ess/leave-requests");

    expect(context.badgeLabel).toBe("ESS");
    expect(context.title).toBe("Cuti & Izin ESS");
    expect(context.hrCapabilityPath).toBe("/org/hr/ess/leave-requests");
    expect(context.hrContextLinks.map((item) => item.path)).toEqual([
      "/org/hr/ess/requests",
      "/org/hr/leave-quota",
      "/org/hr/approval-hierarchy",
    ]);
  });
});
