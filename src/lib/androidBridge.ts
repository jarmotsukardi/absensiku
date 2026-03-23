import type { Session } from "@supabase/supabase-js";

export interface AndroidBridgeSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expiresIn?: number;
  tokenType?: string;
  rememberSession: boolean;
  user?: {
    id?: string;
    email?: string;
  };
}

interface AndroidBridge {
  getAndroidId?: () => string;
  getAndroidVersion?: () => number | string;
  consumeBootstrapSession?: () => string | null;
  syncWebSession?: (sessionJson: string) => void;
  clearRememberedSession?: () => void;
  isRememberSessionEnabled?: () => boolean | string;
  showNativeLogin?: (message?: string) => void;
  notifySessionBootstrapComplete?: () => void;
  notifySessionBootstrapFailed?: (message?: string) => void;
}

export const getAndroidBridge = (): AndroidBridge | null => {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { Android?: AndroidBridge }).Android;
  return candidate && typeof candidate === "object" ? candidate : null;
};

export const isAndroidBridgeAvailable = (): boolean => {
  return Boolean(getAndroidBridge());
};

export const isRememberSessionEnabled = (): boolean => {
  const bridge = getAndroidBridge();
  if (!bridge?.isRememberSessionEnabled) return false;

  try {
    const result = bridge.isRememberSessionEnabled();
    if (typeof result === "boolean") return result;
    if (typeof result === "string") {
      return result === "true" || result === "1";
    }
  } catch {
    return false;
  }

  return false;
};

export const parseBridgeSessionPayload = (
  raw: string | null | undefined,
): AndroidBridgeSessionPayload | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
    const refreshToken = typeof parsed.refresh_token === "string" ? parsed.refresh_token : "";
    if (!accessToken || !refreshToken) return null;

    const user =
      parsed.user && typeof parsed.user === "object"
        ? {
            id:
              typeof (parsed.user as Record<string, unknown>).id === "string"
                ? ((parsed.user as Record<string, unknown>).id as string)
                : undefined,
            email:
              typeof (parsed.user as Record<string, unknown>).email === "string"
                ? ((parsed.user as Record<string, unknown>).email as string)
                : undefined,
          }
        : undefined;

    return {
      accessToken,
      refreshToken,
      expiresAt:
        typeof parsed.expires_at === "number" && Number.isFinite(parsed.expires_at)
          ? parsed.expires_at
          : undefined,
      expiresIn:
        typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in)
          ? parsed.expires_in
          : undefined,
      tokenType: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
      rememberSession: parsed.remember_session === true,
      user,
    };
  } catch {
    return null;
  }
};

export const serializeSessionForAndroid = (session: Session, rememberSession: boolean): string => {
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    remember_session: rememberSession,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  });
};
