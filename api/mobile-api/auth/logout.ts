import { ApiRequest, ApiResponse, getHeaderValue, sendJson, sendNoContent } from "../_lib/http.js";
import { supabaseAuthRequest } from "../_lib/supabase.js";

export const config = {
  runtime: "nodejs",
};

const createRefId = () => `MOB-LOGOUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  const authHeader = getHeaderValue(req.headers, "authorization");
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    sendJson(res, 401, {
      ok: false,
      code: "session_expired",
      message: "Sesi tidak ditemukan.",
      ref_id: traceId,
    });
    return;
  }

  try {
    const response = await supabaseAuthRequest("/auth/v1/logout", {
      method: "POST",
      accessToken,
    });

    if (!response.ok) {
      sendJson(res, 400, {
        ok: false,
        code: "logout_failed",
        message: "Logout gagal.",
        ref_id: traceId,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      message: "Logout berhasil",
      ref_id: traceId,
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: "network_error",
      message: "Tidak dapat memproses logout.",
      ref_id: traceId,
    });
  }
}
