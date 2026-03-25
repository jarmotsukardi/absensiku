import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const TEST_ACCOUNTS_FILE = path.join(process.cwd(), "ops", "test-accounts.local.json");

export const ACCOUNT_ROLE_MAP = {
  superadmin: "superadmin",
  org_admin: "org_admin",
  org_admin_centralized: "org_admin_centralized",
  employee: "employee",
  employee_centralized: "employee_centralized",
};

export function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("__ISI_");
}

export async function readTestAccounts(filePath = TEST_ACCOUNTS_FILE) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function ensureRoleCredentials(accounts, role) {
  const accountKey = ACCOUNT_ROLE_MAP[role];
  if (!accountKey) {
    throw new Error(`Role akun tidak dikenal: ${role}`);
  }

  const email = accounts?.[accountKey]?.email;
  const password = accounts?.[accountKey]?.password;
  if (!isFilled(email) || !isFilled(password)) {
    throw new Error(
      `Kredensial ${role} belum valid di ops/test-accounts.local.json (email/password wajib terisi).`
    );
  }

  return { email, password };
}

export function ensureRoleAccount(accounts, role) {
  const accountKey = ACCOUNT_ROLE_MAP[role];
  if (!accountKey) {
    throw new Error(`Role akun tidak dikenal: ${role}`);
  }

  const account = accounts?.[accountKey] || {};
  const email = account.email;
  const password = account.password;
  if (!isFilled(email) || !isFilled(password)) {
    throw new Error(
      `Kredensial ${role} belum valid di ops/test-accounts.local.json (email/password wajib terisi).`
    );
  }

  return {
    email,
    password,
    tenant_id: isFilled(account.tenant_id) ? account.tenant_id : "",
    tenant_name: isFilled(account.tenant_name) ? account.tenant_name : "",
    employee_id: isFilled(account.employee_id) ? account.employee_id : "",
    android_id: isFilled(account.android_id) ? account.android_id : "",
  };
}
