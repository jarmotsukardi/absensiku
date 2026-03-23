import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV_FILE_CANDIDATES = [".env.local", ".env"] as const;

const stripQuote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const readSupabaseTestEnvMap = async (): Promise<Record<string, string>> => {
  const cwd = process.cwd();
  const result: Record<string, string> = {};

  await Promise.all(
    ENV_FILE_CANDIDATES.map(async (filename) => {
      try {
        const content = await fs.readFile(path.join(cwd, filename), "utf8");
        for (const rawLine of content.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith("#")) continue;
          const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
          if (!match) continue;
          const key = match[1];
          const value = stripQuote(match[2] || "");
          if (value) result[key] = value;
        }
      } catch {
        // Optional file.
      }
    }),
  );

  return result;
};

export const pickSupabaseTestEnv = (map: Record<string, string>, keys: string[]): string => {
  for (const key of keys) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
    const fromFile = map[key]?.trim();
    if (fromFile) return fromFile;
  }
  return "";
};

export const getMissingSupabaseTestEnvKeys = async (
  keyGroups: Record<string, string[]>,
): Promise<string[]> => {
  const envMap = await readSupabaseTestEnvMap();
  return Object.entries(keyGroups)
    .filter(([, keys]) => !pickSupabaseTestEnv(envMap, keys))
    .map(([label]) => label);
};

export const createSupabaseServiceTestClient = async (): Promise<SupabaseClient | null> => {
  const envMap = await readSupabaseTestEnvMap();
  const supabaseUrl = pickSupabaseTestEnv(envMap, ["VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = pickSupabaseTestEnv(envMap, ["SUPABASE_SERVICE_ROLE_KEY"]);
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const createSupabaseAnonTestClient = async (): Promise<SupabaseClient | null> => {
  const envMap = await readSupabaseTestEnvMap();
  const supabaseUrl = pickSupabaseTestEnv(envMap, ["VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const anonKey = pickSupabaseTestEnv(envMap, [
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ]);
  if (!supabaseUrl || !anonKey) return null;

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const createSupabasePublicTestClient = async (): Promise<SupabaseClient | null> => {
  const envMap = await readSupabaseTestEnvMap();
  const supabaseUrl = pickSupabaseTestEnv(envMap, ["VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const publicKey = pickSupabaseTestEnv(envMap, [
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  if (!supabaseUrl || !publicKey) return null;

  return createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
