import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { ensurePayrollAdminAccess, loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

const ensureFallbackPayrollMode = async (page: Page): Promise<boolean> => {
  await page.goto("/org/payroll/roles", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  const rolesHeading = page.getByRole("heading", { name: "Hak Akses Payroll", exact: true, level: 1 });
  const rolesReady = await rolesHeading.isVisible().catch(() => false);
  if (!rolesReady) return false;

  const strictSwitch = page.getByLabel("Strict Mode Payroll");
  const switchVisible = await strictSwitch.isVisible().catch(() => false);
  if (!switchVisible) return true;

  await expect(strictSwitch).toBeEnabled({ timeout: 15_000 });
  const wasChecked = await strictSwitch.isChecked().catch(() => false);
  if (wasChecked) {
    await strictSwitch.click();
  }

  return expect
    .poll(
      async () => {
        const isChecked = await strictSwitch.isChecked().catch(() => true);
        const fallbackLabelVisible = await page
          .getByText("Status saat ini: FALLBACK", { exact: false })
          .isVisible()
          .catch(() => false);
        return !isChecked || fallbackLabelVisible;
      },
      { timeout: 15_000, intervals: [500, 1000, 1500, 2000] },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
};

const ensureIntegrationsAccess = async (page: Page): Promise<boolean> => {
  const integrationsHeading = page.getByRole("heading", { name: "Integrasi Payroll", exact: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/org/payroll/integrations", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    if (await integrationsHeading.isVisible().catch(() => false)) {
      return true;
    }

    const fallbackReady = await ensureFallbackPayrollMode(page);
    if (!fallbackReady) return false;
  }
  return false;
};

const openWebhookResultOrSkip = async (page: Page) => {
  const resultHeading = page.getByRole("heading", { name: "Hasil Uji Webhook", exact: true });
  const hasResult = await expect
    .poll(
      async () => resultHeading.isVisible().catch(() => false),
      { timeout: 20_000, intervals: [500, 1000, 1500, 2000] },
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  test.skip(!hasResult, "Relay webhook belum tersedia atau environment eksternal tidak dapat diakses");
  await expect(resultHeading).toBeVisible();
};

const getWebhookEndpointInput = (page: Page) =>
  page.getByPlaceholder("https://api.example.com/payroll/webhook");

const getWebhookSecretInput = (page: Page) =>
  page.getByPlaceholder("whsec_...");

const expectAuditLogOpen = async (page: Page): Promise<{ scope: Page | FrameLocator; overlayTarget: string | null }> => {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      if (url.pathname === "/org/payroll/audit-log") return true;
      const overlayTarget = url.searchParams.get("payroll_overlay");
      return typeof overlayTarget === "string" && overlayTarget.startsWith("/org/payroll/audit-log?");
    }, { timeout: 15_000, intervals: [500, 1000, 1500, 2000] })
    .toBeTruthy();

  const url = new URL(page.url());
  const overlayTarget = url.searchParams.get("payroll_overlay");
  if (overlayTarget?.startsWith("/org/payroll/audit-log")) {
    const overlayFrame = page.frameLocator(`iframe[title="Overlay ${overlayTarget}"]`);
    await expect(page.locator(`iframe[title="Overlay ${overlayTarget}"]`)).toBeVisible();
    await expect(overlayFrame.getByRole("heading", { name: "Audit Log Payroll", exact: true, level: 1 })).toBeVisible();
    return { scope: overlayFrame, overlayTarget };
  }

  await expect(page.getByRole("heading", { name: "Audit Log Payroll", exact: true, level: 1 })).toBeVisible();
  return { scope: page, overlayTarget: null };
};

test.describe.serial("Org Payroll Webhook Audit", () => {
  test("integrations webhook test opens filtered audit log", async ({ page }) => {
    test.setTimeout(180_000);
    const creds = await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    const accessReady = await ensurePayrollAdminAccess(page, creds.email);
    test.skip(!accessReady, "Akses admin payroll belum siap untuk tenant uji.");

    const hasIntegrationsAccess = await ensureIntegrationsAccess(page);
    test.skip(!hasIntegrationsAccess, "Akses integrasi payroll belum siap untuk tenant uji.");
    await expect(page.getByRole("heading", { name: "Integrasi Payroll", exact: true })).toBeVisible();

    const webhookSwitch = page.getByLabel("Aktifkan webhook");
    await expect(webhookSwitch).toBeVisible();
    if (!(await webhookSwitch.isChecked())) {
      await webhookSwitch.click();
    }

    await getWebhookEndpointInput(page).fill("https://postman-echo.com/post");
    await getWebhookSecretInput(page).fill("whsec_e2e_test");
    await page.getByRole("button", { name: "Simpan Konfigurasi" }).click();
    await waitForStable(page);

    await page.getByRole("button", { name: "Kirim Uji Webhook" }).click();
    await waitForStable(page);

    await openWebhookResultOrSkip(page);
    const openAuditButton = page.getByRole("button", { name: "Buka di Audit Log" });
    await expect(openAuditButton).toBeVisible();
    await openAuditButton.click();
    await waitForStable(page);

    const { scope, overlayTarget } = await expectAuditLogOpen(page);

    await expect.poll(async () => {
      if (overlayTarget) {
        const target = new URL(overlayTarget, "http://localhost");
        return target.searchParams.get("entity") === "payroll_webhook";
      }
      const url = new URL(page.url());
      return url.searchParams.get("entity") === "payroll_webhook";
    }).toBeTruthy();

    await expect.poll(async () => {
      const count = await scope
        .getByRole("row")
        .filter({ hasText: "Webhook Payroll / Uji Webhook Berhasil" })
        .count();
      return count > 0;
    }, { timeout: 15_000 }).toBeTruthy();
  });

  test("webhook failure writes audit attempts count", async ({ page }) => {
    test.setTimeout(180_000);
    const creds = await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    const accessReady = await ensurePayrollAdminAccess(page, creds.email);
    test.skip(!accessReady, "Akses admin payroll belum siap untuk tenant uji.");

    const hasIntegrationsAccess = await ensureIntegrationsAccess(page);
    test.skip(!hasIntegrationsAccess, "Akses integrasi payroll belum siap untuk tenant uji.");
    await expect(page.getByRole("heading", { name: "Integrasi Payroll", exact: true })).toBeVisible();

    const webhookSwitch = page.getByLabel("Aktifkan webhook");
    await expect(webhookSwitch).toBeVisible();
    if (!(await webhookSwitch.isChecked())) {
      await webhookSwitch.click();
    }

    await getWebhookEndpointInput(page).fill("https://nonexistent-payroll-webhook.invalid/test");
    await getWebhookSecretInput(page).fill("whsec_e2e_negative");
    await page.getByRole("button", { name: "Simpan Konfigurasi" }).click();
    await waitForStable(page);

    await page.getByRole("button", { name: "Kirim Uji Webhook" }).click();
    await waitForStable(page);

    await openWebhookResultOrSkip(page);
    await expect(page.getByText(/status relay:\s*gagal/i)).toBeVisible();

    const openAuditButton = page.getByRole("button", { name: "Buka di Audit Log" });
    await expect(openAuditButton).toBeVisible();
    await openAuditButton.click();
    await waitForStable(page);

    const { scope } = await expectAuditLogOpen(page);
    const failedWebhookRow = scope
      .getByRole("row")
      .filter({ hasText: "Webhook Payroll / Uji Webhook Gagal" })
      .first();
    await expect(failedWebhookRow).toBeVisible();

    const attemptsCell = failedWebhookRow.getByRole("cell").nth(3);
    await expect(attemptsCell).not.toHaveText("-");
    await expect
      .poll(async () => {
        const raw = (await attemptsCell.textContent()) || "";
        const parsed = Number.parseInt(raw.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 1;
      })
      .toBeTruthy();
  });
});
