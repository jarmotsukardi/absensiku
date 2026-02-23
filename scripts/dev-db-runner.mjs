#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const ROOT_DIR = process.cwd();
const COMPOSE_FILE = path.join(ROOT_DIR, "docker-compose.dev.yml");
const MIGRATIONS_LOCAL_DIR = path.join(ROOT_DIR, "docker", "postgres", "migrations");
const MIGRATIONS_SUPABASE_DIR = path.join(ROOT_DIR, "supabase", "migrations");
const DEFAULT_SEED_FILE = path.join(ROOT_DIR, "docker", "postgres", "seed.sql");
const action = process.argv[2] ?? "";
const args = process.argv.slice(3);

function getArgValue(name) {
  const key = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(key));
  if (inline) return inline.slice(key.length);
  const index = args.indexOf(name);
  if (index > -1) return args[index + 1] ?? "";
  return "";
}

const sourceArg = getArgValue("--source") || "local";
const fileArg = getArgValue("--file");
const customFileArg = fileArg ? fileArg : "";

function makeErrorRef() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ERR-DBDEV-${stamp}`;
}

function run(command, args, { input, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: quiet ? ["pipe", "ignore", "ignore"] : ["pipe", "inherit", "inherit"],
      shell: false,
    });

    child.on("error", () => resolve({ code: -1 }));
    child.on("close", (code) => resolve({ code: code ?? -1 }));

    if (typeof input === "string") {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveMigrationSources() {
  const source = sourceArg.toLowerCase();
  if (source === "local") {
    return [{ key: "local", dir: MIGRATIONS_LOCAL_DIR }];
  }
  if (source === "supabase") {
    return [{ key: "supabase", dir: MIGRATIONS_SUPABASE_DIR }];
  }
  if (source === "all") {
    return [
      { key: "local", dir: MIGRATIONS_LOCAL_DIR },
      { key: "supabase", dir: MIGRATIONS_SUPABASE_DIR },
    ];
  }
  return null;
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

function getPostgresCredentials() {
  const user = process.env.DOCKER_DEV_POSTGRES_USER || "absensiku";
  const database = process.env.DOCKER_DEV_POSTGRES_DB || "absensiku_dev";
  return { user, database };
}

function sanitizeSupabaseSql(sqlContent) {
  const rules = [
    /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?pg_cron"?\s+WITH\s+SCHEMA\s+[a-zA-Z_][a-zA-Z0-9_]*\s*;/gi,
    /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?pg_net"?\s+WITH\s+SCHEMA\s+[a-zA-Z_][a-zA-Z0-9_]*\s*;/gi,
  ];

  let sanitized = sqlContent;
  for (const pattern of rules) {
    sanitized = sanitized.replace(pattern, "-- stripped by dev-db-runner: unsupported local extension;\n");
  }
  return sanitized;
}

async function runSql(compose, sqlContent, label) {
  const { user, database } = getPostgresCredentials();
  const args = [
    ...compose.prefixArgs,
    "-f",
    COMPOSE_FILE,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    user,
    "-d",
    database,
  ];

  process.stdout.write(`\n[db] Menjalankan ${label}\n`);
  return run(compose.command, args, { input: sqlContent, quiet: false });
}

async function runMigrate(compose) {
  const sources = resolveMigrationSources();
  if (!sources) {
    process.stderr.write("[db] Nilai --source tidak valid. Gunakan: local | supabase | all\n");
    return 1;
  }

  let totalExecuted = 0;

  for (const source of sources) {
    if (!(await exists(source.dir))) {
      process.stdout.write(`[db] Folder migration (${source.key}) tidak ditemukan: ${path.relative(ROOT_DIR, source.dir)}\n`);
      continue;
    }

    const files = (await fs.readdir(source.dir))
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      process.stdout.write(`[db] Tidak ada file migration (*.sql) di ${path.relative(ROOT_DIR, source.dir)}\n`);
      continue;
    }

    process.stdout.write(`\n[db] Menjalankan source migration: ${source.key} (${files.length} file)\n`);

    for (const fileName of files) {
      const fullPath = path.join(source.dir, fileName);
      let content = await fs.readFile(fullPath, "utf8");
      if (source.key === "supabase") {
        content = sanitizeSupabaseSql(content);
      }
      const label = `migration ${source.key}/${fileName}`;
      const result = await runSql(compose, content, label);
      if (result.code !== 0) return result.code;
      totalExecuted += 1;
    }
  }

  if (totalExecuted === 0) {
    process.stdout.write("\n[db] Tidak ada migration yang dijalankan.\n");
    return 0;
  }

  process.stdout.write(`\n[db] Migration selesai (${totalExecuted} file).\n`);
  return 0;
}

async function runSeed(compose) {
  const seedPath = customFileArg ? path.resolve(ROOT_DIR, customFileArg) : DEFAULT_SEED_FILE;

  if (!(await exists(seedPath))) {
    process.stdout.write(`[db] Seed file tidak ditemukan: ${path.relative(ROOT_DIR, seedPath)}\n`);
    process.stdout.write("[db] Seed dilewati (no-op).\n");
    return 0;
  }

  const content = await fs.readFile(seedPath, "utf8");
  const result = await runSql(compose, content, `seed ${path.relative(ROOT_DIR, seedPath)}`);
  if (result.code === 0) {
    process.stdout.write("\n[db] Seed selesai.\n");
  }
  return result.code;
}

async function main() {
  if (action !== "migrate" && action !== "seed") {
    process.stderr.write("Gunakan: node scripts/dev-db-runner.mjs <migrate|seed> [--source local|supabase|all] [--file path.sql]\n");
    process.exitCode = 1;
    return;
  }

  if (!(await exists(COMPOSE_FILE))) {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] docker-compose.dev.yml tidak ditemukan.\n`);
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

  const code = action === "migrate" ? await runMigrate(compose) : await runSeed(compose);
  if (code !== 0) {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] Eksekusi DB gagal. Pastikan service sudah aktif: npm run docker:up\n`);
    process.exitCode = code;
  }
}

main().catch((error) => {
  const ref = makeErrorRef();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ref}] dev-db-runner error: ${message}\n`);
  process.exitCode = 1;
});
