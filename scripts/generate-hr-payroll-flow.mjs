import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:5173";
const OUT_DIR = path.join(ROOT, "public", "manuals", "screenshots", "flow");
const CREDS_PATH = path.join(ROOT, "ops", "test-accounts.local.json");

const EMPLOYEE_NAME = "Susi";

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const readCreds = () => {
  const raw = fs.readFileSync(CREDS_PATH, "utf8");
  const json = JSON.parse(raw);
  const account = json.org_admin_centralized;
  if (!account?.email || !account?.password) {
    throw new Error("Kredensial org_admin_centralized tidak tersedia.");
  }
  return account;
};

const waitForAppReady = async (page) => {
  await page.waitForTimeout(800);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const loadingSelectors = [
    "[data-loading='true']",
    "[aria-busy='true']",
    ".animate-spin",
    ".loading",
    ".spinner",
  ];
  for (const selector of loadingSelectors) {
    await page.waitForSelector(selector, { state: "detached", timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(400);
};

const solveCaptchaIfPresent = async (page) => {
  const captchaInput = page.getByLabel("Masukkan kode captcha");
  if (await captchaInput.isVisible().catch(() => false)) {
    const captchaText = await page.locator("div.font-mono.text-xl").textContent();
    const cleaned = (captchaText || "").replace(/\s+/g, "").trim();
    if (cleaned.length > 0) {
      await captchaInput.fill(cleaned);
    }
  }
};

const login = async (page, { email, password }) => {
  await page.goto(`${BASE_URL}/org/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await solveCaptchaIfPresent(page);
  await page.getByRole("button", { name: /Masuk|Login/i }).click();
  await page.waitForTimeout(1200);
  try {
    await page.waitForURL(
      (url) => url.pathname.startsWith("/org") && !url.pathname.startsWith("/org/login"),
      { timeout: 20000 },
    );
  } catch (error) {
    const failShot = path.join(OUT_DIR, "00-login-gagal.png");
    await page.screenshot({ path: failShot, fullPage: true });
    throw new Error("Login gagal (tetap berada di /org/login). Periksa kredensial uji.");
  }
  await waitForAppReady(page);
};

const clickMenu = async (page, name) => {
  const menu = page.getByRole("button", { name });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
  } else {
    const item = page.getByText(name, { exact: true });
    await item.click();
  }
};

const gotoMenuPath = async (page, path) => {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
};

const selectFirstOption = async (page, trigger) => {
  await trigger.click();
  const option = page.getByRole("option").first();
  await option.click();
};

const selectOptionByText = async (page, text) => {
  const option = page.getByRole("option", { name: text, exact: false }).first();
  await option.click();
};

const isVisible = async (locator) => locator.isVisible().catch(() => false);

const safeClick = async (locator) => {
  if (await isVisible(locator)) {
    await locator.click();
    return true;
  }
  return false;
};

const capture = async (page, index, title) => {
  const fileName = `${String(index).padStart(2, "0")}-${slugify(title)}.png`;
  const target = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: target, fullPage: true });
  return { index, title, fileName };
};

const main = async () => {
  ensureDir(OUT_DIR);
  const creds = readCreds();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await login(page, creds);

  const steps = [];

  // HR: Data Pegawai (filter 1 pegawai)
  await gotoMenuPath(page, "/org/hr/employees");
  const searchEmployee = page.getByPlaceholder("Cari nama, NIP, atau jabatan...");
  if (await searchEmployee.isVisible().catch(() => false)) {
    await searchEmployee.fill(EMPLOYEE_NAME);
  }
  await waitForAppReady(page);
  steps.push(await capture(page, steps.length + 1, "HR Data Pegawai"));

  // HR: Kontrak Kerja
  await gotoMenuPath(page, "/org/hr/contracts");
  steps.push(await capture(page, steps.length + 1, "HR Kontrak Kerja"));

  // Payroll: Periode Payroll
  await gotoMenuPath(page, "/org/payroll/periods");
  steps.push(await capture(page, steps.length + 1, "Payroll Periode"));

  // Payroll: Input Variabel (buat 1 data)
  await gotoMenuPath(page, "/org/payroll/variable-input");
  const inputOpened = await safeClick(page.getByRole("button", { name: "Tambah Input" }));
  if (inputOpened) {
    const dialog = page.getByRole("dialog");
    await selectFirstOption(page, dialog.getByRole("combobox").nth(0));
    await selectFirstOption(page, dialog.getByRole("combobox").nth(1));
    await selectFirstOption(page, dialog.getByRole("combobox").nth(2));
    await dialog.getByRole("combobox").nth(3).click();
    await selectOptionByText(page, EMPLOYEE_NAME);
    await dialog.locator("#component_code").fill("HRFLOW01");
    await dialog.locator("#component_name").fill("Uji Coba Payroll");
    await dialog.locator("#amount").fill("150000");
    await dialog.locator("#trace_id").fill(`FLOW-${Date.now()}`);
    await dialog.locator("#notes").fill("Input variabel dari alur HR -> Payroll");
    await safeClick(dialog.getByRole("button", { name: "Simpan" }));
    await waitForAppReady(page);
  }
  steps.push(await capture(page, steps.length + 1, "Payroll Input Variabel"));

  // Payroll: Validasi Payroll (buat 1 validasi)
  await gotoMenuPath(page, "/org/payroll/validation");
  const validationOpened = await safeClick(
    page.getByRole("button", { name: "Tambah Validasi Payroll" }),
  );
  if (validationOpened) {
    const valDialog = page.getByRole("dialog");
    await selectFirstOption(page, valDialog.getByRole("combobox").first());
    await valDialog.getByRole("combobox").nth(1).click();
    await selectOptionByText(page, "Perlu Perhatian");
    await valDialog.locator("#issue_count").fill("1");
    await valDialog.locator("#critical_count").fill("0");
    await valDialog.locator("#trace_id").fill(`VAL-${Date.now()}`);
    await valDialog.locator("#summary_json").fill("{}");
    await safeClick(valDialog.getByRole("button", { name: "Simpan" }));
    await waitForAppReady(page);
  }
  steps.push(await capture(page, steps.length + 1, "Payroll Validasi"));

  // Payroll: Proses Payroll (buat run)
  await gotoMenuPath(page, "/org/payroll/run-engine");
  let runTraceId = null;
  const runOpened = await safeClick(page.getByRole("button", { name: "Buat Proses" }));
  if (runOpened) {
    const runDialog = page.getByRole("dialog");
    await selectFirstOption(page, runDialog.getByRole("combobox").first());
    runTraceId = `RUN-${Date.now()}`;
    await runDialog.locator("#trace_id").fill(runTraceId);
    await runDialog.locator("#notes").fill("Run payroll dari alur HR -> Payroll");
    await safeClick(runDialog.getByRole("button", { name: "Simpan" }));
    await waitForAppReady(page);
  }
  steps.push(await capture(page, steps.length + 1, "Payroll Proses"));

  // Payroll: Persetujuan Payroll (sync dan approve)
  await gotoMenuPath(page, "/org/payroll/approval");
  const syncButton = page.getByRole("button", { name: "Sync dari Run" });
  if (await isVisible(syncButton)) {
    await syncButton.click();
    await waitForAppReady(page);
  }
  const searchApproval = page.getByPlaceholder("Cari trace approval, trace run, atau catatan...");
  if (runTraceId && (await isVisible(searchApproval))) {
    await searchApproval.fill(runTraceId);
  }
  await waitForAppReady(page);
  steps.push(await capture(page, steps.length + 1, "Payroll Persetujuan"));

  // Payroll: Slip Gaji
  await gotoMenuPath(page, "/org/payroll/slips");
  steps.push(await capture(page, steps.length + 1, "Payroll Slip Gaji"));

  // Payroll: Pembayaran Payroll
  await gotoMenuPath(page, "/org/payroll/payment");
  steps.push(await capture(page, steps.length + 1, "Payroll Pembayaran"));

  fs.writeFileSync(path.join(ROOT, "tmp", "hr-payroll-flow-steps.json"), JSON.stringify(steps, null, 2));
  await browser.close();
  console.log("Flow screenshots generated.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
