#!/usr/bin/env node

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { getMissingScriptEnvKeys, pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

const CLI_ARGS = process.argv.slice(2);
const APPLY = CLI_ARGS.includes("--apply");
const DRY_RUN = !APPLY;
const PAGE_SIZE = 200;

const ADMIN_EMAIL_REGEX = /^e2e\.orgadmin\.\d+@mailinator\.com$/i;
const EMPLOYEE_EMAIL_REGEX = /^e2e\.employee\.\d+@mailinator\.com$/i;
const E2E_ORG_NAME_PREFIX = "Org E2E ";

async function findAuthUserIdByEmail(adminClient, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;

    const users = data?.users || [];
    const matched = users.find((item) => String(item.email || "").trim().toLowerCase() === normalized);
    if (matched?.id) return matched.id;
    if (users.length < PAGE_SIZE) break;
  }
  return null;
}

async function listE2EAuthUsers(adminClient) {
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) {
      const email = String(user.email || "").trim().toLowerCase();
      if (ADMIN_EMAIL_REGEX.test(email) || EMPLOYEE_EMAIL_REGEX.test(email)) {
        rows.push({
          id: user.id,
          email,
          created_at: user.created_at || null,
        });
      }
    }
    if (users.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const env = await readScriptEnvMap();
  const missingEnvKeys = await getMissingScriptEnvKeys({
    SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"],
    SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
  });
  if (missingEnvKeys.length > 0) {
    throw new Error(`Env script belum lengkap: ${missingEnvKeys.join(", ")}`);
  }
  const supabaseUrl = pickScriptEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = pickScriptEnv(env, ["SUPABASE_SERVICE_ROLE_KEY"]);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: e2eTenantsByName, error: tenantsByNameError } = await adminClient
    .from("tenants")
    .select("id,name,code,email,created_at")
    .ilike("name", `${E2E_ORG_NAME_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (tenantsByNameError) throw tenantsByNameError;

  const { data: e2eTenantsByEmail, error: tenantsByEmailError } = await adminClient
    .from("tenants")
    .select("id,name,code,email,created_at")
    .ilike("email", "e2e.orgadmin.%@mailinator.com")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (tenantsByEmailError) throw tenantsByEmailError;

  const tenantMap = new Map();
  for (const row of e2eTenantsByName || []) tenantMap.set(row.id, row);
  for (const row of e2eTenantsByEmail || []) tenantMap.set(row.id, row);
  const e2eTenants = Array.from(tenantMap.values());

  const e2eAuthUsers = await listE2EAuthUsers(adminClient);

  const summary = {
    mode: DRY_RUN ? "dry_run" : "apply",
    tenants_found: e2eTenants.length,
    auth_users_found: e2eAuthUsers.length,
    tenants_deleted: 0,
    tenants_archived: 0,
    auth_users_deleted: 0,
    tenant_audit_logs_deleted: 0,
    auth_audit_logs_deleted: 0,
    tenant_delete_errors: [],
    auth_delete_errors: [],
    tenant_audit_cleanup_errors: [],
    auth_audit_cleanup_errors: [],
    sample_tenants: e2eTenants.slice(0, 10),
    sample_auth_users: e2eAuthUsers.slice(0, 10),
  };

  if (APPLY) {
    // Remove audit log dependencies first so tenant deletion is allowed.
    for (const tenant of e2eTenants) {
      const { error: auditDeleteError, count: auditDeleteCount } = await adminClient
        .from("audit_logs")
        .delete({ count: "exact" })
        .eq("tenant_id", tenant.id);
      if (auditDeleteError) {
        summary.tenant_audit_cleanup_errors.push({
          tenant_id: tenant.id,
          message: auditDeleteError.message || "delete tenant audit logs failed",
        });
      } else {
        summary.tenant_audit_logs_deleted += Number(auditDeleteCount || 0);
      }

      const { error } = await adminClient.from("tenants").delete().eq("id", tenant.id);
      if (error) {
        const message = error.message || "delete tenant failed";
        const lowered = message.toLowerCase();
        const isAuditDeleteBlock =
          (error.code === "23503" && lowered.includes("audit_logs_tenant_id_fkey")) ||
          lowered.includes("audit_logs_tenant_id_fkey");

        if (isAuditDeleteBlock) {
          const archiveName = tenant.name.startsWith("[ARSIP E2E]") ? tenant.name : `[ARSIP E2E] ${tenant.name}`;
          const { error: archiveError } = await adminClient
            .from("tenants")
            .update({
              is_active: false,
              name: archiveName,
              email: null,
            })
            .eq("id", tenant.id);

          if (archiveError) {
            summary.tenant_delete_errors.push({
              tenant_id: tenant.id,
              code: archiveError.code || error.code || null,
              message: `archive_fallback_failed: ${archiveError.message || message}`,
            });
          } else {
            summary.tenants_archived += 1;
          }
        } else {
          summary.tenant_delete_errors.push({
            tenant_id: tenant.id,
            code: error.code || null,
            message,
          });
        }
      } else {
        summary.tenants_deleted += 1;
      }
    }

    const authIdByEmail = new Map();
    for (const authUser of e2eAuthUsers) authIdByEmail.set(authUser.email, authUser.id);

    // Extra fallback: ensure admin/employee emails from remaining tenant rows are attempted.
    for (const tenant of e2eTenants) {
      const email = String(tenant.email || "").trim().toLowerCase();
      if (email && !authIdByEmail.has(email)) {
        const userId = await findAuthUserIdByEmail(adminClient, email);
        if (userId) authIdByEmail.set(email, userId);
      }
    }

    for (const [email, userId] of authIdByEmail.entries()) {
      const { error: auditDeleteError, count: auditDeleteCount } = await adminClient
        .from("audit_logs")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (auditDeleteError) {
        summary.auth_audit_cleanup_errors.push({
          email,
          user_id: userId,
          message: auditDeleteError.message || "delete auth audit logs failed",
        });
      } else {
        summary.auth_audit_logs_deleted += Number(auditDeleteCount || 0);
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error && !String(error.message || "").toLowerCase().includes("not found")) {
        summary.auth_delete_errors.push({
          email,
          user_id: userId,
          message: error.message || "delete auth user failed",
        });
      } else {
        summary.auth_users_deleted += 1;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`cleanup-e2e-orgadmin-data failed: ${message}`);
  process.exitCode = 1;
});
