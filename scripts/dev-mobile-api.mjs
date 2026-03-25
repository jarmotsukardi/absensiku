#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 3000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host") {
      args.host = argv[i + 1] || args.host;
      i += 1;
      continue;
    }
    if (arg === "--port") {
      args.port = Number.parseInt(argv[i + 1] || String(args.port), 10) || args.port;
      i += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(
    `[dev-mobile-api] Menjalankan mobile-api lokal di http://${args.host}:${args.port}\n`
  );

  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(process.cwd(), "scripts/dev-mobile-api-server.mjs"),
      "--host",
      args.host,
      "--port",
      String(args.port),
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      shell: false,
    }
  );

  child.on("error", (error) => {
    process.stderr.write(`[dev-mobile-api] Gagal menjalankan mobile-api lokal: ${error.message}\n`);
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
}

await main();
