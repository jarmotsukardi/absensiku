import { expect, test } from "@playwright/test";
import { loginAsOrgAdmin, loginAsOrgUser, waitForStable } from "./helpers/orgAuth";

test.describe("Org Admin Operator Settings", () => {
  test("admin dapat membuka halaman tanpa overlay floating", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);

    await page.goto("/org/settings/admin-operator", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page.getByRole("heading", { name: "Admin & Operator" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Alert Pengajuan/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Buka widget WhatsApp|Tutup widget WhatsApp/i })).toHaveCount(0);
  });

  test("operator tidak menembak RPC admin-operator dan langsung dialihkan", async ({ page }) => {
    const adminOperatorRpcRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/rpc/org_list_admin_operator_members")) {
        adminOperatorRpcRequests.push(request.url());
      }
    });

    await loginAsOrgUser(page, ["org_operator"]);

    await page.goto("/org/settings/admin-operator", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await expect(page).not.toHaveURL(/\/org\/settings\/admin-operator(?:\?|$)/);
    await expect(page.getByText("Gagal memuat data Admin & Operator")).toHaveCount(0);
    expect(adminOperatorRpcRequests.length).toBe(0);
  });
});
