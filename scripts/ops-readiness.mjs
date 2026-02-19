#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OPS_DIR = path.join(ROOT, "ops");
const ACCOUNTS_TEMPLATE = path.join(OPS_DIR, "test-accounts.template.json");
const DATASET_TEMPLATE = path.join(OPS_DIR, "test-dataset.template.json");
const ACCOUNTS_LOCAL = path.join(OPS_DIR, "test-accounts.local.json");
const DATASET_LOCAL = path.join(OPS_DIR, "test-dataset.local.json");
const ROUTES_FILE = path.join(OPS_DIR, "smoke-routes.json");
const PROFILE_FILE = path.join(OPS_DIR, "working-profile.json");
const PLAYWRIGHT_CONFIG = path.join(ROOT, "playwright.config.ts");
const PLAYWRIGHT_SPEC = path.join(ROOT, "tests", "e2e", "role-login.e2e.ts");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const ENV_LOCAL = path.join(ROOT, ".env.local");

const args = new Set(process.argv.slice(2));
const isInit = args.has("--init");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readEnvValue(filePath, key) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${key}=`));
    if (!line) return "";
    return line.slice(key.length + 1).trim();
  } catch {
    return "";
  }
}

function getByPath(obj, pathExpr) {
  const keys = pathExpr.split(".");
  let cursor = obj;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function isFilled(value) {
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function pushMissing(missingList, label, value) {
  if (!isFilled(value)) missingList.push(label);
}

async function initLocalFromTemplate(templatePath, localPath) {
  const exists = await fileExists(localPath);
  if (exists) return false;
  const raw = await fs.readFile(templatePath, "utf8");
  await fs.writeFile(localPath, raw, "utf8");
  return true;
}

function printStatus(title, ok, detail = "") {
  const icon = ok ? "OK" : "MISSING";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${icon}] ${title}${suffix}`);
}

