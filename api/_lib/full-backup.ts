import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

type HeaderMap = Record<string, string | string[] | undefined>;

export interface BackupHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

interface DumpArtifacts {
  filename: string;
  buffer: Buffer;
  sizeBytes: number;
  generatedAt: string;
  connectionSource: "db_url" | "linked_fallback";
}

function isHostedVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACKUP_SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "supabase-backup-sql.mjs");

class BackupError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "BackupError";
    this.code = code;
    this.status = status;
  }
}

function compactTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .replace(/\..+/, "");
}

function createTraceId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BKP-${compactTimestamp(new Date()).slice(0, 15)}-${random}`;
}

function parseEnv(raw: string) {
  const env: Record<string, string> = {};
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const clean = line.replace(/^export\s+/, "");
    const separator = clean.indexOf("=");
    if (separator <= 0) continue;
    const key = clean.slice(0, separator).trim();
    const value = clean.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
  return env;
}

function loadProcessEnvFallback() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, "utf8");
    const parsed = parseEnv(raw);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function getSupabaseUrl() {
  return (
    readEnv("SUPABASE_URL") ||
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    readEnv("VITE_SUPABASE_URL")
  );
}

function getSupabaseServiceRoleKey() {
  return readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function jsonResponse(status: number, payload: Record<string, unknown>, traceId: string): BackupHttpResponse {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Trace-Id": traceId,
    },
    body: JSON.stringify({ trace_id: traceId, ...payload }),
  };
}

async function verifySuperAdmin(headers: HeaderMap, traceId: string) {
  loadProcessEnvFallback();

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new BackupError(
      "BACKUP_SUPABASE_ENV_MISSING",
      `[${traceId}] SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia untuk verifikasi akses backup.`,
      500,
    );
  }

  const authHeader = normalizeHeaderValue(headers.authorization || headers.Authorization);
  if (!authHeader.startsWith("Bearer ")) {
    throw new BackupError(
      "BACKUP_AUTH_REQUIRED",
      `[${traceId}] Authorization bearer token wajib dikirim.`,
      401,
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    throw new BackupError(
      "BACKUP_AUTH_INVALID",
      `[${traceId}] Token sesi tidak valid atau sudah kedaluwarsa.`,
      401,
    );
  }

  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("role", "super_admin")
    .limit(1);

  if (rolesError) {
    throw new BackupError(
      "BACKUP_ROLE_CHECK_FAILED",
      `[${traceId}] Gagal memverifikasi role super admin: ${rolesError.message}`,
      500,
    );
  }

  if (!roles || roles.length === 0) {
    throw new BackupError(
      "BACKUP_FORBIDDEN",
      `[${traceId}] Hanya super admin yang boleh mengunduh backup database penuh.`,
      403,
    );
  }
}

function parseBackupPath(stdout: string) {
  const match = stdout.match(/^Output:\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}

function inferConnectionSource(stdout: string): DumpArtifacts["connectionSource"] {
  return stdout.includes("via linked fallback") ? "linked_fallback" : "db_url";
}

function createFullDatabaseDump(traceId: string): DumpArtifacts {
  loadProcessEnvFallback();

  if (isHostedVercelRuntime()) {
    throw new BackupError(
      "BACKUP_RUNTIME_UNSUPPORTED",
      `[${traceId}] Full database dump tidak didukung di runtime Vercel serverless. Jalankan dari localhost atau worker backup khusus.`,
      503,
    );
  }

  const label = `ui_${compactTimestamp(new Date())}`;
  const run = spawnSync(process.execPath, [BACKUP_SCRIPT_PATH, "--label", label], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
    timeout: 10 * 60_000,
  });

  if (run.error?.message?.includes("ETIMEDOUT") || run.signal === "SIGTERM") {
    throw new BackupError(
      "BACKUP_DUMP_TIMEOUT",
      `[${traceId}] Pembuatan backup database melebihi batas waktu 10 menit.`,
      504,
    );
  }

  if (run.error) {
    throw new BackupError(
      "BACKUP_SCRIPT_EXEC_FAILED",
      `[${traceId}] Gagal menjalankan script backup: ${run.error.message}`,
      500,
    );
  }

  const stdout = run.stdout || "";
  const stderr = run.stderr || "";
  if (run.status !== 0) {
    const detail = (stderr || stdout || "unknown error").trim();
    throw new BackupError(
      "BACKUP_SCRIPT_FAILED",
      `[${traceId}] Script backup gagal: ${detail}`,
      500,
    );
  }

  const outputPath = parseBackupPath(stdout);
  if (!outputPath || !fs.existsSync(outputPath)) {
    throw new BackupError(
      "BACKUP_OUTPUT_MISSING",
      `[${traceId}] Script backup selesai tetapi file output tidak ditemukan.`,
      500,
    );
  }

  const buffer = fs.readFileSync(outputPath);
  const stats = fs.statSync(outputPath);
  const generatedAt = stats.mtime.toISOString();

  return {
    filename: path.basename(outputPath),
    buffer,
    sizeBytes: buffer.byteLength,
    generatedAt,
    connectionSource: inferConnectionSource(stdout),
  };
}

function mapError(error: unknown, traceId: string) {
  if (error instanceof BackupError) {
    return jsonResponse(
      error.status,
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      traceId,
    );
  }

  const message = error instanceof Error ? error.message : "Unknown backup error";
  return jsonResponse(
    500,
    {
      success: false,
      code: "BACKUP_INTERNAL",
      error: `[${traceId}] ${message}`,
    },
    traceId,
  );
}

export async function handleFullBackupRequest({
  method,
  headers,
}: {
  method?: string;
  headers: HeaderMap;
}): Promise<BackupHttpResponse> {
  const traceId = createTraceId();

  if ((method || "GET").toUpperCase() !== "GET") {
    return jsonResponse(
      405,
      {
        success: false,
        code: "BACKUP_METHOD_NOT_ALLOWED",
        error: `[${traceId}] Method ${method || "UNKNOWN"} tidak didukung.`,
      },
      traceId,
    );
  }

  try {
    if (isHostedVercelRuntime()) {
      throw new BackupError(
        "BACKUP_RUNTIME_UNSUPPORTED",
        `[${traceId}] Full database dump tidak didukung di runtime Vercel serverless. Jalankan dari localhost atau worker backup khusus.`,
        503,
      );
    }

    await verifySuperAdmin(headers, traceId);
    const dump = createFullDatabaseDump(traceId);
    return {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dump.filename}"`,
        "Cache-Control": "no-store",
        "X-Trace-Id": traceId,
        "X-Backup-Mode": "full-database-sql",
        "X-Backup-Bytes": String(dump.sizeBytes),
        "X-Backup-Generated-At": dump.generatedAt,
        "X-Backup-Source": dump.connectionSource,
      },
      body: dump.buffer,
    };
  } catch (error) {
    return mapError(error, traceId);
  }
}
