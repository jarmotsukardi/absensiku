#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE_URL = process.env.TUTORIAL_BASE_URL || "http://127.0.0.1:5173";
const OUTPUT_DIR = path.resolve(process.cwd(), "public/tutorials/screenshots");
const ACCOUNTS_PATH = path.resolve(process.cwd(), "ops/test-accounts.local.json");

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const solveMathExpression = (text) => {
  const match = text.match(/(\d+)\s*([+\-×])\s*(\d+)/);
  if (!match) return null;
  const left = Number(match[1]);
  const op = match[2];
  const right = Number(match[3]);
  if (op === "+") return String(left + right);
  if (op === "-") return String(left - right);
  if (op === "×") return String(left * right);
  return null;
};

const ensureOutputDir = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
};

const shot = async (page, fileName, waitMs = 700) => {
  await page.waitForTimeout(waitMs);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true,
  });
  process.stdout.write(`[shot] ${fileName}\n`);
};

const solveCaptchaFromPage = async (page) => {
  const labelText =
    (await page
      .locator("label")
      .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
      .first()
      .textContent()
      .catch(() => "")) || "";

  const mathAnswer = solveMathExpression(labelText);
  if (mathAnswer && (await page.locator("#captcha-input").count())) {
    await page.fill("#captcha-input", mathAnswer);
    return true;
  }

  const captchaText = await page
    .$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    )
    .catch(() => "");
  if (captchaText && (await page.locator("#captcha-input").count())) {
    await page.fill("#captcha-input", captchaText);
    return true;
  }

  return false;
};

const gotoAndShot = async (page, urlPath, fileName, waitMs = 900) => {
  await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: "domcontentloaded" });
  await shot(page, fileName, waitMs);
};

const loginOrgAdmin = async (page, creds) => {
  await page.goto(`${BASE_URL}/org/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await solveCaptchaFromPage(page);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/org(?!\/login)/, { timeout: 30000 });
};

const loginEmployee = async (page, creds) => {
  await page.goto(`${BASE_URL}/employee/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);

  if (await page.locator("#captcha-input").count()) {
    await solveCaptchaFromPage(page);
  }

  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/employee\/dashboard/, { timeout: 30000 });
};

const main = async () => {
  await ensureOutputDir();

  const accounts = await readJson(ACCOUNTS_PATH);
  const orgAdmin = accounts?.org_admin;
  const employee = accounts?.employee;

  if (!orgAdmin?.email || !orgAdmin?.password) {
    throw new Error("Kredensial org_admin di ops/test-accounts.local.json belum lengkap.");
  }
  if (!employee?.email || !employee?.password) {
    throw new Error("Kredensial employee di ops/test-accounts.local.json belum lengkap.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();

    await gotoAndShot(desktopPage, "/org/login", "01-org-login.png");
    await desktopPage.getByRole("tab", { name: "Daftar Organisasi" }).click();
    await shot(desktopPage, "02-org-register.png");

    await loginOrgAdmin(desktopPage, orgAdmin);
    await shot(desktopPage, "03-org-dashboard.png", 1200);
    await gotoAndShot(desktopPage, "/org/onboarding", "04-org-onboarding.png");
    await gotoAndShot(desktopPage, "/org/schedule/work-hours", "05-org-work-hours.png");
    await gotoAndShot(desktopPage, "/org/employees/active", "06-org-employees-active.png");
    await gotoAndShot(desktopPage, "/org/invitations", "07-org-invitations.png");
    await gotoAndShot(desktopPage, "/org/leave/requests", "08-org-leave-requests.png");
    await gotoAndShot(desktopPage, "/org/reports/attendance", "09-org-report-attendance.png");
    await gotoAndShot(desktopPage, "/org/help/faq", "10-org-help-faq.png");
    await gotoAndShot(desktopPage, "/org/help/tickets", "11-org-help-ticket.png");
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      ...devices["Pixel 7"],
    });
    const mobilePage = await mobileContext.newPage();

    await gotoAndShot(mobilePage, "/employee/login", "12-employee-login-mobile.png");
    await mobilePage.getByRole("tab", { name: "Daftar" }).click().catch(() => {});
    await shot(mobilePage, "13-employee-register-mobile.png");

    await loginEmployee(mobilePage, employee);
    await shot(mobilePage, "14-employee-dashboard-mobile.png", 1300);
    await gotoAndShot(mobilePage, "/employee/dashboard?tab=requests", "15-employee-requests-mobile.png");
    await gotoAndShot(mobilePage, "/employee/dashboard?tab=history", "16-employee-history-mobile.png");
    await gotoAndShot(mobilePage, "/employee/dashboard?tab=help", "17-employee-help-mobile.png");
    await gotoAndShot(mobilePage, "/employee/profile", "18-employee-profile-mobile.png");
    await mobileContext.close();
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  process.stderr.write(`[tutorial-screenshots] gagal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
