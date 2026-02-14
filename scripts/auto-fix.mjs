#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

const steps = [
  { label: "Auto-fix lint (eslint --fix)", command: ["npm", "run", "lint:fix"] },
  { label: "Validate lint", command: ["npm", "run", "lint"] },
  { label: "Validate build", command: ["npm", "run", "build"] },
];

const run = (label, command) => {
  console.log(`\n=== ${label} ===`);
  const [cmd, ...args] = command;
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: isWindows,
  });
  return result.status ?? 1;
};

let hasFailure = false;
for (const step of steps) {
  const exitCode = run(step.label, step.command);
  if (exitCode !== 0) {
    hasFailure = true;
  }
}

if (hasFailure) {
  console.error("\nAuto-fix selesai, tetapi masih ada error yang perlu perbaikan manual.");
  process.exit(1);
}

console.log("\nAuto-fix selesai. Lint dan build sudah lolos.");
