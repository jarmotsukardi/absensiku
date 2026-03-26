import { describe, expect, it } from "vitest";

import {
  getOrgOnboardingReadyModules,
  isOrgOnboardingAllowedPathDuringFirstRun,
  isOrgOnboardingComplete,
  isOrgProfileComplete,
  resolveOrgFirstRunRedirect,
} from "@/lib/orgOnboardingProgress";

describe("orgOnboardingProgress", () => {
  it("menghitung progres onboarding inti dengan stabil", () => {
    const counts = {
      opd: 1,
      work_units: 1,
      positions: 0,
      offices: 1,
      work_hours: 1,
      absence_limits: 0,
      announcements: 0,
    };

    expect(getOrgOnboardingReadyModules(counts)).toBe(4);
    expect(isOrgOnboardingComplete(counts)).toBe(false);
    expect(
      isOrgOnboardingComplete({
        ...counts,
        absence_limits: 1,
      }),
    ).toBe(true);
  });

  it("menganggap profil lengkap hanya jika field wajib terisi", () => {
    expect(
      isOrgProfileComplete({
        pic_name: "Admin Org",
        pic_whatsapp: "08123456789",
        address: "Jl. Contoh 1",
      }),
    ).toBe(true);

    expect(
      isOrgProfileComplete({
        pic_name: "Admin Org",
        pic_whatsapp: "08123456789",
        address: "   ",
      }),
    ).toBe(false);
  });

  it("mengizinkan hanya route onboarding inti selama first-run", () => {
    expect(isOrgOnboardingAllowedPathDuringFirstRun("/org/onboarding")).toBe(true);
    expect(isOrgOnboardingAllowedPathDuringFirstRun("/org/master/opd")).toBe(true);
    expect(isOrgOnboardingAllowedPathDuringFirstRun("/org/schedule/work-hours")).toBe(true);
    expect(isOrgOnboardingAllowedPathDuringFirstRun("/org")).toBe(false);
    expect(isOrgOnboardingAllowedPathDuringFirstRun("/org/hr")).toBe(false);
  });

  it("mengarahkan admin ke profile setup jika profil belum lengkap", () => {
    expect(
      resolveOrgFirstRunRedirect({
        pathname: "/org",
        accessLevel: "admin",
        profileComplete: false,
        onboardingComplete: null,
      }),
    ).toBe("/org/profile/setup");
  });

  it("mengarahkan admin ke onboarding jika profil sudah lengkap tapi setup inti belum selesai", () => {
    expect(
      resolveOrgFirstRunRedirect({
        pathname: "/org",
        accessLevel: "admin",
        profileComplete: true,
        onboardingComplete: false,
      }),
    ).toBe("/org/onboarding");

    expect(
      resolveOrgFirstRunRedirect({
        pathname: "/org/master/work-units",
        accessLevel: "admin",
        profileComplete: true,
        onboardingComplete: false,
      }),
    ).toBeNull();
  });

  it("tidak mengarahkan operator atau tenant yang sudah siap", () => {
    expect(
      resolveOrgFirstRunRedirect({
        pathname: "/org",
        accessLevel: "operator",
        profileComplete: false,
        onboardingComplete: false,
      }),
    ).toBeNull();

    expect(
      resolveOrgFirstRunRedirect({
        pathname: "/org",
        accessLevel: "admin",
        profileComplete: true,
        onboardingComplete: true,
      }),
    ).toBeNull();
  });
});
