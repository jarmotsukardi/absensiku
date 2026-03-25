import { appendErrorReference, reportError } from "@/lib/errorLogger";

type AuthSessionMetadata = Record<string, unknown>;

const createAuthSessionRef = () => {
  const compactIso = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "")
    .replaceAll(".", "")
    .replace("Z", "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AUTH-${compactIso}-${random}`;
};

export const logAuthSessionEvent = (
  context: string,
  metadata: AuthSessionMetadata = {},
): string => {
  const authRef = createAuthSessionRef();
  console.info(`[AUTH_SESSION ${authRef}] ${context}`, metadata);
  return authRef;
};

export const reportAuthSessionError = (
  error: unknown,
  context: string,
  metadata: AuthSessionMetadata = {},
): { authRef: string; errorRef: string } => {
  const authRef = createAuthSessionRef();
  const errorRef = reportError(error, context, {
    ...metadata,
    auth_ref_id: authRef,
  });
  return { authRef, errorRef };
};

export const appendAuthSessionReference = (
  message: string,
  authRef: string,
  errorRef?: string | null,
) => {
  return appendErrorReference(`${message} (Ref Auth: ${authRef})`, errorRef);
};
