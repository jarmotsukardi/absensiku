import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ENV_FILE_CANDIDATES = [".env.local", ".env.online", ".env"];

function stripQuote(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function readScriptEnvMap() {
  const cwd = process.cwd();
  const result = {};

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
}

export function pickScriptEnv(envMap, keys) {
  for (const key of keys) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
    const fromFile = envMap[key]?.trim();
    if (fromFile) return fromFile;
  }
  return "";
}

export async function getMissingScriptEnvKeys(keyGroups) {
  const envMap = await readScriptEnvMap();
  return Object.entries(keyGroups)
    .filter(([, keys]) => !pickScriptEnv(envMap, keys))
    .map(([label]) => label);
}
