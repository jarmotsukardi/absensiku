import { expect, test } from "@playwright/test";
import { loginAsOrgAdmin, loginAsOrgUser, waitForStable } from "./helpers/orgAuth";
import { getRoleCreds } from "./helpers/testAccounts";

let createdTicketKey = "";

test.describe.serial("Org HR Ticket Role Matrix", () => {
  test("admin dapat membuat tiket HR", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    createdTicketKey = `E2E-ROLE-TIK-${Date.now()}`;

    await page.goto("/org/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Tiket HR", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Buat Tiket HR" }).click();
    await expect(page.getByRole("heading", { name: "Buat Tiket HR" })).toBeVisible();

    await page.fill("#subject", createdTicketKey);
    await page.fill("#message", "Seed ticket untuk role matrix e2e");
    await page.getByRole("button", { name: "Kirim Tiket" }).click();
    await waitForStable(page);

    const row = page.locator("tr", { hasText: createdTicketKey }).first();
    await expect(row).toBeVisible();
  });

  test("operator hanya boleh take + comment, tanpa create/assign/resolve", async ({ page }) => {
    test.skip(!createdTicketKey, "Ticket seed dari skenario admin tidak tersedia");
    const operatorCreds = await getRoleCreds("org_operator");
    test.skip(!operatorCreds || operatorCreds.email.endsWith("@example.com"), "Kredensial operator belum siap");

    await loginAsOrgUser(page, ["org_operator"]);

    await page.goto("/org/hr/help/tickets", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Tiket HR", exact: true })).toBeVisible();

    const createButton = page.getByRole("button", { name: "Buat Tiket HR" });
    await expect(createButton).toBeDisabled();

    await page.getByPlaceholder("Cari subjek, detail, pelapor...").fill(createdTicketKey);
    await waitForStable(page);

    const row = page.locator("tr", { hasText: createdTicketKey }).first();
    await expect(row).toBeVisible();

    await expect(row.getByRole("button", { name: "PIC/SLA" })).toBeDisabled();
    await row.getByRole("button", { name: "Take" }).click({ force: true });
    await waitForStable(page);

    await expect(row.getByRole("button", { name: "Resolve" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Reopen" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Kembali Open" })).toHaveCount(0);

    await row.getByRole("button", { name: "Thread" }).click();
    await expect(page.getByRole("heading", { name: "Thread & Audit Tiket" })).toBeVisible();

    const commentValue = `Operator comment ${createdTicketKey}`;
    await page.fill('textarea[placeholder="Tambah komentar tindak lanjut..."]', commentValue);
    await page.getByRole("button", { name: "Tambah Komentar" }).click();
    await expect(page.getByText(commentValue)).toBeVisible();
  });
});
