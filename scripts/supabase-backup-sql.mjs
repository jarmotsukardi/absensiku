#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const DEFAULT_DIR = path.join(ROOT_DIR, "artifacts", "db-backups", "sql");
const PG_DUMP_CANDIDATES = [
  process.env.PG_DUMP_BIN,
  "/usr/local/opt/libpq/bin/pg_dump",
  "/opt/homebrew/opt/libpq/bin/pg_dump",
  "pg_dump",
].filter(Boolean);

function readEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function getArgValue(flag) {
  const idx = process.argv.findIndex((arg) => arg === flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function sanitizeLabel(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function getProjectRefFromUrl(url) {
  const match = String(url || "").match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || "";
}

function getProjectRefFromEnv() {
  return (
    readEnv("SUPABASE_PROJECT_REF", "VITE_SUPABASE_PROJECT_ID") ||
    getProjectRefFromUrl(readEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"))
  );
}

function parseDryRunExport(script, key) {
  const match = script.match(new RegExp(`^export ${key}="([^"]*)"`, "m"));
  return match?.[1] || "";
}

function resolvePgDumpBinary() {
  for (const candidate of PG_DUMP_CANDIDATES) {
    const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!check.error && check.status === 0) {
      return candidate;
    }
  }
  return "";
}

function runLinkedPgDumpFallback({ filePath, schemaOnly, dataOnly, ref }) {
  const supabaseCheck = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (supabaseCheck.error || supabaseCheck.status !== 0) {
    return {
      ok: false,
      detail: "Supabase CLI tidak tersedia untuk fallback linked backup.",
    };
  }

  const dryRun = spawnSync(
    "supabase",
    ["db", "dump", "--linked", "--schema", "public", "--dry-run"],
    { encoding: "utf8" }
  );

  if (dryRun.error || dryRun.status !== 0) {
    const detail = (dryRun.stderr || dryRun.stdout || dryRun.error?.message || "unknown error").trim();
    return { ok: false, detail: `Gagal ambil credential linked backup: ${detail}` };
  }

  const script = dryRun.stdout || "";
  const pgHost = parseDryRunExport(script, "PGHOST");
  const pgPort = parseDryRunExport(script, "PGPORT") || "5432";
  const pgUser = parseDryRunExport(script, "PGUSER");
  const pgPassword = parseDryRunExport(script, "PGPASSWORD");
  const pgDatabase = parseDryRunExport(script, "PGDATABASE") || "postgres";

  if (!pgHost || !pgUser || !pgPassword) {
    return {
      ok: false,
      detail: "Gagal parse PGHOST/PGUSER/PGPASSWORD dari supabase db dump --dry-run.",
    };
  }

  const pgDumpBin = resolvePgDumpBinary();
  if (!pgDumpBin) {
    return {
      ok: false,
      detail: "pg_dump tidak ditemukan. Set PG_DUMP_BIN atau install PostgreSQL client.",
    };
  }

  const args = ["--no-owner", "--no-privileges", "--role", "postgres", "--file", filePath];
  if (schemaOnly) args.push("--schema-only");
  if (dataOnly) args.push("--data-only");
  args.push(pgDatabase);

  const run = spawnSync(pgDumpBin, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      PGHOST: pgHost,
      PGPORT: pgPort,
      PGUSER: pgUser,
      PGPASSWORD: pgPassword,
      PGDATABASE: pgDatabase,
      PGSSLMODE: process.env.PGSSLMODE || "require",
    },
  });

  if (run.error || run.status !== 0) {
    const detail = (run.stderr || run.stdout || run.error?.message || "unknown error").trim();
    return { ok: false, detail: `Fallback pg_dump gagal: ${detail}` };
  }

  return {
    ok: true,
    mode: "linked_fallback",
    ref,
  };
}

function buildDerivedDbConnection() {
  const dbPassword = readEnv("SUPABASE_DB_PASSWORD");
  const projectRef = getProjectRefFromEnv();
  if (!dbPassword || !projectRef) {
    return null;
  }

  return {
    projectRef,
    env: {
      ...process.env,
      PGPASSWORD: dbPassword,
      PGSSLMODE: process.env.PGSSLMODE || "require",
    },
    args: [
      "--host",
      `db.${projectRef}.supabase.co`,
      "--port",
      "5432",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
    ],
  };
}

function main() {
  const ref = `DB-BACKUP-${Date.now()}`;
  const dbUrl =
    process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL || "";
  const derivedConnection = buildDerivedDbConnection();
  const outDir = getArgValue("--dir") || DEFAULT_DIR;
  const labelRaw = getArgValue("--label") || "manual";
  const label = sanitizeLabel(labelRaw) || "manual";
  const schemaOnly = hasFlag("--schema-only");
  const dataOnly = hasFlag("--data-only");
  const filename = `supabase_backup_${nowStamp()}_${label}.sql`;
  const filePath = path.join(outDir, filename);

  if (schemaOnly && dataOnly) {
    console.error(`[${ref}] Flag --schema-only dan --data-only tidak bisa dipakai bersamaan.`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  if (!dbUrl && !derivedConnection) {
    const fallback = runLinkedPgDumpFallback({ filePath, schemaOnly, dataOnly, ref });
    if (fallback.ok) {
      console.log(`[OK] Backup SQL selesai via linked fallback.`);
      console.log(`Ref: ${ref}`);
      console.log(`Output: ${filePath}`);
      return;
    }

    console.error(
      `[${ref}] SUPABASE_DB_URL/SUPABASE_DB_DIRECT_URL/SUPABASE_DB_PASSWORD/DATABASE_URL belum di-set.`
    );
    console.error(`Fallback linked backup gagal: ${fallback.detail}`);
    console.error("Contoh:");
    console.error("  SUPABASE_DB_URL='postgresql://...' npm run db:backup:supabase");
    console.error("  SUPABASE_DB_PASSWORD='...' npm run db:backup:supabase");
    process.exit(1);
  }

  if (dbUrl && !dbUrl.includes("supabase.co")) {
    console.warn(`[${ref}] Peringatan: host DB URL tidak terdeteksi sebagai Supabase (supabase.co).`);
  }

  const args = ["--no-owner", "--no-privileges", "--file", filePath];
  if (schemaOnly) args.push("--schema-only");
  if (dataOnly) args.push("--data-only");
  let pgDumpEnv = process.env;
  if (dbUrl) {
    args.push(dbUrl);
  } else if (derivedConnection) {
    args.push(...derivedConnection.args);
    pgDumpEnv = derivedConnection.env;
  }

  const pgDumpBin = resolvePgDumpBinary();
  if (!pgDumpBin) {
    console.error(`[${ref}] pg_dump tidak ditemukan. Set PG_DUMP_BIN atau install PostgreSQL client.`);
    process.exit(1);
  }

  const run = spawnSync(pgDumpBin, args, { encoding: "utf8", env: pgDumpEnv });
  if (run.error) {
    console.error(`[${ref}] Gagal menjalankan pg_dump: ${run.error.message}`);
    console.error("Pastikan PostgreSQL client tools terpasang (pg_dump).");
    process.exit(1);
  }

  if (run.status !== 0) {
    const detail = (run.stderr || run.stdout || "").trim() || "unknown error";
    console.error(`[${ref}] Backup SQL gagal: ${detail}`);
    process.exit(run.status || 1);
  }

  if (dbUrl) {
    console.log(`[OK] Backup SQL selesai via db url.`);
  } else {
    console.log(`[OK] Backup SQL selesai via derived direct connection.`);
  }
  console.log(`Ref: ${ref}`);
  console.log(`Output: ${filePath}`);
}

main();
