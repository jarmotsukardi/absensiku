#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const includeAttendance = args.has("--with-attendance");
const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173";

const runPrefixed = (label, command, commandArgs) =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      shell: isWindows,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const write = (chunk, isError = false) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      for (const line of lines) {
        const out = `[${label}] ${line}\n`;
        if (isError) {
          process.stderr.write(out);
        } else {
          process.stdout.write(out);
        }
      }
    };

    child.stdout.on("data", (chunk) => write(chunk, false));
    child.stderr.on("data", (chunk) => write(chunk, true));
    child.on("close", (code) => resolve(code ?? 1));
  });

const checkServerUp = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(BASE_URL, { signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

async function main() {
  process.stdout.write("E2E smoke suite dimulai.\n");

  const readinessCode = await runPrefixed("ops:readiness", "npm", ["run", "ops:readiness"]);
  if (readinessCode !== 0) {
    process.stderr.write("ops:readiness belum siap. Lengkapi file ops lokal terlebih dahulu.\n");
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    process.stdout.write("Check-only mode: readiness valid, suite tidak dijalankan.\n");
    return;
  }

  const serverUp = await checkServerUp();
  if (!serverUp) {
    process.stderr.write(
      `Server tidak terdeteksi di ${BASE_URL}. Jalankan dev server dulu, misalnya: npm run dev -- --host 127.0.0.1 --port 5173\n`,
    );
    process.exitCode = 1;
    return;
  }

  const suites = [
    { label: "smoke:login", args: ["run", "smoke:login"] },
    { label: "smoke:dashboard", args: ["run", "smoke:dashboard"] },
  ];

  if (includeAttendance) {
    suites.push({ label: "smoke:attendance", args: ["run", "smoke:attendance"] });
  }

  process.stdout.write(`Menjalankan ${suites.length} suite secara paralel.\n`);
  const startedAt = Date.now();
  const results = await Promise.all(
    suites.map(async (suite) => ({
      label: suite.label,
      code: await runPrefixed(suite.label, "npm", suite.args),
    })),
  );

  const failed = results.filter((result) => result.code !== 0);
  process.stdout.write(`Durasi total: ${Math.round((Date.now() - startedAt) / 1000)} detik.\n`);
  if (failed.length > 0) {
    process.stderr.write(`Suite gagal: ${failed.map((item) => item.label).join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Semua E2E smoke suite lulus.\n");
}

main().catch((error) => {
  process.stderr.write(`e2e-smoke-suite error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
