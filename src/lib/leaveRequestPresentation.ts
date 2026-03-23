import {
  isEarlyLeavePermissionReason,
  isLatePermissionReason,
  parseEarlyLeavePermissionReason,
  parseLatePermissionReason,
} from "@/lib/latePermissionRequest";

export type LeaveRequestCategory = "all" | "regular" | "late_permission" | "early_leave_permission";

export interface LeaveRequestPresentation {
  category: Exclude<LeaveRequestCategory, "all">;
  isLatePermission: boolean;
  isEarlyLeavePermission: boolean;
  leaveTypeLabel: string;
  reasonText: string;
  detailLabel: string | null;
  detailText: string | null;
}

export const LEAVE_REQUEST_CATEGORY_OPTIONS: Array<{
  value: LeaveRequestCategory;
  label: string;
}> = [
  { value: "all", label: "Semua Permohonan" },
  { value: "regular", label: "Izin/Cuti Reguler" },
  { value: "late_permission", label: "Izin Terlambat" },
  { value: "early_leave_permission", label: "Izin Pulang Cepat" },
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  izin: "Izin",
  cuti_tahunan: "Cuti Tahunan",
  cuti_penting: "Cuti Penting",
  cuti_lainnya: "Cuti Lainnya",
  sakit: "Sakit",
  tugas_luar: "Tugas Luar",
};

export const getLeaveTypeLabel = (type: string): string => LEAVE_TYPE_LABELS[type] || type;

type LeaveRequestLike = {
  leave_type: string;
  reason: string | null;
  leave_type_name?: string | null;
};

export const getLeaveRequestPresentation = (record: LeaveRequestLike): LeaveRequestPresentation => {
  const isLatePermission = record.leave_type === "izin" && isLatePermissionReason(record.reason);
  const isEarlyLeavePermission = record.leave_type === "izin" && isEarlyLeavePermissionReason(record.reason);

  if (!isLatePermission && !isEarlyLeavePermission) {
    return {
      category: "regular",
      isLatePermission: false,
      isEarlyLeavePermission: false,
      leaveTypeLabel: (record.leave_type_name || "").trim() || getLeaveTypeLabel(record.leave_type),
      reasonText: (record.reason || "").trim() || "-",
      detailLabel: null,
      detailText: null,
    };
  }

  if (isLatePermission) {
    const parsed = parseLatePermissionReason(record.reason);
    return {
      category: "late_permission",
      isLatePermission: true,
      isEarlyLeavePermission: false,
      leaveTypeLabel: "Izin Terlambat",
      reasonText: parsed.reason || "-",
      detailLabel: "ETA",
      detailText: parsed.estimatedArrivalTime,
    };
  }

  const parsed = parseEarlyLeavePermissionReason(record.reason);
  return {
    category: "early_leave_permission",
    isLatePermission: false,
    isEarlyLeavePermission: true,
    leaveTypeLabel: "Izin Pulang Cepat",
    reasonText: parsed.reason || "-",
    detailLabel: "Jam pulang",
    detailText: parsed.plannedLeaveTime,
  };
};

export const matchesLeaveRequestCategory = (
  record: LeaveRequestLike,
  category: LeaveRequestCategory,
): boolean => {
  if (category === "all") return true;
  return getLeaveRequestPresentation(record).category === category;
};
