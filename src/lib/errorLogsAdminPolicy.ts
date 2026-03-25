export type CentralizedPurgeScope = "archived_or_resolved" | "non_critical" | "all";

export const CENTRALIZED_PURGE_CONFIRMATION_PHRASE = "HAPUS LOG TERPUSAT";

export const CENTRALIZED_PURGE_SCOPE_LABEL: Record<CentralizedPurgeScope, string> = {
  archived_or_resolved: "Arsip + Selesai",
  non_critical: "Semua Non Kritis",
  all: "Semua Log (termasuk kritis aktif)",
};

export const normalizeCentralizedPurgeScope = (value: unknown): CentralizedPurgeScope => {
  if (value === "non_critical" || value === "all" || value === "archived_or_resolved") {
    return value;
  }
  return "archived_or_resolved";
};

export const resolveCentralizedPurgeErrorMessage = (
  rawErrorText: string,
  confirmationPhrase: string = CENTRALIZED_PURGE_CONFIRMATION_PHRASE,
): string => {
  const normalized = rawErrorText.toLowerCase();
  if (normalized.includes("forbidden")) {
    return "Akses ditolak. Purge log terpusat hanya untuk Super Admin.";
  }
  if (
    normalized.includes("pgrst202") ||
    normalized.includes("preview_client_error_logs_purge") ||
    normalized.includes("purge_client_error_logs")
  ) {
    return "RPC purge belum tersedia di Supabase. Jalankan migration terbaru.";
  }
  if (normalized.includes("invalid_confirmation")) {
    return `Konfirmasi tidak valid. Ketik tepat: ${confirmationPhrase}`;
  }
  if (normalized.includes("invalid_scope")) {
    return "Scope purge tidak valid.";
  }
  return "Gagal purge log terpusat";
};
