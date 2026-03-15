import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getRoleAccounts, solveMathExpression, type RoleAccount, type RoleKey } from "./testAccounts";

export const waitForStable = async (page: Page) => {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Abaikan jika ada polling berkala.
  }
};

export const toYmd = (date: Date) => date.toISOString().slice(0, 10);

export const loginAsOrgUser = async (page: Page, roles: RoleKey[]) => {
  const candidates = await getRoleAccounts(roles);
  test.skip(candidates.length === 0, `Kredensial ${roles.join(" / ")} belum diisi di ops/test-accounts.local.json`);

  for (const candidate of candidates) {
    await page.goto("/org/login", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    await page.fill("#email", candidate.account.email);
    await page.fill("#password", candidate.account.password);

    const fallbackMathLabel =
      (await page
        .locator("label")
        .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
        .first()
        .textContent()
        .catch(() => "")) || "";
    const answerFromMath = solveMathExpression(fallbackMathLabel);
    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    );
    const captchaAnswer = (answerFromMath || captchaText).trim();
    expect(captchaAnswer.length).toBeGreaterThanOrEqual(1);
    await page.fill("#captcha-input", captchaAnswer);

    await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
    await page.getByRole("button", { name: "Masuk" }).click();

    try {
      await expect(page).not.toHaveURL(/\/org\/login(?:\?|$)/, { timeout: 20_000 });
      return candidate.account;
    } catch {
      // Coba role berikutnya jika kredensial tersedia tetapi login tidak lolos.
    }
  }

  throw new Error(`Semua kredensial org gagal login untuk role: ${roles.join(", ")}`);
};

export const loginAsOrgAdmin = async (page: Page, roles: RoleKey[]) => {
  const creds = await loginAsOrgUser(page, roles);
  await expect(page).toHaveURL(/\/org(?!\/login)/, { timeout: 20_000 });
  return creds;
};

export const expectOrgTenantContext = async (page: Page, account: Pick<RoleAccount, "tenant_name">) => {
  const expectedTenantName = account.tenant_name?.trim();
  test.skip(!expectedTenantName, "tenant_name belum diisi pada account test.");

  const sidebarTenant = page.getByText(expectedTenantName!, { exact: false }).first();
  await expect(sidebarTenant).toBeVisible({ timeout: 20_000 });
};

export const setWorkspaceToggle = async (
  page: Page,
  switchName: "Aktifkan workspace HR" | "Aktifkan workspace Payroll",
  enabled: boolean,
) => {
  const saveButton = page.getByRole("button", { name: "Simpan Workspace" });
  await expect(saveButton).toBeEnabled();
  const toggle = page.getByRole("switch", { name: switchName });
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
    await saveButton.click();
    await waitForStable(page);
  }
};

export const ensureWorkspaceEnabled = async (
  page: Page,
  switchName: "Aktifkan workspace HR" | "Aktifkan workspace Payroll",
) => {
  await page.goto("/org/onboarding", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await setWorkspaceToggle(page, switchName, true);
  await page.getByRole("button", { name: "Muat Ulang" }).first().click();
  await waitForStable(page);
  await setWorkspaceToggle(page, switchName, true);
};

export const ensurePayrollAdminAccess = async (page: Page, email: string): Promise<boolean> => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  await ensureWorkspaceEnabled(page, "Aktifkan workspace Payroll");
  await page.goto("/org/payroll/roles", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByRole("heading", { name: "Role & Permission Payroll" })).toBeVisible();

  const strictSwitch = page.getByLabel("Strict Mode Payroll");
  if (await strictSwitch.isVisible().catch(() => false)) {
    await expect(strictSwitch).toBeEnabled({ timeout: 15_000 });
    if (await strictSwitch.isChecked()) {
      await strictSwitch.click();
      await expect(strictSwitch).not.toBeChecked();
    }
  }

  const searchInput = page.getByLabel("Cari Pegawai");
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(normalizedEmail);
  }

  const roleSelect = page.locator("label", { hasText: "Role Payroll" }).locator("..").getByRole("combobox").first();
  await roleSelect.click();
  await page.getByRole("option", { name: "Payroll Admin" }).click();

  const employeeSelect = page.locator("label", { hasText: "Pegawai" }).locator("..").getByRole("combobox").first();
  await employeeSelect.click();
  const selfOption = page.getByRole("option").filter({ hasText: normalizedEmail }).first();
  if ((await selfOption.count()) > 0) {
    await selfOption.click();
  } else {
    const fallbackOption = page
      .getByRole("option")
      .filter({ hasNotText: /^Pilih Pegawai$/i })
      .first();
    const hasFallbackOption = (await fallbackOption.count()) > 0;
    if (!hasFallbackOption) return false;
    await fallbackOption.click();
  }

  await page.getByRole("button", { name: "Assign Role" }).click();
  await waitForStable(page);
  return true;
};
