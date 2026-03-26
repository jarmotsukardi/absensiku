import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const TEST_ACCOUNTS_FILE = path.join(process.cwd(), "ops", "test-accounts.local.json");

export const ACCOUNT_ROLE_MAP = {
  superadmin: "superadmin",
  org_admin: "org_admin",
  org_admin_centralized: "org_admin_centralized",
  org_operator: "org_operator",
  employee: "employee",
  employee_centralized: "employee_centralized",
};

function normalizeAccount(account = {}) {
  return {
    role: isFilled(account.role) ? account.role : "",
    email: isFilled(account.email) ? account.email : "",
    password: isFilled(account.password) ? account.password : "",
    tenant_id: isFilled(account.tenant_id) ? account.tenant_id : "",
    tenant_name: isFilled(account.tenant_name) ? account.tenant_name : "",
    employee_id: isFilled(account.employee_id) ? account.employee_id : "",
    android_id: isFilled(account.android_id) ? account.android_id : "",
    notes: isFilled(account.notes) ? account.notes : "",
  };
}

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

  const account = normalizeAccount(accounts?.[accountKey] || {});
  const email = account.email;
  const password = account.password;
  if (!isFilled(email) || !isFilled(password)) {
    throw new Error(
      `Kredensial ${role} belum valid di ops/test-accounts.local.json (email/password wajib terisi).`
    );
  }

  return account;
}

export function ensureNamedAccount(accounts, accountKey) {
  const topLevel = accounts?.[accountKey];
  const extra = accounts?.extra_accounts?.[accountKey];
  const account = normalizeAccount(topLevel || extra || {});

  if (!isFilled(account.email) || !isFilled(account.password)) {
    throw new Error(
      `Kredensial akun "${accountKey}" belum valid di ops/test-accounts.local.json (email/password wajib terisi).`
    );
  }

  const role = isFilled(account.role)
    ? account.role
    : Object.prototype.hasOwnProperty.call(ACCOUNT_ROLE_MAP, accountKey)
      ? accountKey
      : "";
  if (!isFilled(role) || !ACCOUNT_ROLE_MAP[role]) {
    throw new Error(
      `Role akun "${accountKey}" belum valid di ops/test-accounts.local.json. Isi field "role" dengan salah satu role yang didukung.`
    );
  }

  return {
    ...account,
    role,
  };
}
