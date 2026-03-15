import { expect, test, type Browser } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { ensureWorkspaceEnabled, loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

const createOrgAdminPage = async (browser: Browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  await ensureWorkspaceEnabled(page, "Aktifkan workspace HR");
  return { context, page };
};

const ATS_TARGETS = [
  { path: "/org/hr/recruitment/jobs", heading: "Lowongan Kerja" },
  { path: "/org/hr/recruitment/candidates", heading: "Kandidat" },
  { path: "/org/hr/recruitment/interviews", heading: "Tahap Interview" },
  { path: "/org/hr/recruitment/offers", heading: "Penawaran Kerja" },
] as const;

test.describe.serial("Admin HR ATS Governance Runtime", () => {
  test("section governance ATS di admin selaras dengan empat route ATS org", async ({ page, browser }) => {
    await loginAsSuperadmin(page);

    await page.goto("/admin/hr/sections/rekrutmen-ats", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.locator("h1").filter({ hasText: "Rekrutmen (ATS)" })).toBeVisible();
    await expect(
      page.getByText("Governance superadmin untuk modul rekrutmen HR berbasis pipeline.").first(),
    ).toBeVisible();

    for (const target of ATS_TARGETS) {
      await expect(page.getByText(target.path, { exact: true })).toBeVisible();
    }

    const orgRuntime = await createOrgAdminPage(browser);
    try {
      for (const target of ATS_TARGETS) {
        await orgRuntime.page.goto(target.path, { waitUntil: "domcontentloaded" });
        await waitForStable(orgRuntime.page);
        await expect(orgRuntime.page).toHaveURL(new RegExp(`${target.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
        await expect(orgRuntime.page.getByRole("heading", { name: target.heading, exact: true })).toBeVisible();
      }
    } finally {
      await orgRuntime.context.close().catch(() => undefined);
    }
  });
});
