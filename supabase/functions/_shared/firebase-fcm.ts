import { logTraceError } from "./error-utils.ts";

const FIREBASE_MESSAGING_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_FIREBASE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const textEncoder = new TextEncoder();

export interface FirebaseMessagingConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

export interface FcmSendResult {
  ok: boolean;
  provider: "firebase_fcm";
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
}

type JsonObject = Record<string, unknown>;

let cachedAccessToken:
  | {
      cacheKey: string;
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

const toStringSafe = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePrivateKey = (value: string): string =>
  value.replace(/\\n/g, "\n").trim();

const base64UrlEncode = (value: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof value === "string"
    ? textEncoder.encode(value)
    : value instanceof Uint8Array
    ? value
    : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const sanitized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const buildSignedJwt = async (config: FirebaseMessagingConfig): Promise<string> => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FIREBASE_MESSAGING_SCOPE,
      aud: config.tokenUri,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(config.privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    textEncoder.encode(unsignedToken),
  );
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
};

export const getFirebaseMessagingConfig = (): FirebaseMessagingConfig | null => {
  const rawJson = toStringSafe(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON"));
  const envProjectId = toStringSafe(Deno.env.get("FIREBASE_PROJECT_ID"));
  const envClientEmail = toStringSafe(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_EMAIL"));
  const envPrivateKey = normalizePrivateKey(toStringSafe(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY")));
  const envTokenUri = toStringSafe(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_TOKEN_URI")) || DEFAULT_FIREBASE_TOKEN_URI;

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (isJsonObject(parsed)) {
        const projectId = toStringSafe(parsed.project_id) || envProjectId;
        const clientEmail = toStringSafe(parsed.client_email) || envClientEmail;
        const privateKey = normalizePrivateKey(toStringSafe(parsed.private_key) || envPrivateKey);
        const tokenUri = toStringSafe(parsed.token_uri) || envTokenUri;
        if (projectId && clientEmail && privateKey) {
          return { projectId, clientEmail, privateKey, tokenUri };
        }
      }
    } catch {
      // Fallback ke env terpisah jika JSON rusak.
    }
  }

  if (!envProjectId || !envClientEmail || !envPrivateKey) return null;
  return {
    projectId: envProjectId,
    clientEmail: envClientEmail,
    privateKey: envPrivateKey,
    tokenUri: envTokenUri,
  };
};

export const isFirebaseMessagingConfigured = (): boolean =>
  getFirebaseMessagingConfig() !== null;

const getGoogleAccessToken = async (
  traceId: string,
  config: FirebaseMessagingConfig,
): Promise<string> => {
  const cacheKey = `${config.projectId}:${config.clientEmail}`;
  if (
    cachedAccessToken &&
    cachedAccessToken.cacheKey === cacheKey &&
    cachedAccessToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedAccessToken.accessToken;
  }

  const assertion = await buildSignedJwt(config);
  const response = await fetch(config.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const rawText = await response.text();
  let payload: JsonObject = {};
  try {
    const parsed = JSON.parse(rawText);
    if (isJsonObject(parsed)) payload = parsed;
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(
      `GOOGLE_ACCESS_TOKEN_FAILED:${response.status}:${toStringSafe(payload.error_description) || rawText || "UNKNOWN"}`,
    );
  }

  const accessToken = toStringSafe(payload.access_token);
  const expiresIn = Number.parseInt(String(payload.expires_in ?? "3600"), 10) || 3600;
  if (!accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_EMPTY");
  }

  cachedAccessToken = {
    cacheKey,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return accessToken;
};

const buildDataPayload = (data: Record<string, string | null | undefined>): Record<string, string> => {
  const entries = Object.entries(data)
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""] as const)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => [key, value.slice(0, 1000)] as const);

  return Object.fromEntries(entries);
};

export const sendFirebaseDataMessage = async (
  traceId: string,
  params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string | null | undefined>;
    channelId?: string;
  },
): Promise<FcmSendResult> => {
  const config = getFirebaseMessagingConfig();
  if (!config) {
    return {
      ok: false,
      provider: "firebase_fcm",
      errorCode: "FIREBASE_NOT_CONFIGURED",
      errorMessage: "Firebase service account belum dikonfigurasi di Edge Functions.",
    };
  }

  try {
    const accessToken = await getGoogleAccessToken(traceId, config);
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          message: {
            token: params.token,
            data: buildDataPayload({
              title: params.title,
              body: params.body,
              ...(params.data ?? {}),
            }),
            android: {
              priority: "HIGH",
            },
          },
        }),
      },
    );

    const rawText = await response.text();
    let payload: JsonObject = {};
    try {
      const parsed = JSON.parse(rawText);
      if (isJsonObject(parsed)) payload = parsed;
    } catch {
      payload = { raw: rawText };
    }

    if (!response.ok) {
      const errorNode = isJsonObject(payload.error) ? payload.error : {};
      const errorDetails = Array.isArray(errorNode.details) ? errorNode.details : [];
      const detailWithCode = errorDetails.find((detail) =>
        isJsonObject(detail) && typeof detail.errorCode === "string"
      ) as JsonObject | undefined;
      return {
        ok: false,
        provider: "firebase_fcm",
        httpStatus: response.status,
        errorCode:
          toStringSafe(detailWithCode?.errorCode) ||
          toStringSafe(errorNode.status) ||
          "FCM_SEND_FAILED",
        errorMessage: toStringSafe(errorNode.message) || rawText || "FCM send failed",
      };
    }

    return {
      ok: true,
      provider: "firebase_fcm",
      messageId: toStringSafe(payload.name),
      httpStatus: response.status,
    };
  } catch (error) {
    logTraceError(traceId, "Gagal mengirim FCM message", error);
    return {
      ok: false,
      provider: "firebase_fcm",
      errorCode: "FCM_SEND_EXCEPTION",
      errorMessage: error instanceof Error ? error.message : "Unhandled FCM exception",
    };
  }
};
