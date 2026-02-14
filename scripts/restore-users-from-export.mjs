import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BACKUP = "/Users/user/Downloads/users_export_2026-02-14.json";

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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeTempPassword() {
  return `Absen#${crypto.randomBytes(8).toString("hex")}!`;
}

function getBooleanArg(name) {
  return process.argv.includes(name);
}

function getArgValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return "";
  return process.argv[i + 1] || "";
}

function toUserMetadata(row) {
  return {
    name: row.name || null,
    phone: row.phone || null,
    tenant_name: row.tenant_name || null,
    organization_type: row.organization_type || null,
    backup_source: "users_export_2026-02-14",
  };
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (!batch.length) break;
    page += 1;
  }
  return users;
}

function isMissingRelationError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || /relation .* does not exist/i.test(message);
}

async function remapUserIds(supabase, table, idMap, dryRun) {
  let affected = 0;
  for (const [fromId, toId] of idMap.entries()) {
    if (!fromId || !toId || fromId === toId) continue;

    if (dryRun) {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", fromId);
      if (error) {
        if (isMissingRelationError(error)) return { available: false, affected: 0 };
        throw new Error(`Gagal cek relasi ${table}: ${error.message}`);
      }
      affected += Number(count || 0);
      continue;
    }

    const { data, error } = await supabase
      .from(table)
      .update({ user_id: toId })
      .eq("user_id", fromId)
      .select("id");
    if (error) {
      if (isMissingRelationError(error)) return { available: false, affected: 0 };
      throw new Error(`Gagal remap ${table}.user_id ${fromId} -> ${toId}: ${error.message}`);
    }
    affected += (data || []).length;
  }
  return { available: true, affected };
}

async function dedupeUserRoles(supabase, dryRun) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id,user_id,role,created_at")
    .order("created_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Gagal membaca user_roles: ${error.message}`);

  const keep = new Set();
  const removeIds = [];
  for (const row of data || []) {
    const key = `${row.user_id}::${row.role}`;
    if (keep.has(key)) {
      removeIds.push(row.id);
      continue;
    }
    keep.add(key);
  }

  if (dryRun || !removeIds.length) {
    return { removed: removeIds.length };
  }

  const { error: delErr } = await supabase.from("user_roles").delete().in("id", removeIds);
  if (delErr) throw new Error(`Gagal hapus duplicate user_roles: ${delErr.message}`);
  return { removed: removeIds.length };
}

