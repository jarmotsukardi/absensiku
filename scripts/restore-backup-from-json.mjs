import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BACKUP = "/Users/user/Downloads/absensiku_full_backup_2026-02-14.json";
const CHUNK_SIZE = 200;

const TABLE_ORDER = [
  "tenants",
  "subscriptions",
  "opd",
  "offices",
  "work_units",
  "positions",
  "employees",
  "user_roles",
  "work_hours",
  "work_holidays",
  "work_shifts",
  "absence_limits",
  "wfh_schedules",
  "leave_requests",
  "wfh_requests",
  "mutation_requests",
  "flexible_attendance_requests",
  "attendance_corrections",
  "employee_invitations",
  "organization_settings",
  "system_settings",
  "organization_type_settings",
  "faqs",
  "articles",
  "homepage_sections",
  "client_logos",
  "payment_methods",
  "audit_logs",
  "cron_job_logs",
  "shift_change_logs",
];

function parseEnv(raw) {
  const out = {};
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const clean = line.replace(/^export\s+/, "");
    const i = clean.indexOf("=");
    const key = clean.slice(0, i).trim();
    const val = clean.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    out[key] = val;
  }
  return out;
}

async function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const raw = await fs.readFile(envPath, "utf8");
  const parsed = parseEnv(raw);
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`ENV ${name} belum diisi di .env.local`);
  return value;
}

function getProjectRef(url) {
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] || "";
}

