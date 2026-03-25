import { buildLocalProductionWriteBlockMessage, shouldBlockLocalProductionWrites } from "@/lib/runtimeEnvironment";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const MUTATING_RPC_PREFIXES = [
  "apply_",
  "approve_",
  "assign_",
  "cleanup_",
  "complete_",
  "confirm_",
  "create_",
  "deactivate_",
  "delete_",
  "dispatch_",
  "generate_",
  "insert_",
  "log_",
  "mark_",
  "move_",
  "partition_",
  "process_",
  "review_",
  "run_",
  "save_",
  "send_",
  "set_",
  "submit_",
  "sync_",
  "take_",
  "update_",
  "upsert_",
  "verify_",
];

const SAFE_RPC_PREFIXES = [
  "get_",
  "list_",
  "is_",
  "validate_",
];

const normalizeMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const resolveUrl = (input: RequestInfo | URL): URL | null => {
  try {
    if (input instanceof URL) return input;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url);
    }
    return new URL(String(input));
  } catch {
    return null;
  }
};

const createBlockedResponse = (actionLabel: string): Response => {
  const message = buildLocalProductionWriteBlockMessage(actionLabel);
  return new Response(
    JSON.stringify({
      code: "LOCALHOST_PROD_WRITE_BLOCKED",
      message,
      details: "Mutasi diblokir oleh guard localhost->production.",
      hint: "Ganti .env.local ke staging remote atau aktifkan override eksplisit jika benar-benar diperlukan.",
    }),
    {
      status: 403,
      statusText: "Forbidden",
      headers: {
        "content-type": "application/json",
      },
    },
  );
};

export const isLikelyMutatingRpcName = (rpcName: string | null | undefined): boolean => {
  const normalized = (rpcName || "").trim().toLowerCase();
  if (!normalized) return false;
  if (SAFE_RPC_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return MUTATING_RPC_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const shouldBlockSupabaseMutationRequest = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  if (!shouldBlockLocalProductionWrites()) return false;

  const url = resolveUrl(input);
  if (!url) return false;

  const method = normalizeMethod(input, init);
  if (SAFE_HTTP_METHODS.has(method)) return false;

  const pathname = url.pathname;

  if (pathname.startsWith("/auth/v1/")) {
    return false;
  }

  if (pathname.startsWith("/rest/v1/rpc/")) {
    const rpcName = pathname.split("/").pop();
    return isLikelyMutatingRpcName(rpcName);
  }

  if (pathname.startsWith("/rest/v1/")) return true;
  if (pathname.startsWith("/functions/v1/")) return true;
  if (pathname.startsWith("/storage/v1/")) return true;

  return false;
};

export const localhostProductionWriteGuardFetch: typeof fetch = async (input, init) => {
  if (!shouldBlockSupabaseMutationRequest(input, init)) {
    return fetch(input, init);
  }

  const url = resolveUrl(input);
  const pathname = url?.pathname || "";

  if (pathname.startsWith("/rest/v1/rpc/")) {
    const rpcName = pathname.split("/").pop() || "rpc";
    return createBlockedResponse(`RPC ${rpcName}`);
  }

  if (pathname.startsWith("/functions/v1/")) {
    const functionName = pathname.split("/").pop() || "function";
    return createBlockedResponse(`Edge Function ${functionName}`);
  }

  if (pathname.startsWith("/storage/v1/")) {
    return createBlockedResponse("Mutasi storage");
  }

  return createBlockedResponse("Mutasi data");
};
