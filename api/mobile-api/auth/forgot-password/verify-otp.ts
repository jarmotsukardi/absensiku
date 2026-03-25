import { ApiRequest, ApiResponse, readJsonBody, sendJson, sendNoContent } from "../../_lib/http.js";
import { supabaseAuthRequest } from "../../_lib/supabase.js";

export const config = {
  runtime: "nodejs",
};

const createRefId = () => `MOB-OTP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readFunctionMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  return String(record.message ?? record.error ?? fallback).trim() || fallback;
};

const readFunctionCode = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  return String(record.code ?? fallback).trim() || fallback;
};

const readFunctionTrace = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  return String(record.trace_id ?? fallback).trim() || fallback;
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
  const otp = String(body.otp ?? "").trim();
  const newPassword = String(body.new_password ?? body.newPassword ?? "");

  if (!email || !otp || !newPassword) {
    sendJson(res, 400, {
      ok: false,
      code: "validation_error",
      message: "Email, OTP, dan password baru wajib diisi.",
      ref_id: traceId,
    });
    return;
  }

  try {
    const response = await supabaseAuthRequest("/functions/v1/verify-password-otp", {
      method: "POST",
      body: {
        email,
        otp,
        newPassword,
      },
      useServiceRole: true,
    });

    if (!response.ok) {
      const payload = response.json as Record<string, unknown> | null;
      const message = readFunctionMessage(payload, "OTP tidak valid.");
      const code = readFunctionCode(payload, "otp_invalid");
      const refId = readFunctionTrace(payload, traceId);
      sendJson(res, response.status, {
        ok: false,
        code,
        message,
        ref_id: refId,
      });
      return;
    }

    const payload = response.json as Record<string, unknown> | null;
    sendJson(res, 200, {
      ok: true,
      message: readFunctionMessage(payload, "Password berhasil direset."),
      ref_id: readFunctionTrace(payload, traceId),
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: "network_error",
      message: "Tidak dapat memverifikasi OTP.",
      ref_id: traceId,
    });
  }
}
