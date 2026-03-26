#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";

export const parseArgs = (argv) => {
  const parsed = {
    suite: "all",
    headed: false,
    grep: "",
    doctor: false,
    dryRun: false,
    accountKey: "",
    passthrough: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--suite=")) {
      parsed.suite = arg.slice("--suite=".length).trim() || "all";
      continue;
    }
    if (arg === "--suite") {
      parsed.suite = (argv[i + 1] || "all").trim() || "all";
      i += 1;
      continue;
    }
    if (arg.startsWith("--grep=")) {
      parsed.grep = arg.slice("--grep=".length);
      continue;
    }
    if (arg === "--grep") {
      const next = argv[i + 1] || "";
      if (next && !next.startsWith("--")) {
        parsed.grep = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--headed") {
      parsed.headed = true;
      continue;
    }
    if (arg === "--doctor") {
      parsed.doctor = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--account-key=")) {
      parsed.accountKey = arg.slice("--account-key=".length).trim();
      continue;
    }
    if (arg === "--account-key") {
      const next = (argv[i + 1] || "").trim();
      if (next && !next.startsWith("--")) {
        parsed.accountKey = next;
        i += 1;
      }
      continue;
    }
    parsed.passthrough.push(arg);
  }

  return parsed;
};

const run = (command, args, env = process.env) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: isWindows,
      stdio: "inherit",
      env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

const suiteFiles = {
  smoke: ["tests/e2e/org-hr-payroll-smoke.e2e.ts"],
  crud: ["tests/e2e/org-hr-payroll-crud.e2e.ts"],
  "payroll-smoke": ["tests/e2e/org-hr-payroll-smoke.e2e.ts"],
  "payroll-crud": ["tests/e2e/org-hr-payroll-crud.e2e.ts"],
  "hr-core": [
    "tests/e2e/org-hr-workspace-smoke.e2e.ts",
    "tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts",
    "tests/e2e/admin-hr-training-bundle-readonly.e2e.ts",
    "tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts",
    "tests/e2e/admin-hr-performance-readonly-bridge.e2e.ts",
    "tests/e2e/admin-hr-domain-coverage.e2e.ts",
  ],
  "hr-full": [
    "tests/e2e/org-hr-workspace-smoke.e2e.ts",
    "tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts",
    "tests/e2e/admin-hr-training-bundle-readonly.e2e.ts",
    "tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts",
    "tests/e2e/admin-hr-performance-readonly-bridge.e2e.ts",
    "tests/e2e/admin-hr-domain-coverage.e2e.ts",
    "tests/e2e/admin-hr-ats-coverage.e2e.ts",
    "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
    "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
    "tests/e2e/org-hr-ats-crud.e2e.ts",
  ],
  "payroll-full": [
    "tests/e2e/org-hr-payroll-smoke.e2e.ts",
    "tests/e2e/org-hr-payroll-crud.e2e.ts",
    "tests/e2e/org-payroll-role-matrix.e2e.ts",
    "tests/e2e/org-payroll-webhook-audit.e2e.ts",
  ],
  ats: [
    "tests/e2e/admin-hr-ats-coverage.e2e.ts",
    "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
    "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
    "tests/e2e/org-hr-ats-crud.e2e.ts",
  ],
  workspace: ["tests/e2e/org-hr-workspace-smoke.e2e.ts"],
  rolematrix: ["tests/e2e/org-payroll-role-matrix.e2e.ts"],
  webhook: ["tests/e2e/org-payroll-webhook-audit.e2e.ts"],
  all: [
    "tests/e2e/org-hr-payroll-smoke.e2e.ts",
    "tests/e2e/org-hr-payroll-crud.e2e.ts",
    "tests/e2e/admin-hr-ats-coverage.e2e.ts",
    "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
    "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
    "tests/e2e/org-hr-ats-crud.e2e.ts",
    "tests/e2e/org-hr-workspace-smoke.e2e.ts",
    "tests/e2e/org-payroll-role-matrix.e2e.ts",
    "tests/e2e/org-payroll-webhook-audit.e2e.ts",
  ],
};

const reportDirBySuite = {
  smoke: "artifacts/playwright-report-hr-smoke",
  crud: "artifacts/playwright-report-hr-crud",
  "payroll-smoke": "artifacts/playwright-report-hr-payroll-smoke",
  "payroll-crud": "artifacts/playwright-report-hr-payroll-crud",
  "hr-core": "artifacts/playwright-report-hr-core",
  "hr-full": "artifacts/playwright-report-hr-full",
  "payroll-full": "artifacts/playwright-report-hr-payroll-full",
  ats: "artifacts/playwright-report-hr-ats",
  workspace: "artifacts/playwright-report-hr-workspace",
  rolematrix: "artifacts/playwright-report-hr-rolematrix",
  webhook: "artifacts/playwright-report-hr-webhook",
  all: "artifacts/playwright-report-hr-all",
};

const suitePlaywrightArgs = {
  "hr-full": ["--workers=1"],
  "payroll-full": ["--workers=1"],
};

export const resolveRunPlan = (argv, env = process.env) => {
  const args = parseArgs(argv);
  if (!args.grep && typeof env.npm_config_grep === "string") {
    args.grep = env.npm_config_grep;
  }
  const suite = args.suite in suiteFiles ? args.suite : "all";
  return {
    suite,
    files: suiteFiles[suite],
    reportDir: reportDirBySuite[suite],
    playwrightArgs: suitePlaywrightArgs[suite] || [],
    headed: args.headed,
    grep: args.grep,
    doctor: args.doctor,
    dryRun: args.dryRun,
    accountKey: args.accountKey,
    passthrough: args.passthrough,
  };
};

async function main() {
  const plan = resolveRunPlan(process.argv.slice(2), process.env);

  if (plan.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          suite: plan.suite,
          files: plan.files,
          reportDir: plan.reportDir,
          playwrightArgs: plan.playwrightArgs,
          headed: plan.headed,
          grep: plan.grep,
          doctor: plan.doctor,
          accountKey: plan.accountKey,
          passthrough: plan.passthrough,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (plan.doctor) {
    const doctorCode = await run("npm", ["run", "ops:sandbox:doctor:strict", "--", "--skip-http"]);
    if (doctorCode !== 0) {
      process.exitCode = doctorCode;
      return;
    }
  }

  const pwArgs = ["playwright", "test", ...plan.files];
  pwArgs.push(...plan.playwrightArgs);
  if (plan.headed) pwArgs.push("--headed");
  if (plan.grep.trim().length > 0) pwArgs.push("--grep", plan.grep);
  pwArgs.push(...plan.passthrough);

  const code = await run("npx", pwArgs, {
    ...process.env,
    PLAYWRIGHT_HTML_OUTPUT_DIR: plan.reportDir,
    ...(plan.accountKey
      ? {
          PAYROLL_ACCOUNT_KEY: plan.accountKey,
        }
      : {}),
  });
  process.exitCode = code;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`e2e-hr-suite error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
