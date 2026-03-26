import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAsPayrollOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { ensureOrgWorkspaceEnabled } from "./helpers/orgWorkspace";

const buildForcedFailureHandler = (table: string) => async (route: Route) => {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({
      code: "E2E_FORCED_FAILURE",
      message: `forced ${table} failure`,
    }),
  });
};

const withForcedTableFailure = async (page: Page, tables: string[], run: () => Promise<void>) => {
  const handlers = tables.map((table) => ({
    pattern: `**/rest/v1/${table}*`,
    handler: buildForcedFailureHandler(table),
  }));

  for (const item of handlers) {
    await page.route(item.pattern, item.handler);
  }

  try {
    await run();
  } finally {
    for (const item of handlers) {
      await page.unroute(item.pattern, item.handler);
    }
  }
};

test.describe.serial("Org Payroll Partial Failure", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");
  });

  test("roles dan integrations tetap terbuka saat lookup employees gagal", async ({ page }) => {
    const cases = [
      {
        path: "/org/payroll/roles",
        heading: "Hak Akses Payroll",
        button: "Tetapkan Peran",
        fatalText: "Gagal memuat role payroll",
      },
      {
        path: "/org/payroll/integrations",
        heading: "Integrasi Payroll",
        button: "Cek Kesehatan",
        fatalText: "Gagal memuat konfigurasi integrasi payroll",
      },
    ];

    await withForcedTableFailure(page, ["employees"], async () => {
      for (const item of cases) {
        await page.goto(item.path, { waitUntil: "domcontentloaded" });
        await waitForStable(page);

        await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: item.button })).toBeVisible();
        await expect(page.getByText(item.fatalText, { exact: false })).toHaveCount(0);
      }
    });
  });
});
