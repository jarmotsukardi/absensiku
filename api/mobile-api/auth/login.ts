import { readJsonBody, sendJson, sendNoContent, getHeaderValue, ApiRequest, ApiResponse } from "../_lib/http.js";
import { env } from "../_lib/env.js";
import { supabaseAuthRequest } from "../_lib/supabase.js";
import { getRateLimitConfig, isRateLimited, recordAttempt } from "../_lib/rate-limit.js";

export const config = {
  runtime: "nodejs",
};

const createRefId = () => `MOB-LOGIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildBootstrapCookie = (
  payload: Record<string, unknown>,
  isSecure: boolean
): string => {
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const encoded = encodeURIComponent(base64);
  const secure = isSecure ? "; Secure" : "";
  return `absensiku_native_session=${encoded}; Path=/; Max-Age=120; SameSite=Lax${secure}`;
};

const extractErrorMessage = (raw: string | null, json: unknown): string => {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const message =
      (record.error_description as string) ||
      (record.error as string) ||
      (record.message as string) ||
      (record.msg as string) ||
      "";
    if (message) return message;
  }
  return raw || "";
};

const isInvalidCredential = (status: number, message: string) => {
  return status === 400 && message.toLowerCase().includes("invalid login credentials");
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed", ref_id: createRefId() });
    return;
  }

  const traceId = createRefId();
  const body = await readJsonBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const rememberSession = Boolean(body.remember_session ?? body.rememberSession ?? false);
  const deviceId = String(body.device_id ?? body.deviceId ?? "").trim();
  const appVersion = String(body.app_version ?? body.appVersion ?? "").trim();
  const appCode = String(body.app_code ?? body.appCode ?? "").trim();
  const nativeClientHeader = getHeaderValue(req.headers, "x-absensiku-native-client");
  const isNativeFlow = nativeClientHeader.toLowerCase() === "android-webview";

  if (!email || !password) {
    sendJson(res, 400, {
      ok: false,
      code: "validation_error",
      message: "Email dan password wajib diisi.",
      ref_id: traceId,
    });
    return;
  }

  if (isNativeFlow && appCode !== env.nativeAppCode) {
    sendJson(res, 403, {
      ok: false,
      code: "native_app_code_invalid",
      message: "Aplikasi tidak terverifikasi untuk login native.",
      ref_id: traceId,
    });
    return;
  }

  try {
    const config = await getRateLimitConfig();
    if (config.windowSeconds > 0 && config.maxAttempts > 0) {
      const rateState = await isRateLimited(email, config);
      if (rateState.limited) {
        sendJson(res, 429, {
          ok: false,
          code: "rate_limited",
          message: "Terlalu banyak percobaan login. Coba lagi nanti.",
          ref_id: traceId,
        });
        return;
      }
    }

    const response = await supabaseAuthRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: {
        email,
        password,
      },
    });

    if (!response.ok) {
      const message = extractErrorMessage(response.body, response.json);
      if (config.windowSeconds > 0 && config.maxAttempts > 0 && isInvalidCredential(response.status, message)) {
        try {
          await recordAttempt(email, config);
        } catch {
          // Ignore rate-limit logging failures on invalid credential
        }
      }

      const code = isInvalidCredential(response.status, message) ? "invalid_credentials" : "auth_failed";
      sendJson(res, response.status === 400 ? 401 : response.status, {
        ok: false,
        code,
        message: isInvalidCredential(response.status, message)
          ? "Email atau password salah."
          : message || "Login gagal.",
        ref_id: traceId,
      });
      return;
    }

    const session = (response.json ?? {}) as Record<string, unknown>;
    const user = (session.user ?? {}) as Record<string, unknown>;
    const sessionPayload = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      remember_session: rememberSession,
      user: {
        id: user.id,
        email: user.email ?? email,
      },
    };

    const isSecure = getHeaderValue(req.headers, "x-forwarded-proto").includes("https");
    const cookieValue = buildBootstrapCookie(sessionPayload, isSecure);

    sendJson(
      res,
      200,
      {
        ok: true,
        message: "Login berhasil",
        dashboard_url: "/employee/dashboard",
        session: sessionPayload,
        device_id: deviceId,
        app_version: appVersion,
        app_code_verified: isNativeFlow,
        ref_id: traceId,
      },
      {
        "Set-Cookie": cookieValue,
      }
    );
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      code: "network_error",
      message: "Tidak dapat memproses login sekarang.",
      ref_id: traceId,
    });
  }
}
