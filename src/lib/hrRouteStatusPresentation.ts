import type { HrRouteStatus } from "@/lib/hrRouteAccess";

export function getHrRouteStatusBadgeLabel(status: HrRouteStatus): string {
  // Semua menu sekarang production - tidak ada lagi "Tunda" atau "Internal"
  return "Produksi";
}

export function getHrRouteStatusDescription(
  status: HrRouteStatus,
  variant: "general" | "analytics" | "audit" = "general",
): string {
  // Semua menu sekarang production
  return "Halaman ini sudah dianggap bagian dari paket produksi HR.";
}