async function main() {
  const templateChecks = await Promise.all([
    fileExists(ACCOUNTS_TEMPLATE),
    fileExists(DATASET_TEMPLATE),
    fileExists(ROUTES_FILE),
    fileExists(PROFILE_FILE),
  ]);

  printStatus("ops/test-accounts.template.json", templateChecks[0]);
  printStatus("ops/test-dataset.template.json", templateChecks[1]);
  printStatus("ops/smoke-routes.json", templateChecks[2]);
  printStatus("ops/working-profile.json", templateChecks[3]);
  printStatus("playwright.config.ts", await fileExists(PLAYWRIGHT_CONFIG));
  printStatus("tests/e2e/role-login.e2e.ts", await fileExists(PLAYWRIGHT_SPEC));

  if (!templateChecks.every(Boolean)) {
    console.error("Template ops belum lengkap. Pastikan semua file di folder ops tersedia.");
    process.exitCode = 1;
    return;
  }

  if (isInit) {
    const initializedAccounts = await initLocalFromTemplate(ACCOUNTS_TEMPLATE, ACCOUNTS_LOCAL);
    const initializedDataset = await initLocalFromTemplate(DATASET_TEMPLATE, DATASET_LOCAL);
    printStatus("Init test-accounts.local.json", true, initializedAccounts ? "dibuat dari template" : "sudah ada");
    printStatus("Init test-dataset.local.json", true, initializedDataset ? "dibuat dari template" : "sudah ada");
  }

  const hasAccountsLocal = await fileExists(ACCOUNTS_LOCAL);
  const hasDatasetLocal = await fileExists(DATASET_LOCAL);
  printStatus("ops/test-accounts.local.json", hasAccountsLocal, hasAccountsLocal ? "" : "jalankan: npm run ops:readiness -- --init");
  printStatus("ops/test-dataset.local.json", hasDatasetLocal, hasDatasetLocal ? "" : "jalankan: npm run ops:readiness -- --init");

  if (!hasAccountsLocal || !hasDatasetLocal) {
    process.exitCode = 1;
    return;
  }

  let packageJson = {};
  try {
    packageJson = await readJson(PACKAGE_JSON);
  } catch {
    packageJson = {};
  }

  const scripts = typeof packageJson === "object" && packageJson ? packageJson.scripts || {} : {};
  const requiredScripts = ["qa:fast", "e2e:smoke", "e2e:pw"];
  const missingScripts = requiredScripts.filter((scriptName) => typeof scripts[scriptName] !== "string");
  printStatus(
    "Script quality/e2e",
    missingScripts.length === 0,
    missingScripts.length > 0 ? `kurang: ${missingScripts.join(", ")}` : "lengkap",
  );

  const accounts = await readJson(ACCOUNTS_LOCAL);
  const dataset = await readJson(DATASET_LOCAL);

  const missingAccounts = [];
  pushMissing(missingAccounts, "superadmin.email", getByPath(accounts, "superadmin.email"));
  pushMissing(missingAccounts, "superadmin.password", getByPath(accounts, "superadmin.password"));
  pushMissing(missingAccounts, "org_admin.email", getByPath(accounts, "org_admin.email"));
  pushMissing(missingAccounts, "org_admin.password", getByPath(accounts, "org_admin.password"));
  pushMissing(missingAccounts, "employee.email", getByPath(accounts, "employee.email"));
  pushMissing(missingAccounts, "employee.password", getByPath(accounts, "employee.password"));
  pushMissing(missingAccounts, "org_admin.tenant_id", getByPath(accounts, "org_admin.tenant_id"));
  pushMissing(missingAccounts, "employee.tenant_id", getByPath(accounts, "employee.tenant_id"));
  pushMissing(missingAccounts, "employee.employee_id", getByPath(accounts, "employee.employee_id"));

  const missingDataset = [];
  pushMissing(missingDataset, "tenant_primary.id", getByPath(dataset, "tenant_primary.id"));
  pushMissing(missingDataset, "tenant_primary.name", getByPath(dataset, "tenant_primary.name"));
  pushMissing(missingDataset, "sample_users.superadmin_email", getByPath(dataset, "sample_users.superadmin_email"));
  pushMissing(missingDataset, "sample_users.org_admin_email", getByPath(dataset, "sample_users.org_admin_email"));
  pushMissing(missingDataset, "sample_users.employee_email", getByPath(dataset, "sample_users.employee_email"));
  pushMissing(missingDataset, "core_scenarios.streak_monitoring.active_tenant_id", getByPath(dataset, "core_scenarios.streak_monitoring.active_tenant_id"));
  pushMissing(missingDataset, "core_scenarios.streak_monitoring.near_suspended_tenant_id", getByPath(dataset, "core_scenarios.streak_monitoring.near_suspended_tenant_id"));
  pushMissing(missingDataset, "core_scenarios.streak_monitoring.suspended_tenant_id", getByPath(dataset, "core_scenarios.streak_monitoring.suspended_tenant_id"));

  printStatus("Akun uji terisi", missingAccounts.length === 0, missingAccounts.length ? `kurang ${missingAccounts.length} field` : "lengkap");
  printStatus("Dataset uji terisi", missingDataset.length === 0, missingDataset.length ? `kurang ${missingDataset.length} field` : "lengkap");

  if (missingAccounts.length > 0) {
    console.log("Field akun yang belum diisi:");
    for (const item of missingAccounts) console.log(`- ${item}`);
  }
  if (missingDataset.length > 0) {
    console.log("Field dataset yang belum diisi:");
    for (const item of missingDataset) console.log(`- ${item}`);
  }

  if (missingAccounts.length > 0 || missingDataset.length > 0) {
    process.exitCode = 1;
    return;
  }

  const sentryDsn = await readEnvValue(ENV_LOCAL, "VITE_SENTRY_DSN");
  printStatus(
    "Observability Sentry (opsional)",
    sentryDsn.length > 0,
    sentryDsn.length > 0 ? "aktif di .env.local" : "belum diisi (boleh kosong untuk local dev)",
  );

  console.log("Ops readiness: SIAP. Saya bisa kerja lebih cepat dengan pembagian task paralel.");
}

main().catch((error) => {
  console.error(`ops-readiness error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