async function fetchOpenApi(url, key) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal akses OpenAPI (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

function getAvailableTables(openapi) {
  const paths = Object.keys(openapi?.paths || {});
  return new Set(
    paths
      .map((p) => p.replace(/^\//, ""))
      .filter((p) => p && !p.startsWith("rpc/") && !p.includes("{") && p !== "")
  );
}

async function tryAutoPushMigrations(projectRef, dbPassword) {
  if (!projectRef || !dbPassword) return false;
  try {
    execSync(`supabase link --project-ref ${projectRef} -p "${dbPassword}"`, {
      cwd: ROOT,
      stdio: "pipe",
      env: process.env,
    });
    execSync(`supabase db push --include-all -p "${dbPassword}"`, {
      cwd: ROOT,
      stdio: "pipe",
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

function applySchemaViaPsql(projectRef, dbPassword, schemaPath, rlsPath) {
  if (!projectRef || !dbPassword) return false;

  const psqlBaseArgs = [
    `host=db.${projectRef}.supabase.co`,
    "port=5432",
    "user=postgres",
    "dbname=postgres",
    "sslmode=require",
  ];
  const connStr = psqlBaseArgs.join(" ");

  const env = { ...process.env, PGPASSWORD: dbPassword };

  const run1 = spawnSync("psql", [connStr, "-v", "ON_ERROR_STOP=1", "-f", schemaPath], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  if (run1.status !== 0) return false;

  const run2 = spawnSync("psql", [connStr, "-v", "ON_ERROR_STOP=1", "-f", rlsPath], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  return run2.status === 0;
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

async function upsertChunk(url, key, table, rows, conflictTarget = "") {
  const endpoint = `${url}/rest/v1/${table}${conflictTarget ? `?on_conflict=${encodeURIComponent(conflictTarget)}` : ""}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`[${table}] HTTP ${res.status}: ${body.slice(0, 240)}`);
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.body = body;
    throw err;
  }
}

async function fetchAuthUserIds(url, key) {
  const ids = new Set();
  let page = 1;
  while (true) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gagal membaca auth users (${res.status}): ${body.slice(0, 200)}`);
    }
    const payload = await res.json();
    const users = payload?.users || [];
    for (const u of users) {
      if (u?.id) ids.add(u.id);
    }
    if (!users.length) break;
    page += 1;
  }
  return ids;
}

function sanitizeEmployeesRows(rows, validAuthUserIds) {
  return rows.map((row) => {
    if (!row?.user_id) return row;
    if (validAuthUserIds.has(row.user_id)) return row;
    return { ...row, user_id: null };
  });
}

function filterValidUserRolesRows(rows, validAuthUserIds) {
  return rows.filter((row) => !row?.user_id || validAuthUserIds.has(row.user_id));
}

function sanitizeAuditLogsRows(rows, validAuthUserIds) {
  return rows.map((row) => {
    if (!row?.user_id) return row;
    if (validAuthUserIds.has(row.user_id)) return row;
    return { ...row, user_id: null };
  });
}

async function importData(url, key, backup, validAuthUserIds) {
  const entries = Object.entries(backup.data || {});
  const tableMap = new Map(entries);
  const ordered = [];
  for (const t of TABLE_ORDER) {
    if (tableMap.has(t)) ordered.push(t);
  }
  for (const [t] of entries) {
    if (!ordered.includes(t)) ordered.push(t);
  }

  const summary = [];

  for (const table of ordered) {
    const rows = tableMap.get(table) || [];
    if (!rows.length) {
      summary.push({ table, total: 0, imported: 0, skipped: true });
      console.log(`- ${table}: skip (0 row)`);
      continue;
    }

    const useConflictId = rows.some((r) => Object.prototype.hasOwnProperty.call(r, "id"));
    const defaultConflictTarget = useConflictId ? "id" : "";
    const initialRows =
      table === "employees"
        ? sanitizeEmployeesRows(rows, validAuthUserIds)
        : table === "audit_logs"
          ? sanitizeAuditLogsRows(rows, validAuthUserIds)
          : rows;

    const chunks = chunkRows(initialRows, CHUNK_SIZE);
    let imported = 0;
    process.stdout.write(`- ${table}: ${rows.length} row ... `);

    // audit_logs sering bertambah karena trigger dari operasi import tabel lain.
    // Supaya hasil restore tetap mengikuti backup, bersihkan dulu sebelum insert ulang.
    if (table === "audit_logs") {
      await fetch(`${url}/rest/v1/audit_logs?id=not.is.null`, {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
      });
    }

    for (const chunk of chunks) {
      try {
        await upsertChunk(url, key, table, chunk, defaultConflictTarget);
        imported += chunk.length;
      } catch (error) {
        const body = String(error?.body || "");

        // Fallback jika FK auth.users tidak tersedia pada backup.
        if (table === "employees" && body.includes("employees_user_id_fkey")) {
          const safeChunk = sanitizeEmployeesRows(chunk, new Set());
          await upsertChunk(url, key, table, safeChunk, defaultConflictTarget);
          imported += safeChunk.length;
          continue;
        }

        if (table === "user_roles" && body.includes("user_roles_user_id_fkey")) {
          const safeChunk = filterValidUserRolesRows(chunk, validAuthUserIds);
          if (!safeChunk.length) continue;
          await upsertChunk(url, key, table, safeChunk, defaultConflictTarget);
          imported += safeChunk.length;
          continue;
        }

        if (table === "audit_logs" && body.includes("audit_logs_user_id_fkey")) {
          const safeChunk = sanitizeAuditLogsRows(chunk, new Set());
          await upsertChunk(url, key, table, safeChunk, defaultConflictTarget);
          imported += safeChunk.length;
          continue;
        }

        // Fallback unique constraint: retry using offending unique column as conflict target.
        if (body.includes("\"code\":\"23505\"")) {
          const colMatch = body.match(/Key \(([^)]+)\)=/);
          const conflictCols = colMatch?.[1]?.trim();
          if (conflictCols) {
            const safeChunk =
              table === "system_settings"
                ? chunk.map(({ id, ...rest }) => rest)
                : chunk;
            await upsertChunk(url, key, table, safeChunk, conflictCols);
            imported += safeChunk.length;
            continue;
          }
        }

        throw error;
      }
    }
    console.log("OK");
    summary.push({ table, total: rows.length, imported, skipped: false });
  }

  return summary;
}

async function writeHelperFiles(backup) {
  const outDir = path.join(ROOT, "supabase", "backup_restore");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "01_schema.sql"), `${backup.schema || ""}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "02_rls.sql"), `${backup.rls || ""}\n`, "utf8");
  await fs.writeFile(
    path.join(outDir, "03_data_counts.json"),
    `${JSON.stringify(
      Object.fromEntries(
        Object.entries(backup.data || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      ),
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function main() {
  await loadEnv();

  const backupPath = process.argv[2] || DEFAULT_BACKUP;
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = getProjectRef(url);

  console.log(`Backup: ${backupPath}`);
  console.log(`Project: ${projectRef || "(tidak terbaca)"}`);
  console.log(`Total table backup: ${Object.keys(backup.data || {}).length}`);

  let openapi = await fetchOpenApi(url, key);
  let availableTables = getAvailableTables(openapi);

  const backupTables = Object.keys(backup.data || {});
  let missingTables = backupTables.filter((t) => !availableTables.has(t));

  if (missingTables.length) {
    console.log(`Schema target belum siap. Tabel belum ada di API: ${missingTables.length}`);
    await writeHelperFiles(backup);

    const dbPassword = process.env.SUPABASE_DB_PASSWORD || "";
    if (dbPassword) {
      console.log("Mencoba apply schema via psql (SUPABASE_DB_PASSWORD terdeteksi) ...");
      const schemaPath = path.join(ROOT, "supabase", "backup_restore", "01_schema.sql");
      const rlsPath = path.join(ROOT, "supabase", "backup_restore", "02_rls.sql");
      let schemaApplied = applySchemaViaPsql(projectRef, dbPassword, schemaPath, rlsPath);

      if (!schemaApplied) {
        console.log("Apply via psql gagal, mencoba fallback via supabase db push ...");
        schemaApplied = await tryAutoPushMigrations(projectRef, dbPassword);
      }

      if (schemaApplied) {
        openapi = await fetchOpenApi(url, key);
        availableTables = getAvailableTables(openapi);
        missingTables = backupTables.filter((t) => !availableTables.has(t));
      }
    }
  }

  if (missingTables.length) {
    console.log("");
    console.log("Restore data dihentikan karena schema belum siap.");
    console.log("Langkah lanjut:");
    console.log(`1. Jalankan migration ke project ${projectRef} (misalnya: supabase link + supabase db push).`);
    console.log("2. Atau jalankan SQL dari file supabase/backup_restore/01_schema.sql dan 02_rls.sql di SQL Editor.");
    console.log(`3. Ulangi command ini setelah tabel muncul di REST API.`);
    process.exitCode = 1;
    return;
  }

  console.log("Schema siap. Mulai import data backup ...");
  const validAuthUserIds = await fetchAuthUserIds(url, key);
  const summary = await importData(url, key, backup, validAuthUserIds);
  const totalRows = summary.reduce((s, r) => s + r.total, 0);
  const importedRows = summary.reduce((s, r) => s + r.imported, 0);

  console.log("");
  console.log("Restore selesai.");
  console.log(`Table diproses : ${summary.length}`);
  console.log(`Total rows     : ${totalRows}`);
  console.log(`Rows imported  : ${importedRows}`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
