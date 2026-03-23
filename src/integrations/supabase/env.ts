const normalizeSupabaseEnv = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

export const supabaseUrl =
  normalizeSupabaseEnv(import.meta.env.VITE_SUPABASE_URL) ||
  normalizeSupabaseEnv(import.meta.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey =
  normalizeSupabaseEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  normalizeSupabaseEnv(import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
