import { supabaseUrl } from "@/integrations/supabase/env";

export type AppRuntimeEnvironment = "development" | "staging" | "production";

const normalizeString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const parseSupabaseProjectRef = (url: string | null | undefined): string | null => {
  const normalizedUrl = normalizeString(url);
  if (!normalizedUrl) return null;

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.trim().toLowerCase();
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return null;
    const projectRef = hostname.slice(0, -suffix.length).trim();
    return projectRef || null;
  } catch {
    return null;
  }
};

export const getRuntimeHostname = (): string => {
  if (typeof window === "undefined") return "";
  return window.location.hostname.trim().toLowerCase();
};

export const isLocalhostHostname = (hostname: string): boolean => {
  const normalized = normalizeString(hostname).toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "0.0.0.0"
    || normalized === "::1";
};

export const getRuntimeAppEnvironment = (): AppRuntimeEnvironment => {
  const explicitEnv = normalizeString(import.meta.env.VITE_APP_ENV).toLowerCase();
  if (explicitEnv === "development" || explicitEnv === "staging" || explicitEnv === "production") {
    return explicitEnv;
  }

  return isLocalhostHostname(getRuntimeHostname()) ? "development" : "production";
};

export const getCurrentSupabaseProjectRef = (): string | null => {
  return parseSupabaseProjectRef(supabaseUrl)
    || normalizeString(import.meta.env.VITE_SUPABASE_PROJECT_ID)
    || null;
};

export const getProductionSupabaseProjectRef = (): string | null => {
  return normalizeString(import.meta.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF) || null;
};

export const isProductionSupabaseProject = (): boolean => {
  const currentRef = getCurrentSupabaseProjectRef();
  const productionRef = getProductionSupabaseProjectRef();
  return Boolean(currentRef && productionRef && currentRef === productionRef);
};

export const isLocalhostProductionPairing = (): boolean => {
  return isLocalhostHostname(getRuntimeHostname()) && isProductionSupabaseProject();
};

export const isLocalhostProdWriteOverrideEnabled = (): boolean => {
  return normalizeString(import.meta.env.VITE_ALLOW_LOCALHOST_PROD_WRITE).toLowerCase() === "true";
};

export const shouldBlockLocalProductionWrites = (): boolean => {
  return isLocalhostProductionPairing() && !isLocalhostProdWriteOverrideEnabled();
};

export const buildLocalProductionWriteBlockMessage = (actionLabel: string): string => {
  const currentRef = getCurrentSupabaseProjectRef();
  const suffix = currentRef ? ` (project ${currentRef})` : "";
  return `${actionLabel} diblokir di localhost karena environment ini masih terhubung ke database production${suffix}. Gunakan staging remote atau aktifkan override eksplisit hanya bila sadar risikonya.`;
};
