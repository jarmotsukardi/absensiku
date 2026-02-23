#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const ROOT_DIR = process.cwd();
const COMPOSE_FILE = path.join(ROOT_DIR, "docker-compose.dev.yml");
const action = process.argv[2] ?? "";

function makeErrorRef() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ERR-DOCKERDEV-${stamp}`;
}

function run(command, args, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: quiet ? ["ignore", "ignore", "ignore"] : "inherit",
      shell: false,
    });

    child.on("error", () => resolve({ code: -1 }));
    child.on("close", (code) => resolve({ code: code ?? -1 }));
  });
}

async function resolveComposeCommand() {
  const dockerComposeV2 = await run("docker", ["compose", "version"], { quiet: true });
  if (dockerComposeV2.code === 0) {
    return { command: "docker", prefixArgs: ["compose"] };
  }

  const dockerComposeV1 = await run("docker-compose", ["version"], { quiet: true });
  if (dockerComposeV1.code === 0) {
    return { command: "docker-compose", prefixArgs: [] };
  }

  return null;
}

async function runCompose(compose, args) {
  return run(compose.command, [...compose.prefixArgs, "-f", COMPOSE_FILE, ...args]);
}

async function main() {
  if (!["up", "down", "ps", "logs", "reset"].includes(action)) {
    process.stderr.write("Gunakan: node scripts/dev-docker.mjs <up|down|ps|logs|reset>\n");
    process.exitCode = 1;
    return;
  }

  const compose = await resolveComposeCommand();
  if (!compose) {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] Docker Compose tidak terdeteksi. Install Docker Desktop terlebih dulu.\n`);
    process.exitCode = 1;
    return;
  }

  if (action === "up") {
    const result = await runCompose(compose, ["up", "-d", "--remove-orphans"]);
    if (result.code !== 0) {
      const ref = makeErrorRef();
      process.stderr.write(`[${ref}] Gagal menyalakan service Docker.\n`);
      process.exitCode = result.code;
    }
    return;
  }

  if (action === "down") {
    const result = await runCompose(compose, ["down", "--remove-orphans"]);
    if (result.code !== 0) {
      const ref = makeErrorRef();
      process.stderr.write(`[${ref}] Gagal menghentikan service Docker.\n`);
      process.exitCode = result.code;
    }
    return;
  }

  if (action === "ps") {
    const result = await runCompose(compose, ["ps"]);
    if (result.code !== 0) {
      const ref = makeErrorRef();
      process.stderr.write(`[${ref}] Gagal membaca status service Docker.\n`);
      process.exitCode = result.code;
    }
    return;
  }

  if (action === "logs") {
    const tail = process.env.DOCKER_DEV_LOG_TAIL || "150";
    const result = await runCompose(compose, ["logs", "-f", "--tail", tail]);
    if (result.code !== 0 && result.code !== 130) {
      const ref = makeErrorRef();
      process.stderr.write(`[${ref}] Gagal membaca log service Docker.\n`);
      process.exitCode = result.code;
    }
    return;
  }

  const down = await runCompose(compose, ["down", "-v", "--remove-orphans"]);
  if (down.code !== 0) {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] Gagal reset volume (step down).\n`);
    process.exitCode = down.code;
    return;
  }

  const up = await runCompose(compose, ["up", "-d", "--remove-orphans"]);
  if (up.code !== 0) {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] Gagal reset volume (step up).\n`);
    process.exitCode = up.code;
  }
}

main().catch((error) => {
  const ref = makeErrorRef();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ref}] dev-docker error: ${message}\n`);
  process.exitCode = 1;
});
