#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { ensureRoleCredentials, readTestAccounts } from "./lib/test-accounts.mjs";

const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173";
const TABS = ["home", "history", "requests", "notifications", "help", "profile"];
const RECORD_FILE = path.join(process.cwd(), "ops", "test-runs.local.jsonl");

const readAccounts = async () => {
  return readTestAccounts();
};

const ensureEmployeeCreds = (accounts) => {
  return ensureRoleCredentials(accounts, "employee");
};

const appendRecord = async (record) => {
  await fs.mkdir(path.dirname(RECORD_FILE), { recursive: true });
  await fs.appendFile(RECORD_FILE, `${JSON.stringify(record)}\n`, "utf8");
};

const deleteRecordedRun = async () => {
  try {
    await fs.writeFile(RECORD_FILE, "", "utf8");
    return true;
  } catch {
    return false;
  }
};

const gotoTab = async (page, tab) => {
  const url = tab === "home" ? `${BASE_URL}/dashboard` : `${BASE_URL}/dashboard?tab=${tab}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // fallback when long-polling/continuous requests exist
  }
  await page.waitForTimeout(900);
  return page.url();
};

const run = async () => {
  const runId = `DASH-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const accounts = await readAccounts();
  const { email, password } = ensureEmployeeCreds(accounts);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown",
    });
  });

  try {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);

    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((s) => (s.textContent || "").trim()).join("")
    );

    if (!captchaText || captchaText.length < 6) {
      throw new Error("Captcha tidak terbaca dari halaman login.");
    }

    await page.fill("#captcha-input", captchaText);

    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20000 }),
      page.getByRole("button", { name: "Masuk" }).click(),
    ]);

    await page.evaluate(() => {
      if (typeof window.clearAbsensikuErrorLogs === "function") {
        window.clearAbsensikuErrorLogs();
      }
    });

    const tabResults = [];
    for (const tab of TABS) {
      const finalUrl = await gotoTab(page, tab);
      tabResults.push({ tab, url: finalUrl });
    }

    const appLogs = await page.evaluate(() => {
      const logs = typeof window.absensikuErrorLogs === "function" ? window.absensikuErrorLogs() : [];
      return logs.slice(-20);
    });
    const noisyAppLogs = appLogs.filter((log) => log.context === "fetch.network_error");
    const criticalAppLogs = appLogs.filter((log) => log.context !== "fetch.network_error");
    const noisyConsoleErrors = consoleErrors.filter((line) => line.includes("fetch.network_error"));
    const criticalConsoleErrors = consoleErrors.filter((line) => !line.includes("fetch.network_error"));
    const criticalFailedRequests = failedRequests.filter((req) => req.failure !== "net::ERR_ABORTED");

    console.log("=== Dashboard Smoke Result ===");
    console.log(`base_url: ${BASE_URL}`);
    console.log(`logged_in_as: ${email}`);
    console.log("tabs:");
    tabResults.forEach((item) => {
      console.log(`- ${item.tab}: ${item.url}`);
    });
    console.log(`console_errors: ${consoleErrors.length}`);
    if (criticalConsoleErrors.length > 0) {
      console.log(`critical_console_errors: ${criticalConsoleErrors.length}`);
      criticalConsoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }
    if (noisyConsoleErrors.length > 0) {
      console.log(`noisy_console_errors(fetch.network_error): ${noisyConsoleErrors.length}`);
    }
    console.log(`app_error_logs: ${appLogs.length}`);
    if (criticalAppLogs.length > 0) {
      console.log(`critical_app_error_logs: ${criticalAppLogs.length}`);
      criticalAppLogs.forEach((log) => {
        console.log(`  - ${log.id} | ${log.context} | ${log.message}`);
      });
    }
    if (noisyAppLogs.length > 0) {
      console.log(`noisy_app_error_logs(fetch.network_error): ${noisyAppLogs.length}`);
    }
    if (criticalFailedRequests.length > 0) {
      console.log(`critical_failed_requests: ${criticalFailedRequests.length}`);
      criticalFailedRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. [${req.method}] ${req.url} -> ${req.failure}`);
      });
    }

    const status =
      criticalConsoleErrors.length > 0 || criticalAppLogs.length > 0 || criticalFailedRequests.length > 0
        ? "FAIL"
        : noisyConsoleErrors.length > 0 || noisyAppLogs.length > 0
          ? "PASS_WITH_WARNINGS"
          : "PASS";
    if (status === "FAIL") {
      process.exitCode = 1;
    } else if (status === "PASS_WITH_WARNINGS") {
      console.log("status: PASS_WITH_WARNINGS");
    } else {
      console.log("status: PASS");
    }

    await appendRecord({
      run_id: runId,
      suite: "dashboard_smoke",
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      base_url: BASE_URL,
      actor: { role: "employee", email },
      tabs: tabResults,
      refs: {
        critical_app_error_ids: criticalAppLogs.map((x) => x.id).filter(Boolean),
        critical_failed_requests: criticalFailedRequests,
      },
    });
    const deleted = await deleteRecordedRun();
    console.log(`record_cleanup: ${deleted ? "DELETED_MANDATORY" : "DELETE_FAILED"}`);
    if (!deleted) {
      console.error("cleanup_error_ref: DASH-CLEANUP-FAILED");
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
};

run().catch(async (error) => {
  await appendRecord({
    run_id: `DASH-${Date.now()}`,
    suite: "dashboard_smoke",
    status: "FAIL_SCRIPT",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    base_url: BASE_URL,
    error: error instanceof Error ? error.message : String(error),
  });
  const deleted = await deleteRecordedRun();
  console.error(`record_cleanup: ${deleted ? "DELETED_MANDATORY" : "DELETE_FAILED"}`);
  if (!deleted) {
    console.error("cleanup_error_ref: DASH-CLEANUP-FAILED");
  }
  console.error(`dashboard-smoke error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
