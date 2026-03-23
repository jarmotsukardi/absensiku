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
  requests: ["tests/e2e/org-leave-requests-filter-pagination.e2e.ts"],
  approved: ["tests/e2e/org-leave-approved-report-sync.e2e.ts"],
  alerts: ["tests/e2e/org-hard-request-alert-badge.e2e.ts"],
  all: [
    "tests/e2e/org-leave-requests-filter-pagination.e2e.ts",
    "tests/e2e/org-leave-approved-report-sync.e2e.ts",
    "tests/e2e/org-hard-request-alert-badge.e2e.ts",
  ],
};

const reportDirBySuite = {
  requests: "artifacts/playwright-report-leave-requests",
  approved: "artifacts/playwright-report-leave-approved",
  alerts: "artifacts/playwright-report-leave-alerts",
  all: "artifacts/playwright-report-leave-all",
};

const envBySuite = {
  requests: {
    E2E_ORG_LEAVE_FILTER_PAGINATION: "1",
  },
  approved: {
    E2E_ORG_LEAVE_APPROVED_REPORT_SYNC: "1",
  },
  alerts: {
    E2E_ORG_HARD_REQUEST_ALERT: "1",
  },
  all: {
    E2E_ORG_LEAVE_FILTER_PAGINATION: "1",
    E2E_ORG_LEAVE_APPROVED_REPORT_SYNC: "1",
    E2E_ORG_HARD_REQUEST_ALERT: "1",
  },
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
    envFlags: envBySuite[suite],
    headed: args.headed,
    grep: args.grep,
    doctor: args.doctor,
    dryRun: args.dryRun,
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
          envFlags: plan.envFlags,
          headed: plan.headed,
          grep: plan.grep,
          doctor: plan.doctor,
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
  if (plan.headed) pwArgs.push("--headed");
  if (plan.grep.trim().length > 0) pwArgs.push("--grep", plan.grep);
  const hasWorkersOverride = plan.passthrough.some(
    (arg) => arg === "--workers" || arg.startsWith("--workers="),
  );
  if (!hasWorkersOverride) {
    // Leave suites write test data; keep serial execution across files by default.
    pwArgs.push("--workers", "1");
  }
  pwArgs.push(...plan.passthrough);

  const code = await run("npx", pwArgs, {
    ...process.env,
    ...plan.envFlags,
    PLAYWRIGHT_HTML_OUTPUT_DIR: plan.reportDir,
  });
  process.exitCode = code;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`e2e-leave-suite error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
