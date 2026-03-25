import fs from "node:fs/promises";
import path from "node:path";

export type RoleKey =
  | "employee"
  | "org_admin"
  | "org_operator"
  | "superadmin"
  | "employee_centralized"
  | "org_admin_centralized";

type ScenarioRoleKey = "employee" | "org_admin" | "superadmin";

export type RoleCreds = {
  email: string;
  password: string;
};

export type RoleAccount = RoleCreds & {
  tenant_id?: string;
  tenant_name?: string;
  employee_id?: string;
  android_id?: string;
  notes?: string;
};

type ScenarioShape = Partial<Record<ScenarioRoleKey, Partial<RoleCreds>>>;

type AccountsShape = Partial<Record<RoleKey, Partial<RoleAccount>>> & {
  scenarios?: Record<string, ScenarioShape>;
};

const tryReadJson = async (filePath: string): Promise<AccountsShape | null> => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as AccountsShape;
  } catch {
    return null;
  }
};

export const readTestAccounts = async (): Promise<AccountsShape> => {
  const cwd = process.cwd();
  const localPath = path.join(cwd, "ops", "test-accounts.local.json");
  const templatePath = path.join(cwd, "ops", "test-accounts.template.json");

  const local = await tryReadJson(localPath);
  if (local) return local;

  const template = await tryReadJson(templatePath);
  return template || {};
};

const normalizeRoleAccount = (value: Partial<RoleAccount> | undefined | null): RoleAccount | null => {
  if (!value) return null;
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const password = typeof value.password === "string" ? value.password.trim() : "";
  if (!email || !password) return null;
  return {
    email,
    password,
    tenant_id: typeof value.tenant_id === "string" ? value.tenant_id.trim() : undefined,
    tenant_name: typeof value.tenant_name === "string" ? value.tenant_name.trim() : undefined,
    employee_id: typeof value.employee_id === "string" ? value.employee_id.trim() : undefined,
    android_id: typeof value.android_id === "string" ? value.android_id.trim() : undefined,
    notes: typeof value.notes === "string" ? value.notes.trim() : undefined,
  };
};

const normalizeRoleCreds = (value: Partial<RoleAccount> | undefined | null): RoleCreds | null => {
  const account = normalizeRoleAccount(value);
  if (!account) return null;
  return { email: account.email, password: account.password };
};

export const getRoleCreds = async (role: RoleKey): Promise<RoleCreds | null> => {
  const accounts = await readTestAccounts();
  return normalizeRoleCreds(accounts?.[role]);
};

export const getRoleAccount = async (role: RoleKey): Promise<RoleAccount | null> => {
  const accounts = await readTestAccounts();
  return normalizeRoleAccount(accounts?.[role]);
};

export const getRoleCredsWithFallback = async (roles: RoleKey[]): Promise<RoleCreds | null> => {
  for (const role of roles) {
    const creds = await getRoleCreds(role);
    if (creds) return creds;
  }
  return null;
};

export const getRoleAccounts = async (
  roles: RoleKey[],
): Promise<Array<{ role: RoleKey; account: RoleAccount }>> => {
  const resolved = await Promise.all(
    roles.map(async (role) => ({
      role,
      account: await getRoleAccount(role),
    })),
  );
  return resolved.filter(
    (entry): entry is { role: RoleKey; account: RoleAccount } => Boolean(entry.account),
  );
};

export const getScenarioRoleCreds = async (
  scenarioKey: string,
  role: ScenarioRoleKey,
): Promise<RoleCreds | null> => {
  const accounts = await readTestAccounts();
  const scenario = accounts.scenarios?.[scenarioKey];
  return normalizeRoleCreds(scenario?.[role]);
};

export const solveMathExpression = (text: string): string | null => {
  const match = text.match(/(\d+)\s*([+\-×])\s*(\d+)/);
  if (!match) return null;
  const left = Number(match[1]);
  const op = match[2];
  const right = Number(match[3]);
  if (op === "+") return String(left + right);
  if (op === "-") return String(left - right);
  if (op === "×") return String(left * right);
  return null;
};
