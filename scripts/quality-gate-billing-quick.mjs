#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const skipAutofix = args.has("--skip-autofix");

const runWithPrefix = (label, command, commandArgs) =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      shell: isWindows,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const writeChunk = (chunk, isError = false) => {
      const text = chunk.toString();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const output = `[${label}] ${line}\n`;
        if (isError) process.stderr.write(output);
        else process.stdout.write(output);
      }
    };

    child.stdout.on("data", (chunk) => writeChunk(chunk, false));
    child.stderr.on("data", (chunk) => writeChunk(chunk, true));
    child.on("close", (code) => resolve(code ?? 1));
  });

const runStep = async (label, command, commandArgs) => {
  process.stdout.write(`\n=== ${label} ===\n`);
  const exitCode = await runWithPrefix(label, command, commandArgs);
  if (exitCode !== 0) {
    process.stderr.write(`\n${label} gagal (exit code ${exitCode}).\n`);
  }
  return exitCode;
};

async function main() {
  process.stdout.write("Billing quick quality gate dimulai.\n");

  if (!skipAutofix) {
    const autofixCode = await runStep("autofix", "npm", ["run", "autofix"]);
    if (autofixCode !== 0) {
      process.exitCode = 1;
      return;
    }
  } else {
    process.stdout.write("Lewati autofix (--skip-autofix).\n");
  }

  process.stdout.write("\n=== validasi paralel: lint + test + e2e billing minimal ===\n");

  const validations = [
    { label: "lint", command: "npm", args: ["run", "lint"] },
    { label: "test", command: "npm", args: ["run", "test"] },
    {
      label: "e2e-billing",
      command: "npm",
      args: [
        "run",
        "e2e:pw",
        "--",
        "tests/e2e/employee-billing-flow.e2e.ts",
        "tests/e2e/org-billing-flow.e2e.ts",
      ],
    },
  ];

  const results = await Promise.all(
    validations.map(async (step) => ({
      label: step.label,
      code: await runWithPrefix(step.label, step.command, step.args),
    })),
  );

  const failed = results.filter((result) => result.code !== 0);
  if (failed.length > 0) {
    process.stderr.write(
      `\nBilling quick quality gate gagal: ${failed
        .map((item) => `${item.label}(exit ${item.code})`)
        .join(", ")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write("\nBilling quick quality gate selesai: semua validasi lolos.\n");
}

main().catch((error) => {
  process.stderr.write(
    `quality-gate-billing-quick error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
