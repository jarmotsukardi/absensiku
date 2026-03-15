type RpcUnavailableEntry = {
  markedAt: number;
  reason?: string;
};

const RPC_UNAVAILABLE_STORAGE_KEY = "absensiku:rpc_unavailable_v1";
const RPC_UNAVAILABLE_TTL_MS = 6 * 60 * 60 * 1000;

const toErrorRecord = (error: unknown): Record<string, unknown> =>
  (typeof error === "object" && error !== null) ? (error as Record<string, unknown>) : {};

const normalizeErrorMessage = (error: unknown): string => {
  const record = toErrorRecord(error);
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.details === "string" && record.details) ||
    (typeof record.hint === "string" && record.hint) ||
    (error instanceof Error ? error.message : "");
  return message.toLowerCase();
};

const normalizeErrorCode = (error: unknown): string => {
  const record = toErrorRecord(error);
  const code = typeof record.code === "string" ? record.code : "";
  return code.toUpperCase();
};

const normalizeErrorStatus = (error: unknown): number | null => {
  const record = toErrorRecord(error);
  const status = record.status;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  if (typeof status === "string" && /^\d+$/.test(status)) return Number.parseInt(status, 10);
  return null;
};

const readUnavailableMap = (): Record<string, RpcUnavailableEntry> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(RPC_UNAVAILABLE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, RpcUnavailableEntry>;
  } catch {
    return {};
  }
};

const writeUnavailableMap = (nextMap: Record<string, RpcUnavailableEntry>) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RPC_UNAVAILABLE_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // Ignore storage failures.
  }
};

export const isRpcMissingFunctionError = (error: unknown): boolean => {
  const status = normalizeErrorStatus(error);
  const code = normalizeErrorCode(error);
  const message = normalizeErrorMessage(error);

  if (code === "PGRST202") return true;
  if (message.includes("function") && message.includes("does not exist")) return true;
  if (message.includes("could not find the function")) return true;
  if (message.includes("not found") && message.includes("/rpc/")) return true;
  if (status === 404 && (message.includes("rpc") || message.includes("function"))) return true;
  return false;
};

export const isRpcMarkedUnavailable = (rpcName: string): boolean => {
  if (!rpcName) return false;
  const now = Date.now();
  const entries = readUnavailableMap();
  const entry = entries[rpcName];
  if (!entry) return false;
  if (!entry.markedAt || now - entry.markedAt > RPC_UNAVAILABLE_TTL_MS) {
    delete entries[rpcName];
    writeUnavailableMap(entries);
    return false;
  }
  return true;
};

export const markRpcUnavailable = (rpcName: string, reason?: string) => {
  if (!rpcName || typeof window === "undefined") return;
  const entries = readUnavailableMap();
  entries[rpcName] = {
    markedAt: Date.now(),
    reason: reason?.slice(0, 300),
  };
  writeUnavailableMap(entries);
};

export const clearRpcUnavailableMark = (rpcName: string) => {
  if (!rpcName || typeof window === "undefined") return;
  const entries = readUnavailableMap();
  if (!entries[rpcName]) return;
  delete entries[rpcName];
  writeUnavailableMap(entries);
};

export const clearRpcUnavailableMarks = (rpcNames: string[]) => {
  if (typeof window === "undefined" || !Array.isArray(rpcNames) || rpcNames.length === 0) return;
  const entries = readUnavailableMap();
  let hasChanges = false;
  for (const rpcName of rpcNames) {
    if (!rpcName || !entries[rpcName]) continue;
    delete entries[rpcName];
    hasChanges = true;
  }
  if (hasChanges) {
    writeUnavailableMap(entries);
  }
};

type RpcExecutionResult<T> = {
  data: T | null;
  error: unknown | null;
};

export const executeRpcWithAvailability = async <T>(
  rpcName: string,
  execute: () => Promise<RpcExecutionResult<T>>,
): Promise<RpcExecutionResult<T> & { usedRecovery: boolean }> => {
  const run = async (usedRecovery: boolean) => {
    try {
      const result = await execute();
      if (result.error) {
        if (isRpcMissingFunctionError(result.error)) {
          markRpcUnavailable(
            rpcName,
            result.error instanceof Error ? result.error.message : String(result.error || "rpc_missing"),
          );
        }
        return { ...result, usedRecovery };
      }
      clearRpcUnavailableMark(rpcName);
      return { ...result, usedRecovery };
    } catch (error) {
      if (isRpcMissingFunctionError(error)) {
        markRpcUnavailable(
          rpcName,
          error instanceof Error ? error.message : String(error || "rpc_missing"),
        );
        return { data: null, error, usedRecovery };
      }
      throw error;
    }
  };

  if (!isRpcMarkedUnavailable(rpcName)) {
    return run(false);
  }

  clearRpcUnavailableMark(rpcName);
  return run(true);
};
