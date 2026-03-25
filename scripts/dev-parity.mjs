#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

function spawnChild(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
}

const host = "127.0.0.1";
const mobileApiPort = "3000";
const webPort = "5173";
const children = [];
let exiting = false;

function shutdown(signal = "SIGTERM") {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.stdout.write(
  `[dev-parity] Menjalankan mobile-api di http://${host}:${mobileApiPort} dan web di http://${host}:${webPort}\n`
);

const mobileApi = spawnChild("node", ["scripts/dev-mobile-api.mjs", "--host", host, "--port", mobileApiPort]);
children.push(mobileApi);

const web = spawnChild("npm", ["run", "dev", "--", "--host", host, "--port", webPort], {
  ABSENSIKU_MOBILE_API_PROXY_TARGET: `http://${host}:${mobileApiPort}`,
});
children.push(web);

mobileApi.on("close", (code) => {
  if (!exiting) {
    shutdown("SIGTERM");
    process.exit(code ?? 1);
  }
});

web.on("close", (code) => {
  if (!exiting) {
    shutdown("SIGTERM");
    process.exit(code ?? 1);
  }
});
