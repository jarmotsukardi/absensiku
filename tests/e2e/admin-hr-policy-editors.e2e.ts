import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

test.describe.serial("Admin HR Policy Editors", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Kebijakan HR" })).toBeVisible();
  });

  test("dialog tambah program pelatihan dapat dibuka", async ({ page }) => {
    await page.getByRole("button", { name: "Tambah Program" }).first().click();

    await expect(page.getByRole("heading", { name: "Tambah Program Pelatihan", exact: true })).toBeVisible();
    await expect(page.locator("#admin-training-name")).toBeVisible();
    await expect(page.locator("#admin-training-category")).toBeVisible();
    await expect(page.locator("#admin-training-provider")).toBeVisible();
    await expect(page.locator("#admin-training-duration")).toBeVisible();
    await expect(page.locator("#admin-training-target")).toBeVisible();
    await expect(page.locator("#admin-training-notes")).toBeVisible();

    await page.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Program Pelatihan", exact: true })).not.toBeVisible();
  });

  test("dialog tambah sertifikasi dapat dibuka", async ({ page }) => {
    await page.getByRole("button", { name: "Tambah Sertifikasi" }).click();

    await expect(page.getByRole("heading", { name: "Tambah Sertifikasi", exact: true })).toBeVisible();
    await expect(page.locator("#admin-cert-name")).toBeVisible();
    await expect(page.locator("#admin-cert-role")).toBeVisible();
    await expect(page.locator("#admin-cert-issuer")).toBeVisible();
    await expect(page.locator("#admin-cert-validity")).toBeVisible();
    await expect(page.locator("#admin-cert-reminder")).toBeVisible();
    await expect(page.getByText("Wajib untuk role target", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Sertifikasi", exact: true })).not.toBeVisible();
  });

  test("dialog tambah skill matrix dapat dibuka", async ({ page }) => {
    await page.getByRole("button", { name: "Tambah Skill" }).click();

    await expect(page.getByRole("heading", { name: "Tambah Skill Matrix", exact: true })).toBeVisible();
    await expect(page.locator("#admin-skill-name")).toBeVisible();
    await expect(page.locator("#admin-skill-function")).toBeVisible();
    await expect(page.locator("#admin-skill-coverage")).toBeVisible();
    await expect(page.locator("#admin-skill-gap")).toBeVisible();
    await expect(page.locator("#admin-skill-linked-training")).toBeVisible();
    await expect(page.getByText("Level Minimal", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Skill Matrix", exact: true })).not.toBeVisible();
  });
});
