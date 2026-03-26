import { describe, expect, it } from "vitest";
import { prioritizeReadyOrgRoles } from "./orgAccountPriority";

describe("prioritizeReadyOrgRoles", () => {
  it("memprioritaskan org_admin_centralized di atas org_admin saat keduanya tersedia", () => {
    expect(prioritizeReadyOrgRoles(["org_admin", "org_admin_centralized"])).toEqual([
      "org_admin_centralized",
      "org_admin",
    ]);
  });

  it("mempertahankan urutan relatif role lain yang tidak punya prioritas khusus", () => {
    expect(prioritizeReadyOrgRoles(["org_operator", "org_admin", "employee"])).toEqual([
      "org_admin",
      "org_operator",
      "employee",
    ]);
  });

  it("menghapus duplikasi role", () => {
    expect(prioritizeReadyOrgRoles(["org_admin", "org_admin", "org_admin_centralized"])).toEqual([
      "org_admin_centralized",
      "org_admin",
    ]);
  });
});
