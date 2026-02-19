import fs from "node:fs/promises";
import path from "node:path";

export type RoleKey = "employee" | "org_admin" | "superadmin";

type RoleCreds = {
  email: string;
  password: string;
};

type AccountsShape = Partial<Record<RoleKey, Partial<RoleCreds>>>;

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

export const getRoleCreds = async (role: RoleKey): Promise<RoleCreds | null> => {
  const accounts = await readTestAccounts();
  const roleData = accounts?.[role];
  if (!roleData) return null;

  const email = typeof roleData.email === "string" ? roleData.email.trim() : "";
  const password = typeof roleData.password === "string" ? roleData.password.trim() : "";
  if (!email || !password) return null;

  return { email, password };
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

