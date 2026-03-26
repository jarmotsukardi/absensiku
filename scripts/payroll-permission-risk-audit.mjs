#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SQL_FILE = path.join(ROOT_DIR, "ops", "sql", "payroll-permission-risk-audit.sql");
const TRACE_ID = `PAY-AUDIT-${Date.now().toString(36).toUpperCase()}`;

function getProjectRefFromUrl(url) {
  const match = String(url || "").match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || "";
}

function getProjectRef(envMap) {
  return (
    pickScriptEnv(envMap, ["SUPABASE_PROJECT_REF", "VITE_SUPABASE_PROJECT_ID"]) ||
    getProjectRefFromUrl(
      pickScriptEnv(envMap, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]),
    )
  );
}

function resolveDbConnection(envMap) {
  const dbUrl = pickScriptEnv(envMap, ["SUPABASE_DB_URL", "SUPABASE_DB_DIRECT_URL", "DATABASE_URL"]);
  if (dbUrl) {
    return {
      env: process.env,
      args: [dbUrl],
      mode: "db_url",
    };
  }

  const dbPassword = pickScriptEnv(envMap, ["SUPABASE_DB_PASSWORD"]);
  const projectRef = getProjectRef(envMap);
  if (!dbPassword || !projectRef) return null;

  return {
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
    mode: "derived_direct_connection",
  };
}

async function main() {
  const envMap = await readScriptEnvMap();
  const connection = resolveDbConnection(envMap);

  if (!connection) {
    console.error(
      `[${TRACE_ID}] ENV DB remote belum lengkap. Isi salah satu: SUPABASE_DB_URL / SUPABASE_DB_DIRECT_URL / DATABASE_URL, atau SUPABASE_DB_PASSWORD + project ref.`,
    );
    process.exit(1);
  }

  const versionCheck = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (versionCheck.error || versionCheck.status !== 0) {
    console.error(`[${TRACE_ID}] psql tidak tersedia. Install PostgreSQL client terlebih dahulu.`);
    process.exit(1);
  }

  const args = [...connection.args, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE];
  const run = spawnSync("psql", args, {
    cwd: ROOT_DIR,
    env: connection.env,
    stdio: "inherit",
  });

  if (run.error) {
    console.error(`[${TRACE_ID}] Gagal menjalankan audit payroll: ${run.error.message}`);
    process.exit(1);
  }

  if (run.status !== 0) {
    console.error(`[${TRACE_ID}] Audit payroll selesai dengan error. Mode koneksi: ${connection.mode}`);
    process.exit(run.status || 1);
  }

  console.log(`[OK] Audit payroll permission risk selesai. Ref: ${TRACE_ID}`);
}

main().catch((error) => {
  console.error(`[${TRACE_ID}] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
