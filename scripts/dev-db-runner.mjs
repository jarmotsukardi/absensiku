#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
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
const baselineMode = args.includes("--baseline");
const MIGRATION_TRACKER_TABLE = "public.dev_schema_migrations";

function makeErrorRef() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ERR-DBDEV-${stamp}`;
}

function run(command, args, { input, quiet = false, capture = false } = {}) {
  return new Promise((resolve) => {
    const stdio = capture
      ? ["pipe", "pipe", "pipe"]
      : quiet
        ? ["pipe", "ignore", "ignore"]
        : ["pipe", "inherit", "inherit"];

    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", () => resolve({ code: -1, stdout, stderr }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));

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

async function runSqlCapture(compose, sqlContent, label = "") {
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
    "-At",
    "-F",
    "\t",
  ];

  if (label) {
    process.stdout.write(`\n[db] Menjalankan ${label}\n`);
  }

  return run(compose.command, args, { input: sqlContent, quiet: true, capture: true });
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveMigrationSourceByPath(fullPath) {
  const normalized = toPosixPath(fullPath);
  if (normalized.includes("/supabase/migrations/")) return "supabase";
  if (normalized.includes("/docker/postgres/migrations/")) return "local";
  return "custom";
}

function resolveTrackedFileName(fullPath, sourceKey) {
  if (sourceKey === "supabase" || sourceKey === "local") {
    return path.basename(fullPath);
  }
  return toPosixPath(path.relative(ROOT_DIR, fullPath));
}

async function ensureMigrationTracker(compose) {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TRACKER_TABLE} (
      source TEXT NOT NULL,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT NOT NULL DEFAULT 'dev-db-runner',
      PRIMARY KEY (source, filename)
    );
  `;

  return runSql(compose, sql, "setup migration tracker");
}

async function loadAppliedMigrationChecksums(compose, sourceKey) {
  const sql = `
    SELECT filename, checksum
    FROM ${MIGRATION_TRACKER_TABLE}
    WHERE source = ${sqlLiteral(sourceKey)}
    ORDER BY filename;
  `;
  const result = await runSqlCapture(compose, sql);
  if (result.code !== 0) {
    throw new Error(`Gagal membaca tracker migration untuk source "${sourceKey}"`);
  }

  const map = new Map();
  const lines = result.stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [filename, checksum] = trimmed.split("\t");
    if (!filename) continue;
    map.set(filename, checksum || "");
  }
  return map;
}

async function upsertAppliedMigration(compose, sourceKey, filename, checksum) {
  const sql = `
    INSERT INTO ${MIGRATION_TRACKER_TABLE} (source, filename, checksum, applied_by)
    VALUES (${sqlLiteral(sourceKey)}, ${sqlLiteral(filename)}, ${sqlLiteral(checksum)}, 'dev-db-runner')
    ON CONFLICT (source, filename) DO UPDATE
    SET checksum = EXCLUDED.checksum,
        applied_at = now(),
        applied_by = EXCLUDED.applied_by;
  `;
  return runSql(compose, sql, `catat tracker ${sourceKey}/${filename}`);
}

async function prepareMigrationPayload(fullPath, sourceKey) {
  let content = await fs.readFile(fullPath, "utf8");
  if (sourceKey === "supabase") {
    content = sanitizeSupabaseSql(content);
  }

  return {
    content,
    checksum: hashContent(content),
  };
}

