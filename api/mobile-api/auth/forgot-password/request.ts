import { ApiRequest, ApiResponse, readJsonBody, sendJson, sendNoContent } from "../../_lib/http.js";
import { supabaseAuthRequest } from "../../_lib/supabase.js";

export const config = {
  runtime: "nodejs",
};

const createRefId = () => `MOB-FORGOT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  const whatsapp = String(body.whatsapp ?? "").trim();
  const method = String(body.method ?? "").trim();
  const loginType = String(body.login_type ?? body.loginType ?? "employee").trim();
  const validateOnly = Boolean(body.validate_only ?? body.validateOnly ?? false);
  const useOtp = Boolean(body.use_otp ?? body.useOtp ?? false);
  const purpose = String(body.purpose ?? "password_change").trim();

  if (!email) {
    sendJson(res, 400, {
      ok: false,
      code: "validation_error",
      message: "Email wajib diisi.",
      ref_id: traceId,
    });
    return;
  }

  try {
    if (validateOnly) {
      const validateResponse = await supabaseAuthRequest("/functions/v1/send-reset-password", {
        method: "POST",
        body: {
          email,
          whatsapp,
          method,
          login_type: loginType,
          validate_only: true,
        },
        useServiceRole: true,
      });

      if (!validateResponse.ok) {
        const message = readFunctionMessage(validateResponse.json, "Validasi data gagal.");
        const code = readFunctionCode(validateResponse.json, "validation_error");
        const refId = readFunctionTrace(validateResponse.json, traceId);
        sendJson(res, validateResponse.status, {
          ok: false,
          code,
          message,
          ref_id: refId,
        });
        return;
      }

      const payload = validateResponse.json as Record<string, unknown> | null;
      sendJson(res, 200, {
        ok: true,
        message: readFunctionMessage(payload, "Data tervalidasi."),
        name: payload?.name ?? null,
        ref_id: readFunctionTrace(payload, traceId),
      });
      return;
    }

    if (!useOtp) {
      sendJson(res, 400, {
        ok: false,
        code: "validation_error",
        message: "Mode OTP tidak dipilih.",
        ref_id: traceId,
      });
      return;
    }

    const response = await supabaseAuthRequest("/functions/v1/send-password-otp", {
      method: "POST",
      body: {
        email,
        whatsapp,
        method,
        purpose,
        login_type: loginType,
      },
      useServiceRole: true,
    });

    if (!response.ok) {
      const payload = response.json as Record<string, unknown> | null;
      const message = readFunctionMessage(payload, "Permintaan OTP gagal.");
      const code = readFunctionCode(payload, "otp_channel_unavailable");
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
      message: readFunctionMessage(payload, "OTP terkirim."),
      email: payload?.email ?? null,
      whatsapp: payload?.whatsapp ?? null,
      delivery: payload?.delivery ?? null,
      ref_id: readFunctionTrace(payload, traceId),
    });
  } catch {
    sendJson(res, 500, {
      ok: false,
      code: "network_error",
      message: "Tidak dapat mengirim OTP.",
      ref_id: traceId,
    });
  }
}
