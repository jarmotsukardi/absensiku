#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { ensureRoleCredentials, readTestAccounts } from "./lib/test-accounts.mjs";

const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173";
const RECORD_FILE = path.join(process.cwd(), "ops", "test-runs.local.jsonl");

const ROLE_CONFIG = {
  employee: {
    loginPath: "/auth",
    emailSelector: "#login-email",
    passwordSelector: "#login-password",
    submitLabel: "Masuk",
    successUrlPrefix: "/dashboard",
    captchaType: "simple",
  },
  org_admin: {
    loginPath: "/org/login",
    emailSelector: "#email",
    passwordSelector: "#password",
    submitLabel: "Masuk",
    successUrlPrefix: "/org",
    captchaType: "simple",
  },
  superadmin: {
    loginPath: "/admin/login",
    emailSelector: "#email",
    passwordSelector: "#password",
    submitLabel: "Masuk ke Panel Admin",
    successUrlPrefix: "/admin",
    captchaType: "math",
  },
};

function parseRolesArg() {
  const roleArg = process.argv.find((arg) => arg.startsWith("--role="));
  const raw = roleArg ? roleArg.split("=")[1] : "all";
  if (!raw || raw === "all") return ["employee", "org_admin", "superadmin"];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function evalMathCaptcha(expr) {
  const match = expr.match(/(\d+)\s*([+\-×])\s*(\d+)/);
  if (!match) return null;
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  return a * b;
}

async function solveSimpleCaptcha(page) {
  const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
    spans.map((s) => (s.textContent || "").trim()).join("")
  );
  if (!captchaText || captchaText.length < 6) {
    throw new Error("Captcha sederhana tidak terbaca.");
  }
  await page.fill("#captcha-input", captchaText);
}

async function solveMathCaptcha(page) {
  const labelText = await page
    .locator("label")
    .filter({ hasText: "Captcha: Berapa hasil dari" })
    .first()
    .textContent();
  const expr = (labelText || "").replace("Captcha: Berapa hasil dari", "").replace("?", "").trim();
  const result = evalMathCaptcha(expr);
  if (result === null) {
    throw new Error(`Captcha matematika tidak terbaca: "${labelText || "-"}"`);
  }
  await page.fill('input[placeholder="Jawaban"]', String(result));
}

async function ensureCaptcha(page, captchaType) {
  if (captchaType === "simple") {
    await solveSimpleCaptcha(page);
    return;
  }
  await solveMathCaptcha(page);
}

async function runRoleLogin(page, role, accounts) {
  const config = ROLE_CONFIG[role];
  if (!config) throw new Error(`Role tidak didukung: ${role}`);
  const creds = ensureRoleCredentials(accounts, role);
  const url = `${BASE_URL}${config.loginPath}`;

  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // Ignore long-running network connections.
  }

  await page.fill(config.emailSelector, creds.email);
  await page.fill(config.passwordSelector, creds.password);
  await ensureCaptcha(page, config.captchaType);

  await page.evaluate(() => {
    if (typeof window.clearAbsensikuErrorLogs === "function") {
      window.clearAbsensikuErrorLogs();
    }
  });

  await page.getByRole("button", { name: config.submitLabel }).click();
  await page.waitForTimeout(1800);

  const currentPath = new URL(page.url()).pathname;
  const normalizedLoginPath = config.loginPath.endsWith("/")
    ? config.loginPath.slice(0, -1)
    : config.loginPath;
  const normalizedCurrentPath = currentPath.endsWith("/")
    ? currentPath.slice(0, -1)
    : currentPath;
  const stillOnLoginPath = normalizedCurrentPath === normalizedLoginPath;
  const has2FAView =
    role === "superadmin"
      ? await page.getByText("Verifikasi 2FA", { exact: false }).first().isVisible().catch(() => false)
      : false;
  const isSuccess =
    ((!stillOnLoginPath && normalizedCurrentPath.startsWith(config.successUrlPrefix)) || has2FAView);

  const appLogs = await page.evaluate(() => {
    const logs = typeof window.absensikuErrorLogs === "function" ? window.absensikuErrorLogs() : [];
    return logs.slice(-10);
  });
  const logRefs = appLogs.map((entry) => entry?.id).filter(Boolean);

  return {
    role,
    loginUrl: url,
    finalUrl: page.url(),
    success: isSuccess,
    twoFactorPending: has2FAView,
    appLogRefs: logRefs,
  };
}

async function appendRecord(record) {
  await fs.mkdir(path.dirname(RECORD_FILE), { recursive: true });
  await fs.appendFile(RECORD_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

async function deleteRecordedRun() {
  try {
    await fs.writeFile(RECORD_FILE, "", "utf8");
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const runId = `LOGIN-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const roles = parseRolesArg();
  const accounts = await readTestAccounts();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const role of roles) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const roleResult = await runRoleLogin(page, role, accounts);
        results.push(roleResult);
      } catch (error) {
        results.push({
          role,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          appLogRefs: [],
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log("=== Login Smoke Result ===");
  console.log(`base_url: ${BASE_URL}`);
  for (const result of results) {
    console.log(`- role: ${result.role}`);
    console.log(`  success: ${result.success ? "YES" : "NO"}`);
    if (result.loginUrl) console.log(`  login_url: ${result.loginUrl}`);
    if (result.finalUrl) console.log(`  final_url: ${result.finalUrl}`);
    if (result.twoFactorPending) console.log("  note: 2FA view detected (credentials accepted, waiting OTP)");
    if (result.error) console.log(`  error: ${result.error}`);
    if (Array.isArray(result.appLogRefs) && result.appLogRefs.length > 0) {
      console.log(`  app_log_refs: ${result.appLogRefs.join(", ")}`);
    }
  }

  const failed = results.filter((r) => !r.success);
  const record = {
    run_id: runId,
    suite: "login_smoke",
    status: failed.length > 0 ? "FAIL" : "PASS",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    base_url: BASE_URL,
    roles,
    results,
  };
  await appendRecord(record);
  const deleted = await deleteRecordedRun();
  console.log(`record_cleanup: ${deleted ? "DELETED_MANDATORY" : "DELETE_FAILED"}`);
  if (!deleted) {
    console.error("cleanup_error_ref: LOGIN-CLEANUP-FAILED");
    process.exitCode = 1;
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const failRecord = {
    run_id: `LOGIN-${Date.now()}`,
    suite: "login_smoke",
    status: "FAIL_SCRIPT",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    base_url: BASE_URL,
    error: error instanceof Error ? error.message : String(error),
  };
  await appendRecord(failRecord);
  const deleted = await deleteRecordedRun();
  console.error(`record_cleanup: ${deleted ? "DELETED_MANDATORY" : "DELETE_FAILED"}`);
  if (!deleted) {
    console.error("cleanup_error_ref: LOGIN-CLEANUP-FAILED");
  }
  console.error(`login-smoke error: ${failRecord.error}`);
  process.exitCode = 1;
});