async function runMigrate(compose) {
  const trackerResult = await ensureMigrationTracker(compose);
  if (trackerResult.code !== 0) return trackerResult.code;

  if (customFileArg) {
    const fullPath = path.resolve(ROOT_DIR, customFileArg);
    if (!(await exists(fullPath))) {
      process.stderr.write(`[db] File migration tidak ditemukan: ${path.relative(ROOT_DIR, fullPath)}\n`);
      return 1;
    }
    if (path.extname(fullPath).toLowerCase() !== ".sql") {
      process.stderr.write("[db] File migration harus berekstensi .sql\n");
      return 1;
    }

    const sourceKey = resolveMigrationSourceByPath(fullPath);
    const trackedFileName = resolveTrackedFileName(fullPath, sourceKey);
    const { content, checksum } = await prepareMigrationPayload(fullPath, sourceKey);
    const appliedMap = await loadAppliedMigrationChecksums(compose, sourceKey);
    const existingChecksum = appliedMap.get(trackedFileName);

    if (baselineMode) {
      const recordResult = await upsertAppliedMigration(compose, sourceKey, trackedFileName, checksum);
      if (recordResult.code !== 0) return recordResult.code;
      process.stdout.write(`\n[db] Baseline selesai untuk ${sourceKey}/${trackedFileName}\n`);
      return 0;
    }

    if (existingChecksum) {
      if (existingChecksum === checksum) {
        process.stdout.write(`\n[db] Skip ${sourceKey}/${trackedFileName} (sudah terpasang)\n`);
        return 0;
      }
      process.stderr.write(
        `[db] Checksum migration berubah untuk ${sourceKey}/${trackedFileName}. ` +
          "Gunakan --baseline bila memang ingin menyamakan tracker dengan file terbaru.\n",
      );
      return 1;
    }

    const label = `migration file/${path.relative(ROOT_DIR, fullPath)}`;
    const result = await runSql(compose, content, label);
    if (result.code !== 0) return result.code;

    const recordResult = await upsertAppliedMigration(compose, sourceKey, trackedFileName, checksum);
    if (recordResult.code !== 0) return recordResult.code;

    process.stdout.write("\n[db] Migration file selesai (1 file).\n");
    return 0;
  }

  const sources = resolveMigrationSources();
  if (!sources) {
    process.stderr.write("[db] Nilai --source tidak valid. Gunakan: local | supabase | all\n");
    return 1;
  }

  let totalExecuted = 0;
  let totalSkipped = 0;
  let totalBaselined = 0;

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

    const appliedMap = await loadAppliedMigrationChecksums(compose, source.key);
    let sourceExecuted = 0;
    let sourceSkipped = 0;
    let sourceBaselined = 0;

    process.stdout.write(`\n[db] Menjalankan source migration: ${source.key} (${files.length} file)\n`);

    for (const fileName of files) {
      const fullPath = path.join(source.dir, fileName);
      const { content, checksum } = await prepareMigrationPayload(fullPath, source.key);
      const existingChecksum = appliedMap.get(fileName);

      if (baselineMode) {
        if (existingChecksum === checksum) {
          sourceSkipped += 1;
          totalSkipped += 1;
          continue;
        }

        const baselineResult = await upsertAppliedMigration(compose, source.key, fileName, checksum);
        if (baselineResult.code !== 0) return baselineResult.code;
        sourceBaselined += 1;
        totalBaselined += 1;
        appliedMap.set(fileName, checksum);
        continue;
      }

      if (existingChecksum) {
        if (existingChecksum === checksum) {
          sourceSkipped += 1;
          totalSkipped += 1;
          continue;
        }
        process.stderr.write(
          `[db] Checksum migration berubah untuk ${source.key}/${fileName}. ` +
            "Gunakan --baseline bila ingin menyamakan tracker dengan file terbaru.\n",
        );
        return 1;
      }

      const label = `migration ${source.key}/${fileName}`;
      const result = await runSql(compose, content, label);
      if (result.code !== 0) return result.code;

      const recordResult = await upsertAppliedMigration(compose, source.key, fileName, checksum);
      if (recordResult.code !== 0) return recordResult.code;
      appliedMap.set(fileName, checksum);

      totalExecuted += 1;
      sourceExecuted += 1;
    }

    if (baselineMode) {
      process.stdout.write(
        `[db] Source ${source.key}: ${sourceBaselined} baseline, ${sourceSkipped} sudah sinkron tracker.\n`,
      );
    } else {
      process.stdout.write(
        `[db] Source ${source.key}: ${sourceExecuted} dijalankan, ${sourceSkipped} dilewati.\n`,
      );
    }
  }

  if (baselineMode) {
    if (totalBaselined === 0) {
      process.stdout.write("\n[db] Baseline selesai. Semua migration sudah sinkron tracker.\n");
      return 0;
    }
    process.stdout.write(
      `\n[db] Baseline selesai (${totalBaselined} file ditandai, ${totalSkipped} file sudah sinkron).\n`,
    );
    return 0;
  }

  if (totalExecuted === 0) {
    process.stdout.write("\n[db] Tidak ada migration yang dijalankan.\n");
    return 0;
  }

  process.stdout.write(`\n[db] Migration selesai (${totalExecuted} file, ${totalSkipped} dilewati).\n`);
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
    process.stderr.write(
      "Gunakan: node scripts/dev-db-runner.mjs <migrate|seed> " +
        "[--source local|supabase|all] [--file path.sql] [--baseline]\n",
    );
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
    if (action === "migrate" && !baselineMode) {
      process.stderr.write(
        "[db] Jika DB sudah berisi schema lama tapi tracker belum ada, jalankan baseline sekali:\n" +
          "     npm run db:migrate:supabase -- --baseline\n",
      );
    }
    process.exitCode = code;
  }
}

main().catch((error) => {
  const ref = makeErrorRef();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ref}] dev-db-runner error: ${message}\n`);
  process.exitCode = 1;
});
