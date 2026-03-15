import { expect, test, type Page } from "@playwright/test";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";

test.describe.serial("Admin HR Policies Smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Kebijakan HR" })).toBeVisible();
  });

  test("ringkasan domain dan tenant panel tampil stabil", async ({ page }) => {
    const metrics = [
      { title: "Domain Kebijakan", note: "Blok kebijakan aktif yang saat ini dipantau admin." },
      { title: "Rute Org Aktif", note: "Target org yang sudah tampil sebagai halaman kerja." },
      { title: "Rute Non-Final", note: "Alias atau rute internal yang masih butuh konteks admin." },
    ] as const;

    for (const { title, note } of metrics) {
      const card = page
        .locator("div.rounded-xl")
        .filter({ has: page.getByText(title, { exact: true }) })
        .filter({ hasText: note })
        .first();
      await expect(card).toBeVisible();
      const cardText = (((await card.textContent()) || "").trim());
      expect(cardText.length).toBeGreaterThan(0);
    }

    await expect(page.getByRole("heading", { name: "Kontrol Domain Tenant", exact: true })).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-selected-tenant")).toContainText("Tenant aktif:");
    await expect(page.getByRole("heading", { name: "Acuan Bawaan Ulasan 360", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kesiapan Pelatihan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kontrol ESS", exact: true })).toBeVisible();
  });

  test("tenant selector dan kontrol baseline tampil stabil", async ({ page }) => {
    const tenantBanner = page.getByTestId("admin-hr-policy-selected-tenant");
    const initialBannerText = (((await tenantBanner.textContent()) || "").trim());
    await expect(tenantBanner).toBeVisible();

    const tenantTrigger = page.getByRole("combobox").first();
    await tenantTrigger.click();
    const options = page.getByRole("option");
    const optionCount = await options.count();

    if (optionCount > 1) {
      const secondOptionText = (((await options.nth(1).textContent()) || "").trim());
      await options.nth(1).click();
      await waitForStable(page);
      await expect(tenantBanner).not.toHaveText(initialBannerText);
      await expect(tenantBanner).toContainText(secondOptionText.replace(/\s+/g, " ").split(" (")[0]);
    } else {
      await page.keyboard.press("Escape");
      await expect(tenantBanner).toContainText("Tenant aktif:");
    }

    await expect(page.getByTestId("admin-hr-policy-review360-enabled")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-review360-peer-count")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-review360-manager-weight")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-save-review360")).toBeVisible();

    await expect(page.getByTestId("admin-hr-policy-add-training")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-add-certification")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-add-skill")).toBeVisible();

    await expect(page.getByTestId("admin-hr-policy-ess-requests")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-ess-attendance")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-ess-document-source")).toBeVisible();
    await expect(page.getByTestId("admin-hr-policy-save-ess")).toBeVisible();
  });

  test("link ke audit dan coverage map tetap benar", async ({ page }) => {
    await page.getByRole("link", { name: "Buka Audit HR", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/audit$/);

    await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("link", { name: "Buka Matriks Cakupan", exact: true }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/settings#coverage-map$/);
  });

  test("guide halaman kebijakan tampil di bagian bawah", async ({ page }) => {
    await expectAdminPageGuide(page, "Panduan Kebijakan HR");
  });
});
