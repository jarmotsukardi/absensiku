import { expect, test } from "@playwright/test";

import {
  isOrgFirstRunPath,
  loginAsFirstRunOrgAdmin,
  waitForStable,
} from "./helpers/orgAuth";

test.describe.serial("Org First-Run Onboarding", () => {
  test("akun dedicated first-run mendarat di profile setup atau onboarding", async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsFirstRunOrgAdmin(page);

    const pathname = new URL(page.url()).pathname;
    if (pathname === "/org/profile/setup") {
      await expect(page.getByRole("heading", { name: "Lengkapi Profil Organisasi", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Simpan & Lanjutkan", exact: true })).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/org\/onboarding(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Setup Awal Organisasi", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Urutan Setup yang Disarankan", exact: true })).toBeVisible();
    await expect(page.getByText("Progress Inti:", { exact: false })).toBeVisible();
  });

  test("guard /org mengembalikan admin first-run ke langkah yang benar", async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsFirstRunOrgAdmin(page);
    const landingPath = new URL(page.url()).pathname;

    await page.goto("/org", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    if (landingPath === "/org/profile/setup") {
      await expect(page).toHaveURL(/\/org\/profile\/setup(?:\?|$)/, { timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Lengkapi Profil Organisasi", exact: true })).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/org\/onboarding(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Setup Awal Organisasi", exact: true })).toBeVisible();
  });

  test("jika sudah masuk tahap onboarding, route langkah wajib tetap bisa dibuka", async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsFirstRunOrgAdmin(page);
    const landingPath = new URL(page.url()).pathname;
    test.skip(landingPath !== "/org/onboarding", "Akun dedicated first-run saat ini masih berada di profile setup.");

    await page.goto("/org/master/work-units", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const currentPath = new URL(page.url()).pathname;
    expect(isOrgFirstRunPath(currentPath)).toBe(false);
    await expect(page).toHaveURL(/\/org\/master\/work-units(?:\?|$)/, { timeout: 20_000 });
  });
});
