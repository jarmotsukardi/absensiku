import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getNamedAccount, getRoleAccounts, solveMathExpression, type RoleAccount, type RoleKey } from "./testAccounts";
import { prioritizeReadyOrgRoles } from "./orgAccountPriority";

export const waitForStable = async (page: Page) => {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Abaikan jika ada polling berkala.
  }
};

export const toYmd = (date: Date) => date.toISOString().slice(0, 10);

const ORG_LOGIN_PATHNAME = "/org/login";
const ORG_FIRST_RUN_PATHS = new Set(["/org/profile/setup", "/org/onboarding"]);

const getOrgPathname = (page: Page) => new URL(page.url()).pathname;

export const isOrgFirstRunPath = (pathname: string) => ORG_FIRST_RUN_PATHS.has(pathname);

export const waitForOrgArea = async (page: Page) => {
  await expect.poll(() => getOrgPathname(page), { timeout: 20_000 }).toMatch(/^\/org(?:\/.*)?$/);
  await expect.poll(() => getOrgPathname(page), { timeout: 20_000 }).not.toBe(ORG_LOGIN_PATHNAME);
  return getOrgPathname(page);
};

export const skipIfOrgFirstRunFlowActive = async (page: Page, message: string) => {
  const pathname = getOrgPathname(page);
  test.skip(
    isOrgFirstRunPath(pathname),
    `${message} Path aktif: ${pathname}`,
  );
};

const loginWithOrgAccount = async (page: Page, account: RoleAccount) => {
  await page.goto("/org/login", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.fill("#email", account.email);
  await page.fill("#password", account.password);

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
};

export const loginAsOrgUser = async (page: Page, roles: RoleKey[]) => {
  const candidates = await getRoleAccounts(roles);
  test.skip(candidates.length === 0, `Kredensial ${roles.join(" / ")} belum diisi di ops/test-accounts.local.json`);

  for (const candidate of candidates) {
    await loginWithOrgAccount(page, candidate.account);

    try {
      await expect(page).not.toHaveURL(/\/org\/login(?:\?|$)/, { timeout: 20_000 });
      return candidate.account;
    } catch {
      // Coba role berikutnya jika kredensial tersedia tetapi login tidak lolos.
    }
  }

  throw new Error(`Semua kredensial org gagal login untuk role: ${roles.join(", ")}`);
};

export const loginAsNamedOrgUser = async (page: Page, accountKey: string) => {
  const normalizedAccountKey = accountKey.trim();
  test.skip(!normalizedAccountKey, "PAYROLL_ACCOUNT_KEY atau accountKey belum diisi.");

  const account = await getNamedAccount(normalizedAccountKey);
  test.skip(!account, `Akun "${normalizedAccountKey}" belum valid di ops/test-accounts.local.json.`);

  await loginWithOrgAccount(page, account!);
  await expect(page).not.toHaveURL(/\/org\/login(?:\?|$)/, { timeout: 20_000 });
  return account!;
};

const ensureReadyOrgArea = async (page: Page, sourceLabel: string) => {
  const pathname = await waitForOrgArea(page);
  if (isOrgFirstRunPath(pathname)) {
    throw new Error(`${sourceLabel} masih mengarah ke flow setup awal (${pathname}). Gunakan akun tenant yang sudah siap pakai.`);
  }
  return pathname;
};

export const loginAsOrgAdmin = async (page: Page, roles: RoleKey[]) => {
  const namedAccountKey = process.env.ORG_READY_ACCOUNT_KEY?.trim();
  if (namedAccountKey) {
    const creds = await loginAsNamedOrgUser(page, namedAccountKey);
    await ensureReadyOrgArea(page, `ORG_READY_ACCOUNT_KEY="${namedAccountKey}"`);
    return creds;
  }

  const creds = await loginAsOrgUser(page, prioritizeReadyOrgRoles(roles));
  await waitForOrgArea(page);
  return creds;
};

export const loginAsPayrollOrgAdmin = async (page: Page) => {
  const namedAccountKey = process.env.PAYROLL_ACCOUNT_KEY?.trim() || process.env.ORG_READY_ACCOUNT_KEY?.trim();
  const creds = namedAccountKey
    ? await loginAsNamedOrgUser(page, namedAccountKey)
    : await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
  const sourceLabel = process.env.PAYROLL_ACCOUNT_KEY?.trim()
    ? `PAYROLL_ACCOUNT_KEY="${namedAccountKey}"`
    : process.env.ORG_READY_ACCOUNT_KEY?.trim()
      ? `ORG_READY_ACCOUNT_KEY="${namedAccountKey}"`
      : "fallback org admin payroll";
  await ensureReadyOrgArea(page, sourceLabel);
  return creds;
};

export const loginAsFirstRunOrgAdmin = async (page: Page) => {
  const namedAccountKey = process.env.ORG_FIRST_RUN_ACCOUNT_KEY?.trim();
  test.skip(!namedAccountKey, "ORG_FIRST_RUN_ACCOUNT_KEY belum diisi.");

  const creds = await loginAsNamedOrgUser(page, namedAccountKey!);
  await waitForOrgArea(page);
  await expect
    .poll(() => isOrgFirstRunPath(getOrgPathname(page)), {
      timeout: 20_000,
      message: "Akun dedicated first-run tidak berpindah ke langkah setup awal yang diharapkan.",
    })
    .toBe(true);
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

  await page.goto("/org/payroll/roles", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  const rolesHeading = page.getByRole("heading", { name: "Hak Akses Payroll", exact: true, level: 1 });
  const rolesReady = await rolesHeading.isVisible().catch(() => false);
  if (!rolesReady) return false;
  await expect(rolesHeading).toBeVisible();

  const strictSwitch = page.getByLabel("Strict Mode Payroll");
  if (await strictSwitch.isVisible().catch(() => false)) {
    await expect(strictSwitch).toBeEnabled({ timeout: 15_000 });
    if (await strictSwitch.isChecked()) {
      await strictSwitch.click();
      const fallbackReady = await expect
        .poll(
          async () => {
            const isChecked = await strictSwitch.isChecked().catch(() => true);
            const fallbackLabelVisible = await page
              .getByText("Status saat ini: FALLBACK", { exact: false })
              .isVisible()
              .catch(() => false);
            const switchEnabled = await strictSwitch.isEnabled().catch(() => false);
            return !isChecked && fallbackLabelVisible && switchEnabled;
          },
          { timeout: 15_000, intervals: [500, 1000, 1500, 2000] },
        )
        .toBeTruthy()
        .then(() => true)
        .catch(() => false);

      if (!fallbackReady) return false;
    }
  }
  return true;
};