async function main() {
  await loadEnv();

  const backupPath = getArgValue("--file") || process.argv[2] || DEFAULT_BACKUP;
  const dryRun = getBooleanArg("--dry-run");
  const forcePasswordReset = getBooleanArg("--force-password-reset");
  const tempPassword = process.env.RESTORE_USERS_TEMP_PASSWORD || makeTempPassword();

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const raw = await fs.readFile(backupPath, "utf8");
  const backupRows = JSON.parse(raw);
  if (!Array.isArray(backupRows)) {
    throw new Error("Format backup users tidak valid: harus array");
  }

  const cleaned = backupRows
    .filter((row) => row && row.id && row.email)
    .map((row) => ({
      ...row,
      id: String(row.id).trim(),
      email: normalizeEmail(row.email),
    }));

  const seen = new Set();
  const users = [];
  for (const row of cleaned) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    users.push(row);
  }

  if (!users.length) throw new Error("Backup users kosong setelah validasi");

  const beforeUsers = await listAllAuthUsers(supabase);
  const authById = new Map(beforeUsers.map((u) => [u.id, u]));
  const authByEmail = new Map(
    beforeUsers
      .filter((u) => u.email)
      .map((u) => [normalizeEmail(u.email), u])
  );

  let created = 0;
  let updated = 0;
  let mergedByEmail = 0;
  let remappedIds = 0;
  let employeesLinked = 0;
  const idMap = new Map();
  const backupEmailToTargetId = new Map();

  for (const row of users) {
    const sourceId = row.id;
    const targetEmail = row.email;
    const metadata = toUserMetadata(row);
    const emailConfirmed = Boolean(row.email_confirmed_at);

    let targetId = "";
    let existing = authById.get(sourceId) || null;
    const emailOwner = authByEmail.get(targetEmail);

    if (existing && emailOwner && emailOwner.id !== sourceId) {
      targetId = emailOwner.id;
      mergedByEmail += 1;
      existing = emailOwner;
    } else if (existing) {
      targetId = sourceId;
    } else if (emailOwner) {
      targetId = emailOwner.id;
      mergedByEmail += 1;
      existing = emailOwner;
    }

    if (existing && targetId) {
      const attrs = {
        email: targetEmail,
        email_confirm: emailConfirmed,
        user_metadata: {
          ...(existing.user_metadata || {}),
          ...metadata,
        },
        ...(forcePasswordReset ? { password: tempPassword } : {}),
      };

      if (!dryRun) {
        const { error } = await supabase.auth.admin.updateUserById(targetId, attrs);
        if (error) throw new Error(`Gagal update user ${targetId}: ${error.message}`);
      }

      updated += 1;
      authById.set(targetId, { ...existing, email: targetEmail });
      authByEmail.set(targetEmail, { ...existing, email: targetEmail });
    } else {
      let createdUserId = "";
      if (!dryRun) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: targetEmail,
          password: tempPassword,
          email_confirm: emailConfirmed,
          user_metadata: metadata,
        });
        if (error) throw new Error(`Gagal create user ${sourceId}: ${error.message}`);
        createdUserId = data?.user?.id || "";
        if (!createdUserId) throw new Error(`Gagal create user ${sourceId}: user id kosong`);
      } else {
        createdUserId = `new-${sourceId}`;
      }

      targetId = createdUserId;
      created += 1;
      authById.set(targetId, { id: targetId, email: targetEmail, user_metadata: metadata });
      authByEmail.set(targetEmail, { id: targetId, email: targetEmail, user_metadata: metadata });
    }

    idMap.set(sourceId, targetId);
    backupEmailToTargetId.set(targetEmail, targetId);
    if (targetId !== sourceId) remappedIds += 1;
  }

  const roleRemap = await remapUserIds(supabase, "user_roles", idMap, dryRun);
  const empRemap = await remapUserIds(supabase, "employees", idMap, dryRun);
  const auditRemap = await remapUserIds(supabase, "audit_logs", idMap, dryRun);

  const targetEmails = [...backupEmailToTargetId.keys()];
  const { data: employees, error: employeesErr } = await supabase
    .from("employees")
    .select("id,email,user_id")
    .in("email", targetEmails);
  if (employeesErr) throw new Error(`Gagal membaca employees: ${employeesErr.message}`);

  for (const emp of employees || []) {
    const empEmail = normalizeEmail(emp.email);
    const targetId = backupEmailToTargetId.get(empEmail);
    if (!targetId || emp.user_id === targetId) continue;

    if (!dryRun) {
      const { error } = await supabase.from("employees").update({ user_id: targetId }).eq("id", emp.id);
      if (error) throw new Error(`Gagal update employees.user_id ${emp.id}: ${error.message}`);
    }
    employeesLinked += 1;
  }

  const roleDedupe = await dedupeUserRoles(supabase, dryRun);

  const afterUsers = dryRun ? beforeUsers : await listAllAuthUsers(supabase);
  const afterEmails = new Set(
    afterUsers.map((u) => normalizeEmail(u.email)).filter(Boolean)
  );
  const missingEmails = dryRun
    ? []
    : users.filter((u) => !afterEmails.has(normalizeEmail(u.email)));

  console.log(`Backup users file : ${backupPath}`);
  console.log(`Mode              : ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Total backup user : ${users.length}`);
  console.log(`Auth created      : ${created}`);
  console.log(`Auth updated      : ${updated}`);
  console.log(`Auth merge email  : ${mergedByEmail}`);
  console.log(`ID remapped       : ${remappedIds}`);
  console.log(`Roles remapped    : ${roleRemap.available ? roleRemap.affected : "table missing"}`);
  console.log(`Employees remap   : ${empRemap.available ? empRemap.affected : "table missing"}`);
  console.log(`Audit remap       : ${auditRemap.available ? auditRemap.affected : "table missing"}`);
  console.log(`Roles deduped     : ${roleDedupe.removed}`);
  console.log(`Employees linked  : ${employeesLinked}`);
  console.log(`Auth total now    : ${afterUsers.length}`);
  if (!dryRun) {
    console.log(`Temp password     : ${tempPassword}`);
    console.log("Catatan: temp password dipakai untuk user baru.");
    if (forcePasswordReset) {
      console.log("Catatan: --force-password-reset aktif, semua user backup direset ke temp password.");
    }
  }
  if (missingEmails.length) {
    console.log("Missing email user setelah restore:");
    for (const row of missingEmails) console.log(`- ${row.email}`);
    process.exitCode = 1;
    return;
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
