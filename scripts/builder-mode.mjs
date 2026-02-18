#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);

function readFlag(name) {
  return args.includes(name);
}

function readOption(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const profile = readOption("--profile", "quick");
const task = readOption("--task", "");
const maxParallel = Number.parseInt(readOption("--max-parallel", "3"), 10) || 3;
const skipOrchestrate = readFlag("--skip-orchestrate");
const skipAutofix = readFlag("--skip-autofix");
const skipValidate = readFlag("--skip-validate");
const withSmoke = readFlag("--with-smoke");
const dryRun = readFlag("--dry-run");

const startedAt = Date.now();
const runId = `BLD-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function labelCmd(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function run(command, commandArgs, options = {}) {
  const commandLabel = options.label || labelCmd(command, commandArgs);
  if (dryRun) {
    log(`[DRY-RUN] ${commandLabel}`);
    return Promise.resolve({ ok: true, code: 0, label: commandLabel, durationMs: 0 });
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        label: commandLabel,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        label: commandLabel,
        durationMs: Date.now() - start,
      });
    });
  });
}

async function runParallel(items, parallel = 2) {
  const queue = [...items];
  const output = [];
  const workers = Array.from({ length: Math.max(1, parallel) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const result = await run(next.command, next.args, { label: next.label });
      output.push(result);
      const status = result.ok ? "OK" : "FAIL";
      log(`[${status}] ${result.label} (${result.durationMs}ms)`);
    }
  });
  await Promise.all(workers);
  return output;
}

async function main() {
  log(`=== Builder Mode (${profile}) [${runId}] ===`);

  if (task && !skipOrchestrate) {
    log("Step 1/3: Orkestrasi task model");
    const taskArg = ["run", "orchestrate:models", "--", "--task", task];
    const plan = await run("npm", taskArg, {
      label: `npm ${taskArg.join(" ")}`,
    });
    if (!plan.ok) {
      log(`[ERR-${runId}] Orkestrasi model gagal (code ${plan.code}).`);
      process.exitCode = 1;
      return;
    }
  }

  if (!skipAutofix) {
    log("Step 2/3: Autofix");
    const autofix = await run("npm", ["run", "autofix"], { label: "npm run autofix" });
    if (!autofix.ok) {
      log(`[WARN-${runId}] Autofix gagal (code ${autofix.code}), lanjut ke validasi.`);
    }
  }

  if (skipValidate) {
    log("Step 3/3: Validasi dilewati (--skip-validate).");
    log(`DONE [${runId}] ${Date.now() - startedAt}ms`);
    return;
  }

  const baseValidation = [
    { command: "npm", args: ["run", "lint"], label: "npm run lint" },
    { command: "npm", args: ["run", "test"], label: "npm run test" },
    { command: "npm", args: ["run", "build"], label: "npm run build" },
  ];

  const fullExtras = [
    { command: "npm", args: ["run", "ops:readiness"], label: "npm run ops:readiness" },
    { command: "npm", args: ["run", "routes:trace"], label: "npm run routes:trace" },
  ];

  const smokeExtras = [
    { command: "npm", args: ["run", "smoke:dashboard"], label: "npm run smoke:dashboard" },
    { command: "npm", args: ["run", "smoke:attendance"], label: "npm run smoke:attendance" },
  ];

  const validations = [...baseValidation];
  if (profile === "full") validations.push(...fullExtras);
  if (withSmoke) validations.push(...smokeExtras);

  log(`Step 3/3: Validasi paralel (${validations.length} task, max ${maxParallel})`);
  const results = await runParallel(validations, maxParallel);
  const failed = results.filter((r) => !r.ok);

  log("=== Ringkasan ===");
  log(`Run ID: ${runId}`);
  log(`Durasi total: ${Date.now() - startedAt}ms`);
  log(`Validasi sukses: ${results.length - failed.length}/${results.length}`);

  if (failed.length > 0) {
    for (const item of failed) {
      log(`- FAIL: ${item.label} (code ${item.code})`);
    }
    log(`Risiko tersisa: ${failed.length} task validasi gagal. Ref: ERR-${runId}`);
    process.exitCode = 1;
    return;
  }

  log("Risiko tersisa: tidak ada dari batch validasi yang dijalankan.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`[ERR-${runId}] builder-mode crash: ${message}`);
  process.exitCode = 1;
});

