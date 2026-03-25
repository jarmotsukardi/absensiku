type EnvValue = string | undefined;

const normalizeEnvValue = (value: string): string => {
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim();
};

const firstEnv = (...keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      const normalized = normalizeEnvValue(value);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return "";
};

export const env = {
  supabaseUrl: firstEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"),
  supabaseAnonKey: firstEnv(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY"
  ),
  supabaseServiceRoleKey: firstEnv("SUPABASE_SERVICE_ROLE_KEY"),
  nativeAppCode: firstEnv("ABSENSIKU_NATIVE_APP_CODE") || "AKN1",
  rateLimitDisabled: firstEnv("MOBILE_API_RATE_LIMIT_DISABLE") === "1",
};

export const assertEnv = (value: EnvValue, label: string): string => {
  const normalized = value ? normalizeEnvValue(value) : "";
  if (!normalized) {
    throw new Error(`ENV_${label}_MISSING`);
  }
  return normalized;
};
